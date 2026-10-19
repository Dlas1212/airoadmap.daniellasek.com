(() => {
  'use strict';

  const D = window.ROADMAP;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- data indexes ----------
  const byId = {};
  D.nodes.forEach((n, i) => { n.idx = i; n.unlocks = []; byId[n.id] = n; });
  D.nodes.forEach((n) => n.prereqs.forEach((p) => byId[p].unlocks.push(n.id)));
  const laneById = Object.fromEntries(D.lanes.map((l, i) => [l.id, { ...l, i }]));
  const roleById = Object.fromEntries(D.roles.map((r) => [r.id, r]));
  const REL = { c: 'Must learn', r: 'Should know', a: 'Be aware' };
  const REL_SHORT = { c: 'Must', r: 'Should', a: 'Aware' };
  const REL_RANK = { c: 0, r: 1, a: 2 };
  const STATUS = { todo: 'Not started', learning: 'Learning', done: 'Done', skip: 'Skip' };

  // depth of a node among same-tier prerequisites, so prereqs stack above dependents
  const localDepth = {};
  const depthOf = (n) => {
    if (localDepth[n.id] != null) return localDepth[n.id];
    let d = 0;
    n.prereqs.forEach((p) => { if (byId[p].tier === n.tier) d = Math.max(d, depthOf(byId[p]) + 1); });
    return (localDepth[n.id] = d);
  };
  D.nodes.forEach(depthOf);

  // ---------- state ----------
  const KEY = 'ai-atlas:v1';
  const S = { role: 'all', view: null, status: {}, subs: {}, sel: null, pace: 6, showAll: false, legend: true, wide: false };
  try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* storage unavailable */ }
  S.sel = null;
  if (!S.view) S.view = window.innerWidth < 700 ? 'path' : 'map';
  const save = () => {
    try { localStorage.setItem(KEY, JSON.stringify({ role: S.role, view: S.view, status: S.status, subs: S.subs, pace: S.pace, showAll: S.showAll, legend: S.legend, wide: S.wide })); } catch (e) { /* ignore */ }
  };

  const rel = (n, role = S.role) => (role === 'all' ? null : n.roles[role] || null);
  const onPath = (n, role = S.role) => role === 'all' || !!n.roles[role];
  const st = (id) => S.status[id] || 'todo';
  const isClear = (id) => { const s = st(id); return s === 'done' || s === 'skip'; };
  const satisfied = (id) => isClear(id) || !onPath(byId[id]);
  const isLocked = (n) => !n.prereqs.every(satisfied);
  const isNext = (n) => onPath(n) && st(n.id) === 'todo' && !isLocked(n);

  function ancestors(id, acc = new Set()) {
    byId[id].prereqs.forEach((p) => { if (!acc.has(p)) { acc.add(p); ancestors(p, acc); } });
    return acc;
  }
  const sortNodes = (list) => list.slice().sort((a, b) =>
    a.tier - b.tier || localDepth[a.id] - localDepth[b.id] ||
    (REL_RANK[rel(a)] ?? 0) - (REL_RANK[rel(b)] ?? 0) ||
    laneById[a.lane].i - laneById[b.lane].i || a.idx - b.idx);
  const pathNodes = () => sortNodes(D.nodes.filter((n) => onPath(n)));
  // "Be aware" topics only fill the list once nothing more important is unlocked
  const nextUp = (limit = 4) => {
    const all = pathNodes().filter(isNext);
    const main = all.filter((n) => rel(n) !== 'a');
    return (main.length ? main : all).slice(0, limit);
  };
  const hoursOf = (n) => n.hours || 0;

  // ---------- layout ----------
  const NODE_W = 184, NODE_H = 66, COL_W = 210, LEFT = 156, TOP = 64, GAP = 12, PAD = 30;
  const W = LEFT + D.lanes.length * COL_W + 24;
  const tierTop = [], tierH = [];
  const pos = {};
  (() => {
    let y = TOP;
    D.tiers.forEach((t) => {
      const cells = {};
      D.nodes.filter((n) => n.tier === t.id).forEach((n) => (cells[n.lane] ||= []).push(n));
      const maxStack = Math.max(1, ...Object.values(cells).map((c) => c.length));
      const inner = maxStack * (NODE_H + GAP) - GAP;
      const h = Math.max(150, inner + PAD * 2);
      tierTop[t.id] = y; tierH[t.id] = h;
      Object.entries(cells).forEach(([lane, list]) => {
        list.sort((a, b) => localDepth[a.id] - localDepth[b.id] || a.idx - b.idx);
        const stackH = list.length * (NODE_H + GAP) - GAP;
        const y0 = y + (h - stackH) / 2;
        list.forEach((n, i) => {
          pos[n.id] = { x: LEFT + laneById[lane].i * COL_W + (COL_W - NODE_W) / 2, y: y0 + i * (NODE_H + GAP) };
        });
      });
      y += h;
    });
  })();
  const H = tierTop[D.tiers.length - 1] + tierH[D.tiers.length - 1] + 20;

  // ---------- elements ----------
  const el = {
    viewport: $('#viewport'), world: $('#world'), nodes: $('#nodes'), edges: $('#edges'),
    drawer: $('#drawer'), drawerInner: $('#drawerInner'), mapView: $('#mapView'), pathView: $('#pathView'),
    roleChips: $('#roleChips'), progress: $('#progress'), legend: $('#legend'), banner: $('#roleBanner'),
    search: $('#search'), results: $('#searchResults'), modal: $('#modal'), modalBody: $('#modalBody'), toast: $('#toast'),
  };

  // ---------- map rendering ----------
  const nodeEls = {}, edgeEls = [];
  function buildMap() {
    el.world.style.width = W + 'px'; el.world.style.height = H + 'px';
    el.edges.setAttribute('width', W); el.edges.setAttribute('height', H);
    el.edges.setAttribute('viewBox', `0 0 ${W} ${H}`);
    let html = '';
    D.tiers.forEach((t) => {
      html += `<div class="band" style="top:${tierTop[t.id]}px;height:${tierH[t.id]}px;width:${W}px">
        <div class="band-label"><div class="t-num">Tier ${t.id}</div><div class="t-name">${esc(t.name)}</div><div class="t-blurb">${esc(t.blurb)}</div></div></div>`;
    });
    D.lanes.forEach((l, i) => {
      html += `<div class="lane-col" style="left:${LEFT + i * COL_W}px;height:${H - 60}px"></div>`;
      html += `<div class="lane-head" style="left:${LEFT + i * COL_W}px;width:${COL_W}px;--h:${l.hue}">${esc(l.name)}</div>`;
    });
    el.nodes.innerHTML = html;
    D.nodes.forEach((n) => {
      const b = document.createElement('button');
      b.className = 'node';
      b.dataset.id = n.id;
      b.style.cssText = `left:${pos[n.id].x}px;top:${pos[n.id].y}px;width:${NODE_W}px;height:${NODE_H}px;--h:${laneById[n.lane].hue}`;
      b.innerHTML = `<span class="n-title">${esc(n.title)}</span><span class="n-meta"><span class="n-dot"></span><span class="n-rel"></span><span class="n-info"></span><span class="n-status"></span></span>`;
      b.addEventListener('click', () => { if (!drag.moved) select(n.id, { center: false }); });
      el.nodes.appendChild(b);
      nodeEls[n.id] = b;
    });
    const ns = 'http://www.w3.org/2000/svg';
    D.nodes.forEach((n) => n.prereqs.forEach((p) => {
      const a = pos[p], b = pos[n.id];
      let d;
      if (b.y >= a.y + NODE_H - 1) {
        const x1 = a.x + NODE_W / 2, y1 = a.y + NODE_H, x2 = b.x + NODE_W / 2, y2 = b.y, c = Math.max(30, (y2 - y1) / 2);
        d = `M${x1},${y1} C${x1},${y1 + c} ${x2},${y2 - c} ${x2},${y2}`;
      } else {
        const right = b.x > a.x;
        const x1 = right ? a.x + NODE_W : a.x, y1 = a.y + NODE_H / 2, x2 = right ? b.x : b.x + NODE_W, y2 = b.y + NODE_H / 2, c = Math.abs(x2 - x1) / 2;
        d = `M${x1},${y1} C${x1 + (right ? c : -c)},${y1} ${x2 - (right ? c : -c)},${y2} ${x2},${y2}`;
      }
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', d);
      path.setAttribute('class', 'edge');
      el.edges.appendChild(path);
      edgeEls.push({ from: p, to: n.id, path });
    }));
  }

  function refreshMap() {
    const chain = S.sel ? ancestors(S.sel) : null;
    const sel = S.sel ? byId[S.sel] : null;
    const q = el.search.value.trim().toLowerCase();
    D.nodes.forEach((n) => {
      const b = nodeEls[n.id];
      const r = rel(n), s = st(n.id), on = onPath(n), next = isNext(n), locked = isLocked(n);
      b.className = 'node' + (r ? ' rel-' + r : '') + (on ? '' : ' off') + ' st-' + s +
        (next ? ' next' : '') + (locked ? ' locked' : '') + (S.sel === n.id ? ' sel' : '') +
        (chain && (chain.has(n.id) || sel.unlocks.includes(n.id)) ? ' chain' : '') +
        (q.length > 1 && matches(n, q) ? ' match' : '');
      b.querySelector('.n-rel').textContent = r ? REL_SHORT[r] : '';
      const info = [];
      if (n.hours) info.push(n.hours + 'h');
      if (n.subtopics?.length) info.push(n.subtopics.length + ' sub');
      b.querySelector('.n-info').textContent = info.join(' · ');
      b.querySelector('.n-status').textContent = s === 'done' ? '✓ Done' : s === 'learning' ? 'Learning' : s === 'skip' ? 'Skipped' : next ? 'Next up' : '';
      b.setAttribute('aria-label', `${n.title}, tier ${n.tier}${r ? ', ' + REL[r] : ''}, ${STATUS[s]}`);
    });
    el.nodes.classList.toggle('focus', !!S.sel);
    el.edges.classList.toggle('focus', !!S.sel);
    edgeEls.forEach((e) => {
      const off = !onPath(byId[e.from]) || !onPath(byId[e.to]);
      let cls = 'edge' + (off ? ' off' : '');
      if (chain) {
        if ((chain.has(e.to) || e.to === S.sel) && chain.has(e.from)) cls += ' anc';
        else if (e.from === S.sel) cls += ' desc';
      }
      e.path.setAttribute('class', cls);
    });
  }

  // ---------- pan & zoom ----------
  const T = { x: 0, y: 0, k: 1 };
  // keep at least a margin of the map on screen so it can't be panned out of reach
  function clampPan() {
    const vw = el.viewport.clientWidth - drawerW(), vh = el.viewport.clientHeight;
    const mx = Math.min(160, vw / 3), my = Math.min(160, vh / 3);
    T.x = Math.min(vw - mx, Math.max(mx - W * T.k, T.x));
    T.y = Math.min(vh - my, Math.max(my - H * T.k, T.y));
  }
  const apply = () => { clampPan(); el.world.style.transform = `translate(${T.x}px,${T.y}px) scale(${T.k})`; };
  const clampK = (k) => Math.min(1.6, Math.max(0.22, k));
  function zoomAt(f, cx, cy) {
    const k2 = clampK(T.k * f);
    T.x = cx - (cx - T.x) * (k2 / T.k); T.y = cy - (cy - T.y) * (k2 / T.k); T.k = k2; apply();
  }
  function animate(fn) {
    el.world.style.transition = 'transform .4s cubic-bezier(.2,.7,.2,1)';
    fn(); apply();
    setTimeout(() => { el.world.style.transition = ''; }, 420);
  }
  const drawerW = () => (el.drawer.hidden || window.innerWidth <= 640 ? 0 : el.drawer.offsetWidth);
  function fit() {
    const top = el.banner.hidden ? 0 : el.banner.offsetHeight + 20;
    const vw = el.viewport.clientWidth - drawerW(), vh = el.viewport.clientHeight - top;
    const list = D.nodes.filter((n) => onPath(n));
    let x0 = 0, y0 = 0, x1 = W, y1 = H;
    if (S.role !== 'all') {
      x0 = Math.min(...list.map((n) => pos[n.id].x)) - 40; x1 = Math.max(...list.map((n) => pos[n.id].x + NODE_W)) + 40;
      y0 = Math.min(...list.map((n) => pos[n.id].y)) - 70; y1 = Math.max(...list.map((n) => pos[n.id].y + NODE_H)) + 40;
      x0 = Math.min(x0, 0);
    }
    const bw = x1 - x0, bh = y1 - y0;
    let k = Math.min(vw / bw, vh / bh);
    if (k < 0.5) k = Math.min(vw / bw, 1);
    k = Math.min(1, Math.max(window.innerWidth < 700 ? 0.42 : 0.5, k));
    animate(() => {
      T.k = k;
      T.x = bw * k < vw ? (vw - bw * k) / 2 - x0 * k : -x0 * k + 8;
      T.y = top + (bh * k < vh ? (vh - bh * k) / 2 - y0 * k : -y0 * k + 8);
    });
  }
  function centerOn(id) {
    const p = pos[id];
    const vw = el.viewport.clientWidth - drawerW();
    const vh = window.innerWidth <= 640 && !el.drawer.hidden ? el.viewport.clientHeight * 0.12 + 60 : el.viewport.clientHeight / 2;
    animate(() => {
      T.k = Math.max(T.k, 0.75);
      T.x = vw / 2 - (p.x + NODE_W / 2) * T.k;
      T.y = vh - (p.y + NODE_H / 2) * T.k;
    });
  }

  const drag = { on: false, moved: false, sx: 0, sy: 0, ox: 0, oy: 0 };
  const pointers = new Map();
  let pinch = null;
  el.viewport.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: T.k };
      drag.on = false;
      return;
    }
    Object.assign(drag, { on: true, moved: false, sx: e.clientX, sy: e.clientY, ox: T.x, oy: T.y });
  });
  window.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const r = el.viewport.getBoundingClientRect();
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt((pinch.k * d / pinch.d) / T.k, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      drag.moved = true;
      return;
    }
    if (!drag.on) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    el.viewport.classList.add('dragging');
    T.x = drag.ox + dx; T.y = drag.oy + dy; apply();
  });
  const endPointer = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (pointers.size === 0) {
      drag.on = false;
      el.viewport.classList.remove('dragging');
      setTimeout(() => { drag.moved = false; }, 0);
    }
  };
  window.addEventListener('pointerup', endPointer);
  window.addEventListener('pointercancel', endPointer);
  el.viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = el.viewport.getBoundingClientRect();
    if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
    else { T.x -= e.deltaX; T.y -= e.deltaY; apply(); }
  }, { passive: false });
  el.viewport.addEventListener('click', (e) => {
    if (!drag.moved && !e.target.closest('.node') && S.sel) closeDrawer();
  });
  const zoomCenter = (f) => zoomAt(f, (el.viewport.clientWidth - drawerW()) / 2, el.viewport.clientHeight / 2);
  $('#zoomIn').onclick = () => zoomCenter(1.25);
  $('#zoomOut').onclick = () => zoomCenter(0.8);
  $('#zoomFit').onclick = fit;

  // ---------- legend, roles, progress ----------
  function renderLegend() {
    if (!S.legend) { el.legend.hidden = true; return; }
    el.legend.hidden = false;
    el.legend.innerHTML = `
      <div class="lg"><span class="sw c"></span>Must learn</div>
      <div class="lg"><span class="sw next"></span>Next up for you</div>
      <div class="lg"><span class="sw"></span>Should know</div>
      <div class="lg"><span class="sw done"></span>Done</div>
      <div class="lg"><span class="sw a"></span>Be aware of it</div>
      <div class="lg"><span class="sw off"></span>Not on this path</div>
      <button class="legend-close" id="legendClose">Hide legend</button>`;
    $('#legendClose').onclick = () => { S.legend = false; save(); renderLegend(); };
  }

  function renderRoles() {
    const opts = [{ id: 'all', name: 'All topics' }, ...D.roles];
    el.roleChips.innerHTML = opts.map((r) => `<button class="chip" data-role="${r.id}" aria-pressed="${S.role === r.id}" title="${esc(r.blurb || 'Show the whole map')}">${esc(r.name)}</button>`).join('');
    el.roleChips.querySelectorAll('.chip').forEach((b) => (b.onclick = () => setRole(b.dataset.role)));
  }

  function renderProgress() {
    const list = pathNodes();
    const done = list.filter((n) => isClear(n.id)).length;
    const pct = list.length ? Math.round((done / list.length) * 100) : 0;
    el.progress.innerHTML = `<div class="bar"><i style="width:${pct}%"></i></div><span><b>${done}</b>/${list.length} done</span>`;
  }

  function renderBanner() {
    if (S.view !== 'map') { el.banner.hidden = true; return; }
    const ups = nextUp(3);
    const role = roleById[S.role];
    const count = pathNodes().length;
    el.banner.hidden = false;
    el.banner.innerHTML = `<div class="rb-text">
      ${role ? `<b>${esc(role.name)}</b> · ${count} topics on this path` : `<b>The full map</b> · pick a path above to highlight your route`}
      ${ups.length ? `<div class="rb-next"><span class="eyebrow" style="align-self:center">Next up</span>${ups.map((n) => `<button class="mini" data-go="${n.id}">${esc(n.title)}</button>`).join('')}</div>` : '<div class="rb-next">Path complete. Try another path.</div>'}
      </div>`;
    el.banner.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => select(b.dataset.go, { center: true })));
  }

  function setRole(role, opts = {}) {
    S.role = role; save();
    renderRoles(); refreshAll();
    if (S.view === 'map' && !opts.noFit) fit();
    if (!opts.noHash) setHash(role === 'all' ? '' : 'path-' + role);
  }

  // ---------- path view ----------
  function renderPath() {
    const role = roleById[S.role];
    const list = sortNodes(D.nodes);
    const onList = list.filter((n) => onPath(n));
    const left = onList.filter((n) => !isClear(n.id) && rel(n) !== 'a');
    const hoursLeft = left.reduce((s, n) => s + hoursOf(n), 0);
    const done = onList.filter((n) => isClear(n.id)).length;
    const weeks = Math.ceil(hoursLeft / Math.max(1, S.pace));
    const ups = nextUp(4);
    let html = `<div class="path-inner${S.showAll ? ' show-all' : ''}">
      <div class="path-hero">
        <div>
          <div class="eyebrow">Learning path</div>
          <h1>${role ? esc(role.name) : 'Everything in AI'}</h1>
          <p>${role ? esc(role.blurb) : 'All 6 tiers and 11 branches in prerequisite order. Choose a path above to cut this down to what your goal needs.'}</p>
          <div class="pace"><label for="pace">At</label><input id="pace" type="number" min="1" max="60" value="${S.pace}"><span>hours a week, the rest of this path takes about <b>${weeks} weeks</b>${weeks > 8 ? ` (≈ ${Math.round(weeks / 4.3)} months)` : ''}.</span></div>
        </div>
        <div class="stats">
          <div class="stat"><b>${onList.length}</b><span>topics</span></div>
          <div class="stat"><b>${done}</b><span>done</span></div>
          <div class="stat"><b>${hoursLeft}</b><span>hours left</span></div>
        </div>
      </div>`;
    if (ups.length) {
      html += `<div class="up-next"><h3>Up next for you</h3><div class="un-list">${ups.map((n) =>
        `<button data-open="${n.id}">${esc(n.title)}<small>${esc(D.tiers[n.tier].name)} · ${esc(laneById[n.lane].name)}${n.hours ? ' · ~' + n.hours + 'h' : ''}</small></button>`).join('')}</div></div>`;
    }
    D.tiers.forEach((t) => {
      const items = list.filter((n) => n.tier === t.id);
      const visible = items.filter((n) => onPath(n));
      if (!visible.length && !S.showAll) return;
      const hrs = visible.reduce((s, n) => s + hoursOf(n), 0);
      html += `<section class="tier-sec"><div class="tier-sec-head"><h2>${esc(t.name)}</h2><span class="eyebrow">Tier ${t.id} · ${visible.length} topics${hrs ? ' · ' + hrs + 'h' : ''}</span></div><ul class="step-list">`;
      items.forEach((n) => {
        const r = rel(n), s = st(n.id), next = isNext(n);
        html += `<li class="step st-${s}${onPath(n) ? '' : ' off'}" id="step-${n.id}">
          <button class="check" data-toggle="${n.id}" aria-label="Mark ${esc(n.title)} as ${s === 'done' ? 'not started' : 'done'}">${s === 'done' ? '✓' : s === 'learning' ? '•' : s === 'skip' ? '–' : ''}</button>
          <button class="s-main" data-open="${n.id}">
            <span class="s-title">${esc(n.title)}${next ? '<span class="tag next">Next up</span>' : ''}</span>
            <span class="s-sum">${esc(n.summary || '')}</span>
          </button>
          <span class="s-side"><span class="tag lane" style="--h:${laneById[n.lane].hue}">${esc(laneById[n.lane].name)}</span>${r ? `<span class="tag rel-${r}">${REL_SHORT[r]}</span>` : ''}${n.hours ? `<span>${n.hours}h</span>` : ''}</span>
        </li>`;
      });
      html += '</ul></section>';
    });
    if (role) html += `<label class="path-toggle"><input type="checkbox" id="showAll" ${S.showAll ? 'checked' : ''}> Show topics outside this path</label>`;
    html += '</div>';
    const scroll = el.pathView.scrollTop;
    el.pathView.innerHTML = html;
    el.pathView.scrollTop = scroll;
    el.pathView.querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => select(b.dataset.open)));
    el.pathView.querySelectorAll('[data-toggle]').forEach((b) => (b.onclick = () => {
      const id = b.dataset.toggle;
      setStatus(id, st(id) === 'done' ? 'todo' : 'done');
    }));
    const pace = $('#pace', el.pathView);
    pace.onchange = () => { S.pace = Math.min(60, Math.max(1, +pace.value || 6)); save(); renderPath(); };
    const sa = $('#showAll', el.pathView);
    if (sa) sa.onchange = () => { S.showAll = sa.checked; save(); renderPath(); };
  }

  // ---------- drawer ----------
  const ICONS = {
    video: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M10 9.5l4.5 2.5-4.5 2.5z"/>',
    course: '<path d="M2.5 9 12 5l9.5 4L12 13z"/><path d="M6.5 11v4.5c0 1.4 2.5 3 5.5 3s5.5-1.6 5.5-3V11"/>',
    docs: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>',
    article: '<path d="M4 5h16M4 10h16M4 15h11M4 20h7"/>',
    book: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19"/>',
    interactive: '<path d="M5 3l13 7.5-5.5 1.8L10.5 18z"/><path d="M13 13l5 5"/>',
    paper: '<path d="M6 3h12v18H6z"/><path d="M9 7h6M9 11h6M9 15h3"/>',
    tool: '<path d="M14.5 5.5a4 4 0 0 0 4.9 4.9l-9 9a2.1 2.1 0 0 1-3-3l9-9a4 4 0 0 0-1.9-1.9z"/>',
  };
  const resHTML = (r, first) => `<a class="res${first ? ' first' : ''}" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">
      <span class="ico"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[r.type] || ICONS.article}</svg></span>
      <span><span class="r-title">${esc(r.title)}</span>
      <span class="r-meta">${first ? '<span class="start">Start here</span>' : ''}<span>${esc(r.type || 'link')}</span>${r.source ? `<span>${esc(r.source)}</span>` : ''}<span class="${r.free === false ? '' : 'free'}">${r.free === false ? 'Paid' : 'Free'}</span></span></span>
    </a>`;
  const linkBtn = (id) => { const n = byId[id]; return `<button data-open="${id}" class="${isClear(id) ? 'done' : ''}" style="--h:${laneById[n.lane].hue}"><span class="n-dot"></span>${esc(n.title)}</button>`; };

  // "What to learn": subtopics grouped by level, each with a checkbox and an optional third level of key ideas
  const LEVEL_GROUPS = [['core', 'Core', 'Learn these'], ['deep', 'Deep', 'Once the core feels comfortable'], ['optional', 'Optional', 'Safe to skip']];
  const subsGot = (id) => new Set(S.subs[id] || []);
  function learnHTML(n) {
    const subs = n.subtopics || [];
    if (!subs.length) return '';
    const got = subsGot(n.id);
    let num = 0;
    const groups = LEVEL_GROUPS.map(([lv, name, hint]) => {
      const items = subs.map((sb, j) => ({ sb, j })).filter((x) => x.sb.level === lv);
      if (!items.length) return '';
      return `<div class="sub-group" data-lv="${lv}">
        <div class="sg-head"><span class="lvl ${lv}">${name}</span><span class="sg-hint">${hint}</span><span class="sg-count"></span></div>
        <ol class="subtree">${items.map(({ sb, j }) => `
          <li class="sub${got.has(j) ? ' got' : ''}" data-j="${j}">
            <div class="sub-row">
              <button class="sub-check" aria-pressed="${got.has(j)}" aria-label="Got it: ${esc(sb.title)}" title="Mark as understood">✓</button>
              <button class="sub-toggle" aria-expanded="false">
                <span class="sub-num">${++num}</span>
                <span class="sub-title">${esc(sb.title)}</span>
                ${sb.concepts?.length ? `<span class="sub-count">${sb.concepts.length} ideas</span>` : ''}
                <span class="chev">▶</span>
              </button>
            </div>
            <div class="sub-body" hidden>
              <p class="sub-desc">${esc(sb.desc)}</p>
              ${sb.concepts?.length ? `<h4>Key ideas</h4><ol class="concepts">${sb.concepts.map((c) => `<li><b>${esc(c.title)}</b><span>${esc(c.desc)}</span></li>`).join('')}</ol>` : ''}
              ${sb.resources?.length ? `<h4>Learn it from</h4><div class="res-list">${sb.resources.map((x) => resHTML(x, false)).join('')}</div>` : ''}
            </div>
          </li>`).join('')}</ol>
      </div>`;
    }).join('');
    return `<div class="d-sec d-learn">
      <div class="learn-head">
        <h3>What to learn</h3>
        <span class="learn-prog"><span class="bar"><i></i></span><span class="lp-txt"></span></span>
      </div>
      <div class="learn-tools">
        <button class="btn sm" id="subAll">Expand all</button>
        <button class="btn sm wide-only" id="wideToggle">${S.wide ? 'Narrow view' : 'Wide view'}</button>
      </div>
      ${groups}
      <p class="learn-foot">Tick a subtopic once you could explain it to someone else.</p>
    </div>`;
  }
  function syncLearn(n) {
    const got = subsGot(n.id), total = n.subtopics?.length || 0;
    el.drawerInner.querySelectorAll('.sub').forEach((li) => {
      const on = got.has(+li.dataset.j);
      li.classList.toggle('got', on); li.querySelector('.sub-check').setAttribute('aria-pressed', on);
    });
    el.drawerInner.querySelectorAll('.sub-group').forEach((g) => {
      const lis = g.querySelectorAll('.sub');
      g.querySelector('.sg-count').textContent = `${g.querySelectorAll('.sub.got').length}/${lis.length}`;
    });
    const bar = el.drawerInner.querySelector('.learn-prog');
    if (bar) {
      bar.querySelector('i').style.width = `${total ? Math.round((got.size / total) * 100) : 0}%`;
      bar.querySelector('.lp-txt').innerHTML = `<b>${got.size}</b>/${total} understood`;
    }
  }
  function redrawDrawer() {
    const top = el.drawer.scrollTop;
    const open = [...el.drawerInner.querySelectorAll('.sub.open')].map((x) => x.dataset.j);
    renderDrawer();
    el.drawer.scrollTop = top;
    open.forEach((j) => el.drawerInner.querySelector(`.sub[data-j="${j}"] .sub-toggle`)?.click());
  }
  function toggleWide() {
    S.wide = !S.wide; save();
    el.drawer.classList.toggle('wide', S.wide);
    redrawDrawer();
    if (S.view === 'map' && S.sel) centerOn(S.sel);
  }

  function renderDrawer() {
    const n = byId[S.sel];
    if (!n) return;
    const lane = laneById[n.lane], r = rel(n), s = st(n.id);
    const anc = sortNodes([...ancestors(n.id)].map((id) => byId[id]));
    const ancLeft = anc.filter((a) => !isClear(a.id) && onPath(a));
    const order = pathNodes();
    const i = order.findIndex((x) => x.id === n.id);
    const prev = i > 0 ? order[i - 1] : null, next = i >= 0 && i < order.length - 1 ? order[i + 1] : null;
    const roleRels = D.roles.filter((ro) => n.roles[ro.id]).map((ro) => `<span>${esc(ro.short)}: <b>${REL_SHORT[n.roles[ro.id]]}</b></span>`).join('');
    const hasContent = !!n.summary;

    el.drawerInner.innerHTML = `
      <div class="d-top">
        <span class="tag lane" style="--h:${lane.hue}">${esc(lane.name)}</span>
        <span class="tag">Tier ${n.tier} · ${esc(D.tiers[n.tier].name)}</span>
        <button class="btn icon wide-btn" id="dWide" aria-pressed="${S.wide}" aria-label="${S.wide ? 'Narrow panel' : 'Widen panel'}" title="${S.wide ? 'Narrow panel' : 'Widen panel'}">${S.wide ? '⇥' : '⇤'}</button>
        <button class="btn icon close" id="dClose" aria-label="Close">×</button>
      </div>
      <h2 class="d-title">${esc(n.title)}</h2>
      <div class="d-meta">
        ${n.hours ? `<span class="tag">~${n.hours} hours</span>` : ''}
        ${n.subtopics?.length ? `<span class="tag">${n.subtopics.length} subtopics</span>` : ''}
        ${isNext(n) ? '<span class="tag next">Next up</span>' : ''}
        ${ancLeft.length ? `<span class="tag">${ancLeft.length} topic${ancLeft.length > 1 ? 's' : ''} to learn first</span>` : ''}
      </div>
      <div class="d-rel">
        ${r ? `<b>${REL[r]}</b> for ${esc(roleById[S.role].name)}.` : S.role !== 'all' ? `<b>Not on the ${esc(roleById[S.role].name)} path.</b> Explore it if you're curious.` : '<b>Who needs this</b>'}
        <div class="rel-roles">${roleRels || '<span>Optional for every path</span>'}</div>
      </div>
      <div class="status-row" role="group" aria-label="Your status">
        ${Object.entries(STATUS).map(([k, v]) => `<button data-s="${k}" aria-pressed="${s === k}">${v}</button>`).join('')}
      </div>
      <div class="d-cols">
      <div class="d-main">
      ${hasContent ? `<p class="d-sum">${esc(n.summary)}</p>` : '<div class="d-sec"><div class="d-empty">Detailed notes for this topic are on the way. Prerequisites and connections below are final.</div></div>'}
      ${n.why ? `<div class="d-sec"><h3>Why it matters</h3><p>${esc(n.why)}</p></div>` : ''}
      ${n.depth ? `<div class="d-sec"><h3>How deep to go</h3><p class="d-callout">${esc(n.depth)}</p></div>` : ''}
      ${n.outcomes?.length ? `<div class="d-sec"><h3>You'll be able to</h3><ul class="outcomes">${n.outcomes.map((o) => `<li>${esc(o)}</li>`).join('')}</ul></div>` : ''}
      </div>
      ${learnHTML(n)}
      <div class="d-more">
      <div class="d-sec"><h3>Learn these first</h3><div class="links">${n.prereqs.length ? n.prereqs.map(linkBtn).join('') : '<span class="none">Nothing. This is a starting point.</span>'}</div>
        ${anc.length > n.prereqs.length ? `<p style="font-size:13px;color:var(--ink-3);margin-top:8px">Full route to here: ${anc.length} topics, ${anc.filter((a) => isClear(a.id)).length} done. The map highlights the route while this panel is open.</p>` : ''}
        ${anc.length ? `<button class="btn" id="knowAll" style="margin-top:10px">I know this and everything before it</button>` : ''}
      </div>
      <div class="d-sec"><h3>Unlocks</h3><div class="links">${n.unlocks.length ? n.unlocks.map(linkBtn).join('') : '<span class="none">End of this branch. Time to build something.</span>'}</div></div>
      ${n.resources?.length ? `<div class="d-sec"><h3>Resources</h3><div class="res-list">${n.resources.map((x, j) => resHTML(x, j === 0)).join('')}</div></div>` : ''}
      ${n.project ? `<div class="d-sec"><h3>Prove it · mini project</h3><p class="d-project">${esc(n.project)}</p></div>` : ''}
      </div>
      </div>
      <div class="d-nav">
        ${prev ? `<button class="btn" data-open="${prev.id}" title="${esc(prev.title)}">← ${esc(prev.title)}</button>` : '<span></span>'}
        ${next ? `<button class="btn" data-open="${next.id}" title="${esc(next.title)}">${esc(next.title)} →</button>` : ''}
      </div>`;

    $('#dClose').onclick = closeDrawer;
    el.drawerInner.querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => select(b.dataset.open, { center: true })));
    el.drawerInner.querySelectorAll('.status-row button').forEach((b) => (b.onclick = () => setStatus(n.id, b.dataset.s)));
    $('#dWide').onclick = toggleWide;
    const wb = $('#wideToggle');
    if (wb) wb.onclick = toggleWide;
    const toggleSub = (li, open) => {
      li.classList.toggle('open', open); li.querySelector('.sub-toggle').setAttribute('aria-expanded', open); li.querySelector('.sub-body').hidden = !open;
    };
    const items = [...el.drawerInner.querySelectorAll('.sub')];
    const allBtn = $('#subAll');
    const syncAll = () => { if (allBtn) allBtn.textContent = items.every((li) => li.classList.contains('open')) ? 'Collapse all' : 'Expand all'; };
    items.forEach((li) => {
      li.querySelector('.sub-toggle').onclick = () => { toggleSub(li, !li.classList.contains('open')); syncAll(); };
      li.querySelector('.sub-check').onclick = () => {
        const j = +li.dataset.j, got = new Set(S.subs[n.id] || []);
        if (got.has(j)) got.delete(j); else got.add(j);
        if (got.size) S.subs[n.id] = [...got].sort((a, b) => a - b); else delete S.subs[n.id];
        save(); syncLearn(n);
      };
    });
    if (allBtn) allBtn.onclick = () => { const open = !items.every((li) => li.classList.contains('open')); items.forEach((li) => toggleSub(li, open)); syncAll(); };
    syncLearn(n);
    const ka = $('#knowAll');
    if (ka) ka.onclick = () => {
      [...ancestors(n.id), n.id].forEach((id) => { if (st(id) !== 'skip') S.status[id] = 'done'; });
      save(); refreshAll(); toast(`Marked ${anc.length + 1} topics as done`);
    };
  }

  function select(id, opts = {}) {
    if (!byId[id]) return;
    S.sel = id;
    el.drawer.hidden = false;
    el.drawer.classList.toggle('wide', S.wide);
    renderDrawer();
    el.drawer.scrollTop = 0;
    refreshMap();
    if (S.view === 'map' && (opts.center || window.innerWidth <= 640)) centerOn(id);
    if (S.view === 'path') document.getElementById('step-' + id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    setHash(id);
  }
  function closeDrawer() {
    S.sel = null; el.drawer.hidden = true; refreshMap();
    setHash(S.role === 'all' ? '' : 'path-' + S.role);
  }
  function setStatus(id, s) {
    if (s === 'todo') delete S.status[id]; else S.status[id] = s;
    save(); refreshAll();
  }

  // ---------- search ----------
  function matches(n, q) {
    return n.title.toLowerCase().includes(q) || (n.subtopics || []).some((s) => s.title.toLowerCase().includes(q)) ||
      (n.summary || '').toLowerCase().includes(q) || laneById[n.lane].name.toLowerCase().includes(q);
  }
  let active = 0, hits = [];
  function runSearch() {
    const q = el.search.value.trim().toLowerCase();
    if (S.view === 'map') refreshMap();
    if (q.length < 2) { el.results.hidden = true; return; }
    hits = D.nodes.map((n) => {
      const t = n.title.toLowerCase();
      const sub = (n.subtopics || []).find((s) => s.title.toLowerCase().includes(q));
      const score = t.startsWith(q) ? 5 : t.includes(q) ? 4 : sub ? 3 : (n.summary || '').toLowerCase().includes(q) ? 1 : laneById[n.lane].name.toLowerCase().includes(q) ? 1 : 0;
      return { n, sub, score };
    }).filter((h) => h.score).sort((a, b) => b.score - a.score || a.n.tier - b.n.tier).slice(0, 9);
    active = 0;
    el.results.hidden = false;
    el.results.innerHTML = hits.length ? hits.map((h, i) => `<li><button data-i="${i}" class="${i === 0 ? 'active' : ''}">
        <span class="n-dot" style="width:9px;height:9px;border-radius:50%;background:hsl(${laneById[h.n.lane].hue} var(--lane-s) var(--lane-l))"></span>
        <span>${esc(h.n.title)}</span><span class="r-tier">T${h.n.tier}</span>
        ${h.sub && !h.n.title.toLowerCase().includes(q) ? `<span class="r-sub">in subtopic: ${esc(h.sub.title)}</span>` : ''}</button></li>`).join('')
      : '<li class="empty">No topics match. Try a broader word like "agents" or "math".</li>';
    el.results.querySelectorAll('button').forEach((b) => (b.onmousedown = (e) => { e.preventDefault(); pick(+b.dataset.i); }));
  }
  function pick(i) {
    const h = hits[i]; if (!h) return;
    el.results.hidden = true; el.search.blur();
    select(h.n.id, { center: true });
    if (h.sub) {
      const j = h.n.subtopics.indexOf(h.sub);
      el.drawerInner.querySelector(`.sub[data-j="${j}"] > button`)?.click();
    }
  }
  el.search.addEventListener('input', runSearch);
  el.search.addEventListener('focus', runSearch);
  el.search.addEventListener('blur', () => setTimeout(() => (el.results.hidden = true), 120));
  el.search.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % Math.max(1, hits.length);
      el.results.querySelectorAll('button').forEach((b, i) => b.classList.toggle('active', i === active));
    } else if (e.key === 'Enter') { e.preventDefault(); pick(active); }
    else if (e.key === 'Escape') { el.search.value = ''; runSearch(); el.search.blur(); }
  });

  // ---------- modals ----------
  function openModal(html, onReady) {
    el.modalBody.innerHTML = html; el.modal.hidden = false;
    el.modalBody.querySelectorAll('[data-close]').forEach((b) => (b.onclick = closeModal));
    onReady && onReady();
  }
  function closeModal() { el.modal.hidden = true; }
  el.modal.addEventListener('click', (e) => { if (e.target === el.modal) closeModal(); });

  const PRESET = ['what-is-ai', 'ai-landscape', 'prompting-basics', 'prompt-engineering', 'ai-productivity', 'ai-limitations', 'python-basics', 'git-cli', 'apis-json', 'llm-basics'];
  function skillCheck() {
    const groups = D.lanes.map((l) => ({ l, items: D.nodes.filter((n) => n.lane === l.id && n.tier <= 2) })).filter((g) => g.items.length);
    openModal(`
      <div class="eyebrow">Skill check</div>
      <h2 id="modalTitle">What do you already know?</h2>
      <p class="lead">Tick what you're comfortable with. The map marks those topics as done and shows you what's next on your path. You can change any of it later.</p>
      <div style="margin-top:14px"><button class="btn" id="preset">I can prompt, code in Python, and use LLMs</button></div>
      <div class="kc-grid">${groups.map((g) => `<div class="kc-group" style="--h:${g.l.hue}"><h4>${esc(g.l.name)}</h4>
        ${g.items.map((n) => `<label class="kc-item"><input type="checkbox" value="${n.id}" ${isClear(n.id) ? 'checked' : ''}><span>${esc(n.title)} <small>T${n.tier}</small></span></label>`).join('')}</div>`).join('')}</div>
      <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" id="kcSave">Update my map</button></div>`, () => {
      $('#preset').onclick = () => el.modalBody.querySelectorAll('.kc-item input').forEach((i) => { if (PRESET.includes(i.value)) i.checked = true; });
      $('#kcSave').onclick = () => {
        let c = 0;
        el.modalBody.querySelectorAll('.kc-item input').forEach((i) => {
          if (i.checked) { if (!isClear(i.value)) S.status[i.value] = 'done'; c++; }
          else if (st(i.value) === 'done') delete S.status[i.value];
        });
        save(); closeModal(); refreshAll();
        toast(`${c} topics marked as known. Orange rings show what's next.`);
      };
    });
  }

  function help() {
    openModal(`
      <div class="eyebrow">How it works</div>
      <h2 id="modalTitle">Find your route through AI</h2>
      <p class="lead">${D.nodes.length} topics in ${D.tiers.length} tiers and ${D.lanes.length} branches. Arrows point from what you need first to what it unlocks.</p>
      <div class="help-grid">
        <div><h4>1 · Pick a path</h4><p>Choose a role above. Topics that role doesn't need fade out. Bold borders are must-learn, plain borders are should-know, and dashed borders are things to be aware of.</p></div>
        <div><h4>2 · Tell it what you know</h4><p>Use "What I already know", or open any topic and press "I know this and everything before it". Orange rings then mark what you can start next.</p></div>
        <div><h4>3 · Click to go deeper</h4><p>Each topic opens with why it matters, how deep to go, subtopics you can expand, curated resources, and a mini project. The route to it lights up on the map.</p></div>
        <div><h4>4 · Map or Path</h4><p>Map shows the whole tree. Drag to pan, pinch or ⌘/Ctrl-scroll to zoom. Path is the same content as an ordered checklist with a time estimate.</p></div>
      </div>
      <div class="d-sec"><h3>Your progress</h3>
        <p style="font-size:14px;color:var(--ink-2)">Progress is saved in this browser only. Copy it to move it to another device, then paste it there.</p>
        <textarea class="io-area" id="ioArea" spellcheck="false">${esc(JSON.stringify(S.status))}</textarea>
        <div class="modal-actions" style="justify-content:flex-start">
          <button class="btn" id="ioCopy">Copy progress</button><button class="btn" id="ioLoad">Load pasted progress</button>
          <span class="spacer"></span><button class="btn" id="ioReset">Reset progress</button>
        </div>
      </div>
      ${aboutMe()}
      <div class="modal-actions"><button class="btn" id="showLegend">Show map legend</button><button class="btn primary" data-close>Got it</button></div>`, () => {
      const area = $('#ioArea');
      $('#ioCopy').onclick = () => {
        navigator.clipboard?.writeText(area.value).then(() => toast('Progress copied'), () => { area.select(); toast('Press ⌘/Ctrl+C to copy'); });
        if (!navigator.clipboard) { area.select(); toast('Press ⌘/Ctrl+C to copy'); }
      };
      $('#ioLoad').onclick = () => {
        try {
          const v = JSON.parse(area.value);
          if (typeof v !== 'object' || Array.isArray(v)) throw new Error();
          S.status = Object.fromEntries(Object.entries(v).filter(([k, s]) => byId[k] && STATUS[s]));
          save(); refreshAll(); toast('Progress loaded');
        } catch (e) { toast("That text isn't saved progress. Copy it again from the other device."); }
      };
      const reset = $('#ioReset');
      reset.onclick = () => {
        if (reset.dataset.armed) { S.status = {}; save(); refreshAll(); area.value = '{}'; reset.textContent = 'Reset progress'; delete reset.dataset.armed; toast('Progress cleared'); }
        else { reset.dataset.armed = '1'; reset.textContent = 'Click again to clear everything'; }
      };
      $('#showLegend').onclick = () => { S.legend = true; save(); renderLegend(); closeModal(); };
    });
  }
  // ---------- share & creator ----------
  const SITE = 'https://airoadmap.daniellasek.com/';
  const ICON = {
    linkedin: 'M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.34V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13ZM7.12 20.45H3.56V9h3.56v11.45ZM22.22 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0Z',
    x: 'M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.65l-5.21-6.82-5.97 6.82H1.68l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23Zm-1.16 17.52h1.83L7.08 4.13H5.12l11.96 15.64Z',
    youtube: 'M23.5 6.2a3 3 0 0 0-2.12-2.13C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.52A3 3 0 0 0 .5 6.2 31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 5.8 3 3 0 0 0 2.12 2.13c1.88.52 9.38.52 9.38.52s7.5 0 9.38-.52a3 3 0 0 0 2.12-2.13A31.4 31.4 0 0 0 24 12a31.4 31.4 0 0 0-.5-5.8ZM9.6 15.57V8.43L15.82 12 9.6 15.57Z',
    facebook: 'M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.1 24 18.1 24 12.07Z',
    reddit: 'M24 11.78a2.6 2.6 0 0 0-4.43-1.85 12.8 12.8 0 0 0-6.9-2.19l1.17-5.5 3.82.81a1.85 1.85 0 1 0 .19-.9l-4.27-.9a.46.46 0 0 0-.55.36l-1.3 6.13a12.9 12.9 0 0 0-7 2.19 2.6 2.6 0 1 0-2.87 4.25 5.1 5.1 0 0 0-.06.79c0 4.01 4.67 7.27 10.43 7.27s10.43-3.26 10.43-7.27a5.1 5.1 0 0 0-.06-.79A2.6 2.6 0 0 0 24 11.78ZM6.2 13.63a1.85 1.85 0 1 1 3.7 0 1.85 1.85 0 0 1-3.7 0Zm10.36 4.92c-1.27 1.27-3.7 1.37-4.56 1.37s-3.3-.1-4.56-1.37a.5.5 0 0 1 .7-.7c.8.8 2.5 1.08 3.86 1.08s3.06-.28 3.86-1.08a.5.5 0 0 1 .7.7Zm-.33-3.07a1.85 1.85 0 1 1 0-3.7 1.85 1.85 0 0 1 0 3.7Z',
    whatsapp: 'M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.7.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35ZM12.05 21.8h-.01a9.9 9.9 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26c0-5.45 4.44-9.88 9.9-9.88a9.83 9.83 0 0 1 9.88 9.89c0 5.45-4.44 9.88-9.89 9.88Zm8.41-18.3A11.81 11.81 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.9c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.9 0-3.18-1.24-6.17-3.48-8.4Z',
    mail: 'M2 4h20a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 2v.4l10 6.25L22 6.4V6H2Zm20 2.76-9.47 5.92a1 1 0 0 1-1.06 0L2 8.76V18h20V8.76Z',
  };
  const svg = (k) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICON[k]}"/></svg>`;
  const ME = [
    ['linkedin', 'LinkedIn', 'https://www.linkedin.com/in/daniel-lasek'],
    ['x', '@itsdevdaniel', 'https://x.com/itsdevdaniel'],
    ['youtube', 'YouTube', 'https://www.youtube.com/@daniellasekai'],
  ];
  const aboutMe = () => `<div class="about-me"><p>Built by <b>Daniel Lasek</b></p>
    <div class="links">${ME.map(([k, label, href]) => `<a href="${href}" target="_blank" rel="noopener me">${svg(k)}${esc(label)}</a>`).join('')}</div></div>`;

  // Share the live site, keeping the open topic or path; fall back to the canonical URL inside sandboxes.
  function shareUrl() {
    const live = /^https?:$/.test(location.protocol) && location.hostname === new URL(SITE).hostname;
    return live ? location.href : SITE + location.hash;
  }
  function share() {
    const url = shareUrl();
    const n = S.sel && byId[S.sel];
    const text = n ? `${n.title}: what to learn and how deep to go, on the AI Learning Atlas` : 'AI Learning Atlas: every AI skill, in the order you need it. Free interactive roadmap with curated resources.';
    const u = encodeURIComponent(url), t = encodeURIComponent(text);
    const targets = [
      ['x', 'X', `https://x.com/intent/post?text=${t}&url=${u}&via=itsdevdaniel`],
      ['linkedin', 'LinkedIn', `https://www.linkedin.com/sharing/share-offsite/?url=${u}`],
      ['facebook', 'Facebook', `https://www.facebook.com/sharer/sharer.php?u=${u}`],
      ['reddit', 'Reddit', `https://www.reddit.com/submit?url=${u}&title=${t}`],
      ['whatsapp', 'WhatsApp', `https://wa.me/?text=${encodeURIComponent(text + ' ' + url)}`],
      ['mail', 'Email', `mailto:?subject=${encodeURIComponent('AI Learning Atlas')}&body=${encodeURIComponent(text + '\n\n' + url)}`],
    ];
    openModal(`
      <div class="eyebrow">Share</div>
      <h2 id="modalTitle">${n ? `Share “${esc(n.title)}”` : 'Share the AI Learning Atlas'}</h2>
      <p class="lead">${n ? 'The link opens the map with this topic selected.' : 'Know someone figuring out where to start with AI? Send them the map.'}</p>
      <div class="share-grid">${targets.map(([k, label, href]) => `<a class="btn" href="${href}" target="_blank" rel="noopener">${svg(k)}${label}</a>`).join('')}</div>
      <div class="share-link"><input id="shareUrl" readonly value="${esc(url)}" aria-label="Link to share"><button class="btn primary" id="shareCopy">Copy link</button></div>
      ${aboutMe()}
      <div class="modal-actions">${navigator.share ? '<button class="btn" id="shareMore">More options…</button>' : ''}<button class="btn" data-close>Done</button></div>`, () => {
      const input = $('#shareUrl');
      input.onfocus = () => input.select();
      $('#shareCopy').onclick = () => {
        if (!navigator.clipboard) { input.select(); toast('Press ⌘/Ctrl+C to copy'); return; }
        navigator.clipboard.writeText(url).then(() => toast('Link copied'), () => { input.select(); toast('Press ⌘/Ctrl+C to copy'); });
      };
      const more = $('#shareMore');
      if (more) more.onclick = () => navigator.share({ title: 'AI Learning Atlas', text, url }).catch(() => {});
    });
  }
  $('#shareBtn').onclick = share;

  $('#skillCheckBtn').onclick = skillCheck;
  $('#helpBtn').onclick = help;

  let toastT;
  function toast(msg) {
    el.toast.textContent = msg; el.toast.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => (el.toast.hidden = true), 2800);
  }

  // ---------- views ----------
  function setView(v) {
    S.view = v; save();
    $('#viewMap').setAttribute('aria-selected', v === 'map');
    $('#viewPath').setAttribute('aria-selected', v === 'path');
    el.mapView.hidden = v !== 'map';
    el.pathView.hidden = v !== 'path';
    refreshAll();
    if (v === 'map') fit();
  }
  $('#viewMap').onclick = () => setView('map');
  $('#viewPath').onclick = () => setView('path');

  function refreshAll() {
    renderProgress();
    if (S.view === 'map') { refreshMap(); renderBanner(); } else renderPath();
    if (S.sel) redrawDrawer();
  }

  // ---------- hash & keys ----------
  function setHash(h) {
    try { history.replaceState(null, '', h ? '#' + h : location.pathname + location.search); } catch (e) { /* sandboxed */ }
  }
  function readHash() {
    const h = decodeURIComponent(location.hash.slice(1));
    if (h.startsWith('path-') && roleById[h.slice(5)]) { S.role = h.slice(5); return null; }
    return byId[h] ? h : null;
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') { e.preventDefault(); el.search.focus(); }
    else if (e.key === 'Escape') { if (!el.modal.hidden) closeModal(); else if (S.sel) closeDrawer(); }
  });
  let rz;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => S.view === 'map' && !S.sel && fit(), 150); });

  // ---------- boot ----------
  const initial = readHash();
  buildMap();
  renderRoles();
  renderLegend();
  setView(S.view);
  if (initial) select(initial, { center: true });
})();

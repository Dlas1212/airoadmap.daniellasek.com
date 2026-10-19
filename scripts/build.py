#!/usr/bin/env python3
"""Merge data/structure.json + data/content/*.json into site/data.js, and bundle a single-file
dist/ai-atlas.html (body-only markup, everything inlined) for publishing as an artifact."""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TYPES = {"video", "course", "docs", "article", "book", "interactive", "paper", "tool"}
LEVELS = {"core", "deep", "optional"}


def load_content():
    content, problems = {}, []
    for f in sorted((ROOT / "data/content").glob("*.json")):
        try:
            data = json.loads(f.read_text())
        except json.JSONDecodeError as e:
            problems.append(f"{f.name}: invalid JSON ({e})")
            continue
        for k, v in data.items():
            if k in content:
                problems.append(f"{f.name}: duplicate node {k}")
            content[k] = v
    return content, problems


def clean_resources(items, where, problems):
    out = []
    for r in items or []:
        url = r.get("url", "")
        if not url.startswith("https://") and not url.startswith("http://"):
            problems.append(f"{where}: dropped resource with bad url {url!r}")
            continue
        if r.get("type") not in TYPES:
            r["type"] = "article"
        out.append({k: r[k] for k in ("title", "url", "type", "source", "free") if k in r})
    return out


def main():
    structure = json.loads((ROOT / "data/structure.json").read_text())
    content, problems = load_content()
    ids = {n["id"] for n in structure["nodes"]}
    for k in content:
        if k not in ids:
            problems.append(f"content for unknown node {k}")
    missing = []
    for n in structure["nodes"]:
        c = content.get(n["id"])
        if not c:
            missing.append(n["id"])
            continue
        n["summary"] = c.get("summary", "")
        n["why"] = c.get("why", "")
        n["depth"] = c.get("depth", "")
        n["hours"] = int(c.get("hours") or 0)
        n["outcomes"] = c.get("outcomes", [])
        n["project"] = c.get("project", "")
        n["resources"] = clean_resources(c.get("resources"), n["id"], problems)
        subs = []
        for s in c.get("subtopics", []):
            lvl = s.get("level", "core")
            subs.append({
                "title": s.get("title", ""),
                "desc": s.get("desc", ""),
                "level": lvl if lvl in LEVELS else "core",
                "resources": clean_resources(s.get("resources"), f"{n['id']} / {s.get('title')}", problems),
            })
        n["subtopics"] = subs

    data_js = "window.ROADMAP = " + json.dumps(structure, ensure_ascii=False, separators=(",", ":")) + ";\n"
    (ROOT / "site/data.js").write_text(data_js)

    html = (ROOT / "site/index.html").read_text()
    head = re.search(r"<!-- BUILD:HEAD -->(.*?)<!-- BUILD:END -->", html, re.S).group(1).strip()
    body = re.search(r"<!-- BUILD:BODY -->(.*?)<!-- BUILD:END -->", html, re.S).group(1).strip()
    css = (ROOT / "site/styles.css").read_text()
    app = (ROOT / "site/app.js").read_text()
    bundle = f"{head}\n<style>\n{css}</style>\n{body}\n<script>\n{data_js}</script>\n<script>\n{app}</script>\n"
    (ROOT / "dist").mkdir(exist_ok=True)
    (ROOT / "dist/ai-atlas.html").write_text(bundle)

    n_res = sum(len(n.get("resources", [])) + sum(len(s["resources"]) for s in n.get("subtopics", [])) for n in structure["nodes"])
    print(f"nodes: {len(structure['nodes'])}  with content: {len(structure['nodes']) - len(missing)}  resources: {n_res}")
    if missing:
        print("missing content:", ", ".join(missing))
    for p in problems:
        print("warn:", p)
    print(f"wrote site/data.js ({len(data_js)//1024} KB) and dist/ai-atlas.html ({len(bundle)//1024} KB)")


if __name__ == "__main__":
    sys.exit(main())

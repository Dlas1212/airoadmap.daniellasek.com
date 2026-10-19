# AI Learning Atlas

An interactive map of what to learn in AI, in prerequisite order: 78 topics, 6 tiers (Fundamentals → Frontier),
11 branches, and 8 role paths (AI Engineer, ML Engineer, Data Scientist, Research Scientist, AI PM,
Business Owner, No-code Automator, Everyday Power User).

## Layout
- `data/structure.json`: the tree. Topics, tiers, branches, prerequisites, and how much each role needs each topic (`c` must, `r` should, `a` aware).
- `data/content/*.json`: per-topic content (summary, why, how deep to go, outcomes, subtopics, resources, project).
- `data/CONTENT_BRIEF.md`: the writing and sourcing rules for content.
- `site/`: the static app (`index.html`, `styles.css`, `app.js`, generated `data.js`).
- `scripts/build.py`: merges data into `site/data.js` and bundles `dist/ai-atlas.html` (single file).

## Run
    python3 scripts/build.py
    open site/index.html          # or: python3 -m http.server -d site

## Add or change a topic
Edit `structure.json` (id, tier, lane, prereqs, roles), add its content in any `data/content/*.json`, and rebuild.
The build warns about missing content, unknown ids, and malformed links.

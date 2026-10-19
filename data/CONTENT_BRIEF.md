# Content brief for the AI Learning Roadmap

We're building an interactive website, a tree map of everything you need to learn about AI. It's organized by
tier (Fundamentals → Foundational → Intermediate → Advanced → Expert → Frontier) and by branch ("lane").
It has role paths (AI Engineer, ML Engineer, Data Scientist, Research Scientist, AI Product Manager,
Business Owner, No-code Automator, Everyday Power User). The structure (node ids, tiers, lanes,
prerequisites, which roles need each node) is fixed in `data/structure.json`. Read it first so you
understand where your nodes sit and what comes before and after them. Do NOT change the structure.

Your job: write the learning content for the nodes you're assigned. Output ONE JSON file (path given
in your task), an object keyed by node id:

```json
{
  "rag-fundamentals": {
    "summary": "1–2 plain-language sentences: what this is.",
    "why": "1–2 sentences: why it matters and when you actually need it.",
    "depth": "1–2 sentences on how deep to go. Separate 'must master' from 'just know it exists' (e.g. 'You don't need to derive backprop by hand; you do need to know what a gradient tells you.').",
    "hours": 15,
    "outcomes": ["You can ...", "You can ...", "You can ..."],
    "subtopics": [
      {
        "title": "Embedding the query",
        "desc": "One or two sentences explaining it.",
        "level": "core",
        "resources": [ { "title": "...", "url": "https://...", "type": "article", "source": "Pinecone", "free": true } ]
      }
    ],
    "resources": [
      { "title": "...", "url": "https://...", "type": "video", "source": "3Blue1Brown", "free": true }
    ],
    "project": "One concrete hands-on mini project to prove you've learned it."
  }
}
```

Rules:
- `hours`: a realistic estimate to reach working competence (an integer).
- `outcomes`: 3–5 items.
- `subtopics`: 4–7 per node. `level` is one of `core` (learn this), `deep` (go here once comfortable),
  or `optional` (good to know about, safe to skip). Subtopics are how the site lets people "click in and go deeper",
  so make them meaningful branches, not filler. Subtopic `resources` are optional (0–2 each); add them
  where a specific link helps.
- `resources` (node level): 4–7 per node, mixed types. `type` is one of `video`, `course`, `docs`, `article`,
  `book`, `interactive`, `paper`, `tool`. Order best first. Mark `free` honestly.
- Prefer trusted, durable sources: official docs (Anthropic, OpenAI, Google, Hugging Face, PyTorch,
  scikit-learn, etc.), well-known educators (3Blue1Brown, Andrej Karpathy, StatQuest, fast.ai,
  DeepLearning.AI, Jay Alammar, Lilian Weng, Chip Huyen, Simon Willison, Khan Academy, MIT OCW, Stanford
  courses, d2l.ai, Google ML Crash Course, Kaggle Learn), standards bodies (NIST, OWASP, EU), and seminal papers (arXiv).
- **Links must be real.** Do not invent URLs or YouTube video IDs. Use WebSearch/WebFetch to confirm any URL you
  aren't certain of. A stable page you've confirmed (a course homepage, a playlist, an official doc page) beats a deep link
  you're guessing at. If you can't verify a link, drop it.
- Writing style: plain, direct, friendly, for a smart beginner. Short sentences. No hype, no marketing language,
  no em-dashes used as asides. Use real terms of art and explain them briefly.
- Content should be current as of late 2026 (agents, MCP, reasoning models, context engineering, etc. are mainstream).
- Output must be valid JSON (no comments, no trailing commas). Validate it with `python3 -c "import json;json.load(open('<path>'))"` before finishing.
- When done, reply with a short note: the node ids you covered and any links you couldn't verify and dropped.

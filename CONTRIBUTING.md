# Contributing

Thanks for helping make the AI Learning Atlas better. Most contributions touch a single JSON file.

## Fix a broken link or suggest a better resource

1. Find the topic in `data/content/*.json` (search for its id or title).
2. Edit its `resources` list, or a subtopic's `resources`. Order resources best first, because the first one is shown as "Start here".
3. Each resource looks like this:
   ```json
   { "title": "Neural Networks: Zero to Hero", "url": "https://...", "type": "video", "source": "Andrej Karpathy", "free": true }
   ```
   `type` is one of `video`, `course`, `docs`, `article`, `book`, `interactive`, `paper`, `tool`.

Prefer durable, trusted sources: official docs, well-known educators, university courses, and original papers.
Please don't submit affiliate links or your own paid products.

## Add or move a topic

1. Add the topic to `data/structure.json` with an `id`, `title`, `tier` (0–5), `lane` (branch id), `prereqs` (ids),
   and `roles` (`c` = must learn, `r` = should know, `a` = be aware).
2. Add its content in the matching `data/content/*.json` file, following [`data/CONTENT_BRIEF.md`](data/CONTENT_BRIEF.md).
3. Run `python3 scripts/build.py`. It warns about missing content, unknown ids, and malformed links.
4. Open `site/index.html` and check the topic on the map.

## Writing style

Plain, direct, and friendly, for a smart beginner. Use short sentences, no hype, and explain terms of art briefly.

## Pull requests

Keep each PR focused (one topic or one batch of link fixes). Commit the regenerated `site/data.js` along with your data changes.

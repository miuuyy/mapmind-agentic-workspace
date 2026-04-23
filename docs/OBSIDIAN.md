# Obsidian Bridge

Clew can move structure in both directions:

- Obsidian vault to Clew graph
- Clew graph to Obsidian-ready markdown folder

This bridge is useful when Obsidian is where your notes live, but Clew is where you want to shape the learning path.

## Import From Obsidian

In the app, open **Create graph** and choose **Import from Obsidian**.

The importer reads Markdown files from a selected vault folder and builds a graph package before applying it.

It can derive:

- topics from Markdown files
- topic titles from filenames or frontmatter
- descriptions from the first meaningful paragraph
- artifacts from note bodies
- edges from wiki links
- zones from folder paths
- placeholder topics for missing links when enabled

## Relation Hints

Plain links are accepted. If a link needs a specific learning relation, use an inline hint:

```markdown
[[Linear Algebra]]::requires
[[Probability]]::supports
[[Embeddings]]::bridges
```

Supported relations:

- `requires`
- `supports`
- `bridges`
- `extends`
- `reviews`

The importer also understands legacy frontmatter fields such as `mapmind_relations` and `mapmind_edges`. Those names remain for compatibility with older graph packages.

## Import Options

The import dialog lets you choose:

- graph title
- subject
- fallback relation for untyped links
- whether folders become zones
- whether descriptions are autofilled from note bodies
- whether note bodies become artifacts
- whether links to missing notes become placeholder topics

The preview shows topic, edge, and zone counts plus warnings/errors before import.

## Export To Obsidian

Open **Export graph** and choose **Obsidian folder**.

The exporter writes a markdown folder containing:

- a graph README
- one note per topic
- optional topic descriptions
- optional resources
- optional artifacts
- optional progress state
- folder placement based on primary zones when enabled

Modern Chromium browsers support direct folder writing. If the browser does not support it, Clew will explain that the export requires folder write access.

## Compatibility Notes

Clew still uses `mapmind_graph_export`, `mapmind_obsidian_export`, and `mapmind_*` metadata fields internally for compatibility with older local packages.

Those are protocol names, not product copy. User-facing docs and UI should say Clew.

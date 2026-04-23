# ADR 0004: External learning bridges preserve the graph boundary

- Status: Accepted
- Date: 2026-04-24

## Context

Clew is built around a learning path: topics, dependencies, zones, resources,
progress, and the user's current direction.

That path is more universal than one UI. It should be able to touch the tools
where people already keep notes or ask for help:

- Obsidian, where a user may already have a vault or may want to keep a graph
  as readable Markdown
- MCP clients, where an external assistant can use the user's current graph as
  context for answers, project suggestions, and study guidance

Obsidian is not being replaced. It is a strong note surface, but it does not
provide Clew's graph-first planning, proposal review, progress model, or topic
closure flow.

MCP is not being used as a second app interface. Its main job is context: an
assistant can ask Clew what the user is learning, what comes next, and which
topics block the current path before answering.

The core boundary still matters: Clew owns the active graph state. External
bridges can prepare, move, or read learning structure, but they must not become
hidden mutation paths.

## Decision

Treat Obsidian and MCP as external learning bridges around the Clew graph.

Obsidian is the portable learning-path bridge:

- a plain vault can be imported as topics, folders, note bodies, and links
- a richer vault can be prepared by an external agent before import by adding
  relation metadata or explicit note links
- a Clew graph can be exported back into an Obsidian-ready folder so the path
  remains readable and useful outside Clew
- Obsidian can carry the path, but Clew remains the place where the path is
  shaped, reviewed, studied, and progressed

MCP is the read-only context bridge:

- external assistants can inspect workspaces, graphs, topics, progress,
  resources, neighbors, and blockers
- the main use case is better contextual help, for example: "suggest a project
  to reinforce this topic using where I am in the graph"
- MCP tools must not apply graph mutations directly
- future write-capable MCP behavior would need a separate ADR and would have to
  route through Clew's proposal/review boundary

Both bridges exist because AI works better with structured context, and a
learning path is exactly the kind of structure an assistant should be able to
read.

## Implementation anchors

The Obsidian importer does not only ingest loose files. It can consume links
and explicit relation metadata, which is what lets an external agent prepare a
vault before Clew imports it. Source: `frontend/src/lib/obsidianImport.ts`.

```ts
const explicitRelationLinks = extractExplicitRelationEntries(frontmatter, entry.path);
const wikilinks = extractWikilinks(cleanBody, entry.path);
const markdownLinks = extractMarkdownInternalLinks(cleanBody, entry.path);

links: [...explicitRelationLinks.links, ...wikilinks.links, ...markdownLinks.links],
```

```ts
const entries = [
  ...normalizeStringArray(frontmatter.mapmind_relations),
  ...normalizeStringArray(frontmatter.mapmind_edges),
];
```

The Obsidian exporter writes graph structure back into Markdown metadata, so a
Clew graph can become a readable vault instead of a trapped app state. Source:
`backend/app/services/obsidian_export.py`.

```py
if outgoing_edges:
    lines.append("mapmind_relations:")
    for edge in outgoing_edges:
        target = topics_by_id.get(edge.target_topic_id)
        lines.append(f"  - relation: {_yaml_string(edge.relation)}")
```

The MCP server exposes context tools and wires them to reads from the current
workspace. There is no write handler in this surface. Source:
`backend/app/mcp_server/server.py`.

```py
handlers: dict[str, Callable[[dict[str, Any]], dict[str, Any]]] = {
    "list_graphs": lambda _args: tool_impls.list_graphs(repository.current().workspace),
    "get_current_learning_context": lambda args: tool_impls.get_current_context(
        repository.current().workspace,
        graph_id=args.get("graph_id"),
    ),
    "get_node": lambda args: tool_impls.get_node(
        repository.current().workspace,
        graph_id=args["graph_id"],
        node_id=args["node_id"],
    ),
    "search_notes": lambda args: tool_impls.search_nodes(
        repository.current().workspace,
        query=args["query"],
        graph_id=args.get("graph_id"),
        limit=int(args.get("limit") or 12),
    ),
}
```

The MCP tool implementation is intentionally read-only. Source:
`backend/app/mcp_server/tools.py`.

```py
"""Pure read-only tool implementations for the Clew MCP server.

These functions take a WorkspaceDocument (loaded by server.py from the
repository) and return plain dicts. They do not touch the LLM layer and do
not mutate the workspace in any way.
"""
```

The `mapmind_*` metadata names remain for compatibility with older local graph
packages even though the product is now Clew.

## Alternatives considered

### 1. Import only plain Obsidian notes

Rejected.

Plain note import is useful, but it loses the strongest version of the bridge:
an external agent can prepare an Obsidian vault with links or relation metadata
before Clew imports it. That makes Obsidian a staging surface for a learning
path, not just a pile of notes.

### 2. Make Obsidian the source of truth

Rejected.

Obsidian is excellent for writing and browsing notes, but Clew's product value
comes from graph-first planning, reviewable graph changes, progress, closure,
and a dedicated learning workspace. The vault can carry the path; it should not
own the active state.

### 3. Continuous two-way sync

Rejected for now.

It sounds convenient, but it creates conflict semantics and can turn file edits
into silent graph mutations. Import and export are explicit actions. Background
sync would need a separate design.

### 4. Read/write MCP tools

Rejected.

The MCP use case is context, not control. A different assistant UI should not
mutate the graph directly, because it would bypass the place where Clew can show
review, validation, snapshots, and rollback. Write access would require a
separate proposal surface.

### 5. Keep Clew isolated from external tools

Rejected.

That would keep the implementation smaller, but it would make the learning path
less useful. The whole point is that the graph can become context for AI and can
move through real note workflows without giving up its trust boundary.

## Consequences

Positive:

- users can bring an existing vault into Clew
- users can use an external agent to prepare a better graph-shaped vault before
  import
- users can export a Clew graph back into a readable Obsidian folder
- external assistants can answer with the user's actual learning path in mind
- Clew stays graph-first while becoming more useful alongside the tools people
  already use

Negative:

- import needs clear preview and validation because inferred links can be wrong
- export metadata needs to stay stable enough for external tooling
- MCP may feel conservative because it cannot write
- future sync/write requests require deliberate architecture work instead of a
  convenience patch

## Notes

This decision is not "Obsidian integration because notes are popular" and not
"MCP because assistants are popular." It is one product idea:

**a learning path should be portable enough to live near the user's notes and
visible enough for AI to use as context, while Clew keeps the graph reviewable,
reversible, and central.**

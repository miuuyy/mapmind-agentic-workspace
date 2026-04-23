# Obsidian And MCP

Clew is not trying to own every surface where learning happens.

It is the place where the path becomes visible. Obsidian and MCP make that path useful outside the main workspace.

## Obsidian Import

If you already have notes, you should not have to start from zero.

Clew can import an Obsidian vault and turn Markdown structure into a graph:

- notes become topics
- wiki links become relationships
- folders can become zones
- note bodies can become artifacts
- missing links can become placeholder topics when enabled
- validation issues show before import

This is useful when a vault has accumulated real knowledge but no clear route through it.

## Obsidian Export

Clew can also export a graph back into an Obsidian-ready folder.

The export can include:

- topic descriptions
- resources as Markdown links
- artifacts as note sections
- folder structure from zones
- graph metadata
- optional progress state

That makes Clew a graph-building and path-shaping layer, not a data trap.

## MCP: Clew Study Assist

Clew ships with a read-only MCP server called `Clew Study Assist`.

Once connected to Claude Desktop, Claude Code, Cursor, or another MCP client, an assistant can:

- list your graphs
- read the current learning context
- inspect a topic
- see blockers and neighbors
- search notes

The point is simple: external assistants can help with your real learning state without you copy-pasting a graph summary into chat.

## The Trust Rule

Both integrations follow the same rule:

**they can expose or move structure, but they do not silently mutate the graph.**

Obsidian import still goes through preview and apply. MCP is read-only. Clew keeps the graph as the center of truth.

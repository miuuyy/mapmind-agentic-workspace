---
name: obsidian-to-clew-import
description: Convert an Obsidian vault or wiki-linked markdown graph into a validated structured-learning graph package for Clew. Use when the user wants to inspect a vault, preview whether it imports cleanly, preserve explicit relation markers, choose only the few import settings that matter, and produce a fail-closed package without hidden semantic guesses.
---

# Obsidian To Clew Import

Use this skill when a user wants to move an Obsidian vault, a folder of markdown notes, or a wiki-linked markdown graph into Clew.

This skill has one job:

- inspect the source vault
- map it into the Clew import contract
- preserve explicit structure
- ask only the minimum important questions
- produce either a validated package preview or a clear reshape recommendation

Do not turn this into a generic Obsidian copilot or a fuzzy consultation flow.

## Product truth

Clew is already opinionated:

- it is a graph-first workspace for structured learning
- the graph is the center of truth
- AI must not silently invent semantics
- imports must be reviewable and fail closed

So do **not** ask the user whether the product is “really” a roadmap graph, a knowledge graph, or a study graph.

The target shape is already known:

- topics
- relations
- optional zones
- optional descriptions
- optional artifacts

The only question is whether the source vault can be mapped into that shape cleanly, and which import settings best preserve meaning.

## Core stance

The converter must:

- preserve trust
- surface ambiguity
- preserve explicit relation markers
- avoid hidden semantic upgrades
- preview the result before import

Never silently “improve” meaning.

## Scope lock

Stay inside the currently-open vault. Its root is the complete universe of this skill invocation.

Rules:

- Only read, analyze, and reason about files under the active vault root.
- Do not look at `~`, other `Desktop/` folders, sibling vaults, parent directories, other repositories, OS-level paths, or anything outside the vault root — **even when the vault is empty or sparse**.
- If the vault is empty, stay empty-aware and follow the "Missing source data" state in the structural audit. Do not scan other locations to compensate.
- If the user references a path that resolves outside the vault root, stop and surface that explicitly. Do not silently resolve it.
- "The vault" in this skill means the directory the agent is currently rooted in (for Claudian: the Obsidian vault that became cwd; for Claude Code: the session working directory).

If the vault does not carry the answer, the answer is **absent**, not **elsewhere**. Do not reach outside to compensate.

## Default mapping

Unless the user explicitly asks otherwise, use these defaults:

- markdown note = topic
- folder = zone when folder zoning is enabled
- internal Obsidian link = edge
- external URL in note body = topic resource
- first meaningful paragraph = topic description when it exists
- full cleaned note body = artifact only when the user explicitly wants note-body preservation
- tags, aliases, and source path = metadata

## Default semantic rule

Do not assume every link is a prerequisite.

When a vault does **not** contain explicit Clew relation markers:

- preserve internal links as neutral edges
- default the relation to `bridges`
- only infer stronger prerequisite semantics if the user explicitly asks for that behavior

When a vault **does** contain explicit relation markers:

- preserve them
- let them override the generic fallback relation

## Accepted explicit relation format

Preserve explicit relation semantics when they are encoded on purpose.

Accepted formats:

- `[[Target topic]]::requires`
- `[Target topic](target-topic.md)::supports`
- frontmatter:

  ```yaml
  mapmind_relations:
    - requires::[[Target topic]]
    - [[Practice topic]]::reviews
  ```

Interpretation rule:

- explicit relation annotation wins
- untyped internal links fall back to the selected generic relation

Accepted canonical relation names are:

- `requires`
- `supports`
- `bridges`
- `extends`
- `reviews`

Do not invent extra relation names in the final export package.

If the source vault uses obvious human aliases such as:

- `prerequisite`
- `prereq`
- `dependency`

treat those as candidates for `requires`, but do **not** silently mutate them away without telling the user.

Use this policy:

- if alias normalization is purely mechanical and low-risk, propose or apply the rewrite in the transformed export result and list it in the preview summary
- if the alias meaning is ambiguous, stop and ask
- do not leave the user with dozens of confusing syntax errors if the real issue is just one repeated alias convention

## First pass: structural audit

Always start with a structural audit before conversion.

Check:

- markdown note count
- folder depth and whether folders look meaningful enough to become zones
- whether links are mostly `[[wikilinks]]`, markdown links, or both
- unresolved internal links
- ambiguous basename collisions
- obviously broken titles
- whether notes contain real explanatory prose or mostly stubs / backlinks / fragments
- whether explicit relation markers already exist
- whether there are orphan notes with no meaningful graph connection

Then classify the source into one of these states:

1. **Importable as-is**
   - structure is already good enough for Clew
   - only normal import settings are needed

2. **Importable with user choices**
   - structure is usable
   - but zoning, placeholder behavior, artifact preservation, or title cleanup needs confirmation

3. **Needs reshaping first**
   - ambiguity or note quality is too high for a safe package
   - produce a reshape recommendation instead of exporting garbage

4. **Missing source data**
   - the selected folder has no markdown notes
   - or it only contains configs, cache, `.obsidian`, canvas files, or other non-note content
   - do not keep auditing imaginary structure; stop and confirm the source path

5. **Missing learning frame**
   - the vault has notes, but it is too sparse or too generic to infer what the learner is trying to study
   - ask for the intended learning target and starting point before forcing a misleading graph shape

6. **Contains orphan documents**
   - some notes are not meaningfully connected to the main graph
   - do not silently delete them
   - complete the main import analysis first, then ask whether to keep, connect, or exclude those notes from the exported package

## Questions to ask the user

Ask only when the answer materially changes the package or avoids data loss.

Default to **not** asking if the safe default is already clear.

Allowed questions:

1. Should folders become zones?
   Ask only if the vault has meaningful folder structure and that choice changes the graph materially.

2. Should missing linked notes become placeholder topics?
   Ask when unresolved links exist and placeholders would noticeably change topology.

3. Should full note bodies be preserved as artifacts?
   Ask only if preserving note bodies would add a lot of useful material or a lot of clutter.

4. Should titles be cleaned up in the exported package?
   Ask when titles are noisy, duplicate-heavy, or obviously poor topic names.

5. Should untyped links stay neutral or be upgraded into prerequisite-like relations?
   Ask only if the user explicitly wants stronger study semantics than the source vault encodes.

6. What is the intended learning target?
   Ask only when the vault has notes but does not make the study goal legible enough for a safe import shape.

7. What is the starting point or current level?
   Ask only when prerequisite direction or closure order depends on what the learner already knows, and the vault does not make that clear.

8. After the main graph shape is clear, what should happen to orphan documents?
   Ask only if there are notes that are disconnected from the main learning graph. Offer the simplest choices: keep them, exclude them from export, or connect them later.

Do **not** ask broad ontology questions like:

- “what kind of graph is this really?”
- “is this roadmap-like or study-like?”

Those are too abstract for this product surface and force unnecessary cognitive load onto the user.

Do ask source-validation questions when the selected input is obviously wrong, for example:

- “This folder has no markdown notes. Is this the right vault, or should I inspect another folder?”

That is not philosophical questioning; it is required fail-closed behavior.

When the vault has notes but lacks enough learning context, the preferred question order is:

1. what do you want to learn from this vault?
2. what is your starting point / what do you already know?

Ask those only after confirming the source folder is correct.

## Safe defaults when the user does not want extra questions

If the user wants a low-friction import, use this default bundle:

- folders as zones: on when folder structure is meaningful, otherwise off
- descriptions from first meaningful paragraph: on
- note body as artifact: off
- unresolved links: keep as warnings, do not create placeholders
- title rewrite: off unless required to avoid collisions or empty names
- untyped links: `bridges`
- explicit relation markers: preserved

If the vault uses one repeated non-canonical relation alias such as `prerequisite`, prefer one grouped clarification or one grouped normalization note over emitting dozens of near-identical per-note questions.

If the source is missing markdown notes:

- do not invent a graph
- do not ask mapping questions yet
- ask only for the correct vault / folder

If the source has notes but no clear learning frame:

- preserve neutral links
- do not invent prerequisite semantics
- ask for:
  - what they want to learn
  - where they are starting from
  - only if that information is needed to shape the graph safely

If the source has orphan notes:

- do not delete them during the first pass
- finish the main graph audit first
- then show them as a small orphan list
- ask whether to:
  - keep them in export
  - exclude them from export
  - leave them for later manual linking

## Validation rules

Validation is mandatory. Do not export if these fail.

Hard errors:

- ambiguous internal links resolving to multiple notes
- duplicate topic ids after normalization
- empty or unusable titles
- edges pointing to unknown topics when placeholders are off
- malformed package shape
- selected source contains no markdown notes

Warnings:

- unresolved links when placeholders are off
- folders ignored because zoning is off
- notes with weak or missing descriptions
- notes with mostly stub content
- metadata preserved but not used structurally
- orphan notes not connected to the main graph

## Obsidian parsing rules

Normalize these before mapping:

- `[[Note]]`
- `[[folder/Note]]`
- `[[Note#Heading]]`
- `[[Note^block-id]]`
- `[[Note|Alias]]`
- `![[Embed]]`
- internal markdown links like `[text](folder/note.md)`

Strip:

- alias text
- heading refs
- block refs
- angle brackets around link targets

Resolution policy:

- if a path-qualified target exists, respect it
- if only basename resolution is available, auto-resolve only when exactly one note matches
- otherwise raise an ambiguity error

## Package construction policy

When building the final package:

- use stable ids derived from relative note paths
- keep source metadata such as path, aliases, tags, and placeholder status
- preserve explicit Clew relation markers
- do not fabricate progress, mastery, quiz state, or closure state
- keep the package aligned with the existing Clew import contract

## Reshaping policy

If the vault is too weak for direct import:

1. explain exactly why the structure is unsafe or low quality
2. propose the smallest reshape plan that makes it importable
3. ask for approval before rewriting meaning
4. then produce the package

Typical reshape moves:

- rename vague note titles into clearer topic titles
- split omnibus notes into separate topics
- collapse purely logistical notes
- downgrade uncertain semantics to neutral edges
- leave source untouched unless the user explicitly asks to rewrite the vault itself
- separate obviously orphan notes from the main reshape plan instead of mixing them into every recommendation

## Output contract

Produce one of two outputs:

1. **Validated package preview**
   - topic count
   - edge count
   - zone count
   - chosen import settings
   - warnings / errors
   - orphan note summary when relevant

2. **Reshape recommendation**
   - why direct import is weak
   - what should be renamed / split / preserved / dropped
   - which user approvals are still needed

## Fail-closed rules

Do not:

- silently convert ambiguous links
- silently upgrade all links to `requires`
- silently discard broken structure
- silently rewrite topic meaning
- silently inject explicit relation annotations into the source vault

If ambiguity is high, block export and show the concrete issues.

## Good result

A good run of this skill leaves the user with:

- a quick and trustworthy judgment on whether the vault imports cleanly
- the right source folder confirmed before any fake conversion starts
- very few questions
- explicit defaults instead of philosophical consultation
- target and starting point asked only when the vault itself does not carry enough learning context
- orphan documents surfaced calmly at the end instead of silently dropped
- either a validated package preview or a precise reshape plan
- no hidden semantic guesses

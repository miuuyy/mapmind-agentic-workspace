# Usage Guide

This guide is for the part of the workflow where you or another model prepare raw source material for graph ingest.

MapMind does **not** want a polished final curriculum here. It wants clean, structured source material that can later be turned into a connected proposal.

## What this guide is for

Use this when you want to:

- prepare a topic dump manually
- ask another LLM to generate ingest-ready markdown
- keep large subject dumps from collapsing into one useless blob

## What MapMind wants from raw source

Good ingest material is:

- English
- markdown
- topic-bounded
- compact but structured
- honest when information is missing

Bad ingest material is:

- giant prose blobs
- fake exact prerequisite graphs
- JSON pretending to be the final truth
- hundreds of disconnected buzzwords

## Recommended shape

Each topic block should ideally contain:

- topic title
- one short description line
- estimated time if reasonably inferable
- one to three useful resources if known
- a testing note only if it is reliable

Example:

```text
- Networking basics
  OSI model, IP, ports, routing, DNS, and packet flow
  Estimated time: 2h
  Resource: Cisco Skills for All - https://example.com/networking
  Resource: Wireshark intro - https://example.com/wireshark
  Testing: inspect a simple packet capture
```

## Good rules for source generation

- keep topic titles canonical and concise
- prefer stable, recognizable topic names
- include missing fundamentals instead of only advanced topics
- keep topic boundaries obvious
- omit fields that you cannot support confidently
- do not invent exact edges or graph IDs

## Copy-paste brief for another LLM

```text
You are generating source material for a local AI-assisted study graph application.

This application is not asking you for a final roadmap, not for strict JSON, and not for a polished article.
It wants a clean Markdown topic dump that MapMind will reason over directly to build a connected knowledge graph.

What the application is for:
- building a graph of study topics
- attaching resources and testing notes to topics
- later inferring prerequisite structure
- later grouping topics into large learning regions or milestones
- helping a self-learner see scale, structure, and missing foundations

Important output rules:
- output only Markdown
- use English
- one topic per block
- keep topic titles concise and canonical
- do not output JSON
- do not invent exact prerequisite edges
- do not invent graph ids
- do not invent tiny per-topic zones
- do not force fake tests if you cannot find good ones

Input-tolerance notes:
- plain URLs are ideal, but Markdown links are acceptable
- separator lines like --- are acceptable
- Region: ... lines are acceptable and will remain as source context
- do not merge many topics into one giant paragraph

Use this structure when possible for each topic block:

- Topic title
  One short description line
  Estimated time: 60-120 min
  Resource: Name - https://...
  Resource: Name - https://...
  Testing: short note

Field priority:
1. topic title
2. short description
3. estimated time if reasonably inferable
4. one to three useful resources if known
5. testing note only if reliable or honestly uncertain

Quality rules:
- include missing fundamentals, not only advanced topics
- prefer stable, widely recognizable topic names
- keep topic boundaries clear
- if a resource is uncertain, omit it
- if testing quality is weak, say so honestly
- if a field is unknown, omit it instead of hallucinating precision

Now generate the topic dump for this request:

{{USER_REQUEST}}
```

## Cybersecurity variant

```text
You are generating source material for a local AI-assisted study graph application.

I need a Markdown topic dump for cybersecurity study.
This is raw structured input for a graph-building system, not the final roadmap itself.

The system will later:
- turn topics into graph nodes
- attach resources to topics
- infer missing prerequisites
- build paths toward advanced goals

Output rules:
- English only
- Markdown only
- one topic per block
- concise topic titles
- no JSON
- no exact prerequisite graph
- no fake certainty

For each topic include, when possible:
- title
- one short description line
- estimated study time
- one to three useful resources
- testing note only if reliable

Prefer topics that create a serious cybersecurity foundation.
Include fundamentals when needed, such as networking, Linux, scripting, operating systems, cryptography, web basics, security practice, reverse engineering, and low-level systems.

If testing quality is weak, say so honestly.
If a resource is uncertain, omit it.

Now generate the topic dump for this request:

{{USER_REQUEST}}
```

## Anti-patterns

Do not give MapMind source material like this:

```text
networking, linux, python, crypto, web security, malware, reverse engineering, labs, operating systems...
```

That destroys the very thing the graph builder needs: **clear topic boundaries**.

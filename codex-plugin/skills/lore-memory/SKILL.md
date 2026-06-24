---
name: lore-memory
description: Use when Codex should load Lore boot memory, recall durable context, or write long-term memory through Lore MCP tools.
---

# Lore Memory

Lore is the long-term memory for this agent. Treat Lore reads as remembering durable context, not as external research.

## Startup

When a task depends on user preferences, project history, agent identity, or durable workflow rules, call `lore_boot` first. In Codex, the boot baseline includes:

- `core://agent`
- `core://soul`
- `preferences://user`
- `core://agent/codex`

## Recall

Before answering on a topic that may have durable context, call `lore_search` with the user's current intent. Read relevant results with `lore_get_node` before using them.

## Writes

Create or update Lore memory when the information should survive this session. Lore is a living semantic tree: each node is a concept that can absorb future evidence, and each `uri` names that concept's identity and position.

Dates express event time. Put event time in the node narrative, history, metadata, or explicit diary/log/release/archive/incident concepts. Project, work, preference, and decision memories should use durable concept names so future recall returns by meaning.

A multi-segment path grows through parent abstractions. Every intermediate segment is a real memory node with content, disclosure, and glossary that explains why its children belong together. Before moving nodes into a hierarchy, create or update the parent abstraction.

Before creating, search or open the likely existing owner concept. Prefer updating or merging into an existing stable node. Use `lore_create_node` when a new long-lived concept has appeared.

## Maintenance

Before changing or deleting memory, read the existing node first. Add disclosure text that says when the node should be recalled.

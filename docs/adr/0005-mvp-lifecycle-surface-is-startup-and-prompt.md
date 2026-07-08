# MVP lifecycle surface is startup and prompt

The first server-driven Lifecycle Contract will support only `session.start` and `prompt.submit`. These are already proven by the existing Codex, Claude Code, and OpenClaw integrations, while tool, stop, session-end, and compaction hooks still need per-runtime network and output-semantics verification before they become part of the contract.

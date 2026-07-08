# Guidance is versioned server configuration

Fixed product prompts, lifecycle instructions, recall formatting guidance, and runtime-specific instructions will live in server-side Guidance Configuration rather than Plugin Shell files or user memory nodes. The configuration should eventually support page-based editing, validation, version history, and rollback so Lore can iterate agent behavior without plugin updates while keeping product guidance distinct from personal or project memory.

**Consequences**

This creates a new server-owned configuration surface. It needs versioning and validation before user-facing editing is enabled, and Lifecycle Server responses should include enough diagnostic metadata to identify which guidance version produced a given Host-Ready Output.

# Guidance is server-managed, not plugin-managed

Lore guidance will be server-managed rather than bundled into Plugin Shell artifacts. The goal is to reduce plugin update frequency and let Lore iterate lifecycle prompts, recall formatting, and runtime-specific instructions from the server side; this does not imply that fixed product prompts are user-editable memory.

**Consequences**

Server-managed guidance must stay distinct from user memory. Boot memory nodes may still contribute user/agent context, but operational lifecycle prompts and host-output formatting belong to server-owned guidance code or configuration unless a later decision explicitly exposes an override.

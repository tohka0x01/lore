# No plugin-bundled fallback guidance

The Plugin Shell will not bundle Lore behavior guidance, memory rules, recall formatting instructions, or fallback prompt text. All such content is server-originated so behavior can change with the Lore server instead of requiring plugin updates; if the server is unavailable, the shell emits nothing by default.

Before expanding the lifecycle surface beyond the already-used startup and prompt hooks, implementation must verify each target runtime can perform a bounded network request from that lifecycle point. If a host lifecycle cannot make a network request reliably, that lifecycle cannot be treated as server-driven until the design explicitly adds a server-authored cache or another transport.

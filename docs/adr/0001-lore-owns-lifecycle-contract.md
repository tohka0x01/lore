# Lore owns the lifecycle contract

Lore will define and own `lore.lifecycle.v1`, the stable event/effect contract between agent runtime hooks and the Lore server. Adapter generators such as AgentPlugins may be used to produce host-native plugin shells, but they are optional build-time tools and must not become the source of truth for Lore's lifecycle semantics; this keeps prompts, memory rules, recall formatting, and behavior policy server-driven so plugin updates stay rare.

**Considered Options**

- AgentPlugins-owned lifecycle: faster reuse of an existing universal hook model, but makes Lore's server-driven behavior dependent on an external manifest and adapter capability model.
- Lore-owned lifecycle: slightly more design work, but gives Lore a stable seam and lets adapter generators remain replaceable.

# Lore for OpenCode

Native OpenCode plugin bundle for Lore memory.

## Install

The standard Lore installer places `lore-memory.js` at:

```text
~/.config/opencode/plugins/lore-memory.js
```

Configuration is shared through `~/.lore/config.json` using `base_url` and `api_token`.
The installer does not add an OpenCode MCP server; the plugin registers the exact native `lore_*` tools.

This bundle is built against `@opencode-ai/plugin@1.18.3`.

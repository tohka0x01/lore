# Lore for OpenCode

Native OpenCode plugin bundle for Lore memory.

## Install

The standard Lore installer places `lore-memory.js` at:

```text
~/.config/opencode/plugins/lore-memory.js
```

Configuration is shared through `~/.lore/config.json` using `base_url` and `api_token`.
The installer does not add an OpenCode MCP server; the plugin registers the exact native `lore_*` tools.

When another OpenCode plugin imports Claude Code MCP configuration, the native plugin suppresses duplicate Lore MCP entries such as `lore` and `lore:lore` at runtime. This prevents duplicate tools and multiple client types without changing files owned by Claude Code or another plugin. Lore does not modify Claude Code or third-party configuration files.

Set `LORE_OPENCODE_ALLOW_MCP=1` before starting OpenCode only when you explicitly need the legacy generic MCP fallback alongside the native plugin.

This bundle is built against `@opencode-ai/plugin@1.18.3`.

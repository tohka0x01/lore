# Lore Codex Plugin

Lore gives Codex MCP tools for fixed boot memory, recall search, durable memory writes, and recall adoption tracking.

## One-Command Install

```bash
mkdir -p ~/.lore
cat > ~/.lore/config.json <<'JSON'
{
  "base_url": "http://127.0.0.1:18901",
  "api_token": "YOUR_TOKEN_IF_USED"
}
JSON
./scripts/install.sh
```

The installer stages the official Codex marketplace layout, registers the marketplace, enables `lore@lore`, enables Codex lifecycle hooks, and configures the Lore MCP server. Lore hooks are bundled in the plugin manifest (`hooks/hooks.json`) rather than installed as user-level `~/.codex/hooks.json` entries.

Restart Codex after the script finishes. If Codex reports that hooks need review, open `/hooks` and trust the Lore user hooks.

## Local Server

Start Lore before using the plugin:

```bash
docker compose up -d
```

The plugin MCP config points Codex to:

```text
${LORE_BASE_URL:-http://127.0.0.1:18901}/api/mcp?client_type=codex
```

Shared connection settings come from `~/.lore/config.json`:

```json
{
  "base_url": "http://127.0.0.1:18901",
  "api_token": "YOUR_TOKEN_IF_USED"
}
```

The installer reads that file, configures Codex MCP with a standard `Authorization: Bearer ...` HTTP header, and leaves the MCP URL as a plain base URL plus `client_type`.

## Prompt Injection Hooks

Lore ships plugin-bundled lifecycle hooks through `hooks/hooks.json`, referenced by `.codex-plugin/plugin.json`. Modern Codex builds execute those plugin hooks directly. The installer enables the official Codex hooks feature in `~/.codex/config.toml` and removes older Lore user-level hook entries from `~/.codex/hooks.json` so one prompt creates one recall query:

```toml
[features]
hooks = true
```

Set `LORE_CODEX_INSTALL_USER_HOOKS=1` only for legacy Codex builds that require `~/.codex/hooks.json` compatibility entries.

The hooks add:

- `SessionStart`: Lore guidance plus boot baseline from `client_type=codex`
- `UserPromptSubmit`: `<recall>` context for the current prompt

Hook commands run plain `node` `.mjs` files instead of `npx tsx`, avoiding per-prompt package runner startup cost.

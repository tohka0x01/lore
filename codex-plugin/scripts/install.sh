#!/usr/bin/env bash
set -euo pipefail

DEFAULT_BASE_URL="http://127.0.0.1:18901"
MARKETPLACE_NAME="lore"
PLUGIN_NAME="lore"
PLUGIN_ID="${PLUGIN_NAME}@${MARKETPLACE_NAME}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_SOURCE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
CODEX_CONFIG="${CODEX_CONFIG:-$CODEX_HOME/config.toml}"
TARGET_ROOT="${LORE_CODEX_MARKETPLACE_ROOT:-$CODEX_HOME/plugins/lore-local-marketplace}"
LORE_BASE_URL="${LORE_BASE_URL:-$DEFAULT_BASE_URL}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

copy_source_layout() {
  local source_marketplace_root=""
  local source_plugin_root="$PLUGIN_SOURCE_ROOT"

  if [ -d "$PLUGIN_SOURCE_ROOT/.agents" ] && [ -d "$PLUGIN_SOURCE_ROOT/.codex-plugin" ]; then
    source_marketplace_root="$PLUGIN_SOURCE_ROOT"
  elif [ -d "$PLUGIN_SOURCE_ROOT/.codex-plugin" ] && [ -d "$PLUGIN_SOURCE_ROOT/../../.agents" ]; then
    source_marketplace_root="$(cd "$PLUGIN_SOURCE_ROOT/../.." && pwd)"
  else
    echo "Cannot locate Codex plugin source layout from $PLUGIN_SOURCE_ROOT" >&2
    exit 1
  fi

  rm -rf "$TARGET_ROOT.tmp"
  mkdir -p "$TARGET_ROOT.tmp/plugins/$PLUGIN_NAME"

  cp -a "$source_marketplace_root/.agents" "$TARGET_ROOT.tmp/.agents"
  cp -a "$source_plugin_root/.codex-plugin" "$TARGET_ROOT.tmp/plugins/$PLUGIN_NAME/.codex-plugin"
  cp -a "$source_plugin_root/.mcp.json" "$TARGET_ROOT.tmp/plugins/$PLUGIN_NAME/.mcp.json"
  for entry in README.md skills hooks rules scripts assets; do
    if [ -e "$source_plugin_root/$entry" ]; then
      cp -a "$source_plugin_root/$entry" "$TARGET_ROOT.tmp/plugins/$PLUGIN_NAME/$entry"
    fi
  done

  rm -rf "$TARGET_ROOT"
  mv "$TARGET_ROOT.tmp" "$TARGET_ROOT"
}

enable_plugin_config() {
  mkdir -p "$(dirname "$CODEX_CONFIG")"
  touch "$CODEX_CONFIG"
  cp "$CODEX_CONFIG" "$CODEX_CONFIG.bak.$(date +%Y%m%d%H%M%S)"

  python3 - "$CODEX_CONFIG" "$PLUGIN_ID" <<'PY'
import sys

path, plugin_id = sys.argv[1], sys.argv[2]
section = f'[plugins."{plugin_id}"]'

with open(path, "r", encoding="utf-8") as handle:
    lines = handle.read().splitlines()

out = []
idx = 0
found = False
while idx < len(lines):
    line = lines[idx]
    if line.strip() == section:
        found = True
        out.append(line)
        idx += 1
        enabled_written = False
        while idx < len(lines) and not lines[idx].lstrip().startswith("["):
            if lines[idx].strip().startswith("enabled"):
                out.append("enabled = true")
                enabled_written = True
            else:
                out.append(lines[idx])
            idx += 1
        if not enabled_written:
            out.append("enabled = true")
        continue
    out.append(line)
    idx += 1

if not found:
    if out and out[-1] != "":
        out.append("")
    out.extend([section, "enabled = true"])

with open(path, "w", encoding="utf-8") as handle:
    handle.write("\n".join(out).rstrip() + "\n")
PY
}

register_marketplace() {
  codex plugin marketplace remove "$MARKETPLACE_NAME" >/dev/null 2>&1 || true
  codex plugin marketplace add "$TARGET_ROOT"
}

enable_codex_hooks_feature() {
  mkdir -p "$(dirname "$CODEX_CONFIG")"
  touch "$CODEX_CONFIG"
  cp "$CODEX_CONFIG" "$CODEX_CONFIG.bak.$(date +%Y%m%d%H%M%S)"

  python3 - "$CODEX_CONFIG" <<'PY'
import sys
path = sys.argv[1]
with open(path, "r", encoding="utf-8") as handle:
    lines = handle.read().splitlines()
out = []
idx = 0
found = False
while idx < len(lines):
    line = lines[idx]
    if line.strip() == "[features]":
        found = True
        out.append(line)
        idx += 1
        written = False
        while idx < len(lines) and not lines[idx].lstrip().startswith("["):
            if lines[idx].strip().startswith("codex_hooks"):
                out.append("codex_hooks = true")
                written = True
            else:
                out.append(lines[idx])
            idx += 1
        if not written:
            out.append("codex_hooks = true")
        continue
    out.append(line)
    idx += 1
if not found:
    if out and out[-1] != "":
        out.append("")
    out.extend(["[features]", "codex_hooks = true"])
with open(path, "w", encoding="utf-8") as handle:
    handle.write("\n".join(out).rstrip() + "\n")
PY
}

configure_mcp() {
  local url="${LORE_BASE_URL%/}/api/mcp?client_type=codex"
  local token_env="${LORE_BEARER_TOKEN_ENV_VAR:-}"
  if [ -z "$token_env" ]; then
    if [ -n "${LORE_API_TOKEN:-}" ]; then
      token_env="LORE_API_TOKEN"
    elif [ -n "${API_TOKEN:-}" ]; then
      token_env="API_TOKEN"
    fi
  fi

  codex mcp remove lore >/dev/null 2>&1 || true
  if [ -n "$token_env" ]; then
    codex mcp add lore --url "$url" --bearer-token-env-var "$token_env"
  else
    codex mcp add lore --url "$url"
  fi
}

cleanup_legacy_user_hooks() {
  # Older Lore installers wrote user-level hooks under ~/.codex/hooks.json.
  # Current Codex plugin hooks are bundled via .codex-plugin/plugin.json -> hooks/hooks.json.
  local hooks_json="$CODEX_HOME/hooks.json"
  local hook_root="$CODEX_HOME/hooks/lore"
  rm -rf "$hook_root"
  if [ -f "$hooks_json" ]; then
    cp "$hooks_json" "$hooks_json.bak.$(date +%Y%m%d%H%M%S)"
    python3 - "$hooks_json" <<'PY'
import json, sys
path = sys.argv[1]
try:
    with open(path, "r", encoding="utf-8") as handle:
        data = json.load(handle)
except Exception:
    sys.exit(0)

def keep_entry(entry):
    hooks = entry.get("hooks") if isinstance(entry, dict) else None
    if not isinstance(hooks, list):
        return True
    commands = [str(h.get("command", "")) for h in hooks if isinstance(h, dict)]
    return not any("/hooks/lore/hooks/rules-inject.ts" in c or "/hooks/lore/hooks/recall-inject.ts" in c for c in commands)

hooks = data.get("hooks")
if isinstance(hooks, dict):
    for event, entries in list(hooks.items()):
        if isinstance(entries, list):
            filtered = [entry for entry in entries if keep_entry(entry)]
            # Drop empty matcher entries produced by early installers.
            filtered = [entry for entry in filtered if not (isinstance(entry, dict) and entry.get("matcher", "") == "" and entry.get("hooks") == [])]
            if filtered:
                hooks[event] = filtered
            else:
                hooks.pop(event, None)
if not hooks:
    data.pop("hooks", None)
with open(path, "w", encoding="utf-8") as handle:
    json.dump(data, handle, indent=2, ensure_ascii=False)
    handle.write("\n")
PY
  fi
}

require_command codex
require_command jq
require_command python3

copy_source_layout
python3 - "$TARGET_ROOT/plugins/$PLUGIN_NAME/hooks/hooks.json" "$TARGET_ROOT/plugins/$PLUGIN_NAME" <<'PY'
import sys
from pathlib import Path
hooks_path = Path(sys.argv[1])
plugin_root = sys.argv[2]
if hooks_path.exists():
    hooks_path.write_text(hooks_path.read_text().replace("__LORE_CODEX_PLUGIN_ROOT__", plugin_root))
PY
jq -e '.plugins[0].source.path == "./plugins/lore"' "$TARGET_ROOT/.agents/plugins/marketplace.json" >/dev/null
jq -e '.mcpServers.lore.url | contains("client_type=codex")' "$TARGET_ROOT/plugins/$PLUGIN_NAME/.mcp.json" >/dev/null

register_marketplace
enable_plugin_config
enable_codex_hooks_feature
configure_mcp
cleanup_legacy_user_hooks

echo ""
echo "Lore Codex plugin installed."
echo "Marketplace: $TARGET_ROOT"
echo "Plugin: $PLUGIN_ID enabled in $CODEX_CONFIG"
echo "MCP: ${LORE_BASE_URL%/}/api/mcp?client_type=codex"
echo "Hooks: bundled in $TARGET_ROOT/plugins/$PLUGIN_NAME/hooks/hooks.json"
echo "If Codex reports hook review is required, open /hooks and trust the Lore plugin hooks."
echo "Restart Codex for plugin and hook changes to take effect."

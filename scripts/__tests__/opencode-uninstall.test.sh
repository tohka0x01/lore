#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
UNINSTALL="$ROOT/scripts/uninstall.sh"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

assert_contains() {
  local file="$1" text="$2"
  grep -Fq "$text" "$file" || fail "expected $file to contain: $text"
}

HOME_ONE="$TMP/home-one"
TARGET="$HOME_ONE/.config/opencode/plugins/lore-memory.js"
OTHER_PLUGIN="$HOME_ONE/.config/opencode/plugins/user-plugin.js"
APP_CONFIG="$HOME_ONE/.config/opencode/opencode.json"
SESSION_FILE="$HOME_ONE/.local/share/opencode/sessions/session.json"
STAGING="$HOME_ONE/.lore/opencode"
mkdir -p "$(dirname "$TARGET")" "$(dirname "$SESSION_FILE")" "$STAGING"
cat > "$TARGET" <<'JS'
/* @lore-managed-opencode-plugin version=1.3.15-pre.1 */
export const managed = true;
JS
printf 'export const userPlugin = true;\n' > "$OTHER_PLUGIN"
cat > "$APP_CONFIG" <<'JSON'
{
  "mcp": {
    "manual-lore": {
      "url": "http://manual.example.test/api/mcp",
      "tool": "lore_lore_search"
    }
  },
  "theme": "user-choice"
}
JSON
cp "$APP_CONFIG" "$TMP/opencode-config.before"
printf 'session-state\n' > "$SESSION_FILE"
printf 'staged\n' > "$STAGING/file.txt"

OUT_ONE="$TMP/uninstall-one.log"
HOME="$HOME_ONE" LORE_HOME="$HOME_ONE/.lore" \
  PATH="/opt/homebrew/bin:/usr/bin:/bin" \
  bash "$UNINSTALL" --channels opencode -y >"$OUT_ONE" 2>&1

[[ ! -e "$TARGET" ]] || fail "managed OpenCode plugin was not removed"
[[ ! -d "$STAGING" ]] || fail "OpenCode staging directory was not removed"
[[ -f "$OTHER_PLUGIN" ]] || fail "unrelated OpenCode plugin was removed"
[[ -f "$SESSION_FILE" ]] || fail "OpenCode session data was removed"
cmp -s "$APP_CONFIG" "$TMP/opencode-config.before" || fail "OpenCode app config was modified"
assert_contains "$OUT_ONE" 'OpenCode uninstall complete.'

HOME_TWO="$TMP/home-two"
TARGET_TWO="$HOME_TWO/.config/opencode/plugins/lore-memory.js"
mkdir -p "$(dirname "$TARGET_TWO")" "$HOME_TWO/.lore/opencode"
printf 'export const userOwnedPlugin = true;\n' > "$TARGET_TWO"
printf 'staged\n' > "$HOME_TWO/.lore/opencode/file.txt"
OUT_TWO="$TMP/uninstall-two.log"
HOME="$HOME_TWO" LORE_HOME="$HOME_TWO/.lore" \
  PATH="/opt/homebrew/bin:/usr/bin:/bin" \
  bash "$UNINSTALL" --channels opencode -y >"$OUT_TWO" 2>&1

[[ -f "$TARGET_TWO" ]] || fail "unmarked OpenCode plugin was removed"
assert_contains "$TARGET_TWO" 'userOwnedPlugin = true'
[[ ! -d "$HOME_TWO/.lore/opencode" ]] || fail "OpenCode staging directory was not removed for unmarked target"
assert_contains "$OUT_TWO" 'not managed by Lore'

HELP_OUT="$TMP/uninstall-help.log"
bash "$UNINSTALL" --help >"$HELP_OUT"
assert_contains "$HELP_OUT" 'claudecode,codex,pi,openclaw,hermes,opencode'

echo "opencode uninstall tests passed"

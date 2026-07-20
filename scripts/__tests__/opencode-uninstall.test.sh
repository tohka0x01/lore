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

assert_not_contains() {
  local file="$1" text="$2"
  if grep -Fq "$text" "$file"; then
    fail "expected $file not to contain: $text"
  fi
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

HOME_COMPAT="$TMP/home-compat"
TARGET_COMPAT="$HOME_COMPAT/.config/opencode/plugins/lore-memory.js"
COMPAT_CONFIG="$HOME_COMPAT/.config/opencode/oh-my-openagent.json"
COMPAT_STATE="$HOME_COMPAT/.lore/opencode-compat.json"
CLAUDE_CONFIG="$HOME_COMPAT/.claude.json"
mkdir -p "$(dirname "$TARGET_COMPAT")" "$(dirname "$COMPAT_STATE")"
cat > "$TARGET_COMPAT" <<'JS'
/* @lore-managed-opencode-plugin version=1.3.15-pre.4 */
export const managed = true;
JS
cat > "$COMPAT_CONFIG" <<'JSON'
{
  "disabled_mcps": ["context7"],
  "claude_code": {
    "hooks": true,
    "plugins_override": {
      "other@market": true,
      "lore@lore": false
    }
  }
}
JSON
cat > "$COMPAT_STATE" <<JSON
{
  "version": 1,
  "records": [
    {
      "path": "$COMPAT_CONFIG",
      "previous": "absent"
    }
  ]
}
JSON
cat > "$CLAUDE_CONFIG" <<'JSON'
{
  "mcpServers": {
    "lore": {
      "url": "https://api.loremem.com/api/mcp?client_type=claudecode"
    }
  }
}
JSON
cp "$CLAUDE_CONFIG" "$TMP/claude-compat.before"
OUT_COMPAT="$TMP/uninstall-compat.log"
HOME="$HOME_COMPAT" LORE_HOME="$HOME_COMPAT/.lore" \
  PATH="/opt/homebrew/bin:/usr/bin:/bin" \
  bash "$UNINSTALL" --channels opencode -y >"$OUT_COMPAT" 2>&1
python3 - "$COMPAT_CONFIG" <<'PY'
import json, sys
with open(sys.argv[1], encoding='utf-8') as handle:
    data = json.load(handle)
assert data['disabled_mcps'] == ['context7']
assert data['claude_code']['hooks'] is True
assert data['claude_code']['plugins_override'] == {'other@market': True}
PY
[[ ! -e "$COMPAT_STATE" ]] || fail "compatibility state was not removed after rollback"
cmp -s "$CLAUDE_CONFIG" "$TMP/claude-compat.before" || fail "Claude Code config was modified during uninstall"
assert_contains "$OUT_COMPAT" 'restored oh-my-openagent Claude Lore plugin import setting'

HOME_JSONC="$TMP/home-jsonc"
TARGET_JSONC="$HOME_JSONC/.config/opencode/plugins/lore-memory.js"
JSONC_CONFIG="$HOME_JSONC/.config/opencode/oh-my-openagent.jsonc"
JSONC_STATE="$HOME_JSONC/.lore/opencode-compat.json"
mkdir -p "$(dirname "$TARGET_JSONC")" "$(dirname "$JSONC_STATE")"
cat > "$TARGET_JSONC" <<'JS'
/* @lore-managed-opencode-plugin version=1.3.15-pre.4 */
export const managed = true;
JS
cat > "$JSONC_CONFIG" <<'JSONC'
{
  // preserve this comment
  "claude_code": {
    "hooks": true,
    "plugins_override": {
      "other@market": true,
      "lore@lore": false,
    },
  },
}
JSONC
cat > "$JSONC_STATE" <<JSON
{
  "version": 1,
  "records": [
    {
      "path": "$JSONC_CONFIG",
      "previous": true
    }
  ]
}
JSON
OUT_JSONC="$TMP/uninstall-jsonc.log"
HOME="$HOME_JSONC" LORE_HOME="$HOME_JSONC/.lore" \
  PATH="/opt/homebrew/bin:/usr/bin:/bin" \
  bash "$UNINSTALL" --channels opencode -y >"$OUT_JSONC" 2>&1
assert_contains "$JSONC_CONFIG" '// preserve this comment'
assert_contains "$JSONC_CONFIG" '"hooks": true'
assert_contains "$JSONC_CONFIG" '"other@market": true'
assert_contains "$JSONC_CONFIG" '"lore@lore": true'
[[ ! -e "$JSONC_STATE" ]] || fail "JSONC compatibility state was not removed after rollback"

HOME_USER_CHANGED="$TMP/home-user-changed"
TARGET_USER_CHANGED="$HOME_USER_CHANGED/.config/opencode/plugins/lore-memory.js"
USER_CHANGED_CONFIG="$HOME_USER_CHANGED/.config/opencode/oh-my-openagent.json"
USER_CHANGED_STATE="$HOME_USER_CHANGED/.lore/opencode-compat.json"
mkdir -p "$(dirname "$TARGET_USER_CHANGED")" "$(dirname "$USER_CHANGED_STATE")"
printf '/* @lore-managed-opencode-plugin version=1.3.15-pre.4 */\n' > "$TARGET_USER_CHANGED"
printf '{"claude_code":{"plugins_override":{"lore@lore":true}}}\n' > "$USER_CHANGED_CONFIG"
cat > "$USER_CHANGED_STATE" <<JSON
{
  "version": 1,
  "records": [
    {
      "path": "$USER_CHANGED_CONFIG",
      "previous": "absent"
    }
  ]
}
JSON
cp "$USER_CHANGED_CONFIG" "$TMP/user-changed.before"
OUT_USER_CHANGED="$TMP/uninstall-user-changed.log"
HOME="$HOME_USER_CHANGED" LORE_HOME="$HOME_USER_CHANGED/.lore" \
  PATH="/opt/homebrew/bin:/usr/bin:/bin" \
  bash "$UNINSTALL" --channels opencode -y >"$OUT_USER_CHANGED" 2>&1
cmp -s "$USER_CHANGED_CONFIG" "$TMP/user-changed.before" || fail "user-changed compatibility value was overwritten"
[[ ! -e "$USER_CHANGED_STATE" ]] || fail "stale compatibility state was not removed after user override"
assert_contains "$OUT_USER_CHANGED" 'changed by the user; preserving it'

HOME_UNSAFE="$TMP/home-unsafe"
TARGET_UNSAFE="$HOME_UNSAFE/.config/opencode/plugins/lore-memory.js"
UNSAFE_CONFIG="$HOME_UNSAFE/.config/opencode/oh-my-openagent.jsonc"
UNSAFE_STATE="$HOME_UNSAFE/.lore/opencode-compat.json"
mkdir -p "$(dirname "$TARGET_UNSAFE")" "$(dirname "$UNSAFE_STATE")"
printf '/* @lore-managed-opencode-plugin version=1.3.15-pre.4 */\n' > "$TARGET_UNSAFE"
printf '{ "claude_code": { invalid } }\n' > "$UNSAFE_CONFIG"
cat > "$UNSAFE_STATE" <<JSON
{
  "version": 1,
  "records": [
    {
      "path": "$UNSAFE_CONFIG",
      "previous": "absent"
    }
  ]
}
JSON
cp "$UNSAFE_CONFIG" "$TMP/uninstall-unsafe.before"
OUT_UNSAFE="$TMP/uninstall-unsafe.log"
HOME="$HOME_UNSAFE" LORE_HOME="$HOME_UNSAFE/.lore" \
  PATH="/opt/homebrew/bin:/usr/bin:/bin" \
  bash "$UNINSTALL" --channels opencode -y >"$OUT_UNSAFE" 2>&1
cmp -s "$UNSAFE_CONFIG" "$TMP/uninstall-unsafe.before" || fail "unparseable compatibility config was overwritten during uninstall"
[[ -f "$UNSAFE_STATE" ]] || fail "rollback state was discarded after unsafe parse failure"
assert_contains "$OUT_UNSAFE" 'could not safely parse'

HOME_CREATED="$TMP/home-created"
TARGET_CREATED="$HOME_CREATED/.config/opencode/plugins/lore-memory.js"
CREATED_CONFIG="$HOME_CREATED/.config/opencode/oh-my-openagent.json"
CREATED_STATE="$HOME_CREATED/.lore/opencode-compat.json"
mkdir -p "$(dirname "$TARGET_CREATED")" "$(dirname "$CREATED_STATE")"
printf '/* @lore-managed-opencode-plugin version=1.3.15-pre.4 */\n' > "$TARGET_CREATED"
printf '{"claude_code":{"plugins_override":{"lore@lore":false}}}\n' > "$CREATED_CONFIG"
cat > "$CREATED_STATE" <<JSON
{
  "version": 1,
  "records": [
    {
      "path": "$CREATED_CONFIG",
      "previous": "absent",
      "created": ["claude_code", "plugins_override"]
    }
  ]
}
JSON
OUT_CREATED="$TMP/uninstall-created.log"
HOME="$HOME_CREATED" LORE_HOME="$HOME_CREATED/.lore" \
  PATH="/opt/homebrew/bin:/usr/bin:/bin" \
  bash "$UNINSTALL" --channels opencode -y >"$OUT_CREATED" 2>&1
python3 - "$CREATED_CONFIG" <<'PY'
import json, sys
with open(sys.argv[1], encoding='utf-8') as handle:
    assert json.load(handle) == {}
PY
[[ ! -e "$CREATED_STATE" ]] || fail "created compatibility state was not removed"

HOME_COMMENTED="$TMP/home-commented"
TARGET_COMMENTED="$HOME_COMMENTED/.config/opencode/plugins/lore-memory.js"
COMMENTED_CONFIG="$HOME_COMMENTED/.config/opencode/oh-my-openagent.jsonc"
COMMENTED_STATE="$HOME_COMMENTED/.lore/opencode-compat.json"
mkdir -p "$(dirname "$TARGET_COMMENTED")" "$(dirname "$COMMENTED_STATE")"
printf '/* @lore-managed-opencode-plugin version=1.3.15-pre.4 */\n' > "$TARGET_COMMENTED"
cat > "$COMMENTED_CONFIG" <<'JSONC'
{
  "claude_code": {
    "plugins_override": {
      // user note: keep this object for future overrides
      "lore@lore": false,
    },
  },
}
JSONC
cat > "$COMMENTED_STATE" <<JSON
{
  "version": 1,
  "records": [
    {
      "path": "$COMMENTED_CONFIG",
      "previous": "absent",
      "created": ["claude_code", "plugins_override"]
    }
  ]
}
JSON
OUT_COMMENTED="$TMP/uninstall-commented.log"
HOME="$HOME_COMMENTED" LORE_HOME="$HOME_COMMENTED/.lore" \
  PATH="/opt/homebrew/bin:/usr/bin:/bin" \
  bash "$UNINSTALL" --channels opencode -y >"$OUT_COMMENTED" 2>&1
assert_contains "$COMMENTED_CONFIG" '// user note: keep this object for future overrides'
assert_contains "$COMMENTED_CONFIG" '"plugins_override"'
assert_not_contains "$COMMENTED_CONFIG" '"lore@lore"'
[[ ! -e "$COMMENTED_STATE" ]] || fail "commented compatibility state was not removed"

HOME_PIPE="$TMP/home-pipe"
TARGET_PIPE="$HOME_PIPE/.config/opencode/plugins/lore-memory.js"
PIPE_CONFIG="$HOME_PIPE/.config/opencode/oh-my-openagent.jsonc"
PIPE_STATE="$HOME_PIPE/.lore/opencode-compat.json"
PIPE_HELPER="$HOME_PIPE/.lore/opencode-compat.py"
PIPE_CWD="$TMP/pipe-cwd"
PIPE_MARKER="$TMP/untrusted-uninstall-helper-ran"
mkdir -p "$(dirname "$TARGET_PIPE")" "$(dirname "$PIPE_STATE")" "$PIPE_CWD"
printf '/* @lore-managed-opencode-plugin version=1.3.15-pre.4 */\n' > "$TARGET_PIPE"
cat > "$PIPE_CONFIG" <<'JSONC'
{
  // preserve stdin uninstall comments
  "claude_code": {
    "hooks": true,
    "plugins_override": {
      "lore@lore": false,
    },
  },
}
JSONC
cat > "$PIPE_STATE" <<JSON
{
  "version": 1,
  "records": [
    {
      "path": "$PIPE_CONFIG",
      "previous": "absent",
      "created": ["plugins_override"]
    }
  ]
}
JSON
cp "$ROOT/scripts/opencode-compat.py" "$PIPE_HELPER"
chmod 0600 "$PIPE_HELPER"
python3 - "$PIPE_CWD/opencode-compat.py" "$PIPE_MARKER" <<'PY'
from pathlib import Path
import sys
path, marker = sys.argv[1:]
Path(path).write_text(
    "from pathlib import Path\n"
    f"Path({marker!r}).write_text('unsafe')\n"
    "raise SystemExit(77)\n"
)
PY
OUT_PIPE="$TMP/uninstall-pipe.log"
(
  cd "$PIPE_CWD"
  cat "$UNINSTALL" | \
    HOME="$HOME_PIPE" LORE_HOME="$HOME_PIPE/.lore" \
    PATH="/opt/homebrew/bin:/usr/bin:/bin" \
      bash -s -- --channels opencode -y >"$OUT_PIPE" 2>&1
)
[[ ! -e "$PIPE_MARKER" ]] || fail "stdin uninstall executed an untrusted cwd helper"
assert_contains "$PIPE_CONFIG" '// preserve stdin uninstall comments'
assert_contains "$PIPE_CONFIG" '"hooks": true'
assert_not_contains "$PIPE_CONFIG" 'plugins_override'
[[ ! -e "$PIPE_STATE" ]] || fail "stdin uninstall did not remove compatibility state"
[[ ! -e "$PIPE_HELPER" ]] || fail "stdin uninstall did not remove managed compatibility helper"
assert_contains "$OUT_PIPE" 'restored oh-my-openagent Claude Lore plugin import setting'

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

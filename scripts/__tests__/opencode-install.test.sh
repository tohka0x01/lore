#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
INSTALL="$ROOT/scripts/install.sh"
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

assert_not_exists() {
  local path="$1"
  [[ ! -e "$path" ]] || fail "expected path not to exist: $path"
}

make_fixture_archive() {
  local archive_root="$TMP/archive"
  mkdir -p "$archive_root"
  cat > "$archive_root/lore-memory.js" <<'JS'
/* @lore-managed-opencode-plugin version=1.3.15-pre.2 */
export const fixture = true;
JS
  (cd "$archive_root" && /usr/bin/zip -q "$TMP/lore-opencode.zip" lore-memory.js)
}

make_fake_tools() {
  local bin="$1" with_opencode="$2"
  mkdir -p "$bin"
  cat > "$bin/curl" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
out=""
url=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -o) out="$2"; shift 2 ;;
    -*) shift ;;
    *) url="$1"; shift ;;
  esac
done
if [[ -n "$out" ]]; then
  if [[ "$url" == */scripts/opencode-compat.py ]]; then
    cp "$TEST_OPENCODE_COMPAT_HELPER" "$out"
  else
    cp "$TEST_OPENCODE_ARCHIVE" "$out"
  fi
else
  printf '[{"tag_name":"v1.3.15-pre.2"}]\n'
fi
SH
  cat > "$bin/unzip" <<'SH'
#!/usr/bin/env bash
exec /usr/bin/unzip "$@"
SH
  chmod +x "$bin/curl" "$bin/unzip"

  if [[ "$with_opencode" == "1" ]]; then
    cat > "$bin/opencode" <<'SH'
#!/usr/bin/env bash
exit 0
SH
    chmod +x "$bin/opencode"
  fi
}

run_install() {
  local home="$1" bin="$2" output="$3"
  HOME="$home" \
  PATH="$bin:/opt/homebrew/bin:/usr/bin:/bin" \
  LORE_HOME="$home/.lore" \
  TEST_OPENCODE_ARCHIVE="$TMP/lore-opencode.zip" \
  TEST_OPENCODE_COMPAT_HELPER="$ROOT/scripts/opencode-compat.py" \
    bash "$INSTALL" --skip-docker --pre --channels opencode \
      --base-url http://127.0.0.1:18901 --api-token test-token >"$output" 2>&1
}

make_fixture_archive

HOME_ONE="$TMP/home-one"
BIN_ONE="$TMP/bin-one"
mkdir -p "$HOME_ONE/.lore" "$HOME_ONE/.config/opencode" "$HOME_ONE/.local/share/opencode"
make_fake_tools "$BIN_ONE" 1
cat > "$HOME_ONE/.lore/config.json" <<'JSON'
{
  "base_url": "http://old.example.test",
  "api_token": "old-token",
  "installed_version": "v1.0.0",
  "docker_managed": true,
  "custom": { "preserve": true }
}
JSON
cat > "$HOME_ONE/.config/opencode/opencode.json" <<'JSON'
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
cp "$HOME_ONE/.config/opencode/opencode.json" "$TMP/opencode-config.before"
printf 'session-data\n' > "$HOME_ONE/.local/share/opencode/session.json"

OUT_ONE="$TMP/install-one.log"
run_install "$HOME_ONE" "$BIN_ONE" "$OUT_ONE"
TARGET="$HOME_ONE/.config/opencode/plugins/lore-memory.js"
[[ -f "$TARGET" ]] || fail "managed OpenCode plugin was not installed"
assert_contains "$TARGET" '@lore-managed-opencode-plugin'
assert_contains "$TARGET" 'version=1.3.15-pre.2'
cmp -s "$HOME_ONE/.config/opencode/opencode.json" "$TMP/opencode-config.before" || fail "OpenCode config was modified"
[[ -f "$HOME_ONE/.local/share/opencode/session.json" ]] || fail "OpenCode session data was modified"
assert_not_contains "$HOME_ONE/.config/opencode/opencode.json" 'client_type=opencode'
python3 - "$HOME_ONE/.lore/config.json" <<'PY'
import json, sys
with open(sys.argv[1], encoding='utf-8') as handle:
    data = json.load(handle)
assert data['base_url'] == 'http://127.0.0.1:18901'
assert data['api_token'] == 'test-token'
assert data['installed_version'] == 'v1.3.15-pre.2'
assert data['docker_managed'] is True
assert data['custom'] == {'preserve': True}
PY
assert_contains "$OUT_ONE" 'OpenCode configured'
assert_contains "$OUT_ONE" 'duplicate Lore MCP imports are suppressed at runtime'
assert_contains "$OUT_ONE" '1.3.15-pre.2'

HOME_COMPAT="$TMP/home-compat"
BIN_COMPAT="$TMP/bin-compat"
COMPAT_CONFIG="$HOME_COMPAT/.config/opencode/oh-my-openagent.json"
COMPAT_STATE="$HOME_COMPAT/.lore/opencode-compat.json"
CLAUDE_CONFIG="$HOME_COMPAT/.claude.json"
mkdir -p "$(dirname "$COMPAT_CONFIG")"
make_fake_tools "$BIN_COMPAT" 1
cat > "$COMPAT_CONFIG" <<'JSON'
{
  "$schema": "https://example.test/oh-my-openagent.schema.json",
  "disabled_mcps": ["context7"],
  "claude_code": {
    "hooks": true,
    "plugins_override": {
      "other@market": true
    }
  }
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
cp "$CLAUDE_CONFIG" "$TMP/claude-config.before"
OUT_COMPAT="$TMP/install-compat.log"
run_install "$HOME_COMPAT" "$BIN_COMPAT" "$OUT_COMPAT"
python3 - "$COMPAT_CONFIG" "$COMPAT_STATE" <<'PY'
import json, sys
config_path, state_path = sys.argv[1:]
with open(config_path, encoding='utf-8') as handle:
    data = json.load(handle)
assert data['$schema'] == 'https://example.test/oh-my-openagent.schema.json'
assert data['disabled_mcps'] == ['context7']
assert data['claude_code']['hooks'] is True
assert data['claude_code']['plugins_override'] == {
    'other@market': True,
    'lore@lore': False,
}
with open(state_path, encoding='utf-8') as handle:
    state = json.load(handle)
assert state == {
    'version': 1,
    'records': [{
        'path': config_path,
        'previous': 'absent',
    }],
}
PY
cmp -s "$CLAUDE_CONFIG" "$TMP/claude-config.before" || fail "Claude Code config was modified"
assert_contains "$OUT_COMPAT" 'disabled Claude Lore plugin import in oh-my-openagent'
cp "$COMPAT_CONFIG" "$TMP/compat-config.after-first"
cp "$COMPAT_STATE" "$TMP/compat-state.after-first"
OUT_COMPAT_REPEAT="$TMP/install-compat-repeat.log"
run_install "$HOME_COMPAT" "$BIN_COMPAT" "$OUT_COMPAT_REPEAT"
cmp -s "$COMPAT_CONFIG" "$TMP/compat-config.after-first" || fail "compatibility patch was not idempotent"
cmp -s "$COMPAT_STATE" "$TMP/compat-state.after-first" || fail "compatibility state was not idempotent"
OUT_COMPAT_ALLOW="$TMP/install-compat-allow.log"
HOME="$HOME_COMPAT" \
PATH="$BIN_COMPAT:/opt/homebrew/bin:/usr/bin:/bin" \
LORE_HOME="$HOME_COMPAT/.lore" \
LORE_OPENCODE_ALLOW_MCP=1 \
TEST_OPENCODE_ARCHIVE="$TMP/lore-opencode.zip" \
TEST_OPENCODE_COMPAT_HELPER="$ROOT/scripts/opencode-compat.py" \
  bash "$INSTALL" --skip-docker --pre --channels opencode \
    --base-url http://127.0.0.1:18901 --api-token test-token >"$OUT_COMPAT_ALLOW" 2>&1
python3 - "$COMPAT_CONFIG" <<'PY'
import json, sys
with open(sys.argv[1], encoding='utf-8') as handle:
    data = json.load(handle)
assert data['claude_code']['plugins_override'] == {'other@market': True}
PY
assert_not_exists "$COMPAT_STATE"
assert_not_exists "$HOME_COMPAT/.lore/opencode-compat.py"
assert_contains "$OUT_COMPAT_ALLOW" 'restored oh-my-openagent Claude Lore plugin import setting'
assert_contains "$OUT_COMPAT_ALLOW" 'LORE_OPENCODE_ALLOW_MCP=1'

HOME_REAPPLY="$TMP/home-reapply"
BIN_REAPPLY="$TMP/bin-reapply"
REAPPLY_CONFIG="$HOME_REAPPLY/.config/opencode/oh-my-openagent.json"
REAPPLY_STATE="$HOME_REAPPLY/.lore/opencode-compat.json"
mkdir -p "$(dirname "$REAPPLY_CONFIG")" "$(dirname "$REAPPLY_STATE")"
make_fake_tools "$BIN_REAPPLY" 1
printf '{"claude_code":{"plugins_override":{"lore@lore":true}}}\n' > "$REAPPLY_CONFIG"
cat > "$REAPPLY_STATE" <<JSON
{
  "version": 1,
  "records": [
    {
      "path": "$REAPPLY_CONFIG",
      "previous": "absent"
    }
  ]
}
JSON
run_install "$HOME_REAPPLY" "$BIN_REAPPLY" "$TMP/install-reapply.log"
python3 - "$REAPPLY_CONFIG" "$REAPPLY_STATE" <<'PY'
import json, sys
config_path, state_path = sys.argv[1:]
with open(config_path, encoding='utf-8') as handle:
    config = json.load(handle)
with open(state_path, encoding='utf-8') as handle:
    state = json.load(handle)
assert config['claude_code']['plugins_override']['lore@lore'] is False
assert state['records'] == [{'path': config_path, 'previous': True}]
PY

HOME_JSONC="$TMP/home-jsonc"
BIN_JSONC="$TMP/bin-jsonc"
JSONC_CONFIG="$HOME_JSONC/.config/opencode/oh-my-openagent.jsonc"
mkdir -p "$(dirname "$JSONC_CONFIG")"
make_fake_tools "$BIN_JSONC" 1
cat > "$JSONC_CONFIG" <<'JSONC'
{
  // keep this user comment
  "team_mode": {
    "enabled": true,
  },
  "claude_code": {
    "hooks": true,
  },
}
JSONC
OUT_JSONC="$TMP/install-jsonc.log"
run_install "$HOME_JSONC" "$BIN_JSONC" "$OUT_JSONC"
assert_contains "$JSONC_CONFIG" '// keep this user comment'
assert_contains "$JSONC_CONFIG" '"team_mode"'
assert_contains "$JSONC_CONFIG" '"hooks": true'
assert_contains "$JSONC_CONFIG" '"plugins_override"'
assert_contains "$JSONC_CONFIG" '"lore@lore": false'
cp "$JSONC_CONFIG" "$TMP/jsonc-config.after-first"
run_install "$HOME_JSONC" "$BIN_JSONC" "$TMP/install-jsonc-repeat.log"
cmp -s "$JSONC_CONFIG" "$TMP/jsonc-config.after-first" || fail "JSONC compatibility patch was not idempotent"

HOME_LEGACY="$TMP/home-legacy"
BIN_LEGACY="$TMP/bin-legacy"
LEGACY_CONFIG="$HOME_LEGACY/.config/opencode/oh-my-opencode.jsonc"
mkdir -p "$(dirname "$LEGACY_CONFIG")"
make_fake_tools "$BIN_LEGACY" 1
cat > "$LEGACY_CONFIG" <<'JSONC'
{
  "claude_code": {
    "plugins_override": {
      "lore@lore": true,
    },
  },
}
JSONC
OUT_LEGACY="$TMP/install-legacy.log"
run_install "$HOME_LEGACY" "$BIN_LEGACY" "$OUT_LEGACY"
assert_contains "$LEGACY_CONFIG" '"lore@lore": false'
python3 - "$HOME_LEGACY/.lore/opencode-compat.json" "$LEGACY_CONFIG" <<'PY'
import json, sys
with open(sys.argv[1], encoding='utf-8') as handle:
    state = json.load(handle)
assert state == {
    'version': 1,
    'records': [{
        'path': sys.argv[2],
        'previous': True,
    }],
}
PY

HOME_PRECEDENCE="$TMP/home-precedence"
BIN_PRECEDENCE="$TMP/bin-precedence"
CANONICAL_PRECEDENCE="$HOME_PRECEDENCE/.config/opencode/oh-my-openagent.json"
LEGACY_PRECEDENCE="$HOME_PRECEDENCE/.config/opencode/oh-my-opencode.jsonc"
mkdir -p "$(dirname "$CANONICAL_PRECEDENCE")"
make_fake_tools "$BIN_PRECEDENCE" 1
printf '{"claude_code":{"plugins_override":{}}}\n' > "$CANONICAL_PRECEDENCE"
printf '{"legacy":true}\n' > "$LEGACY_PRECEDENCE"
cp "$LEGACY_PRECEDENCE" "$TMP/legacy-precedence.before"
run_install "$HOME_PRECEDENCE" "$BIN_PRECEDENCE" "$TMP/install-precedence.log"
assert_contains "$CANONICAL_PRECEDENCE" '"lore@lore": false'
cmp -s "$LEGACY_PRECEDENCE" "$TMP/legacy-precedence.before" || fail "inactive legacy config was modified"

HOME_UNSAFE="$TMP/home-unsafe"
BIN_UNSAFE="$TMP/bin-unsafe"
UNSAFE_CONFIG="$HOME_UNSAFE/.config/opencode/oh-my-openagent.jsonc"
mkdir -p "$(dirname "$UNSAFE_CONFIG")"
make_fake_tools "$BIN_UNSAFE" 1
printf '{ "claude_code": { invalid } }\n' > "$UNSAFE_CONFIG"
cp "$UNSAFE_CONFIG" "$TMP/unsafe-config.before"
OUT_UNSAFE="$TMP/install-unsafe.log"
run_install "$HOME_UNSAFE" "$BIN_UNSAFE" "$OUT_UNSAFE"
cmp -s "$UNSAFE_CONFIG" "$TMP/unsafe-config.before" || fail "unparseable third-party config was overwritten"
assert_not_exists "$HOME_UNSAFE/.lore/opencode-compat.json"
assert_contains "$OUT_UNSAFE" 'could not safely parse'

HOME_WRONG_TYPE="$TMP/home-wrong-type"
BIN_WRONG_TYPE="$TMP/bin-wrong-type"
WRONG_TYPE_CONFIG="$HOME_WRONG_TYPE/.config/opencode/oh-my-openagent.json"
mkdir -p "$(dirname "$WRONG_TYPE_CONFIG")"
make_fake_tools "$BIN_WRONG_TYPE" 1
printf '{"claude_code":{"plugins_override":{"lore@lore":"absent"}}}\n' > "$WRONG_TYPE_CONFIG"
cp "$WRONG_TYPE_CONFIG" "$TMP/wrong-type.before"
OUT_WRONG_TYPE="$TMP/install-wrong-type.log"
run_install "$HOME_WRONG_TYPE" "$BIN_WRONG_TYPE" "$OUT_WRONG_TYPE"
cmp -s "$WRONG_TYPE_CONFIG" "$TMP/wrong-type.before" || fail "non-boolean lore@lore value was overwritten"
assert_not_exists "$HOME_WRONG_TYPE/.lore/opencode-compat.json"
assert_contains "$OUT_WRONG_TYPE" 'could not safely parse'

HOME_DUPLICATE="$TMP/home-duplicate"
BIN_DUPLICATE="$TMP/bin-duplicate"
DUPLICATE_CONFIG="$HOME_DUPLICATE/.config/opencode/oh-my-openagent.jsonc"
mkdir -p "$(dirname "$DUPLICATE_CONFIG")"
make_fake_tools "$BIN_DUPLICATE" 1
cat > "$DUPLICATE_CONFIG" <<'JSONC'
{
  "claude_code": {"plugins_override": {}},
  "claude_code": {"plugins_override": {}},
}
JSONC
cp "$DUPLICATE_CONFIG" "$TMP/duplicate.before"
OUT_DUPLICATE="$TMP/install-duplicate.log"
run_install "$HOME_DUPLICATE" "$BIN_DUPLICATE" "$OUT_DUPLICATE"
cmp -s "$DUPLICATE_CONFIG" "$TMP/duplicate.before" || fail "duplicate compatibility keys were overwritten"
assert_not_exists "$HOME_DUPLICATE/.lore/opencode-compat.json"
assert_contains "$OUT_DUPLICATE" 'could not safely parse'

HOME_STATE_FAIL="$TMP/home-state-fail"
STATE_FAIL_CONFIG="$HOME_STATE_FAIL/.config/opencode/oh-my-openagent.json"
STATE_FAIL_LORE_HOME="$HOME_STATE_FAIL/.lore-readonly"
mkdir -p "$(dirname "$STATE_FAIL_CONFIG")" "$STATE_FAIL_LORE_HOME"
printf '{"claude_code":{"hooks":true}}\n' > "$STATE_FAIL_CONFIG"
cp "$STATE_FAIL_CONFIG" "$TMP/state-fail.before"
chmod 0500 "$STATE_FAIL_LORE_HOME"
if HOME="$HOME_STATE_FAIL" python3 "$ROOT/scripts/opencode-compat.py" install \
  --home "$HOME_STATE_FAIL" --lore-home "$STATE_FAIL_LORE_HOME" \
  >"$TMP/state-fail.log" 2>&1; then
  fail "compatibility helper unexpectedly wrote state into a read-only directory"
fi
chmod 0700 "$STATE_FAIL_LORE_HOME"
cmp -s "$STATE_FAIL_CONFIG" "$TMP/state-fail.before" || fail "third-party config changed before rollback state was durable"

HOME_NO_COMPAT="$TMP/home-no-compat"
BIN_NO_COMPAT="$TMP/bin-no-compat"
make_fake_tools "$BIN_NO_COMPAT" 1
OUT_NO_COMPAT="$TMP/install-no-compat.log"
run_install "$HOME_NO_COMPAT" "$BIN_NO_COMPAT" "$OUT_NO_COMPAT"
assert_not_exists "$HOME_NO_COMPAT/.config/opencode/oh-my-openagent.json"
assert_not_exists "$HOME_NO_COMPAT/.config/opencode/oh-my-openagent.jsonc"
assert_not_exists "$HOME_NO_COMPAT/.config/opencode/oh-my-opencode.json"
assert_not_exists "$HOME_NO_COMPAT/.config/opencode/oh-my-opencode.jsonc"
assert_not_exists "$HOME_NO_COMPAT/.lore/opencode-compat.json"

HOME_PIPE="$TMP/home-pipe"
BIN_PIPE="$TMP/bin-pipe"
PIPE_CONFIG="$HOME_PIPE/.config/opencode/oh-my-openagent.json"
PIPE_CWD="$TMP/pipe-cwd"
PIPE_MARKER="$TMP/untrusted-helper-ran"
mkdir -p "$(dirname "$PIPE_CONFIG")" "$PIPE_CWD"
make_fake_tools "$BIN_PIPE" 1
printf '{"claude_code":{"hooks":true}}\n' > "$PIPE_CONFIG"
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
OUT_PIPE="$TMP/install-pipe.log"
(
  cd "$PIPE_CWD"
  cat "$INSTALL" | \
    HOME="$HOME_PIPE" \
    PATH="$BIN_PIPE:/opt/homebrew/bin:/usr/bin:/bin" \
    LORE_HOME="$HOME_PIPE/.lore" \
    TEST_OPENCODE_ARCHIVE="$TMP/lore-opencode.zip" \
    TEST_OPENCODE_COMPAT_HELPER="$ROOT/scripts/opencode-compat.py" \
      bash -s -- --skip-docker --pre --channels opencode \
        --base-url http://127.0.0.1:18901 --api-token test-token >"$OUT_PIPE" 2>&1
)
assert_not_exists "$PIPE_MARKER"
assert_contains "$PIPE_CONFIG" '"lore@lore": false'
assert_contains "$OUT_PIPE" 'disabled Claude Lore plugin import in oh-my-openagent'

HOME_ALLOW="$TMP/home-allow"
BIN_ALLOW="$TMP/bin-allow"
ALLOW_CONFIG="$HOME_ALLOW/.config/opencode/oh-my-openagent.json"
mkdir -p "$(dirname "$ALLOW_CONFIG")"
make_fake_tools "$BIN_ALLOW" 1
printf '{"claude_code":{"plugins_override":{"lore@lore":true}}}\n' > "$ALLOW_CONFIG"
cp "$ALLOW_CONFIG" "$TMP/allow-config.before"
OUT_ALLOW="$TMP/install-allow.log"
HOME="$HOME_ALLOW" \
PATH="$BIN_ALLOW:/opt/homebrew/bin:/usr/bin:/bin" \
LORE_HOME="$HOME_ALLOW/.lore" \
LORE_OPENCODE_ALLOW_MCP=1 \
TEST_OPENCODE_ARCHIVE="$TMP/lore-opencode.zip" \
TEST_OPENCODE_COMPAT_HELPER="$ROOT/scripts/opencode-compat.py" \
  bash "$INSTALL" --skip-docker --pre --channels opencode \
    --base-url http://127.0.0.1:18901 --api-token test-token >"$OUT_ALLOW" 2>&1
cmp -s "$ALLOW_CONFIG" "$TMP/allow-config.before" || fail "escape hatch did not preserve compatibility config"
assert_not_exists "$HOME_ALLOW/.lore/opencode-compat.json"
assert_contains "$OUT_ALLOW" 'LORE_OPENCODE_ALLOW_MCP=1'

cat > "$TARGET" <<'JS'
/* @lore-managed-opencode-plugin version=0.0.1 */
export const stale = true;
JS
OUT_REPLACE="$TMP/install-replace.log"
run_install "$HOME_ONE" "$BIN_ONE" "$OUT_REPLACE"
assert_contains "$TARGET" 'version=1.3.15-pre.2'
assert_not_contains "$TARGET" 'stale = true'

cat > "$TARGET" <<'JS'
export const userOwnedPlugin = true;
JS
OUT_UNMARKED="$TMP/install-unmarked.log"
run_install "$HOME_ONE" "$BIN_ONE" "$OUT_UNMARKED"
assert_contains "$TARGET" 'userOwnedPlugin = true'
assert_not_contains "$TARGET" '@lore-managed-opencode-plugin'
assert_contains "$OUT_UNMARKED" 'not managed by Lore'

HOME_MISSING="$TMP/home-missing"
BIN_MISSING="$TMP/bin-missing"
mkdir -p "$HOME_MISSING"
make_fake_tools "$BIN_MISSING" 0
OUT_MISSING="$TMP/install-missing.log"
run_install "$HOME_MISSING" "$BIN_MISSING" "$OUT_MISSING"
assert_contains "$OUT_MISSING" 'opencode CLI not found. Skipping.'
[[ ! -e "$HOME_MISSING/.config/opencode/plugins/lore-memory.js" ]] || fail "plugin installed without OpenCode CLI"

HELP_OUT="$TMP/install-help.log"
LORE_INSTALL_LANG=en bash "$INSTALL" --help >"$HELP_OUT"
assert_contains "$HELP_OUT" 'claudecode,codex,pi,openclaw,hermes,opencode'
assert_contains "$HELP_OUT" 'default all 6'

OUT_DEFAULT="$TMP/install-default.log"
HOME="$TMP/home-default" \
PATH="$BIN_ONE:/usr/bin:/bin" \
LORE_HOME="$TMP/home-default/.lore" \
TEST_OPENCODE_ARCHIVE="$TMP/lore-opencode.zip" \
TEST_OPENCODE_COMPAT_HELPER="$ROOT/scripts/opencode-compat.py" \
  bash "$INSTALL" --skip-docker --pre --base-url http://127.0.0.1:18901 --api-token test-token >"$OUT_DEFAULT" 2>&1
assert_contains "$OUT_DEFAULT" 'Channels: claudecode,codex,pi,openclaw,hermes,opencode'

ZH_HELP_OUT="$TMP/install-help-zh.log"
LORE_INSTALL_LANG=zh bash "$INSTALL" --help >"$ZH_HELP_OUT"
assert_contains "$ZH_HELP_OUT" 'claudecode,codex,pi,openclaw,hermes,opencode'
assert_contains "$ZH_HELP_OUT" '默认全部 6 个'

echo "opencode install tests passed"

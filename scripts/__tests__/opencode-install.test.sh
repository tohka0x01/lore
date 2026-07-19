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
  cp "$TEST_OPENCODE_ARCHIVE" "$out"
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
  bash "$INSTALL" --skip-docker --pre --base-url http://127.0.0.1:18901 --api-token test-token >"$OUT_DEFAULT" 2>&1
assert_contains "$OUT_DEFAULT" 'Channels: claudecode,codex,pi,openclaw,hermes,opencode'

ZH_HELP_OUT="$TMP/install-help-zh.log"
LORE_INSTALL_LANG=zh bash "$INSTALL" --help >"$ZH_HELP_OUT"
assert_contains "$ZH_HELP_OUT" 'claudecode,codex,pi,openclaw,hermes,opencode'
assert_contains "$ZH_HELP_OUT" '默认全部 6 个'

echo "opencode install tests passed"

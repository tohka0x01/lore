#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Lore install script — one command to connect any agent runtime
# =============================================================================
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/FFatTiger/lore/main/scripts/install.sh | bash -s -- [OPTIONS]
#
# Options:
#   --base-url URL       Lore server base URL
#   --api-token TOKEN    Lore API token
#   --channels CH,...    Comma-separated: claudecode,codex,pi,openclaw,hermes
#                        Default: all 5
#   --skip-docker        Don't run docker compose up
#   --force              Force reinstall even if version unchanged
#   --pre                Include pre-releases when checking latest version

# ---- Args ----

BASE_URL=""
API_TOKEN=""
CHANNELS_RAW=""
SKIP_DOCKER=0
FORCE=0
CHECK_PRE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url)   BASE_URL="$2"; _EXPLICIT_BASE_URL=1; shift 2;;
    --api-token)  API_TOKEN="$2"; shift 2;;
    --channels)   CHANNELS_RAW="$2"; shift 2;;
    --skip-docker) SKIP_DOCKER=1; shift;;
    --force)       FORCE=1; shift;;
    --pre)         CHECK_PRE=1; shift;;
    *) shift;;
  esac
done

# ---- Constants ----

REPO="FFatTiger/lore"
DEFAULT_BASE_URL="http://127.0.0.1:18901"
LORE_HOME="${LORE_HOME:-$HOME/.lore}"
LORE_CONFIG_FILE="$LORE_HOME/config.json"
LORE_DOCKER_DIR="$LORE_HOME/docker"
REPO_RAW="https://raw.githubusercontent.com/${REPO}/main"

# ---- Colors ----

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

banner() {
  echo ""
  echo -e "${BLUE}${BOLD} _     ____  ____  _____ ${NC}"
  echo -e "${BLUE}${BOLD}/ \   /  _ \/  __\/  __/ ${NC}  Lore — long-term memory for AI agents"
  echo -e "${BLUE}${BOLD}| |   | / \||  \/||  \   ${NC}"
  echo -e "${BLUE}${BOLD}| |_/\| \_/||    /|  /_  ${NC}  One install script, all agent runtimes."
  echo -e "${BLUE}${BOLD}\____/\____/\_/\_\\____\ ${NC}"
  echo -e "${BLUE}${BOLD}                        ${NC}"
  echo ""
}

info()  { echo -e "${BLUE}→${NC} $1"; }
ok()    { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}!${NC} $1"; }
err()   { echo -e "${RED}✗${NC} $1"; }

have_command() { command -v "$1" >/dev/null 2>&1; }

# ---- Config file ----

read_config() {
  if [[ -f "$LORE_CONFIG_FILE" ]]; then
    python3 -c "
import sys, json
try:
  with open('$LORE_CONFIG_FILE') as f: d = json.load(f)
  print(d.get('base_url',''))
except: pass
" 2>/dev/null
  fi
}

write_config() {
  mkdir -p "$LORE_HOME"
  local new_ver=""
  # Only bump installed_version if we actually installed
  if [[ $NEED_INSTALL -ne 2 ]]; then
    new_ver="${RELEASE_VERSION:-}"
  fi

  python3 - "$LORE_CONFIG_FILE" "$BASE_URL" "$API_TOKEN" "$new_ver" <<'PY'
import sys, json, os
path = sys.argv[1]
base_url = sys.argv[2]
api_token = sys.argv[3]
version = sys.argv[4]

data = {}
if os.path.exists(path):
    try:
        with open(path, 'r') as f: data = json.load(f)
    except: data = {}

data['base_url'] = base_url
if api_token: data['api_token'] = api_token
elif 'api_token' in data: del data['api_token']
if version: data['installed_version'] = version

with open(path, 'w') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
PY
  ok "Config saved → $LORE_CONFIG_FILE"
}

# ---- Resolve channels ----

ALL_CHANNELS=(claudecode codex pi openclaw hermes)

resolve_channels() {
  if [[ -n "$CHANNELS_RAW" ]]; then
    IFS=',' read -ra CHANNELS <<< "$CHANNELS_RAW"
  else
    CHANNELS=("${ALL_CHANNELS[@]}")
  fi
}

# ---- Docker ----

start_docker() {
  if [[ "$SKIP_DOCKER" == "1" ]]; then
    info "Skipping Docker (--skip-docker)."
    return
  fi

  # Only skip docker if user explicitly passed --base-url
  if [[ -n "${_EXPLICIT_BASE_URL:-}" ]]; then
    info "Using external Lore server: $BASE_URL — skipping Docker."
    return
  fi

  # If config.json already has a saved base_url, skip docker (updating existing install)
  local saved; saved=$(read_config)
  if [[ -n "$saved" ]]; then
    info "Config has saved server: $saved — skipping Docker."
    BASE_URL="$saved"
    return
  fi

  if ! have_command docker; then
    warn "Docker not found. Install Docker first, or use --base-url for external server."
    return
  fi

  info "Starting Lore via Docker Compose..."
  mkdir -p "$LORE_DOCKER_DIR"

  # Download docker-compose.yml from repo
  local compose_url="${REPO_RAW}/docker-compose.yml"
  curl -fsSL "$compose_url" -o "$LORE_DOCKER_DIR/docker-compose.yml" || {
    warn "Failed to download docker-compose.yml"
    return
  }

  # Write .env if not exists
  if [[ ! -f "$LORE_DOCKER_DIR/.env" ]]; then
    local pg_pass
    pg_pass=$(python3 -c "import secrets; print(secrets.token_hex(16))" 2>/dev/null || echo "lore-$(date +%s)")
    cat > "$LORE_DOCKER_DIR/.env" <<EOF
TZ=Asia/Shanghai
POSTGRES_DB=lore
POSTGRES_USER=lore
POSTGRES_PASSWORD=${pg_pass}
POSTGRES_PORT=55439
WEB_PORT=18901
POSTGRES_DATA_DIR=${LORE_DOCKER_DIR}/data/postgres
SNAPSHOT_DATA_DIR=${LORE_DOCKER_DIR}/data/snapshots
DATABASE_URL=postgresql://lore:${pg_pass}@postgres:5432/lore
EOF
    ok "Docker .env written → $LORE_DOCKER_DIR/.env"
  fi

  (
    cd "$LORE_DOCKER_DIR"
    docker compose up -d || {
      warn "docker compose up failed. Check $LORE_DOCKER_DIR/docker-compose.yml"
      return
    }
  )

  ok "Lore server starting at http://127.0.0.1:18901"
  BASE_URL="$DEFAULT_BASE_URL"

  # Wait for health
  info "Waiting for Lore to be ready (this may take a minute)..."
  local attempts=0
  while [[ $attempts -lt 60 ]]; do
    if curl -fsS "${BASE_URL}/api/health" >/dev/null 2>&1; then
      ok "Lore server is healthy."
      return
    fi
    sleep 3
    attempts=$((attempts + 1))
    # Show progress every 30 seconds
    if [[ $((attempts % 10)) -eq 0 ]]; then
      info "Still waiting... (${attempts}0s)"
    fi
  done
  warn "Lore health check timed out (3 min). Check: docker compose -f $LORE_DOCKER_DIR/docker-compose.yml logs"
}

# ---- Release / version ----

RELEASE_VERSION=""
NEED_INSTALL=0

check_release() {
  info "Checking latest release..."

  local api_url
  if [[ "$CHECK_PRE" == "1" ]]; then
    api_url="https://api.github.com/repos/${REPO}/releases?per_page=1"
  else
    api_url="https://api.github.com/repos/${REPO}/releases/latest"
  fi

  local release_json
  release_json=$(curl -fsSL "$api_url" 2>/dev/null) || {
    warn "Cannot reach GitHub API."
    NEED_INSTALL=1
    return
  }

  if [[ "$CHECK_PRE" == "1" ]]; then
    RELEASE_VERSION=$(echo "$release_json" | python3 -c "
import sys, json
arr = json.loads(sys.stdin.read())
print(arr[0].get('tag_name','') if arr else '')
" 2>/dev/null)
  else
    RELEASE_VERSION=$(echo "$release_json" | python3 -c "
import sys, json
print(json.loads(sys.stdin.read()).get('tag_name',''))
" 2>/dev/null)
  fi

  if [[ -z "$RELEASE_VERSION" ]]; then
    warn "Could not determine latest release version."
    NEED_INSTALL=1
    return
  fi

  local installed
  installed=$(python3 -c "
import sys, json
try:
  with open('$LORE_CONFIG_FILE') as f: d = json.load(f)
  print(d.get('installed_version',''))
except: pass
" 2>/dev/null) || installed=""

  # Semver compare: don't downgrade
  if [[ -n "$installed" && "$FORCE" != "1" ]]; then
    local cmp; cmp=$(python3 -c "
import re

def parse(v):
    v = v.lstrip('v')
    m = re.match(r'(\d+)\.(\d+)\.(\d+)(?:-(.*))?', v)
    if not m: return (0,0,0, '', '')
    return (int(m.group(1)), int(m.group(2)), int(m.group(3)),
            m.group(4) or '', 'pre' in (m.group(4) or ''))

a = parse('$installed')
b = parse('$RELEASE_VERSION')

# pre-release < stable at same version
if a[:3] == b[:3]:
    if a[4] and not b[4]: print('newer_installed')  # installed is pre, release is stable
    elif not a[4] and b[4]: print('downgrade')
    elif a == b: print('same')
    else: print('newer' if a > b else 'older')
else:
    print('newer' if a > b else 'older')
" 2>/dev/null) || cmp="unknown"

    if [[ "$cmp" == "same" ]]; then
      ok "Already at latest version: $RELEASE_VERSION"
      NEED_INSTALL=2
    elif [[ "$cmp" == "newer_installed" ]]; then
      ok "Installed $installed (newer than latest stable $RELEASE_VERSION). Use --pre to check pre-releases."
      NEED_INSTALL=2
    elif [[ "$cmp" == "newer" ]]; then
      ok "Installed $installed (newer than $RELEASE_VERSION). Use --pre to check pre-releases."
      NEED_INSTALL=2
    elif [[ "$cmp" == "downgrade" ]]; then
      warn "Release $RELEASE_VERSION is older than installed $installed. Use --force to downgrade."
      NEED_INSTALL=2
    else
      info "Update available: $installed → $RELEASE_VERSION"
      NEED_INSTALL=0
    fi
  elif [[ -n "$installed" ]]; then
    info "Update available: $installed → $RELEASE_VERSION"
    NEED_INSTALL=0
  else
    info "Installing version: $RELEASE_VERSION"
    NEED_INSTALL=0
  fi
}

# ---- Artifact download ----

artifact_for() {
  case "$1" in
    claudecode) echo "lore-claudecode.zip";;
    codex)      echo "lore-codex.zip";;
    pi)         echo "lore-pi.zip";;
    openclaw)   echo "lore-openclaw.zip";;
    hermes)     echo "lore-hermes.zip";;
  esac
}

download_artifact() {
  local channel="$1" dest="$2"
  local artifact; artifact=$(artifact_for "$channel")
  if [[ -z "$artifact" ]]; then
    warn "No artifact for: $channel"
    return 1
  fi

  local url="https://github.com/${REPO}/releases/download/${RELEASE_VERSION}/${artifact}"

  info "Downloading ${artifact}..."
  rm -rf "$dest" "$dest.tmp"
  mkdir -p "$dest.tmp"

  curl -fsSL "$url" -o "$dest.tmp/${artifact}" 2>/dev/null || {
    warn "Download failed: $url"
    rm -rf "$dest.tmp"
    return 1
  }

  unzip -qo "$dest.tmp/${artifact}" -d "$dest.tmp/extracted" 2>/dev/null || {
    warn "Extract failed for ${artifact}"
    rm -rf "$dest.tmp"
    return 1
  }

  rm -rf "$dest"
  mv "$dest.tmp/extracted" "$dest"
  rm -rf "$dest.tmp"
  ok "Installed to $dest"
  return 0
}

download_or_skip() {
  local channel="$1" dest="$2"
  if [[ $NEED_INSTALL -eq 0 ]]; then
    download_artifact "$channel" "$dest" || return 1
  elif [[ ! -d "$dest" ]]; then
    if [[ -n "$RELEASE_VERSION" ]]; then
      download_artifact "$channel" "$dest" || return 1
    else
      err "No local install and no release."; return 1
    fi
  else
    ok "${channel} at $dest (${RELEASE_VERSION:-local})"
  fi
}

# ---- Channel: Claude Code ----

install_claudecode() {
  echo ""
  echo -e "${BOLD}── Claude Code ────────────────────────────────${NC}"; echo ""

  if ! have_command claude; then warn "claude CLI not found. Skipping."; return; fi

  local plugin_dir="$LORE_HOME/claudecode"
  download_or_skip "claudecode" "$plugin_dir" || return

  claude plugin marketplace add "$plugin_dir" 2>/dev/null || true

  if ! claude plugin list 2>/dev/null | grep -q "lore@lore"; then
    claude plugin install lore@lore 2>/dev/null || warn "Try: /plugin install lore@lore"
  else
    ok "Plugin already enabled."
  fi

  # settings.json env (for MCP URL)
  local sf="$HOME/.claude/settings.json"
  if have_command python3; then
    python3 - "$sf" "$BASE_URL" "$API_TOKEN" <<'PY'
import sys, json, os
path, base_url, api_token = sys.argv[1], sys.argv[2], sys.argv[3]
data = {}
if os.path.exists(path):
    try:
        with open(path, 'r') as f: data = json.load(f)
    except: data = {}
if not isinstance(data, dict): data = {}
data.setdefault("env", {})
data["env"]["LORE_BASE_URL"] = base_url
if api_token: data["env"]["LORE_API_TOKEN"] = api_token
with open(path, 'w') as f: json.dump(data, f, indent=2, ensure_ascii=False)
PY
    ok "Claude Code settings updated."
  fi

  # lore-guidance.md + CLAUDE.md @import
  local gsrc="$plugin_dir/rules/lore-guidance.md"
  local gdst="$HOME/.claude/lore-guidance.md"
  if [[ -f "$gsrc" ]]; then
    cp "$gsrc" "$gdst"
    ok "lore-guidance.md → $gdst"
  fi

  local cmd="$HOME/.claude/CLAUDE.md"
  local iline="@import ~/.claude/lore-guidance.md"
  if [[ -f "$cmd" ]] && grep -qF "$iline" "$cmd" 2>/dev/null; then
    ok "CLAUDE.md already has lore-guidance import."
  else
    if [[ -f "$cmd" ]]; then
      printf '%s\n\n%s\n' "$iline" "$(cat "$cmd")" > "${cmd}.tmp.$$"
      mv "${cmd}.tmp.$$" "$cmd"
    else
      printf '%s\n' "$iline" > "$cmd"
    fi
    ok "Added @import to CLAUDE.md"
  fi

  ok "Claude Code done. Restart Claude Code."
}

# ---- Channel: Codex ----

install_codex() {
  echo ""
  echo -e "${BOLD}── Codex ───────────────────────────────────────${NC}"; echo ""

  if ! have_command codex; then warn "codex CLI not found. Skipping."; return; fi

  local market_dir="$LORE_HOME/codex"
  download_or_skip "codex" "$market_dir" || return

  codex plugin marketplace add "$market_dir" 2>/dev/null || true

  # Enable in config.toml
  local cfg="${CODEX_HOME:-$HOME/.codex}/config.toml"
  if have_command python3 && [[ -f "$cfg" ]]; then
    python3 - "$cfg" <<'PY'
import sys
path = sys.argv[1]
with open(path) as f: lines = f.readlines()
section = '[plugins."lore@lore"]'
out = []; idx = 0; found = False; done_en = False
while idx < len(lines):
    line = lines[idx]
    if line.strip() == section:
        found = True; out.append(line); idx += 1
        while idx < len(lines) and not lines[idx].lstrip().startswith('['):
            if lines[idx].strip().startswith('enabled'):
                out.append('enabled = true\n'); done_en = True
            else: out.append(lines[idx])
            idx += 1
        if not done_en: out.append('enabled = true\n')
        continue
    out.append(line); idx += 1
if not found:
    if out and out[-1] != '\n': out.append('\n')
    out.extend([section + '\n', 'enabled = true\n'])
with open(path, 'w') as f: f.writelines(out)
PY
    ok "Plugin enabled in config.toml"
  fi

  # MCP
  local mcp_url="${BASE_URL}/api/mcp?client_type=codex"
  codex mcp remove lore >/dev/null 2>&1 || true
  if [[ -n "$API_TOKEN" ]]; then
    codex mcp add lore --url "$mcp_url" --bearer-token-env-var LORE_API_TOKEN 2>/dev/null || true
  else
    codex mcp add lore --url "$mcp_url" 2>/dev/null || true
  fi
  ok "MCP configured."

  # AGENTS.md guidance (Codex has no @import)
  local gsrc="$market_dir/plugins/lore/rules/lore-guidance.md"
  local gdst="${CODEX_HOME:-$HOME/.codex}/AGENTS.md"
  if [[ -f "$gsrc" ]]; then
    if ! grep -qF "Lore 使用规则" "$gdst" 2>/dev/null; then
      if [[ -f "$gdst" ]]; then
        cat "$gsrc" "$gdst" > "${gdst}.tmp.$$"
        mv "${gdst}.tmp.$$" "$gdst"
      else
        cp "$gsrc" "$gdst"
      fi
      ok "Lore guidance added to AGENTS.md"
    else
      ok "AGENTS.md already has Lore guidance."
    fi
  fi

  # Hooks
  if [[ -x "$market_dir/plugins/lore/scripts/install-hooks.sh" ]]; then
    LORE_CODEX_PLUGIN_ROOT="$market_dir/plugins/lore" \
      LORE_BASE_URL="${BASE_URL}" \
      bash "$market_dir/plugins/lore/scripts/install-hooks.sh" 2>/dev/null || true
    ok "Hooks installed."
  fi

  ok "Codex done. Restart Codex."
}

# ---- Channel: Pi ----

install_pi() {
  echo ""
  echo -e "${BOLD}── Pi ──────────────────────────────────────────${NC}"; echo ""

  if ! have_command pi; then warn "pi CLI not found. Skipping."; return; fi

  local pi_dir="$LORE_HOME/pi"
  download_or_skip "pi" "$pi_dir" || return

  LORE_BASE_URL="${BASE_URL}" LORE_API_TOKEN="${API_TOKEN:-}" \
    bash "$pi_dir/scripts/install-local.sh"
  ok "Pi done. Run /reload in Pi."
}

# ---- Channel: OpenClaw ----

install_openclaw() {
  echo ""
  echo -e "${BOLD}── OpenClaw ────────────────────────────────────${NC}"; echo ""

  if ! have_command openclaw; then warn "openclaw CLI not found. Skipping."; return; fi

  local oc_dir="$LORE_HOME/openclaw"
  download_or_skip "openclaw" "$oc_dir" || return

  (
    cd "$oc_dir"
    npm install --silent 2>/dev/null || npm install
    npm run build 2>/dev/null || true
    openclaw plugins install . --force --dangerously-force-unsafe-install 2>/dev/null || true
    openclaw plugins enable lore 2>/dev/null || true
  )

  local occ="$HOME/.openclaw/openclaw.json"
  if [[ -f "$occ" ]] && have_command python3; then
    python3 - "$occ" "$BASE_URL" "$API_TOKEN" <<'PY'
import sys, json
path, base_url, api_token = sys.argv[1], sys.argv[2], sys.argv[3]
try:
    with open(path) as f: data = json.load(f)
except: data = {}
data.setdefault("plugins",{}).setdefault("entries",{}).setdefault("lore",{})
lore = data["plugins"]["entries"]["lore"]
lore.setdefault("config",{})
lore["config"]["baseUrl"] = base_url
if api_token: lore["config"]["apiToken"] = api_token
lore.setdefault("enabled", True)
with open(path, 'w') as f: json.dump(data, f, indent=2, ensure_ascii=False)
PY
    ok "OpenClaw config updated."
  fi
  ok "OpenClaw done."
}

# ---- Channel: Hermes ----

install_hermes() {
  echo ""
  echo -e "${BOLD}── Hermes ──────────────────────────────────────${NC}"; echo ""

  local plugin_dir="$LORE_HOME/hermes"
  download_or_skip "hermes" "$plugin_dir" || return

  echo ""
  echo -e "  Symlink to complete Hermes setup:"
  echo -e "    ${GREEN}ln -s ${plugin_dir}/lore_memory <hermes-plugin-path>/lore_memory${NC}"
  echo ""
  echo "  And ensure env vars in Hermes environment:"
  echo -e "    ${GREEN}export LORE_BASE_URL=${BASE_URL}${NC}"
  [[ -n "$API_TOKEN" ]] && echo -e "    ${GREEN}export LORE_API_TOKEN=${API_TOKEN}${NC}"
  echo ""
  ok "Hermes files ready."
}

# ---- Main ----

main() {
  banner

  resolve_channels
  start_docker

  # Ensure BASE_URL is set
  BASE_URL="${BASE_URL:-$DEFAULT_BASE_URL}"
  BASE_URL="${BASE_URL%/}"

  echo ""
  echo -e "  Base URL:  ${GREEN}${BASE_URL}${NC}"
  echo -e "  Channels:  ${GREEN}$(IFS=,; echo "${CHANNELS[*]}")${NC}"
  echo -e "  Pre-releases: ${GREEN}$([[ "$CHECK_PRE" == "1" ]] && echo yes || echo no)${NC}"
  echo ""

  check_release || true

  for ch in "${CHANNELS[@]}"; do
    case "$ch" in
      claudecode) install_claudecode;;
      codex)      install_codex;;
      pi)         install_pi;;
      openclaw)   install_openclaw;;
      hermes)     install_hermes;;
      *)          warn "Unknown channel: $ch";;
    esac
  done

  write_config

  echo ""
  echo -e "${GREEN}${BOLD}══════════════════════════════════════════════${NC}"
  echo -e "${GREEN}${BOLD}  Lore install complete!${NC}"
  echo ""
  echo -e "  Version:   ${GREEN}${RELEASE_VERSION:-unknown}${NC}"
  echo -e "  Base URL:  ${GREEN}${BASE_URL}${NC}"
  echo -e "  Config:    ${BLUE}${LORE_CONFIG_FILE}${NC}"
  echo -e "  Docker:    ${BLUE}${LORE_DOCKER_DIR}${NC}"
  echo ""
  echo "  Next:"
  echo "    1. Restart agent runtime(s)"
  echo "    2. Open http://${BASE_URL#http://}/setup for first-run setup"
  echo ""
  echo "  To update: re-run this script."
  echo -e "${GREEN}${BOLD}══════════════════════════════════════════════${NC}"
  echo ""
}

main "$@"

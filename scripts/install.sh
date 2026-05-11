#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Lore install script — one command to connect any agent runtime
# =============================================================================
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/FFatTiger/lore/main/scripts/install.sh | bash
#
# Env vars (skip interactive prompts):
#   LORE_BASE_URL          — Lore server base URL
#   LORE_API_TOKEN         — Lore API token
#   LORE_INSTALL_CHANNELS  — comma-separated: claudecode,codex,pi,openclaw,hermes
#   LORE_INSTALL_NO_INTERACTIVE=1 — non-interactive mode
#   LORE_FORCE_REINSTALL=1 — force reinstall even if same version

# ---- Constants ----

REPO="FFatTiger/lore"
DEFAULT_BASE_URL="http://127.0.0.1:18901"
LORE_HOME="${LORE_HOME:-$HOME/.lore}"
LORE_CONFIG_FILE="$LORE_HOME/config.json"

# Channel → artifact name on release
artifact_for() {
  case "$1" in
    claudecode) echo "lore-claudecode.zip";;
    codex)      echo "lore-codex.zip";;
    pi)         echo "lore-pi.zip";;
    openclaw)   echo "lore-openclaw.zip";;
    hermes)     echo "lore-hermes.zip";;
  esac
}

# ---- Colors ----

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; NC='\033[0m'

banner() {
  echo ""
  echo -e "${BLUE}${BOLD}  █████       ${NC}"
  echo -e "${BLUE}${BOLD} ██╱  ██      ${NC}  Lore — long-term memory for AI agents"
  echo -e "${BLUE}${BOLD} ██╱  ╱██     ${NC}"
  echo -e "${BLUE}${BOLD} ██╱  ╱██     ${NC}  One install script, all agent runtimes."
  echo -e "${BLUE}${BOLD} ██╱  ╱██     ${NC}"
  echo -e "${BLUE}${BOLD}  ████╱      ${NC}"
  echo ""
}

info()  { echo -e "${BLUE}→${NC} $1"; }
ok()    { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}!${NC} $1"; }
err()   { echo -e "${RED}✗${NC} $1"; }

have_command() { command -v "$1" >/dev/null 2>&1; }
is_tty() { [[ -t 0 && -t 1 ]]; }
is_interactive() { [[ "${LORE_INSTALL_NO_INTERACTIVE:-0}" != "1" ]] && is_tty; }

# ---- Config file ----

read_config() {
  if [[ -f "$LORE_CONFIG_FILE" ]]; then
    python3 -c "
import sys, json
try:
  with open('$LORE_CONFIG_FILE') as f:
    d = json.load(f)
  print(d.get('base_url',''))
except: pass
" 2>/dev/null
  fi
}

write_config() {
  mkdir -p "$LORE_HOME"
  local existing_base_url="${BASE_URL}"
  local existing_token="${API_TOKEN:-}"
  local installed_ver="${RELEASE_VERSION:-}"

  python3 - "$LORE_CONFIG_FILE" "$existing_base_url" "$existing_token" "$installed_ver" <<'PY'
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

# ---- Release / version ----

RELEASE_VERSION=""

# Returns: 0 = needs install, 1 = install if local missing, 2 = skip (up to date)
NEED_INSTALL=0

check_release() {
  info "Checking latest release..."

  # Use /releases?per_page=1 to include pre-releases
  local release_json
  release_json=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases?per_page=1" 2>/dev/null) || {
    warn "Cannot reach GitHub API."
    NEED_INSTALL=1
    return
  }

  RELEASE_VERSION=$(echo "$release_json" | python3 -c "
import sys, json
arr = json.loads(sys.stdin.read())
print(arr[0].get('tag_name','') if arr else '')
" 2>/dev/null)

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

  if [[ "$installed" == "$RELEASE_VERSION" && "${LORE_FORCE_REINSTALL:-0}" != "1" ]]; then
    ok "Already at latest version: $RELEASE_VERSION"
    NEED_INSTALL=2
  elif [[ -n "$installed" ]]; then
    info "Update available: $installed → $RELEASE_VERSION"
    NEED_INSTALL=0
  else
    info "Installing version: $RELEASE_VERSION"
    NEED_INSTALL=0
  fi
}

download_artifact() {
  local channel="$1" dest="$2"
  local artifact; artifact=$(artifact_for "$channel")
  if [[ -z "$artifact" ]]; then
    warn "No artifact mapping for channel: $channel"
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

  # Extract
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

# ---- Interactive UI ----

multi_select() {
  local channels=("claudecode" "codex" "pi" "openclaw" "hermes")
  local labels=(
    "Claude Code  (MCP + boot/recall hooks + CLAUDE.md guidance)"
    "Codex        (local marketplace + MCP + hooks + AGENTS.md)"
    "Pi           (extension + tools + startup hooks)"
    "OpenClaw     (runtime plugin + boot/recall + tools)"
    "Hermes       (MemoryProvider plugin + tools + recall)"
  )
  local cmds=("claude" "codex" "pi" "openclaw" "python3")
  local n=${#channels[@]}

  # Build label list with detection marks
  local opts=()
  for i in $(seq 0 $((n - 1))); do
    local mark=""
    if have_command "${cmds[$i]}"; then mark=" (detected)"; else mark=" (not found)"; fi
    opts+=("${channels[$i]}: ${labels[$i]}${mark}")
  done

  local selected
  if have_command gum; then
    echo ""
    echo -e "${BOLD}Select channels (Space=toggle, Enter=confirm):${NC}"
    echo ""
    selected=$(printf '%s\n' "${opts[@]}" | gum choose --no-limit --height=8 \
      --selected-prefix=' ◉ ' --unselected-prefix=' ○ ' \
      --cursor-prefix='> ' \
      2>/dev/null) || {
      err "gum failed. Try: brew install gum or set LORE_INSTALL_CHANNELS=..."
      exit 1
    }
  else
    echo ""
    echo -e "${BOLD}Available channels:${NC}"
    echo ""
    for i in $(seq 0 $((n - 1))); do
      echo "  [$((i+1))] ${opts[$i]}"
    done
    echo "  [a] All channels"
    echo ""
    echo -e "${YELLOW}Tip: brew install gum for interactive multi-select${NC}"
    read -r -p "Enter comma-separated numbers or 'a': " input
    if [[ "$input" =~ ^[Aa]$ ]]; then
      CHANNELS=("${channels[@]}")
      echo ""; return
    fi
    CHANNELS=()
    IFS=',' read -ra nums <<< "$input"
    for num in "${nums[@]}"; do
      num=$(echo "$num" | xargs)
      if [[ "$num" =~ ^[1-5]$ ]]; then
        CHANNELS+=("${channels[$((num-1))]}")
      fi
    done
    if [[ ${#CHANNELS[@]} -eq 0 ]]; then err "No channels selected."; exit 1; fi
    echo ""; return
  fi

  CHANNELS=()
  while IFS= read -r line; do
    local ch="${line%%:*}"
    CHANNELS+=("$ch")
  done <<< "$selected"

  if [[ ${#CHANNELS[@]} -eq 0 ]]; then err "No channels selected."; exit 1; fi

  echo -ne "Channels: "
  for ch in "${CHANNELS[@]}"; do echo -ne "${GREEN}${ch}${NC} "; done
  echo ""; echo ""
}

select_channels() {
  if [[ -n "${LORE_INSTALL_CHANNELS:-}" ]]; then
    IFS=',' read -ra CHANNELS <<< "$LORE_INSTALL_CHANNELS"
    echo -e "Using LORE_INSTALL_CHANNELS: ${LORE_INSTALL_CHANNELS}"; echo ""
    return
  fi
  if ! is_interactive; then
    CHANNELS=("claudecode" "codex" "pi" "openclaw" "hermes")
    echo "Non-interactive mode, installing all channels."; echo ""
    return
  fi
  multi_select
}

prompt_config() {
  local saved_url; saved_url=$(read_config)

  if [[ -n "${LORE_BASE_URL:-}" ]]; then
    BASE_URL="$LORE_BASE_URL"
    info "Using LORE_BASE_URL from environment: ${BASE_URL}"
  elif [[ -n "$saved_url" ]]; then
    BASE_URL="$saved_url"
    info "Using saved base URL: ${BASE_URL}"
  elif is_interactive; then
    read -r -p "Lore server base URL [${DEFAULT_BASE_URL}]: " input_url
    BASE_URL="${input_url:-$DEFAULT_BASE_URL}"
  else
    BASE_URL="$DEFAULT_BASE_URL"
    info "Using default base URL: ${BASE_URL}"
  fi
  BASE_URL="${BASE_URL%/}"

  if [[ -n "${LORE_API_TOKEN:-}" ]]; then
    API_TOKEN="$LORE_API_TOKEN"
  elif is_interactive; then
    read -r -p "Lore API token (press Enter to skip): " input_token
    API_TOKEN="${input_token:-}"
  else
    API_TOKEN=""
  fi

  echo ""
  echo -e "  Base URL:  ${GREEN}${BASE_URL}${NC}"
  if [[ -n "$API_TOKEN" ]]; then
    echo -e "  API Token: ${GREEN}$(echo "$API_TOKEN" | head -c 8)...${NC}"
  else
    echo -e "  API Token: ${YELLOW}(none)${NC}"
  fi
  echo ""

  if is_interactive; then
    read -r -p "Continue with these settings? [Y/n]: " confirm
    if [[ "$confirm" =~ ^[Nn] ]]; then err "Aborted."; exit 1; fi
  fi
}

# ---- Channel: Claude Code ----

install_claudecode() {
  echo ""
  echo -e "${BOLD}── Claude Code ────────────────────────────────${NC}"; echo ""

  if ! have_command claude; then
    warn "claude CLI not found. Skipping."; return
  fi

  local plugin_dir="$LORE_HOME/claudecode"

  if [[ $NEED_INSTALL -eq 0 ]]; then
    download_artifact "claudecode" "$plugin_dir" || return
  elif [[ ! -d "$plugin_dir/.claude-plugin" ]]; then
    if [[ -n "$RELEASE_VERSION" ]]; then
      download_artifact "claudecode" "$plugin_dir" || return
    else
      err "No release found and no local install."; return
    fi
  else
    ok "Claude Code plugin at $plugin_dir (version: ${RELEASE_VERSION:-local})"
  fi

  # Register local marketplace (idempotent)
  claude plugin marketplace add "$plugin_dir" 2>/dev/null || true

  # Install plugin (idempotent)
  if ! claude plugin list 2>/dev/null | grep -q "lore@lore"; then
    info "Installing lore@lore..."
    claude plugin install lore@lore 2>/dev/null || \
      warn "Try manually: /plugin install lore@lore"
  else
    ok "Plugin already enabled."
  fi

  # Write settings.json env (for MCP URL resolution)
  local settings_file="$HOME/.claude/settings.json"
  if have_command python3; then
    python3 - "$settings_file" "$BASE_URL" "$API_TOKEN" <<'PY'
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

  # Write lore-guidance.md to ~/.claude/
  local guidance_src="$plugin_dir/rules/lore-guidance.md"
  local guidance_dst="$HOME/.claude/lore-guidance.md"
  if [[ -f "$guidance_src" ]]; then
    cp "$guidance_src" "$guidance_dst"
    ok "lore-guidance.md → $guidance_dst"
  fi

  # Prepend @import to ~/.claude/CLAUDE.md
  local claude_md="$HOME/.claude/CLAUDE.md"
  local import_line="@import ~/.claude/lore-guidance.md"
  if [[ -f "$claude_md" ]] && grep -qF "$import_line" "$claude_md" 2>/dev/null; then
    ok "CLAUDE.md already has lore-guidance import."
  else
    info "Adding import to CLAUDE.md..."
    if [[ -f "$claude_md" ]]; then
      local tmp_md="${claude_md}.tmp.$$"
      printf '%s\n\n%s\n' "$import_line" "$(cat "$claude_md")" > "$tmp_md"
      mv "$tmp_md" "$claude_md"
    else
      printf '%s\n' "$import_line" > "$claude_md"
    fi
    ok "Added '@import ~/.claude/lore-guidance.md' to CLAUDE.md"
  fi

  ok "Claude Code setup complete. Restart Claude Code to take effect."
}

# ---- Channel: Codex ----

install_codex() {
  echo ""
  echo -e "${BOLD}── Codex ───────────────────────────────────────${NC}"; echo ""

  if ! have_command codex; then
    warn "codex CLI not found. Skipping."; return
  fi

  local market_dir="$LORE_HOME/codex"

  if [[ $NEED_INSTALL -eq 0 ]]; then
    download_artifact "codex" "$market_dir" || return
  elif [[ ! -d "$market_dir/.agents" ]]; then
    if [[ -n "$RELEASE_VERSION" ]]; then
      download_artifact "codex" "$market_dir" || return
    else
      err "No release found and no local install."; return
    fi
  else
    ok "Codex marketplace at $market_dir (version: ${RELEASE_VERSION:-local})"
  fi

  # Register marketplace (idempotent)
  codex plugin marketplace add "$market_dir" 2>/dev/null || true

  # Enable in config.toml
  local codex_config="${CODEX_HOME:-$HOME/.codex}/config.toml"
  if have_command python3 && [[ -f "$codex_config" ]]; then
    python3 - "$codex_config" <<'PY'
import sys
path = sys.argv[1]
with open(path, 'r') as f: lines = f.readlines()

plugin_section = '[plugins."lore@lore"]'
out = []; idx = 0; found = False; enabled_done = False
while idx < len(lines):
    line = lines[idx]
    if line.strip() == plugin_section:
        found = True; out.append(line); idx += 1
        while idx < len(lines) and not lines[idx].lstrip().startswith('['):
            if lines[idx].strip().startswith('enabled'):
                out.append('enabled = true\n'); enabled_done = True
            else: out.append(lines[idx])
            idx += 1
        if not enabled_done: out.append('enabled = true\n')
        continue
    out.append(line); idx += 1
if not found:
    if out and out[-1] != '\n': out.append('\n')
    out.extend([plugin_section + '\n', 'enabled = true\n'])
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

  # Write lore-guidance.md and inject into ~/.codex/AGENTS.md (Codex has no @import)
  local guidance_src="$market_dir/plugins/lore/rules/lore-guidance.md"
  local codex_agents_md="${CODEX_HOME:-$HOME/.codex}/AGENTS.md"
  if [[ -f "$guidance_src" ]]; then
    if ! grep -qF "Lore 使用规则" "$codex_agents_md" 2>/dev/null; then
      info "Adding Lore guidance to AGENTS.md..."
      if [[ -f "$codex_agents_md" ]]; then
        local tmp_md="${codex_agents_md}.tmp.$$"
        cat "$guidance_src" "$codex_agents_md" > "$tmp_md"
        mv "$tmp_md" "$codex_agents_md"
      else
        cp "$guidance_src" "$codex_agents_md"
      fi
      ok "Lore guidance appended to AGENTS.md"
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

  ok "Codex setup complete. Restart Codex to take effect."
}

# ---- Channel: Pi ----

install_pi() {
  echo ""
  echo -e "${BOLD}── Pi ──────────────────────────────────────────${NC}"; echo ""

  if ! have_command pi; then warn "pi CLI not found. Skipping."; return; fi

  local pi_dir="$LORE_HOME/pi"

  if [[ $NEED_INSTALL -eq 0 ]]; then
    download_artifact "pi" "$pi_dir" || return
  elif [[ ! -f "$pi_dir/scripts/install-local.sh" ]]; then
    if [[ -n "$RELEASE_VERSION" ]]; then
      download_artifact "pi" "$pi_dir" || return
    else
      err "No release found."; return
    fi
  else
    ok "Pi at $pi_dir (version: ${RELEASE_VERSION:-local})"
  fi

  LORE_BASE_URL="${BASE_URL}" LORE_API_TOKEN="${API_TOKEN:-}" \
    bash "$pi_dir/scripts/install-local.sh"
  ok "Pi install complete."
}

# ---- Channel: OpenClaw ----

install_openclaw() {
  echo ""
  echo -e "${BOLD}── OpenClaw ────────────────────────────────────${NC}"; echo ""

  if ! have_command openclaw; then warn "openclaw CLI not found. Skipping."; return; fi

  local oc_dir="$LORE_HOME/openclaw"

  if [[ $NEED_INSTALL -eq 0 ]]; then
    download_artifact "openclaw" "$oc_dir" || return
  elif [[ ! -f "$oc_dir/openclaw.plugin.json" ]]; then
    if [[ -n "$RELEASE_VERSION" ]]; then
      download_artifact "openclaw" "$oc_dir" || return
    else
      err "No release found."; return
    fi
  else
    ok "OpenClaw at $oc_dir (version: ${RELEASE_VERSION:-local})"
  fi

  (
    cd "$oc_dir"
    npm install --silent 2>/dev/null || npm install
    npm run build 2>/dev/null || true
    openclaw plugins install . --force --dangerously-force-unsafe-install 2>/dev/null || true
    openclaw plugins enable lore 2>/dev/null || true
  )

  local oc_config="$HOME/.openclaw/openclaw.json"
  if [[ -f "$oc_config" ]] && have_command python3; then
    python3 - "$oc_config" "$BASE_URL" "$API_TOKEN" <<'PY'
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
  ok "OpenClaw install complete."
}

# ---- Channel: Hermes ----

install_hermes() {
  echo ""
  echo -e "${BOLD}── Hermes ──────────────────────────────────────${NC}"; echo ""

  local plugin_dir="$LORE_HOME/hermes"

  if [[ $NEED_INSTALL -eq 0 ]]; then
    download_artifact "hermes" "$plugin_dir" || return
  elif [[ ! -d "$plugin_dir/lore_memory" ]]; then
    if [[ -n "$RELEASE_VERSION" ]]; then
      download_artifact "hermes" "$plugin_dir" || return
    else
      err "No release found."; return
    fi
  else
    ok "Hermes plugin at $plugin_dir (version: ${RELEASE_VERSION:-local})"
  fi

  echo ""
  echo -e "  ${BOLD}Hermes requires a symlink to complete setup:${NC}"
  echo ""
  echo -e "    ln -s ${plugin_dir}/lore_memory <hermes-plugin-path>/lore_memory"
  echo ""
  echo "  And ensure these env vars are set for Hermes:"
  echo -e "    ${GREEN}export LORE_BASE_URL=${BASE_URL}${NC}"
  [[ -n "$API_TOKEN" ]] && echo -e "    ${GREEN}export LORE_API_TOKEN=${API_TOKEN}${NC}"
  echo ""
  ok "Hermes setup info above. Create the symlink manually."
}

# ---- Final summary ----

summary() {
  echo ""
  echo -e "${GREEN}${BOLD}══════════════════════════════════════════════${NC}"
  echo -e "${GREEN}${BOLD}  Lore install complete!${NC}"
  echo ""
  echo -e "  Version: ${GREEN}${RELEASE_VERSION:-unknown}${NC}"
  echo -e "  Base URL:  ${GREEN}${BASE_URL}${NC}"
  echo -e "  Config:    ${BLUE}${LORE_CONFIG_FILE}${NC}"
  echo ""
  echo "  Installed channels:"
  for ch in "${CHANNELS[@]}"; do
    echo -e "    ${GREEN}✓${NC} ${ch}"
  done
  echo ""
  echo "  Next:"
  echo "    1. Restart your agent runtime(s)"
  echo "    2. Open http://${BASE_URL#http://}/setup for first-run setup"
  echo ""
  echo "  To update later, re-run:"
  echo "    curl -fsSL https://raw.githubusercontent.com/${REPO}/main/scripts/install.sh | bash"
  echo ""
  echo -e "${GREEN}${BOLD}══════════════════════════════════════════════${NC}"
  echo ""
}

# ---- Main ----

main() {
  banner
  select_channels
  prompt_config

  check_release || true

  for ch in "${CHANNELS[@]}"; do
    case "$ch" in
      claudecode) install_claudecode;;
      codex)      install_codex;;
      pi)         install_pi;;
      openclaw)   install_openclaw;;
      hermes)     install_hermes;;
    esac
  done

  write_config
  summary
}

main "$@"

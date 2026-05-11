#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Lore install script — one command to connect any agent runtime
# =============================================================================
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/FFatTiger/lore/main/scripts/install.sh | bash
#
# Env vars (highest priority, skip interactive prompts):
#   LORE_BASE_URL          — Lore server base URL
#   LORE_API_TOKEN         — Lore API token (if server requires auth)
#   LORE_INSTALL_CHANNELS  — comma-separated: claudecode,codex,pi,openclaw,hermes
#   LORE_INSTALL_NO_INTERACTIVE=1 — non-interactive mode, install all channels
#   LORE_FORCE_REINSTALL=1 — force reinstall even if same version

# ---- Constants ----

REPO_URL="https://github.com/FFatTiger/lore.git"
REPO_RAW="https://raw.githubusercontent.com/FFatTiger/lore/main"
DEFAULT_BASE_URL="http://127.0.0.1:18901"
LORE_HOME="${LORE_HOME:-$HOME/.lore}"
LORE_REPO_DIR="$LORE_HOME/repo"
LORE_CONFIG_DIR="${LORE_CONFIG_DIR:-$HOME/.config/lore}"
LORE_ENV_FILE="$LORE_CONFIG_DIR/env"
CODEX_MARKETPLACE_DIR="$LORE_HOME/codex-marketplace"

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

# Write key=value to $LORE_ENV_FILE, deduplicating existing keys
write_config() {
  local key="$1" value="$2"
  mkdir -p "$LORE_CONFIG_DIR"
  touch "$LORE_ENV_FILE"
  if grep -q "^${key}=" "$LORE_ENV_FILE" 2>/dev/null; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s|^${key}=.*|${key}=${value}|" "$LORE_ENV_FILE"
    else
      sed -i "s|^${key}=.*|${key}=${value}|" "$LORE_ENV_FILE"
    fi
  else
    echo "${key}=${value}" >> "$LORE_ENV_FILE"
  fi
  ok "Wrote ${key}=${value} → $LORE_ENV_FILE"
}

# ---- Interactive UI ----

multi_select() {
  local channels=("claudecode" "codex" "pi" "openclaw" "hermes")
  local labels=(
    "Claude Code  (MCP + boot/recall hooks + guidance rules)"
    "Codex        (local marketplace + MCP + hooks)"
    "Pi           (extension + tools + startup hooks)"
    "OpenClaw     (runtime plugin + boot/recall + tools)"
    "Hermes       (MemoryProvider plugin + tools + recall)"
  )
  local cmds=("claude" "codex" "pi" "openclaw" "python3")
  local n=${#channels[@]}

  local detected=()
  for i in $(seq 0 $((n - 1))); do
    if have_command "${cmds[$i]}"; then detected+=("1"); else detected+=("0"); fi
  done

  local selected=()
  for i in $(seq 0 $((n - 1))); do selected+=("0"); done
  local cursor=0

  local old_tty
  old_tty=$(stty -g 2>/dev/null || true)
  stty -echo -icanon min 0 time 0 2>/dev/null || true
  trap 'stty "$old_tty" 2>/dev/null || true' EXIT

  draw_menu() {
    if [[ $_menu_drawn -gt 0 ]]; then printf '\033[%dA' "$((_menu_lines))"; fi
    _menu_lines=$((n + 4))
    echo ""
    echo -e "${BOLD}Select channels (Space=toggle, Enter=confirm):${NC}"
    echo ""
    for i in $(seq 0 $((n - 1))); do
      local label="${labels[$i]}"
      local sel="${selected[$i]}"
      local prefix="○"
      if [[ "$sel" == "1" ]]; then prefix="◉"; fi
      if [[ "$i" == "$cursor" ]]; then
        if [[ "$sel" == "1" ]]; then
          echo -e "  ${GREEN}${BOLD}> ${prefix} ${label}${NC}"
        else
          echo -e "  ${BOLD}> ${prefix} ${label}${NC}"
        fi
      else
        if [[ "$sel" == "1" ]]; then
          echo -e "  ${GREEN}  ${prefix} ${label}${NC}"
        else
          echo -e "    ${prefix} ${label}"
        fi
      fi
      printf '\033[1A'; printf '\033[60C'
      if [[ "${detected[$i]}" == "1" ]]; then
        echo -e "${GREEN}(detected)${NC}"
      else
        echo -e "${YELLOW}(not found)${NC}"
      fi
    done
    _menu_drawn=1
  }

  while true; do
    draw_menu
    local key
    key=$(dd bs=3 count=1 2>/dev/null | xxd -p)
    case "$key" in
      6a|1b5b42) cursor=$(( (cursor + 1) % n ));;
      6b|1b5b41) cursor=$(( (cursor - 1 + n) % n ));;
      20)
        if [[ "${selected[$cursor]}" == "1" ]]; then selected[$cursor]="0"
        else selected[$cursor]="1"; fi;;
      0a|0d) echo ""; echo ""; break;;
      61) for i in $(seq 0 $((n - 1))); do selected[$i]="1"; done;;
      71) stty "$old_tty" 2>/dev/null || true; echo ""; err "Aborted."; exit 1;;
    esac
  done

  stty "$old_tty" 2>/dev/null || true; trap - EXIT

  CHANNELS=()
  for i in $(seq 0 $((n - 1))); do
    if [[ "${selected[$i]}" == "1" ]]; then CHANNELS+=("${channels[$i]}"); fi
  done
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
  if [[ "${LORE_INSTALL_NO_INTERACTIVE:-0}" == "1" ]]; then
    CHANNELS=("claudecode" "codex" "pi" "openclaw" "hermes")
    echo "Non-interactive mode, installing all channels."; echo ""
    return
  fi
  multi_select
}

prompt_config() {
  if [[ -n "${LORE_BASE_URL:-}" ]]; then
    BASE_URL="$LORE_BASE_URL"
    info "Using LORE_BASE_URL from environment: ${BASE_URL}"
  else
    read -r -p "Lore server base URL [${DEFAULT_BASE_URL}]: " input_url
    BASE_URL="${input_url:-$DEFAULT_BASE_URL}"
  fi
  BASE_URL="${BASE_URL%/}"

  if [[ -n "${LORE_API_TOKEN:-}" ]]; then
    API_TOKEN="$LORE_API_TOKEN"
    info "Using LORE_API_TOKEN from environment"
  else
    read -r -p "Lore API token (press Enter to skip): " input_token
    API_TOKEN="${input_token:-}"
  fi

  echo ""
  echo -e "  Base URL:  ${GREEN}${BASE_URL}${NC}"
  if [[ -n "$API_TOKEN" ]]; then
    echo -e "  API Token: ${GREEN}$(echo "$API_TOKEN" | head -c 8)...${NC}"
  else
    echo -e "  API Token: ${YELLOW}(none)${NC}"
  fi
  echo ""

  if [[ "${LORE_INSTALL_NO_INTERACTIVE:-0}" != "1" ]]; then
    read -r -p "Continue with these settings? [Y/n]: " confirm
    if [[ "$confirm" =~ ^[Nn] ]]; then err "Aborted."; exit 1; fi
  fi
}

# ---- Clone / update repo ----

REPO_CLONED=false

clone_repo() {
  if [[ -d "$LORE_REPO_DIR/.git" ]]; then
    info "Repo exists at $LORE_REPO_DIR, checking for updates..."
    (cd "$LORE_REPO_DIR" && git fetch origin main 2>/dev/null) || true
    local local_sha remote_sha
    local_sha=$(cd "$LORE_REPO_DIR" && git rev-parse HEAD 2>/dev/null || echo "")
    remote_sha=$(cd "$LORE_REPO_DIR" && git rev-parse origin/main 2>/dev/null || echo "")
    if [[ "$local_sha" != "$remote_sha" && -n "$remote_sha" ]]; then
      info "Updating repo..."
      (cd "$LORE_REPO_DIR" && git pull --ff-only origin main 2>/dev/null) || warn "git pull failed"
    else
      ok "Repo is up to date."
    fi
  else
    info "Cloning Lore repo to $LORE_REPO_DIR ..."
    mkdir -p "$(dirname "$LORE_REPO_DIR")"
    git clone --depth 1 "$REPO_URL" "$LORE_REPO_DIR" 2>/dev/null || {
      err "Failed to clone repo. Check network and try again."
      exit 1
    }
  fi
  REPO_CLONED=true
}

# ---- Channel: Claude Code ----

install_claudecode() {
  echo ""
  echo -e "${BOLD}── Claude Code ────────────────────────────────${NC}"; echo ""

  $REPO_CLONED || clone_repo

  local plugin_dir="$LORE_REPO_DIR/claudecode-plugin"

  if [[ ! -f "$plugin_dir/.claude-plugin/marketplace.json" ]]; then
    err "Claude Code plugin not found at $plugin_dir"; return
  fi

  require_command() {
    if ! have_command "$1"; then
      warn "$1 CLI not found. Skipping."
      warn "Install $1 first, then re-run this script."
      return 1
    fi
  }
  require_command claude || return

  # Register local marketplace
  info "Adding local marketplace: $plugin_dir"
  if claude plugin marketplace add "$plugin_dir" 2>/dev/null; then
    ok "Marketplace registered."
  else
    info "Marketplace may already be registered."
  fi

  # Install plugin
  info "Installing lore@lore plugin..."
  if claude plugin install lore@lore 2>/dev/null; then
    ok "Plugin lore@lore installed."
  else
    if claude plugin list 2>/dev/null | grep -q "lore@lore"; then
      ok "Plugin lore@lore already installed."
    else
      warn "Plugin install returned non-zero."
      warn "Try manually in Claude Code: /plugin install lore@lore"
    fi
  fi

  # Write LORE_BASE_URL to Claude Code settings.json env
  local settings_file="$HOME/.claude/settings.json"
  info "Setting LORE_BASE_URL in Claude Code settings..."
  if have_command python3; then
    python3 - "$settings_file" "$BASE_URL" "$API_TOKEN" <<'PY'
import sys, json, os
path, base_url, api_token = sys.argv[1], sys.argv[2], sys.argv[3]
data = {}
if os.path.exists(path):
    try:
        with open(path, 'r') as f: data = json.load(f)
    except (json.JSONDecode, IOError): data = {}
if not isinstance(data, dict): data = {}
data.setdefault("env", {})
data["env"]["LORE_BASE_URL"] = base_url
if api_token: data["env"]["LORE_API_TOKEN"] = api_token
with open(path, 'w') as f: json.dump(data, f, indent=2, ensure_ascii=False)
PY
    ok "Claude Code settings updated."
  else
    warn "python3 not found — skipping settings.json update."
    warn "Add manually: \"env\": { \"LORE_BASE_URL\": \"${BASE_URL}\" }"
  fi

  # Write lore-guidance.md to ~/.claude/
  local guidance_src="$plugin_dir/rules/lore-guidance.md"
  local guidance_dst="$HOME/.claude/lore-guidance.md"
  if [[ -f "$guidance_src" ]]; then
    cp "$guidance_src" "$guidance_dst"
    ok "lore-guidance.md → $guidance_dst"
  else
    curl -fsSL "${REPO_RAW}/claudecode-plugin/rules/lore-guidance.md" -o "$guidance_dst" || {
      warn "Failed to download lore-guidance.md."
    }
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

  write_config "LORE_BASE_URL" "$BASE_URL"
  [[ -n "$API_TOKEN" ]] && write_config "LORE_API_TOKEN" "$API_TOKEN"

  ok "Claude Code setup complete. Restart Claude Code to take effect."
}

# ---- Channel: Codex ----

install_codex() {
  echo ""
  echo -e "${BOLD}── Codex ───────────────────────────────────────${NC}"; echo ""

  $REPO_CLONED || clone_repo

  local source_dir="$LORE_REPO_DIR/codex-plugin"
  local market_dir="$CODEX_MARKETPLACE_DIR"

  if [[ ! -d "$source_dir" ]]; then
    err "Codex plugin source not found at $source_dir"; return
  fi

  require_command() {
    if ! have_command "$1"; then
      warn "$1 CLI not found. Skipping."
      return 1
    fi
  }
  require_command codex || return

  # Build marketplace structure: codex requires plugin in subdirectory
  # marketplace.json says source.path = "./plugins/lore"
  info "Building Codex marketplace at $market_dir ..."
  rm -rf "$market_dir"
  mkdir -p "$market_dir/plugins/lore"

  # Marketplace manifest
  cp -a "$source_dir/.agents" "$market_dir/.agents"

  # Plugin files under plugins/lore/
  cp -a "$source_dir/.codex-plugin" "$market_dir/plugins/lore/.codex-plugin"
  cp -a "$source_dir/.mcp.json"      "$market_dir/plugins/lore/.mcp.json"
  for entry in README.md skills hooks rules scripts assets; do
    if [[ -e "$source_dir/$entry" ]]; then
      cp -a "$source_dir/$entry" "$market_dir/plugins/lore/$entry"
    fi
  done
  ok "Marketplace built at $market_dir"

  # Register marketplace
  info "Registering local marketplace..."
  codex plugin marketplace add "$market_dir" 2>/dev/null || \
    info "Marketplace may already be registered."

  # Enable plugin in config.toml via python3
  local codex_config="${CODEX_HOME:-$HOME/.codex}/config.toml"
  if have_command python3 && [[ -f "$codex_config" ]]; then
    python3 - "$codex_config" "$market_dir" "$BASE_URL" "$API_TOKEN" <<'PY'
import sys, os, copy
config_path, market_dir, base_url, api_token = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]

# Read config
with open(config_path, 'r') as f:
    lines = f.readlines()

# Enable plugin
plugin_id = 'lore@lore'
section = f'[plugins."{plugin_id}"]'
out = []; idx = 0; found = False; enabled_written = False
while idx < len(lines):
    line = lines[idx]
    if line.strip() == section:
        found = True; out.append(line); idx += 1
        while idx < len(lines) and not lines[idx].lstrip().startswith('['):
            if lines[idx].strip().startswith('enabled'):
                out.append('enabled = true\n'); enabled_written = True
            else:
                out.append(lines[idx])
            idx += 1
        if not enabled_written: out.append('enabled = true\n')
        continue
    out.append(line); idx += 1
if not found:
    if out and out[-1] != '\n': out.append('\n')
    out.extend([section + '\n', 'enabled = true\n'])

with open(config_path, 'w') as f: f.writelines(out)
PY
    ok "Codex plugin enabled in config.toml"
  else
    warn "Add to ~/.codex/config.toml: [plugins.\"lore@lore\"] → enabled = true"
  fi

  # Configure MCP
  local mcp_url="${BASE_URL}/api/mcp?client_type=codex"
  info "Configuring MCP server..."
  codex mcp remove lore >/dev/null 2>&1 || true
  if [[ -n "$API_TOKEN" ]]; then
    codex mcp add lore --url "$mcp_url" --bearer-token-env-var LORE_API_TOKEN 2>/dev/null || \
      warn "MCP add returned non-zero."
  else
    codex mcp add lore --url "$mcp_url" 2>/dev/null || \
      warn "MCP add returned non-zero."
  fi
  ok "MCP configured."

  # Install hooks
  if [[ -x "$market_dir/plugins/lore/scripts/install-hooks.sh" ]]; then
    info "Installing hooks..."
    LORE_CODEX_PLUGIN_ROOT="$market_dir/plugins/lore" \
      LORE_BASE_URL="${BASE_URL}" \
      bash "$market_dir/plugins/lore/scripts/install-hooks.sh" 2>/dev/null || \
      warn "Hook install returned non-zero."
    ok "Hooks installed."
  fi

  write_config "LORE_BASE_URL" "$BASE_URL"
  [[ -n "$API_TOKEN" ]] && write_config "LORE_API_TOKEN" "$API_TOKEN"

  ok "Codex setup complete. Restart Codex to take effect."
}

# ---- Channel: Pi ----

install_pi() {
  echo ""
  echo -e "${BOLD}── Pi ──────────────────────────────────────────${NC}"; echo ""

  $REPO_CLONED || clone_repo

  if ! have_command pi; then
    warn "pi CLI not found. Skipping."; return
  fi

  local pi_script="$LORE_REPO_DIR/pi-extension/scripts/install-local.sh"
  if [[ -f "$pi_script" ]]; then
    info "Running Pi extension install..."
    LORE_BASE_URL="${BASE_URL}" LORE_API_TOKEN="${API_TOKEN:-}" bash "$pi_script"
    ok "Pi install complete."
  else
    warn "Pi install script not found."
  fi
  write_config "LORE_BASE_URL" "$BASE_URL"
  [[ -n "$API_TOKEN" ]] && write_config "LORE_API_TOKEN" "$API_TOKEN"
}

# ---- Channel: OpenClaw ----

install_openclaw() {
  echo ""
  echo -e "${BOLD}── OpenClaw ────────────────────────────────────${NC}"; echo ""

  $REPO_CLONED || clone_repo

  if ! have_command openclaw; then
    warn "openclaw CLI not found. Skipping."; return
  fi

  local oc_dir="$LORE_REPO_DIR/openclaw-plugin"
  if [[ -d "$oc_dir" ]]; then
    info "Building and installing OpenClaw plugin..."
    (
      cd "$oc_dir"
      npm install --silent 2>/dev/null || npm install
      npm run build 2>/dev/null || true
      openclaw plugins install . --force --dangerously-force-unsafe-install 2>/dev/null || \
        warn "openclaw plugins install returned non-zero."
      openclaw plugins enable lore 2>/dev/null || \
        warn "openclaw plugins enable returned non-zero."
    )

    local oc_config="$HOME/.openclaw/openclaw.json"
    if [[ -f "$oc_config" ]] && have_command python3; then
      python3 - "$oc_config" "$BASE_URL" "$API_TOKEN" <<'PY'
import sys, json
path, base_url, api_token = sys.argv[1], sys.argv[2], sys.argv[3]
try:
    with open(path, 'r') as f: data = json.load(f)
except (json.JSONDecode, IOError): data = {}
data.setdefault("plugins", {}).setdefault("entries", {}).setdefault("lore", {})
lore = data["plugins"]["entries"]["lore"]
lore.setdefault("config", {})
lore["config"]["baseUrl"] = base_url
if api_token: lore["config"]["apiToken"] = api_token
lore.setdefault("enabled", True)
with open(path, 'w') as f: json.dump(data, f, indent=2, ensure_ascii=False)
PY
      ok "OpenClaw config updated."
    fi
    ok "OpenClaw install complete."
  else
    warn "OpenClaw plugin source not found."
  fi
  write_config "LORE_BASE_URL" "$BASE_URL"
  [[ -n "$API_TOKEN" ]] && write_config "LORE_API_TOKEN" "$API_TOKEN"
}

# ---- Channel: Hermes ----

install_hermes() {
  echo ""
  echo -e "${BOLD}── Hermes ──────────────────────────────────────${NC}"; echo ""

  $REPO_CLONED || clone_repo

  local hermes_src="$LORE_REPO_DIR/hermes-plugin/lore_memory"
  if [[ ! -d "$hermes_src" ]]; then
    warn "Hermes plugin source not found. Skipping."; return
  fi

  write_config "LORE_BASE_URL" "$BASE_URL"
  [[ -n "$API_TOKEN" ]] && write_config "LORE_API_TOKEN" "$API_TOKEN"

  echo ""
  echo -e "  ${BOLD}Hermes requires manual setup:${NC}"
  echo ""
  echo -e "  export LORE_BASE_URL=${BASE_URL}"
  [[ -n "$API_TOKEN" ]] && echo -e "  export LORE_API_TOKEN=${API_TOKEN}"
  echo -e "  ln -s ${hermes_src} <hermes-plugin-path>/lore_memory"
  echo ""
  ok "Hermes setup info above."
}

# ---- Final summary ----

summary() {
  echo ""
  echo -e "${GREEN}${BOLD}══════════════════════════════════════════════${NC}"
  echo -e "${GREEN}${BOLD}  Lore install complete!${NC}"
  echo ""
  echo -e "  Base URL: ${GREEN}${BASE_URL}${NC}"
  echo -e "  Config:   ${BLUE}${LORE_ENV_FILE}${NC}"
  echo -e "  Repo:     ${BLUE}${LORE_REPO_DIR}${NC}"
  echo ""
  echo "  Installed channels:"
  for ch in "${CHANNELS[@]}"; do
    echo -e "    ${GREEN}✓${NC} ${ch}"
  done
  echo ""
  echo "  Next steps:"
  echo "    1. Restart your agent runtime(s)"
  echo "    2. Open http://${BASE_URL#http://}/setup to complete first-run setup"
  echo ""
  echo "  To update later, re-run:"
  echo "    curl -fsSL ${REPO_RAW}/scripts/install.sh | bash"
  echo ""
  echo -e "${GREEN}${BOLD}══════════════════════════════════════════════${NC}"
  echo ""
}

# ---- Main ----

main() {
  banner
  select_channels
  prompt_config

  for ch in "${CHANNELS[@]}"; do
    case "$ch" in
      claudecode) install_claudecode;;
      codex)      install_codex;;
      pi)         install_pi;;
      openclaw)   install_openclaw;;
      hermes)     install_hermes;;
    esac
  done

  summary
}

main "$@"

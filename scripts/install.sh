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
#   LORE_INSTALL_CHANNELS  — comma-separated list: claudecode,codex,pi,openclaw,hermes
#   LORE_INSTALL_NO_INTERACTIVE=1 — non-interactive mode

# ---- Constants ----

REPO_URL="https://github.com/FFatTiger/lore.git"
REPO_RAW="https://raw.githubusercontent.com/FFatTiger/lore/main"
DEFAULT_BASE_URL="http://127.0.0.1:18901"
LORE_CONFIG_DIR="${LORE_CONFIG_DIR:-$HOME/.config/lore}"
LORE_ENV_FILE="$LORE_CONFIG_DIR/env"
LORE_CLONE_DIR="${LORE_CLONE_DIR:-$HOME/.lore/repo}"

# ---- Colors ----

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

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

# ---- Helpers ----

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    err "Missing required command: $1"
    return 1
  fi
}

have_command() {
  command -v "$1" >/dev/null 2>&1
}

# Write key=value to $LORE_ENV_FILE, deduplicating existing keys
write_config() {
  local key="$1" value="$2"
  mkdir -p "$LORE_CONFIG_DIR"
  touch "$LORE_ENV_FILE"
  if grep -q "^${key}=" "$LORE_ENV_FILE" 2>/dev/null; then
    # macOS sed in-place wants '' extension; GNU sed works either way
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

# Multi-select menu: Space to toggle, Enter to confirm, j/k or arrows to move
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

  # Build availability markers
  local detected=()
  for i in $(seq 0 $((n - 1))); do
    if have_command "${cmds[$i]}"; then
      detected+=("1")
    else
      detected+=("0")
    fi
  done

  # Selected state (all default off)
  local selected=()
  for i in $(seq 0 $((n - 1))); do
    selected+=("0")
  done

  local cursor=0

  # Save terminal settings, switch to raw mode
  local old_tty
  old_tty=$(stty -g 2>/dev/null || true)
  stty -echo -icanon min 0 time 0 2>/dev/null || true
  trap 'stty "$old_tty" 2>/dev/null || true' EXIT

  draw_menu() {
    # Move cursor up N+3 lines from previous render
    if [[ $_menu_drawn -gt 0 ]]; then
      printf '\033[%dA' "$((_menu_lines))"
    fi
    _menu_lines=$((n + 4))

    echo ""
    echo -e "${BOLD}Select channels (Space=toggle, Enter=confirm):${NC}"
    echo ""

    for i in $(seq 0 $((n - 1))); do
      local ch="${channels[$i]}"
      local label="${labels[$i]}"
      local det="${detected[$i]}"
      local sel="${selected[$i]}"
      local prefix=" "
      local style=""
      local suffix=""

      if [[ "$sel" == "1" ]]; then
        prefix="◉"
      else
        prefix="○"
      fi

      if [[ "$i" == "$cursor" ]]; then
        # Highlighted row
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
      if [[ "$det" == "1" ]]; then
        # Move up one line and append detected tag
        printf '\033[1A'
        printf '\033[60C'
        echo -e "${GREEN}(detected)${NC}"
      else
        printf '\033[1A'
        printf '\033[60C'
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
      # j or down arrow
      6a|1b5b42)
        cursor=$(( (cursor + 1) % n ))
        ;;
      # k or up arrow
      6b|1b5b41)
        cursor=$(( (cursor - 1 + n) % n ))
        ;;
      # Space
      20)
        if [[ "${selected[$cursor]}" == "1" ]]; then
          selected[$cursor]="0"
        else
          selected[$cursor]="1"
        fi
        ;;
      # Enter
      0a|0d)
        echo ""
        echo ""
        break
        ;;
      # a = select all
      61)
        for i in $(seq 0 $((n - 1))); do
          selected[$i]="1"
        done
        ;;
      # q = quit
      71)
        stty "$old_tty" 2>/dev/null || true
        echo ""
        err "Aborted."
        exit 1
        ;;
    esac
  done

  # Restore terminal
  stty "$old_tty" 2>/dev/null || true
  trap - EXIT

  CHANNELS=()
  for i in $(seq 0 $((n - 1))); do
    if [[ "${selected[$i]}" == "1" ]]; then
      CHANNELS+=("${channels[$i]}")
    fi
  done

  if [[ ${#CHANNELS[@]} -eq 0 ]]; then
    err "No channels selected."
    exit 1
  fi

  echo -ne "Channels: "
  for ch in "${CHANNELS[@]}"; do echo -ne "${GREEN}${ch}${NC} "; done
  echo ""
  echo ""
}

# ---- Channel selection ----

select_channels() {
  if [[ -n "${LORE_INSTALL_CHANNELS:-}" ]]; then
    IFS=',' read -ra CHANNELS <<< "$LORE_INSTALL_CHANNELS"
    echo -e "Using LORE_INSTALL_CHANNELS: ${LORE_INSTALL_CHANNELS}"
    echo ""
    return
  fi

  if [[ "${LORE_INSTALL_NO_INTERACTIVE:-0}" == "1" ]]; then
    CHANNELS=("claudecode" "codex" "pi" "openclaw" "hermes")
    echo "Non-interactive mode, installing all channels."
    echo ""
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
    if [[ "$confirm" =~ ^[Nn] ]]; then
      err "Aborted."
      exit 1
    fi
  fi
}

# ---- Channel: Claude Code ----

install_claudecode() {
  echo ""
  echo -e "${BOLD}── Claude Code ────────────────────────────────${NC}"
  echo ""

  require_command claude || {
    warn "claude CLI not found. Skipping marketplace install."
    warn "After installing Claude Code, run:"
    echo "  claude plugins marketplace add FFatTiger/lore#plugin"
    echo "  claude plugins install lore@lore"
    return
  }

  # Register marketplace and install plugin
  info "Registering Lore marketplace..."
  claude plugins marketplace add FFatTiger/lore#plugin 2>/dev/null || \
    info "Marketplace already registered (or add skipped)."

  info "Installing lore@lore plugin..."
  if claude plugins install lore@lore 2>/dev/null; then
    ok "Plugin lore@lore installed."
  else
    # Plugin might already be installed — check
    if claude plugins list 2>/dev/null | grep -q "lore@lore"; then
      ok "Plugin lore@lore already installed."
    else
      warn "Plugin install via CLI returned non-zero."
      warn "You can install manually in Claude Code with: /plugin install lore@lore"
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
        with open(path, 'r') as f:
            data = json.load(f)
    except (json.JSONDecodeError, IOError):
        data = {}

if not isinstance(data, dict):
    data = {}

data.setdefault("env", {})
data["env"]["LORE_BASE_URL"] = base_url
if api_token:
    data["env"]["LORE_API_TOKEN"] = api_token
elif "LORE_API_TOKEN" in data.get("env", {}):
    pass  # keep existing

with open(path, 'w') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
print("ok")
PY
    ok "Claude Code settings updated."
  else
    warn "python3 not found — skipping settings.json update."
    warn "Add to ~/.claude/settings.json manually:"
    echo "  \"env\": { \"LORE_BASE_URL\": \"${BASE_URL}\" }"
  fi

  # Write lore-guidance.md to ~/.claude/
  local guidance_src="$LORE_CLONE_DIR/claudecode-plugin/rules/lore-guidance.md"
  local guidance_dst="$HOME/.claude/lore-guidance.md"

  if [[ -f "$guidance_src" ]]; then
    cp "$guidance_src" "$guidance_dst"
    ok "lore-guidance.md → $guidance_dst"
  else
    # Download from raw URL as fallback
    info "Downloading lore-guidance.md from GitHub..."
    curl -fsSL "${REPO_RAW}/claudecode-plugin/rules/lore-guidance.md" -o "$guidance_dst" || {
      warn "Failed to download lore-guidance.md. You can copy it manually later."
      return
    }
    ok "lore-guidance.md downloaded → $guidance_dst"
  fi

  # Prepend @import to ~/.claude/CLAUDE.md
  local claude_md="$HOME/.claude/CLAUDE.md"
  local import_line="@import ~/.claude/lore-guidance.md"

  if [[ -f "$claude_md" ]] && grep -qF "$import_line" "$claude_md" 2>/dev/null; then
    ok "CLAUDE.md already has lore-guidance import."
  else
    info "Adding import to CLAUDE.md..."
    if [[ -f "$claude_md" ]]; then
      # File exists — prepend
      local tmp_md="${claude_md}.tmp.$$"
      printf '%s\n\n%s\n' "$import_line" "$(cat "$claude_md")" > "$tmp_md"
      mv "$tmp_md" "$claude_md"
    else
      # File doesn't exist — create
      printf '%s\n' "$import_line" > "$claude_md"
    fi
    ok "Added '@import ~/.claude/lore-guidance.md' to CLAUDE.md"
  fi

  # Write config
  write_config "LORE_BASE_URL" "$BASE_URL"
  if [[ -n "$API_TOKEN" ]]; then
    write_config "LORE_API_TOKEN" "$API_TOKEN"
  fi

  ok "Claude Code setup complete."
  echo "  Restart Claude Code for changes to take effect."
}

# ---- Channel: Codex ----

install_codex() {
  echo ""
  echo -e "${BOLD}── Codex ───────────────────────────────────────${NC}"
  echo ""

  require_command codex || {
    warn "codex CLI not found. Skipping Codex install."
    return
  }

  local codex_plugin_dir="$LORE_CLONE_DIR/codex-plugin"
  if [[ -d "$codex_plugin_dir" ]]; then
    info "Running Codex plugin install from $codex_plugin_dir ..."
    (
      cd "$codex_plugin_dir"
      LORE_BASE_URL="${BASE_URL}" LORE_API_TOKEN="${API_TOKEN:-}" bash scripts/install.sh
    )
    ok "Codex install complete."
  else
    warn "Codex plugin source not found in clone. Skipping."
  fi
}

# ---- Channel: Pi ----

install_pi() {
  echo ""
  echo -e "${BOLD}── Pi ──────────────────────────────────────────${NC}"
  echo ""

  require_command pi || {
    warn "pi CLI not found. Skipping Pi install."
    return
  }

  local pi_install_script="$LORE_CLONE_DIR/pi-extension/scripts/install-local.sh"
  if [[ -f "$pi_install_script" ]]; then
    info "Running Pi extension install..."
    LORE_BASE_URL="${BASE_URL}" LORE_API_TOKEN="${API_TOKEN:-}" bash "$pi_install_script"
    ok "Pi install complete."
  else
    warn "Pi install script not found in clone. Skipping."
  fi
}

# ---- Channel: OpenClaw ----

install_openclaw() {
  echo ""
  echo -e "${BOLD}── OpenClaw ────────────────────────────────────${NC}"
  echo ""

  require_command openclaw || {
    warn "openclaw CLI not found. Skipping OpenClaw install."
    return
  }

  local oc_plugin_dir="$LORE_CLONE_DIR/openclaw-plugin"
  if [[ -d "$oc_plugin_dir" ]]; then
    info "Building and installing OpenClaw plugin..."
    (
      cd "$oc_plugin_dir"
      npm install --silent 2>/dev/null || npm install
      npm run build 2>/dev/null || true
      openclaw plugins install . --force --dangerously-force-unsafe-install 2>/dev/null || \
        warn "openclaw plugins install returned non-zero."
      openclaw plugins enable lore 2>/dev/null || \
        warn "openclaw plugins enable returned non-zero."
    )

    # Update openclaw.json config
    local oc_config="$HOME/.openclaw/openclaw.json"
    if [[ -f "$oc_config" ]] && have_command python3; then
      python3 - "$oc_config" "$BASE_URL" "$API_TOKEN" <<'PY'
import sys, json, os

path, base_url, api_token = sys.argv[1], sys.argv[2], sys.argv[3]
try:
    with open(path, 'r') as f:
        data = json.load(f)
except (json.JSONDecode, IOError):
    data = {}

data.setdefault("plugins", {}).setdefault("entries", {}).setdefault("lore", {})
lore = data["plugins"]["entries"]["lore"]
lore.setdefault("config", {})
lore["config"]["baseUrl"] = base_url
if api_token:
    lore["config"]["apiToken"] = api_token
lore.setdefault("enabled", True)

with open(path, 'w') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
print("ok")
PY
      ok "OpenClaw config updated."
    fi
    ok "OpenClaw install complete."
  else
    warn "OpenClaw plugin source not found in clone. Skipping."
  fi
}

# ---- Channel: Hermes ----

install_hermes() {
  echo ""
  echo -e "${BOLD}── Hermes ──────────────────────────────────────${NC}"
  echo ""

  local hermes_plugin="$LORE_CLONE_DIR/hermes-plugin/lore_memory"

  if [[ ! -d "$hermes_plugin" ]]; then
    warn "Hermes plugin source not found in clone. Skipping."
    return
  fi

  write_config "LORE_BASE_URL" "$BASE_URL"
  if [[ -n "$API_TOKEN" ]]; then
    write_config "LORE_API_TOKEN" "$API_TOKEN"
  fi

  echo ""
  echo -e "  ${BOLD}Hermes install requires manual symlinking.${NC}"
  echo ""
  echo "  Add to your Hermes plugin config:"
  echo ""
  echo -e "    ${GREEN}export LORE_BASE_URL=${BASE_URL}${NC}"
  if [[ -n "$API_TOKEN" ]]; then
    echo -e "    ${GREEN}export LORE_API_TOKEN=${API_TOKEN}${NC}"
  fi
  echo ""
  echo "  Then symlink the plugin:"
  echo -e "    ${GREEN}ln -s ${hermes_plugin} <hermes-plugin-path>/lore_memory${NC}"
  echo ""

  ok "Hermes setup info printed above."
}

# ---- Clone repo for source-based channels ----

clone_repo() {
  # Only clone if a source-based channel is selected
  local need_clone=false
  for ch in "${CHANNELS[@]}"; do
    case "$ch" in
      codex|pi|openclaw|hermes) need_clone=true;;
    esac
  done

  if ! $need_clone; then
    return
  fi

  if [[ -d "$LORE_CLONE_DIR" ]]; then
    info "Lore repo already cloned at $LORE_CLONE_DIR"
    info "Pulling latest..."
    (cd "$LORE_CLONE_DIR" && git pull --ff-only 2>/dev/null) || \
      warn "git pull failed — using existing clone."
  else
    info "Cloning Lore repo to $LORE_CLONE_DIR ..."
    mkdir -p "$(dirname "$LORE_CLONE_DIR")"
    git clone --depth 1 "$REPO_URL" "$LORE_CLONE_DIR" 2>/dev/null || {
      warn "Clone failed. Some channels will download files from GitHub directly."
    }
  fi
}

# ---- Final summary ----

summary() {
  echo ""
  echo -e "${GREEN}${BOLD}══════════════════════════════════════════════${NC}"
  echo -e "${GREEN}${BOLD}  Lore install complete!${NC}"
  echo ""
  echo -e "  Base URL: ${GREEN}${BASE_URL}${NC}"
  echo -e "  Config:   ${BLUE}${LORE_ENV_FILE}${NC}"
  echo ""
  echo "  Installed channels:"
  for ch in "${CHANNELS[@]}"; do
    echo -e "    ${GREEN}✓${NC} ${ch}"
  done
  echo ""
  echo "  Next steps:"
  echo "    1. Restart your agent runtime(s)"
  if [[ " ${CHANNELS[*]} " =~ " claudecode " ]]; then
    echo "    2. In Claude Code, check: /plugin list (should show lore@lore)"
  fi
  echo "    3. Open http://${BASE_URL#http://}/setup to complete first-run setup"
  echo ""
  echo -e "${GREEN}${BOLD}══════════════════════════════════════════════${NC}"
  echo ""
}

# ---- Main ----

main() {
  banner
  select_channels
  prompt_config
  clone_repo

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

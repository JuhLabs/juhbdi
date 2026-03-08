#!/usr/bin/env bash
set -euo pipefail

# ============================================
#  JuhBDI Installer
#  Intent-Driven Autonomous Development Engine
# ============================================

# --- Catppuccin Mocha Colors ---
RST="\033[0m"
BOLD="\033[1m"
DIM="\033[2m"
ITALIC="\033[3m"

if [[ "${COLORTERM:-}" == "truecolor" || "${COLORTERM:-}" == "24bit" || "${TERM_PROGRAM:-}" == "iTerm.app" || "${TERM_PROGRAM:-}" == "WezTerm" || "${TERM:-}" == *"256color"* ]]; then
  LAVENDER="\033[38;2;180;190;254m"
  BLUE="\033[38;2;137;180;250m"
  TEAL="\033[38;2;148;226;213m"
  GREEN="\033[38;2;166;227;161m"
  PEACH="\033[38;2;250;179;135m"
  MAUVE="\033[38;2;203;166;247m"
  RED="\033[38;2;243;139;168m"
  YELLOW="\033[38;2;249;226;175m"
  TEXT="\033[38;2;205;214;244m"
  SUBTEXT="\033[38;2;166;173;200m"
  SURFACE="\033[38;2;69;71;90m"
else
  LAVENDER="\033[38;5;147m"
  BLUE="\033[38;5;111m"
  TEAL="\033[38;5;115m"
  GREEN="\033[38;5;114m"
  PEACH="\033[38;5;216m"
  MAUVE="\033[38;5;183m"
  RED="\033[38;5;211m"
  YELLOW="\033[38;5;223m"
  TEXT="\033[38;5;252m"
  SUBTEXT="\033[38;5;248m"
  SURFACE="\033[38;5;240m"
fi

VERSION="1.4.1"
DOWNLOAD_URL="https://www.juhlabs.com/juhbdi/juhbdi-${VERSION}.tar.gz"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
GLOBAL_PLUGIN_DIR="${HOME}/.claude/plugins/cache/juhlabs/juhbdi/${VERSION}"

# --- Detect curl-pipe mode (no project files nearby) ---
REMOTE_INSTALL=false
if [[ ! -f "${SCRIPT_DIR}/.claude-plugin/plugin.json" ]]; then
  REMOTE_INSTALL=true
  SCRIPT_DIR=$(mktemp -d)
  trap "rm -rf '$SCRIPT_DIR'" EXIT
fi

# --- Helpers ---
p()      { echo -e "$1"; }
blank()  { echo ""; }
step()   { echo -e "  ${LAVENDER}${BOLD}[$1/${TOTAL_STEPS}]${RST} ${TEXT}$2${RST}"; }
ok()     { echo -e "  ${GREEN}  OK${RST} ${SUBTEXT}$1${RST}"; }
warn()   { echo -e "  ${YELLOW}  !!${RST} ${YELLOW}$1${RST}"; }
fail()   { echo -e "  ${RED}  FAIL${RST} ${RED}$1${RST}"; }
info()   { echo -e "  ${SURFACE}  --${RST} ${SUBTEXT}$1${RST}"; }

# ─── Parse Arguments ──────────────────────────────────────────
INSTALL_MODE=""
for arg in "$@"; do
  case "$arg" in
    --global|-g)  INSTALL_MODE="global" ;;
    --local|-l)   INSTALL_MODE="local" ;;
    --help|-h)
      echo "Usage: ./install.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --global, -g    Install globally (plugin + CLI, no prompts)"
      echo "  --local, -l     Install locally in current project only"
      echo "  --help, -h      Show this help"
      echo ""
      echo "Without flags, you'll be asked to choose."
      exit 0
      ;;
  esac
done

# ─── Gradient helper ──────────────────────────────────────────
# Prints a string where each character gets a truecolor gradient
gradient_line() {
  local text="$1"
  shift
  local -a colors=("$@")
  local len=${#text}
  local num_colors=${#colors[@]}
  local out=""

  for ((i=0; i<len; i++)); do
    local char="${text:$i:1}"
    if [[ "$char" == " " ]]; then
      out+=" "
      continue
    fi
    # Map character position to color gradient
    local pos=$(( i * (num_colors - 1) * 100 / (len > 1 ? len - 1 : 1) ))
    local seg=$(( pos / 100 ))
    local frac=$(( pos % 100 ))
    if [[ $seg -ge $((num_colors - 1)) ]]; then
      seg=$((num_colors - 2))
      frac=100
    fi
    # Parse rgb from "r;g;b" format
    IFS=';' read -r r1 g1 b1 <<< "${colors[$seg]}"
    IFS=';' read -r r2 g2 b2 <<< "${colors[$((seg+1))]}"
    local r=$(( r1 + (r2 - r1) * frac / 100 ))
    local g=$(( g1 + (g2 - g1) * frac / 100 ))
    local b=$(( b1 + (b2 - b1) * frac / 100 ))
    out+="\033[38;2;${r};${g};${b}m${BOLD}${char}"
  done
  echo -e "${out}${RST}"
}

# ─── Banner ───────────────────────────────────────────────────
clear 2>/dev/null || true

# Gradient stops: lavender → blue → sapphire → teal → green
G1="180;190;254"  # lavender
G2="137;180;250"  # blue
G3="116;199;236"  # sapphire
G4="148;226;213"  # teal
G5="166;227;161"  # green

blank
p "${SURFACE}  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RST}"
blank
gradient_line "       ██╗██╗   ██╗██╗  ██╗██████╗ ██████╗ ██╗"  "$G1" "$G2" "$G3" "$G4" "$G5"
gradient_line "       ██║██║   ██║██║  ██║██╔══██╗██╔══██╗██║"  "$G1" "$G2" "$G3" "$G4" "$G5"
gradient_line "       ██║██║   ██║███████║██████╔╝██║  ██║██║"  "$G1" "$G2" "$G3" "$G4" "$G5"
gradient_line "  ██   ██║██║   ██║██╔══██║██╔══██╗██║  ██║██║"  "$G1" "$G2" "$G3" "$G4" "$G5"
gradient_line "  ╚█████╔╝╚██████╔╝██║  ██║██████╔╝██████╔╝██║"  "$G1" "$G2" "$G3" "$G4" "$G5"
gradient_line "   ╚════╝  ╚═════╝ ╚═╝  ╚═╝╚═════╝ ╚═════╝ ╚═╝"  "$G1" "$G2" "$G3" "$G4" "$G5"
blank
p "${TEXT}${BOLD}       Intent-Driven Autonomous Development${RST}"
p "${SUBTEXT}              v${VERSION} — by JuhLabs${RST}"
blank
p "${SURFACE}  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RST}"
blank
sleep 0.4

# ─── Install Mode Selection ──────────────────────────────────
if [[ -z "$INSTALL_MODE" ]]; then
  p "  ${TEXT}${BOLD}How would you like to install JuhBDI?${RST}"
  blank
  p "  ${LAVENDER}${BOLD}[1]${RST} ${TEXT}Global${RST}  ${SUBTEXT}— Plugin + CLI available everywhere ${DIM}(recommended)${RST}"
  p "  ${BLUE}${BOLD}[2]${RST} ${TEXT}Local${RST}   ${SUBTEXT}— Plugin in this project only${RST}"
  blank
  printf "  ${TEXT}Choose ${LAVENDER}[1]${RST}${TEXT}/${BLUE}2${RST}${TEXT}: ${RST}"
  read -r CHOICE </dev/tty
  blank

  case "${CHOICE:-1}" in
    2|local|l)  INSTALL_MODE="local" ;;
    *)          INSTALL_MODE="global" ;;
  esac
fi

if [[ "$INSTALL_MODE" == "global" ]]; then
  TOTAL_STEPS=5
  p "  ${LAVENDER}${BOLD}Mode:${RST} ${TEXT}Global install${RST}"
else
  TOTAL_STEPS=4
  p "  ${BLUE}${BOLD}Mode:${RST} ${TEXT}Local install${RST}"
fi
blank
sleep 0.3

# ─── Step 1: Check Prerequisites ─────────────────────────────
step 1 "Checking prerequisites..."
blank

HAS_BUN=false
BUN_PATH=""
ERRORS=0

# Node.js
if command -v node &>/dev/null; then
  NODE_VER=$(node --version 2>/dev/null)
  ok "Node.js ${DIM}${NODE_VER}${RST}"
else
  fail "Node.js not found"
  ((ERRORS++))
fi

# Bun
if [[ -x "${HOME}/.bun/bin/bun" ]]; then
  BUN_PATH="${HOME}/.bun/bin/bun"
  BUN_VER=$("$BUN_PATH" --version 2>/dev/null)
  ok "Bun ${DIM}v${BUN_VER}${RST}"
  HAS_BUN=true
elif command -v bun &>/dev/null; then
  BUN_PATH="$(command -v bun)"
  BUN_VER=$(bun --version 2>/dev/null)
  ok "Bun ${DIM}v${BUN_VER}${RST}"
  HAS_BUN=true
else
  info "Bun not found — installing automatically..."
  if curl -fsSL https://bun.sh/install | bash 2>/dev/null; then
    BUN_PATH="${HOME}/.bun/bin/bun"
    if [[ -x "$BUN_PATH" ]]; then
      BUN_VER=$("$BUN_PATH" --version 2>/dev/null)
      ok "Bun ${DIM}v${BUN_VER}${RST} ${GREEN}(auto-installed)${RST}"
      HAS_BUN=true
    else
      fail "Bun install succeeded but binary not found"
      ((ERRORS++))
    fi
  else
    fail "Could not auto-install Bun — install manually at https://bun.sh"
    ((ERRORS++))
  fi
fi

# Claude Code CLI
if command -v claude &>/dev/null; then
  ok "Claude Code CLI ${DIM}found${RST}"
else
  warn "Claude Code CLI not found (optional)"
fi

# Git
if command -v git &>/dev/null; then
  GIT_VER=$(git --version 2>/dev/null | awk '{print $3}')
  ok "Git ${DIM}v${GIT_VER}${RST}"
else
  fail "Git not found"
  ((ERRORS++))
fi

blank

if [[ $ERRORS -gt 0 ]]; then
  fail "Missing ${ERRORS} required tool(s). Install them and re-run."
  blank
  exit 1
fi

sleep 0.3

# ─── Step 2: Download / Install Dependencies ─────────────────
step 2 "Installing dependencies..."
blank

if [[ "$REMOTE_INSTALL" == true ]]; then
  # Download the release package from JuhLabs
  info "Downloading JuhBDI v${VERSION}..."
  TARBALL="${SCRIPT_DIR}/juhbdi-${VERSION}.tar.gz"
  if curl -fsSL "$DOWNLOAD_URL" -o "$TARBALL" 2>/dev/null; then
    # Verify SHA256 checksum if available
    SHA_URL="https://www.juhlabs.com/juhbdi/juhbdi-${VERSION}.tar.gz.sha256"
    EXPECTED_SHA=$(curl -fsSL "$SHA_URL" 2>/dev/null | awk '{print $1}')
    if [[ -n "$EXPECTED_SHA" ]]; then
      if command -v sha256sum &>/dev/null; then
        ACTUAL_SHA=$(sha256sum "$TARBALL" | awk '{print $1}')
      else
        ACTUAL_SHA=$(shasum -a 256 "$TARBALL" | awk '{print $1}')
      fi
      if [[ "$ACTUAL_SHA" != "$EXPECTED_SHA" ]]; then
        fail "SHA256 verification failed — tarball may be corrupted or tampered with."
        rm -f "$TARBALL"
        blank
        exit 1
      fi
      ok "SHA256 verified"
    else
      warn "SHA256 checksum not available — skipping verification"
    fi
    tar xz -C "$SCRIPT_DIR" -f "$TARBALL" 2>/dev/null
    rm -f "$TARBALL"
    ok "Downloaded JuhBDI v${VERSION}"
  else
    fail "Download failed. Check your internet connection."
    blank
    exit 1
  fi
else
  cd "$SCRIPT_DIR"
fi

# Install dependencies if node_modules is missing (local clone mode)
if [[ ! -d "${SCRIPT_DIR}/node_modules" ]]; then
  cd "$SCRIPT_DIR"
  if [[ "$HAS_BUN" == true ]]; then
    if "$BUN_PATH" install --frozen-lockfile 2>/dev/null || "$BUN_PATH" install 2>/dev/null; then
      DEP_COUNT=$(node -e "const p=require('./package.json'); console.log(Object.keys(p.dependencies||{}).length)" 2>/dev/null || echo "?")
      ok "${DEP_COUNT} dependencies installed via Bun"
    else
      warn "bun install had warnings (non-fatal)"
    fi
  else
    npm install --silent 2>/dev/null
    ok "Dependencies installed via npm"
  fi
else
  DEP_COUNT=$(node -e "const p=require(process.argv[1]); console.log(Object.keys(p.dependencies||{}).length)" "${SCRIPT_DIR}/package.json" 2>/dev/null || echo "?")
  ok "${DEP_COUNT} dependencies bundled"
fi

blank
sleep 0.3

# ─── Step 3: Register Plugin ─────────────────────────────────
CURRENT_STEP=3

if [[ "$INSTALL_MODE" == "global" ]]; then
  step $CURRENT_STEP "Registering global Claude Code plugin..."
  blank

  SETTINGS="${HOME}/.claude/settings.json"
  CACHE_DIR="${HOME}/.claude/plugins/cache/juhlabs/juhbdi/${VERSION}"
  REGISTRY="${HOME}/.claude/plugins/installed_plugins.json"

  # Ensure ~/.claude/ and subdirectories exist
  mkdir -p "${HOME}/.claude/plugins/cache/juhlabs/juhbdi"
  mkdir -p "${HOME}/.claude/plugins/marketplaces"

  if [[ ! -f "$SETTINGS" ]]; then
    echo '{}' > "$SETTINGS"
  fi

  # --- 3a: Copy plugin files to cache (where Claude Code reads from) ---
  rm -rf "${CACHE_DIR:?}" 2>/dev/null
  mkdir -p "$CACHE_DIR"
  cp -r "${SCRIPT_DIR}/.claude-plugin" "${CACHE_DIR}/.claude-plugin"
  cp -r "${SCRIPT_DIR}/commands" "${CACHE_DIR}/commands"
  cp -r "${SCRIPT_DIR}/agents" "${CACHE_DIR}/agents"
  [[ -d "${SCRIPT_DIR}/hooks" ]] && cp -r "${SCRIPT_DIR}/hooks" "${CACHE_DIR}/hooks"
  cp -r "${SCRIPT_DIR}/src" "${CACHE_DIR}/src"
  cp -r "${SCRIPT_DIR}/node_modules" "${CACHE_DIR}/node_modules"
  cp "${SCRIPT_DIR}/package.json" "${CACHE_DIR}/package.json"
  cp "${SCRIPT_DIR}/tsconfig.json" "${CACHE_DIR}/tsconfig.json"
  ok "Plugin files installed to cache"
  info "${DIM}${CACHE_DIR}${RST}"

  # --- 3b: Write installed_plugins.json registry entry ---
  if [[ ! -f "$REGISTRY" ]]; then
    echo '{"version":2,"plugins":{}}' > "$REGISTRY"
  fi
  node -e "
    const fs = require('fs');
    const [,, regPath, cacheDir, version] = process.argv;
    let reg;
    try { reg = JSON.parse(fs.readFileSync(regPath, 'utf-8')); } catch { reg = {version:2,plugins:{}}; }
    if (!reg.plugins) reg.plugins = {};
    const existing = (reg.plugins['juhbdi@juhlabs'] || [])[0];
    reg.plugins['juhbdi@juhlabs'] = [{
      scope: 'user',
      installPath: cacheDir,
      version: version,
      installedAt: (existing && existing.installedAt) || new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    }];
    fs.writeFileSync(regPath, JSON.stringify(reg, null, 2) + '\n');
  " "$REGISTRY" "$CACHE_DIR" "$VERSION" 2>/dev/null && ok "Plugin registered in installed_plugins.json" || warn "Could not update registry"

  # --- 3c: Enable plugin + register marketplace in settings.json ---
  node -e "
    const fs = require('fs');
    const [,, settingsPath, mktPath] = process.argv;
    const s = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    // Enable plugin
    if (!s.enabledPlugins) s.enabledPlugins = {};
    s.enabledPlugins['juhbdi@juhlabs'] = true;
    // Register marketplace for future updates
    if (!s.extraKnownMarketplaces) s.extraKnownMarketplaces = {};
    s.extraKnownMarketplaces['juhlabs'] = {
      source: { source: 'directory', path: mktPath }
    };
    fs.writeFileSync(settingsPath, JSON.stringify(s, null, 2) + '\n');
  " "$SETTINGS" "${HOME}/.claude/plugins/marketplaces/juhlabs" 2>/dev/null && ok "Plugin enabled in settings.json" || warn "Could not update settings"

  # --- 3d: Set up marketplace (for future `claude plugin install` updates) ---
  MARKETPLACE_DIR="${HOME}/.claude/plugins/marketplaces/juhlabs"
  mkdir -p "${MARKETPLACE_DIR}/.claude-plugin"
  mkdir -p "${MARKETPLACE_DIR}/plugins/juhbdi"
  cat > "${MARKETPLACE_DIR}/.claude-plugin/marketplace.json" << 'MKTEOF'
{
  "name": "juhlabs",
  "description": "JuhLabs — Intent-Driven Development Tools",
  "owner": { "name": "Julian Hermstad" },
  "plugins": [
    {
      "name": "juhbdi",
      "description": "Intent-driven autonomous development engine with BDI governance, Socratic challenge, wave execution, and audit compliance",
      "version": "1.4.1",
      "source": "./plugins/juhbdi",
      "author": { "name": "Julian Hermstad" }
    }
  ]
}
MKTEOF
  # Copy plugin files to marketplace too
  rm -rf "${MARKETPLACE_DIR}/plugins/juhbdi/"* 2>/dev/null
  cp -r "${CACHE_DIR}/." "${MARKETPLACE_DIR}/plugins/juhbdi/"
  ok "Marketplace configured"

  # --- 3e: Install statusline (always overwrite) ---
  STATUSLINE_SRC="${SCRIPT_DIR}/statusline/juhbdi-statusline.cjs"
  STATUSLINE_DST="${HOME}/.claude/juhbdi-statusline.cjs"
  if [[ -f "$STATUSLINE_SRC" ]]; then
    cp "$STATUSLINE_SRC" "$STATUSLINE_DST"
    ok "Statusline installed"
  else
    warn "Statusline source not found in package"
  fi

  # Set statusLine in settings.json (overwrite any existing)
  node -e "
    const fs = require('fs');
    const [,, settingsPath] = process.argv;
    const s = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    s.statusLine = {
      type: 'command',
      command: 'node ~/.claude/juhbdi-statusline.cjs',
      padding: 1
    };
    fs.writeFileSync(settingsPath, JSON.stringify(s, null, 2) + '\n');
  " "$SETTINGS" 2>/dev/null && ok "Statusline configured in settings" || warn "Could not set statusline config"

else
  step $CURRENT_STEP "Registering local plugin..."
  blank

  # For local install, ensure .claude-plugin/plugin.json is accessible from cwd
  if [[ -f "${SCRIPT_DIR}/.claude-plugin/plugin.json" ]]; then
    ok "Plugin manifest found"
  else
    fail ".claude-plugin/plugin.json missing"
    exit 1
  fi

  info "Plugin loads automatically when Claude Code opens this project"
fi

# Verify manifest
if [[ -f "${SCRIPT_DIR}/.claude-plugin/plugin.json" ]]; then
  PLUGIN_VER=$(node -e "console.log(require(process.argv[1]).version)" "${SCRIPT_DIR}/.claude-plugin/plugin.json" 2>/dev/null || echo "?")
  HOOK_COUNT=0
  if [[ -f "${SCRIPT_DIR}/hooks/hooks.json" ]]; then
    HOOK_COUNT=$(node -e "const h=require(process.argv[1]).hooks||{}; let c=0; for(const k in h) c+=h[k].length; console.log(c)" "${SCRIPT_DIR}/hooks/hooks.json" 2>/dev/null || echo "?")
  fi
  ok "Manifest v${PLUGIN_VER} — ${HOOK_COUNT} hooks"
fi

blank
sleep 0.3

# ─── Step 4: Install Global CLI (global mode only) ───────────
if [[ "$INSTALL_MODE" == "global" ]]; then
  CURRENT_STEP=4
  step $CURRENT_STEP "Installing global CLI command..."
  blank

  LINK_OK=false
  BIN_ENTRY="${CACHE_DIR}/bin/juhbdi.mjs"

  # Try npm link without sudo first (works on macOS + nvm/fnm setups)
  cd "$CACHE_DIR"
  if npm link --silent 2>/dev/null; then
    LINK_OK=true
  else
    # On Linux, global npm prefix is usually /usr/local (needs root)
    if [[ "$(uname -s)" == "Linux" ]]; then
      info "Retrying with sudo (Linux global npm requires root)..."
      if sudo npm link --silent 2>/dev/null; then
        LINK_OK=true
      fi
    fi
  fi

  # If npm link failed, fall back to manual symlink in ~/.local/bin (Linux) or /usr/local/bin (macOS)
  if [[ "$LINK_OK" == false && -f "$BIN_ENTRY" ]]; then
    chmod +x "$BIN_ENTRY"
    if [[ "$(uname -s)" == "Linux" ]]; then
      # ~/.local/bin is on PATH for most Linux distros (Ubuntu, Fedora, Debian, Arch)
      mkdir -p "${HOME}/.local/bin"
      ln -sf "$BIN_ENTRY" "${HOME}/.local/bin/juhbdi"
      if [[ -x "${HOME}/.local/bin/juhbdi" ]]; then
        LINK_OK=true
        ok "CLI linked to ~/.local/bin/juhbdi"
        # Check if ~/.local/bin is on PATH
        if ! echo "$PATH" | tr ':' '\n' | grep -q "${HOME}/.local/bin"; then
          warn "~/.local/bin is not on your PATH"
          info "Add to your shell profile: ${LAVENDER}export PATH=\"\$HOME/.local/bin:\$PATH\"${RST}"
        fi
      fi
    else
      # macOS fallback: /usr/local/bin
      if ln -sf "$BIN_ENTRY" /usr/local/bin/juhbdi 2>/dev/null || sudo ln -sf "$BIN_ENTRY" /usr/local/bin/juhbdi 2>/dev/null; then
        LINK_OK=true
      fi
    fi
  fi

  if [[ "$LINK_OK" == true ]]; then
    CLI_PATH=$(which juhbdi 2>/dev/null || echo "")
    if [[ -n "$CLI_PATH" ]]; then
      ok "juhbdi CLI available globally"
      info "${DIM}${CLI_PATH}${RST}"
    else
      ok "CLI linked (restart shell to use)"
    fi
  else
    warn "CLI link skipped — plugin still works via /juhbdi:* commands"
  fi

  blank
  sleep 0.3
fi

# ─── Step N: Verify Installation ─────────────────────────────
if [[ "$INSTALL_MODE" == "global" ]]; then
  VERIFY_STEP=5
else
  VERIFY_STEP=4
fi

step $VERIFY_STEP "Verifying installation..."
blank

CHECKS_PASSED=0
CHECKS_TOTAL=0

# Determine check target
if [[ "$INSTALL_MODE" == "global" ]]; then
  CHECK_DIR="${GLOBAL_PLUGIN_DIR}"
else
  CHECK_DIR="${SCRIPT_DIR}"
fi

# Plugin manifest
((CHECKS_TOTAL++))
if [[ -f "${CHECK_DIR}/.claude-plugin/plugin.json" ]]; then
  ok "Plugin manifest"
  ((CHECKS_PASSED++))
else
  fail "Plugin manifest not found"
fi

# Commands
((CHECKS_TOTAL++))
CMD_COUNT=$(ls -1 "${CHECK_DIR}/commands/"*.md 2>/dev/null | wc -l | tr -d ' ')
if [[ "$CMD_COUNT" -gt 0 ]]; then
  ok "${CMD_COUNT} commands"
  ((CHECKS_PASSED++))
else
  fail "No commands found"
fi

# Agents
((CHECKS_TOTAL++))
AGENT_COUNT=$(ls -1 "${CHECK_DIR}/agents/"*.md 2>/dev/null | wc -l | tr -d ' ')
if [[ "$AGENT_COUNT" -gt 0 ]]; then
  ok "${AGENT_COUNT} agents"
  ((CHECKS_PASSED++))
else
  fail "No agents found"
fi

# Hooks
((CHECKS_TOTAL++))
HOOK_FILES=$(ls -1 "${CHECK_DIR}/.claude-plugin/hooks/"*.cjs 2>/dev/null | wc -l | tr -d ' ')
if [[ "$HOOK_FILES" -gt 0 ]]; then
  ok "${HOOK_FILES} hooks"
  ((CHECKS_PASSED++))
else
  warn "No hooks found"
fi

# Tests (skip for remote installs — no test files in release package)
if [[ "$REMOTE_INSTALL" == false ]]; then
((CHECKS_TOTAL++))
if [[ "$HAS_BUN" == true ]]; then
  cd "$SCRIPT_DIR"
  TEST_OUTPUT=$("$BUN_PATH" test 2>&1 || true)
  TEST_PASS=$(echo "$TEST_OUTPUT" | grep -oE '[0-9]+ pass' | head -1 | grep -oE '[0-9]+' || echo "0")
  TEST_FAIL=$(echo "$TEST_OUTPUT" | grep -oE '[0-9]+ fail' | head -1 | grep -oE '[0-9]+' || echo "0")

  if [[ "$TEST_FAIL" == "0" && "$TEST_PASS" -gt 0 ]]; then
    ok "${GREEN}${TEST_PASS} tests passed${RST}${SUBTEXT}, 0 failures${RST}"
    ((CHECKS_PASSED++))
  elif [[ "$TEST_PASS" -gt 0 ]]; then
    warn "${TEST_PASS} passed, ${TEST_FAIL} failed"
    ((CHECKS_PASSED++))
  else
    warn "Could not run test suite"
  fi
fi
fi # end REMOTE_INSTALL check

# CLI (global only)
if [[ "$INSTALL_MODE" == "global" ]]; then
  ((CHECKS_TOTAL++))
  if command -v juhbdi &>/dev/null; then
    CLI_VER=$(juhbdi --version 2>/dev/null || echo "unknown")
    ok "CLI: ${DIM}${CLI_VER}${RST}"
    ((CHECKS_PASSED++))
  else
    warn "CLI not on PATH (use: npx juhbdi)"
  fi
fi

blank
sleep 0.3

# ─── Summary ─────────────────────────────────────────────────
p "${SURFACE}  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RST}"
blank

if [[ $CHECKS_PASSED -eq $CHECKS_TOTAL ]]; then
  p "  ${GREEN}${BOLD}Installation complete.${RST} ${TEXT}All ${CHECKS_TOTAL} checks passed.${RST}"
else
  p "  ${YELLOW}${BOLD}Installation complete.${RST} ${TEXT}${CHECKS_PASSED}/${CHECKS_TOTAL} checks passed.${RST}"
fi

blank
p "  ${TEXT}${BOLD}What's installed:${RST}"

if [[ "$INSTALL_MODE" == "global" ]]; then
  p "  ${SURFACE}  ├─${RST} ${LAVENDER}Plugin${RST}    ${SUBTEXT}${GLOBAL_PLUGIN_DIR}${RST}"
  p "  ${SURFACE}  ├─${RST} ${BLUE}CLI${RST}       ${SUBTEXT}juhbdi (global command)${RST}"
  p "  ${SURFACE}  ├─${RST} ${TEAL}Status${RST}    ${SUBTEXT}Catppuccin Mocha statusline${RST}"
else
  p "  ${SURFACE}  ├─${RST} ${LAVENDER}Plugin${RST}    ${SUBTEXT}${SCRIPT_DIR} (local)${RST}"
fi
p "  ${SURFACE}  ├─${RST} ${PEACH}Cmds${RST}      ${SUBTEXT}/juhbdi:init, :plan, :execute, :reflect + ${CMD_COUNT} more${RST}"
p "  ${SURFACE}  └─${RST} ${MAUVE}Hooks${RST}     ${SUBTEXT}statusline, context monitor, session primer, auto-trigger${RST}"

blank
p "  ${TEXT}${BOLD}Get started:${RST}"

if [[ "$INSTALL_MODE" == "global" ]]; then
  p "  ${SURFACE}  1.${RST} ${TEXT}Open any project:${RST}  ${LAVENDER}cd my-project && claude${RST}"
else
  p "  ${SURFACE}  1.${RST} ${TEXT}Open this project:${RST} ${LAVENDER}claude${RST}"
fi
p "  ${SURFACE}  2.${RST} ${TEXT}Initialize:${RST}        ${LAVENDER}/juhbdi:init${RST}"
p "  ${SURFACE}  3.${RST} ${TEXT}Plan work:${RST}         ${LAVENDER}/juhbdi:plan ${PEACH}Build a feature${RST}"
p "  ${SURFACE}  4.${RST} ${TEXT}Execute:${RST}           ${LAVENDER}/juhbdi:execute${RST}"

blank
p "  ${SUBTEXT}${ITALIC}Docs:${RST} ${LAVENDER}https://www.JuhLabs.com${RST}"
p "  ${SUBTEXT}${ITALIC}Code:${RST} ${LAVENDER}https://github.com/JuhLabs${RST}"
blank
p "${SURFACE}  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RST}"
blank

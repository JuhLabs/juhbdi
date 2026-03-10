#!/usr/bin/env node
// JuhBDI Statusline v1.6.1 — Catppuccin Mocha with context heat shift
//
// Used by settings.json statusLine command. Reads session JSON from stdin,
// outputs single-line ANSI text. Also writes bridge files for context monitor.
//
// Mood system: entire UI heats up as context drains
//   CALM     (< 55% used)  — full Catppuccin beauty
//   WARM     (55–69%)      — branding shifts yellow, ⚡ emoji
//   HOT      (70–84%)      — everything orange, ⚠️ emoji, "N% left"
//   CRITICAL (85%+)        — full red takeover, 🚨 emoji, "WRAP UP"

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

// ── Catppuccin Mocha Palette ────────────────────────────────────────
const C = {
  rosewater: [245, 224, 220],
  flamingo:  [242, 205, 205],
  pink:      [245, 194, 231],
  mauve:     [203, 166, 247],
  red:       [243, 139, 168],
  maroon:    [235, 160, 172],
  peach:     [250, 179, 135],
  yellow:    [249, 226, 175],
  green:     [166, 227, 161],
  teal:      [148, 226, 213],
  sky:       [137, 220, 235],
  sapphire:  [116, 199, 236],
  blue:      [137, 180, 250],
  lavender:  [180, 190, 254],
  text:      [205, 214, 244],
  subtext1:  [186, 194, 222],
  subtext0:  [166, 173, 200],
  overlay0:  [108, 112, 134],
  surface1:  [69, 71, 90],
  surface0:  [49, 50, 68],
};

const RST = "\x1b[0m";
const BOLD = "\x1b[1m";
const fg = (r, g, b) => `\x1b[38;2;${r};${g};${b}m`;
const col = (name) => fg(...C[name]);

// ── Mood System ─────────────────────────────────────────────────────
// The entire statusline shifts color based on context pressure.
// At calm, you get the full Catppuccin rainbow. At critical, everything is red.
const MOODS = {
  calm: {
    brand: "lavender", sep: "overlay0", branch: "mauve", model: "blue",
    cost: "peach", dur: "subtext0", linesAdd: "green", linesDel: "red",
    weather: "sky", pct: "green", tier: "teal",
    emoji: "", label: "",
  },
  warm: {
    brand: "yellow", sep: "overlay0", branch: "yellow", model: "sky",
    cost: "yellow", dur: "subtext0", linesAdd: "green", linesDel: "red",
    weather: "sky", pct: "yellow", tier: "yellow",
    emoji: " \u26A1", label: "",
  },
  hot: {
    brand: "peach", sep: "peach", branch: "peach", model: "peach",
    cost: "peach", dur: "peach", linesAdd: "peach", linesDel: "peach",
    weather: "peach", pct: "peach", tier: "peach",
    emoji: " \u26A0\uFE0F", label: "",
  },
  critical: {
    brand: "red", sep: "red", branch: "red", model: "red",
    cost: "red", dur: "red", linesAdd: "red", linesDel: "red",
    weather: "red", pct: "red", tier: "red",
    emoji: " \uD83D\uDEA8", label: " WRAP UP",
  },
};

function getMood(usedPct) {
  if (usedPct < 55) return "calm";
  if (usedPct < 70) return "warm";
  if (usedPct < 85) return "hot";
  return "critical";
}

// ── Gradient Bar ────────────────────────────────────────────────────
function lerp(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

// Rainbow gradient: green → teal → sky → blue → lavender → mauve → yellow → peach → red
const GRADIENT_STOPS = [
  [0.00, C.green],   [0.15, C.teal],    [0.30, C.sky],
  [0.45, C.blue],    [0.55, C.lavender], [0.65, C.mauve],
  [0.75, C.yellow],  [0.85, C.peach],    [0.95, C.red],
  [1.00, C.maroon],
];

function gradientColor(position) {
  for (let i = 0; i < GRADIENT_STOPS.length - 1; i++) {
    const [startPos, startCol] = GRADIENT_STOPS[i];
    const [endPos, endCol] = GRADIENT_STOPS[i + 1];
    if (position >= startPos && position <= endPos) {
      const t = (position - startPos) / (endPos - startPos);
      return lerp(startCol, endCol, t);
    }
  }
  return GRADIENT_STOPS[GRADIENT_STOPS.length - 1][1];
}

function buildGradientBar(usedPct, mood, segments = 20) {
  const filled = Math.round((usedPct / 100) * segments);
  // At critical, empty segments glow dim red instead of gray
  const emptyRgb = mood === "critical"
    ? lerp(C.surface1, C.red, 0.35)
    : mood === "hot"
      ? lerp(C.surface1, C.peach, 0.15)
      : C.surface1;

  let bar = "";
  for (let i = 0; i < segments; i++) {
    const pos = i / (segments - 1);
    if (i < filled) {
      const [r, g, b] = gradientColor(pos);
      bar += fg(r, g, b) + "\u2588";
    } else {
      bar += fg(...emptyRgb) + "\u2591";
    }
  }
  return bar + RST;
}

// ── Helpers ─────────────────────────────────────────────────────────
// Strip ANSI escape codes to get visible character count
function visibleLength(str) {
  const stripped = str.replace(/\x1b\[[0-9;]*m/g, "");
  let len = 0;
  for (const ch of stripped) {
    const cp = ch.codePointAt(0);
    // Only emoji (>= U+1F000) are double-width; box drawing/symbols are single-width
    if (cp >= 0x1F000) len += 2;
    else len += 1;
  }
  return len;
}

// Detect actual terminal width by walking up process tree to find a TTY
function getTerminalWidth() {
  if (process.stdout.columns) return process.stdout.columns;
  try {
    const ps = execFileSync("ps", ["-o", "pid=,ppid=,tty=", "-A"], {
      encoding: "utf8", timeout: 500, stdio: ["pipe", "pipe", "ignore"],
    }).trim().split("\n").map(l => l.trim().split(/\s+/));
    let pid = String(process.pid);
    for (let i = 0; i < 10; i++) {
      const row = ps.find(l => l[0] === pid);
      if (!row) break;
      const tty = row[2];
      if (tty && tty !== "??" && tty !== "?" && /^ttys?\d+$/.test(tty)) {
        const { execSync } = require("child_process");
        const w = parseInt(execSync("stty size < /dev/" + tty, {
          encoding: "utf8", timeout: 500, shell: "/bin/sh", stdio: ["pipe", "pipe", "ignore"],
        }).trim().split(" ")[1], 10);
        if (w > 0) return w;
      }
      pid = row[1];
    }
  } catch {}
  return null;
}

const AUTOCOMPACT_BUFFER = 16.5;

function formatCost(usd) { return "$" + usd.toFixed(2); }

function formatDuration(ms) {
  if (!ms || ms <= 0) return "";
  const s = Math.floor(ms / 1000);
  if (s < 60) return s + "s";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m" + (s % 60) + "s";
  return Math.floor(m / 60) + "h" + (m % 60) + "m";
}

// ── Trust Tier Badge ────────────────────────────────────────────────
function getTrustTier(cwd) {
  try {
    const trustPath = path.join(cwd, ".juhbdi", "trust-store.json");
    if (!fs.existsSync(trustPath)) return "";
    const store = JSON.parse(fs.readFileSync(trustPath, "utf-8"));
    if (!store || !store.records) return "";
    const records = Object.values(store.records);
    if (records.length === 0) return "";
    const r = records[0];
    const tasksAttempted = typeof r.tasks_attempted === "number" ? r.tasks_attempted : 0;
    const tasksPassed = typeof r.tasks_passed === "number" ? r.tasks_passed : 0;
    const passRate = tasksAttempted > 0 ? tasksPassed / tasksAttempted : 0.5;
    const avgStrikes = typeof r.avg_strikes === "number" ? r.avg_strikes : 0;
    const violationCount = typeof r.violation_count === "number" ? r.violation_count : 0;
    const eff = Math.max(0, 1 - avgStrikes / 3);
    const viol = Math.max(0, 1 - violationCount * 0.2);
    const score = Math.min(1, passRate * 0.4 + eff * 0.3 + viol * 0.3);
    if (isNaN(score)) return "";
    return score >= 0.85 ? "P" : score >= 0.6 ? "S" : score >= 0.35 ? "J" : "I";
  } catch { return ""; }
}

// ── Bridge File (atomic write, multi-session fields) ────────────────
function writeBridgeFile(sessionId, remainingPct, projectDir) {
  const usablePct = Math.max(0, remainingPct - AUTOCOMPACT_BUFFER);
  const bridgeData = {
    session_id: sessionId,
    project_dir: projectDir,
    ide_platform: process.env.CLAUDE_CODE_ENTRYPOINT || "claude-code",
    remaining_pct: remainingPct,
    usable_pct: usablePct,
    timestamp: new Date().toISOString(),
  };
  const bridgePath = `/tmp/juhbdi-ctx-${sessionId}.json`;
  const tmpPath = bridgePath + ".tmp";
  const content = JSON.stringify(bridgeData, null, 2) + "\n";
  try {
    fs.writeFileSync(tmpPath, content);
    fs.renameSync(tmpPath, bridgePath);
  } catch {
    try { fs.writeFileSync(bridgePath, content); } catch {}
  }
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  const input = JSON.parse(await new Promise((resolve) => {
    let data = "";
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
  }));

  const model = input.model?.display_name || "Claude";
  const sessionId = input.session_id || "unknown";
  const ctxWin = input.context_window || {};
  const usedPct = Math.floor(ctxWin.used_percentage || 0);
  const remainingPct = ctxWin.remaining_percentage;
  const safeRemaining = (typeof remainingPct === "number" && !isNaN(remainingPct))
    ? remainingPct : (100 - usedPct);
  const cost = input.cost || {};
  const totalCost = cost.total_cost_usd || 0;
  const duration = cost.total_api_duration_ms || 0;
  const linesAdded = cost.total_lines_added || 0;
  const linesRemoved = cost.total_lines_removed || 0;
  const projectDir = input.cwd || process.cwd();

  // Write bridge file for context monitor
  if (remainingPct !== undefined && remainingPct !== null) {
    writeBridgeFile(sessionId, safeRemaining, projectDir);
  }

  // Mood + colors
  const mood = getMood(usedPct);
  const m = MOODS[mood];

  // Git branch
  let branch = "";
  try {
    branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: projectDir, timeout: 1000, stdio: ["pipe", "pipe", "pipe"],
    }).toString().trim();
  } catch {}

  // Trust tier
  const tier = getTrustTier(projectDir);

  // ═══ LINE 1: Branding + metadata ═══
  const parts = [];
  const tierTag = tier ? ` [${tier}]` : "";
  parts.push(col(m.brand) + "\u25C8 JuhBDI" + (tier ? col(m.tier) + tierTag : "") + RST);
  if (branch) parts.push(col(m.sep) + "\u2502" + RST + " " + col(m.branch) + "\u2387 " + branch + RST);
  parts.push(col(m.sep) + "\u2502" + RST + " " + col(m.model) + model + RST);
  if (totalCost > 0) parts.push(col(m.sep) + "\u2502" + RST + " " + col(m.cost) + formatCost(totalCost) + RST);
  if (duration > 0) parts.push(col(m.sep) + "\u2502" + RST + " " + col(m.dur) + formatDuration(duration) + RST);
  if (linesAdded > 0 || linesRemoved > 0) {
    parts.push(col(m.sep) + "\u2502" + RST + " " + col(m.linesAdd) + "+" + linesAdded + RST + col(m.linesDel) + "/-" + linesRemoved + RST);
  }
  const line1 = parts.join(" ");

  // ═══ LINE 2: Gradient bar + context info + weather ═══
  const bar = buildGradientBar(usedPct, mood);

  // Context display — information density increases with urgency
  let pctDisplay = col(m.pct) + usedPct + "%" + RST + m.emoji;
  if (mood === "hot") {
    const usableLeft = Math.max(0, Math.round(safeRemaining - AUTOCOMPACT_BUFFER));
    pctDisplay += " " + col("subtext0") + usableLeft + "% left" + RST;
  } else if (mood === "critical") {
    pctDisplay += " " + BOLD + col("red") + m.label + RST;
  }

  // ═══ Output ═══
  // Right-aligned single-line for status bar
  const content = line1 + "  " + bar + " " + pctDisplay;
  const cols = getTerminalWidth();
  if (cols) {
    const pad = Math.max(0, cols - visibleLength(content) - 6); // -6 for CC built-in margin
    console.log(" ".repeat(pad) + content);
  } else {
    console.log(content);
  }
}

main().catch(() => {
  console.log(col("lavender") + "\u25C8 JuhBDI" + RST);
});

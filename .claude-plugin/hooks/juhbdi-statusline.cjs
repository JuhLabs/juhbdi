#!/usr/bin/env node
// JuhBDI Statusline v1.6.0 — Catppuccin Mocha with context heat shift
//
// Notification hook + global statusline command (unified file).
//   --raw  → multi-line ANSI output (global statusline command)
//   default → JSON { status_line } (plugin Notification hook)
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

// ── Weather (cached, only in raw mode) ──────────────────────────────
const WEATHER_CACHE = "/tmp/juhbdi_weather_cache.json";
const WEATHER_TTL = 600000; // 10 minutes

function getCachedWeather() {
  try {
    const raw = JSON.parse(fs.readFileSync(WEATHER_CACHE, "utf-8"));
    if (Date.now() - raw.ts < WEATHER_TTL) return raw;
  } catch {}
  return null;
}

async function fetchWeather() {
  const cached = getCachedWeather();
  if (cached) return { text: cached.text, city: cached.city };
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    const resp = await fetch("https://wttr.in/?format=%c+%t", { signal: ctrl.signal });
    clearTimeout(timer);
    const text = (await resp.text()).trim().replace(/\s+/g, " ");
    let city = "";
    try {
      const ctrl2 = new AbortController();
      const timer2 = setTimeout(() => ctrl2.abort(), 2000);
      const resp2 = await fetch("https://wttr.in/?format=%l", { signal: ctrl2.signal });
      clearTimeout(timer2);
      city = (await resp2.text()).trim().split(",")[0].trim();
    } catch {}
    fs.writeFileSync(WEATHER_CACHE, JSON.stringify({ ts: Date.now(), text, city }));
    return { text, city };
  } catch {
    return null;
  }
}

// ── Main ────────────────────────────────────────────────────────────
async function main() {
  const input = JSON.parse(await new Promise((resolve) => {
    let data = "";
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
  }));

  const isRaw = process.argv.includes("--raw") || process.env.JUHBDI_RAW === "1";
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

  let line2 = bar + " " + pctDisplay;

  // Weather (only in raw/multi-line mode to avoid hook latency)
  if (isRaw) {
    const weather = await fetchWeather();
    if (weather) {
      const cityLabel = weather.city || "Local";
      line2 += "  " + col(m.sep) + "\u2502" + RST + " " + col(m.weather) + "\uD83C\uDFD9\uFE0F  " + cityLabel + ":" + RST + " " + col("text") + weather.text + RST;
    }
  }

  // ═══ Output ═══
  if (isRaw) {
    console.log(line1);
    console.log(line2);
  } else {
    // Hook mode: single-line compact status
    console.log(JSON.stringify({ status_line: line1 + "  " + bar + " " + col(m.pct) + usedPct + "%" + RST + m.emoji }));
  }
}

main().catch(() => {
  const isRaw = process.argv.includes("--raw") || process.env.JUHBDI_RAW === "1";
  if (isRaw) {
    console.log(col("lavender") + "\u25C8 JuhBDI" + RST);
  } else {
    console.log(JSON.stringify({ status_line: "" }));
  }
});

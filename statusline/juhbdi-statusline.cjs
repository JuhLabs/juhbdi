#!/usr/bin/env node
// JuhBDI Statusline — Catpuccin Mocha gradient theme
// Two-line statusline with context bar, cost, git, and weather

const fs = require("fs");
const { execFileSync } = require("child_process");

// --- Catpuccin Mocha Palette (truecolor) ---
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
const fg = (r, g, b) => `\x1b[38;2;${r};${g};${b}m`;
const col = (name) => fg(...C[name]);

function lerp(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

const GRADIENT_STOPS = [
  [0.00, C.green],
  [0.15, C.teal],
  [0.30, C.sky],
  [0.45, C.blue],
  [0.55, C.lavender],
  [0.65, C.mauve],
  [0.75, C.yellow],
  [0.85, C.peach],
  [0.95, C.red],
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

function buildGradientBar(usedPct, segments = 20) {
  const filled = Math.round((usedPct / 100) * segments);
  let bar = "";
  for (let i = 0; i < segments; i++) {
    const pos = i / (segments - 1);
    const [r, g, b] = gradientColor(pos);
    if (i < filled) {
      bar += fg(r, g, b) + "\u2588";
    } else {
      bar += fg(...C.surface1) + "\u2591";
    }
  }
  return bar + RST;
}

function pctColor(pct) {
  if (pct < 50) return col("green");
  if (pct < 70) return col("yellow");
  if (pct < 85) return col("peach");
  return col("red");
}

function formatCost(usd) {
  return "$" + usd.toFixed(2);
}

function formatDuration(ms) {
  if (!ms || ms <= 0) return "";
  const s = Math.floor(ms / 1000);
  if (s < 60) return s + "s";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m" + (s % 60) + "s";
  return Math.floor(m / 60) + "h" + (m % 60) + "m";
}

const WEATHER_CACHE = "/tmp/juhbdi_weather_cache.json";
const WEATHER_TTL = 600000;

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
    // Fetch weather — no city = wttr.in auto-detects from IP
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    const resp = await fetch("https://wttr.in/?format=%c+%t", { signal: ctrl.signal });
    clearTimeout(timer);
    const text = (await resp.text()).trim().replace(/\s+/g, " ");

    // Fetch city name from wttr.in JSON (includes location auto-detect)
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
  const cost = input.cost || {};
  const totalCost = cost.total_cost_usd || 0;
  const duration = cost.total_api_duration_ms || 0;
  const linesAdded = cost.total_lines_added || 0;
  const linesRemoved = cost.total_lines_removed || 0;

  // Write bridge file for context monitor hook
  if (remainingPct !== undefined && remainingPct !== null) {
    const AUTOCOMPACT_BUFFER = 16.5;
    const bridgeData = {
      session_id: sessionId,
      remaining_pct: remainingPct,
      usable_pct: Math.max(0, remainingPct - AUTOCOMPACT_BUFFER),
      timestamp: new Date().toISOString(),
    };
    try {
      fs.writeFileSync("/tmp/juhbdi-ctx-" + sessionId + ".json", JSON.stringify(bridgeData, null, 2) + "\n");
    } catch {}
  }

  // Git branch (safe — no shell, no user input)
  let branch = "";
  try {
    branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: input.cwd || process.cwd(),
      timeout: 1000,
      stdio: ["pipe", "pipe", "pipe"],
    }).toString().trim();
  } catch {}

  // Weather
  const weather = await fetchWeather();

  // === LINE 1: Branding + Info ===
  const parts = [];
  parts.push(col("lavender") + "\u25C8 JuhBDI" + RST);
  if (branch) parts.push(col("overlay0") + "\u2502" + RST + " " + col("mauve") + "\u2387 " + branch + RST);
  parts.push(col("overlay0") + "\u2502" + RST + " " + col("blue") + model + RST);
  if (totalCost > 0) parts.push(col("overlay0") + "\u2502" + RST + " " + col("peach") + formatCost(totalCost) + RST);
  if (duration > 0) parts.push(col("overlay0") + "\u2502" + RST + " " + col("subtext0") + formatDuration(duration) + RST);
  if (linesAdded > 0 || linesRemoved > 0) {
    parts.push(col("overlay0") + "\u2502" + RST + " " + col("green") + "+" + linesAdded + RST + col("red") + "/-" + linesRemoved + RST);
  }

  const line1 = parts.join(" ");

  // === LINE 2: Gradient Bar + Weather ===
  const bar = buildGradientBar(usedPct);
  const pctStr = pctColor(usedPct) + usedPct + "%" + RST;
  let line2 = bar + " " + pctStr;
  if (weather) {
    const cityLabel = weather.city || "Local";
    line2 += "  " + col("overlay0") + "\u2502" + RST + " " + col("sky") + "\uD83C\uDFD9\uFE0F  " + cityLabel + ":" + RST + " " + col("text") + weather.text + RST;
  }

  console.log(line1);
  console.log(line2);
}

main().catch(() => {
  console.log("\x1b[38;2;180;190;254m\u25C8 JuhBDI\x1b[0m");
});

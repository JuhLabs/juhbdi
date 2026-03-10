/**
 * JuhBDI Statusline Setup — Interactive configuration for Claude Code statusline
 *
 * Configures the user's ~/.claude/settings.json statusLine and copies the
 * statusline script to ~/.claude/juhbdi-statusline.cjs.
 *
 * Usage:
 *   bun run src/statusline/setup.ts detect    — detect current config, output JSON
 *   bun run src/statusline/setup.ts apply     — apply config from stdin JSON
 *   bun run src/statusline/setup.ts preview   — preview statusline with config from stdin
 */

import * as fs from "fs";
import * as path from "path";

// ── Types ───────────────────────────────────────────────────────────

export interface StatuslineConfig {
  right_align: boolean;
  mood_colors: boolean;
  trust_badge: boolean;
  git_branch: boolean;
  cost_display: boolean;
  context_bar: boolean;
}

export interface DetectResult {
  has_settings: boolean;
  has_statusline: boolean;
  current_command: string | null;
  is_juhbdi: boolean;
  is_ccstatusline: boolean;
  is_other: boolean;
  settings_path: string;
  statusline_path: string;
}

export const DEFAULT_CONFIG: StatuslineConfig = {
  right_align: true,
  mood_colors: true,
  trust_badge: true,
  git_branch: true,
  cost_display: true,
  context_bar: true,
};

// ── Paths ───────────────────────────────────────────────────────────

const HOME = process.env.HOME || process.env.USERPROFILE || "~";
const CLAUDE_DIR = path.join(HOME, ".claude");
const SETTINGS_PATH = path.join(CLAUDE_DIR, "settings.json");
const STATUSLINE_DEST = path.join(CLAUDE_DIR, "juhbdi-statusline.cjs");

function getPluginRoot(): string {
  // Use CLAUDE_PLUGIN_ROOT if available, else try to find relative to this file
  if (process.env.CLAUDE_PLUGIN_ROOT) return process.env.CLAUDE_PLUGIN_ROOT;
  // Walk up from src/statusline/ to project root
  return path.resolve(__dirname, "..", "..");
}

// ── Detect Current Config ───────────────────────────────────────────

export function detect(): DetectResult {
  const result: DetectResult = {
    has_settings: false,
    has_statusline: false,
    current_command: null,
    is_juhbdi: false,
    is_ccstatusline: false,
    is_other: false,
    settings_path: SETTINGS_PATH,
    statusline_path: STATUSLINE_DEST,
  };

  // Check settings.json
  if (fs.existsSync(SETTINGS_PATH)) {
    result.has_settings = true;
    try {
      const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
      const cmd = settings?.env?.statusLine?.command;
      if (cmd) {
        result.current_command = cmd;
        if (cmd.includes("juhbdi-statusline")) {
          result.is_juhbdi = true;
        } else if (cmd.includes("ccstatusline")) {
          result.is_ccstatusline = true;
        } else {
          result.is_other = true;
        }
      }
    } catch {
      // Invalid JSON — treat as no settings
    }
  }

  // Check statusline script
  result.has_statusline = fs.existsSync(STATUSLINE_DEST);

  return result;
}

// ── Apply Config ────────────────────────────────────────────────────

export function apply(config: StatuslineConfig): { success: boolean; message: string } {
  try {
    // 1. Ensure ~/.claude/ exists
    if (!fs.existsSync(CLAUDE_DIR)) {
      fs.mkdirSync(CLAUDE_DIR, { recursive: true });
    }

    // 2. Copy statusline script from plugin source
    const pluginRoot = getPluginRoot();
    const sourcePath = path.join(pluginRoot, ".claude-plugin", "hooks", "juhbdi-statusline.cjs");

    if (!fs.existsSync(sourcePath)) {
      return { success: false, message: `Statusline source not found at ${sourcePath}` };
    }

    let script = fs.readFileSync(sourcePath, "utf-8");

    // Inject config overrides at the top of the script (after the header comment)
    const configBlock = buildConfigOverrides(config);
    if (configBlock) {
      // Insert after the first occurrence of "const fs = require"
      const insertPoint = script.indexOf('const fs = require("fs");');
      if (insertPoint > 0) {
        script = script.slice(0, insertPoint) + configBlock + "\n" + script.slice(insertPoint);
      }
    }

    // Write to destination (atomic)
    const tmpPath = STATUSLINE_DEST + ".tmp";
    fs.writeFileSync(tmpPath, script);
    fs.renameSync(tmpPath, STATUSLINE_DEST);
    fs.chmodSync(STATUSLINE_DEST, 0o755);

    // 3. Update settings.json
    let settings: Record<string, any> = {};
    if (fs.existsSync(SETTINGS_PATH)) {
      try {
        settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
      } catch {
        settings = {};
      }
    }

    if (!settings.env) settings.env = {};
    settings.env.statusLine = {
      command: `node ${STATUSLINE_DEST}`,
    };

    const settingsTmp = SETTINGS_PATH + ".tmp";
    fs.writeFileSync(settingsTmp, JSON.stringify(settings, null, 2) + "\n");
    fs.renameSync(settingsTmp, SETTINGS_PATH);

    return {
      success: true,
      message: `Statusline configured. Script: ${STATUSLINE_DEST}, Settings: ${SETTINGS_PATH}`,
    };
  } catch (err: any) {
    return { success: false, message: `Failed to apply: ${err.message}` };
  }
}

// ── Build Config Overrides ──────────────────────────────────────────

function buildConfigOverrides(config: StatuslineConfig): string {
  const lines: string[] = [];
  lines.push("// ── User Preferences (generated by /juhbdi:statusline) ──────────");

  if (!config.mood_colors) {
    lines.push("// Mood colors disabled — always use calm palette");
    lines.push('const FORCE_MOOD = "calm";');
  }
  if (!config.trust_badge) {
    lines.push("// Trust badge disabled");
    lines.push("const HIDE_TRUST_BADGE = true;");
  }
  if (!config.git_branch) {
    lines.push("// Git branch display disabled");
    lines.push("const HIDE_GIT_BRANCH = true;");
  }
  if (!config.cost_display) {
    lines.push("// Cost display disabled");
    lines.push("const HIDE_COST = true;");
  }
  if (!config.right_align) {
    lines.push("// Right-alignment disabled");
    lines.push("const DISABLE_RIGHT_ALIGN = true;");
  }
  if (!config.context_bar) {
    lines.push("// Context bar disabled");
    lines.push("const HIDE_CONTEXT_BAR = true;");
  }

  // Only emit block if there are actual overrides
  if (lines.length <= 1) return "";
  lines.push("// ── End User Preferences ────────────────────────────────────────");
  return lines.join("\n");
}

// ── Preview ─────────────────────────────────────────────────────────

export function preview(config: StatuslineConfig): string {
  const parts: string[] = [];

  // Simulate a calm statusline with mock data
  const RST = "\x1b[0m";
  const fg = (r: number, g: number, b: number) => `\x1b[38;2;${r};${g};${b}m`;
  const lavender = fg(180, 190, 254);
  const mauve = fg(203, 166, 247);
  const blue = fg(137, 180, 250);
  const peach = fg(250, 179, 135);
  const green = fg(166, 227, 161);
  const red = fg(243, 139, 168);
  const teal = fg(148, 226, 213);
  const overlay = fg(108, 112, 134);

  parts.push(`${lavender}\u25C8 JuhBDI${RST}`);

  if (config.trust_badge) {
    parts.push(`${teal}[P]${RST}`);
  }

  if (config.git_branch) {
    parts.push(`${overlay}\u2502${RST} ${mauve}\u2387 main${RST}`);
  }

  parts.push(`${overlay}\u2502${RST} ${blue}Claude Opus 4.6${RST}`);

  if (config.cost_display) {
    parts.push(`${overlay}\u2502${RST} ${peach}$1.23${RST}`);
  }

  parts.push(`${overlay}\u2502${RST} ${green}+42${RST}${red}/-8${RST}`);

  // Context bar
  if (config.context_bar) {
    const segments = 20;
    const filled = 7; // 35% used
    let bar = "";
    const stops = [
      [166, 227, 161], [148, 226, 213], [137, 220, 235],
      [137, 180, 250], [180, 190, 254], [203, 166, 247],
      [249, 226, 175], [250, 179, 135], [243, 139, 168],
      [235, 160, 172],
    ];
    for (let i = 0; i < segments; i++) {
      const idx = Math.floor((i / segments) * stops.length);
      const [r, g, b] = stops[Math.min(idx, stops.length - 1)];
      if (i < filled) {
        bar += fg(r, g, b) + "\u2588";
      } else {
        bar += fg(69, 71, 90) + "\u2591";
      }
    }
    parts.push(` ${bar}${RST} ${green}35%${RST}`);
  }

  return parts.join(" ");
}

// ── CLI Entry ───────────────────────────────────────────────────────

async function main() {
  const command = process.argv[2];

  if (command === "detect") {
    const result = detect();
    console.log(JSON.stringify(result, null, 2));
  } else if (command === "apply") {
    const input = await readStdin();
    const config: StatuslineConfig = JSON.parse(input);
    const result = apply(config);
    console.log(JSON.stringify(result, null, 2));
  } else if (command === "preview") {
    const input = await readStdin();
    const config: StatuslineConfig = JSON.parse(input);
    const line = preview(config);
    console.log(line);
  } else {
    console.error("Usage: bun run setup.ts <detect|apply|preview>");
    process.exit(1);
  }
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
  });
}

// Only run CLI when executed directly (not when imported by tests)
const isDirectRun = import.meta.path === Bun.main;
if (isDirectRun) {
  main().catch((err) => {
    console.error(JSON.stringify({ error: err.message }));
    process.exit(1);
  });
}

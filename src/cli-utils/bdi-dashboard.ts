// src/cli-utils/bdi-dashboard.ts
//
// Live BDI state dashboard — shows what the agent knows, wants, and is doing.
import chalk from "chalk";

export interface BDIState {
  beliefs: BeliefSnapshot[];
  desire: DesireSnapshot;
  intention: IntentionSnapshot;
  context_pct: number; // Remaining context percentage
  trust_tier?: string; // Current autonomy tier
  trust_score?: number; // Current trust score (0-1)
  session_duration_ms: number;
}

export interface BeliefSnapshot {
  category: "project" | "task" | "memory" | "constraint";
  summary: string; // One-line belief
}

export interface DesireSnapshot {
  goal: string; // Current high-level goal
  task_id?: string;
  progress_pct: number; // 0-100
}

export interface IntentionSnapshot {
  action: string; // What the agent is doing right now
  step: number; // Current step number
  total_steps: number; // Total planned steps
  status: "planning" | "executing" | "verifying" | "reflecting" | "idle";
}

const STATUS_COLORS: Record<IntentionSnapshot["status"], (text: string) => string> = {
  planning: chalk.blue,
  executing: chalk.green,
  verifying: chalk.yellow,
  reflecting: chalk.magenta,
  idle: chalk.dim,
};

/**
 * Render a progress bar with chalk colors.
 * @param pct Progress percentage (0-100)
 * @param width Number of bar segments (default 10)
 */
export function renderProgressBar(pct: number, width: number = 10): string {
  const clamped = Math.max(0, Math.min(100, pct));
  const filled = Math.round((clamped / 100) * width);
  const empty = width - filled;
  const filledChar = "\u2588"; // █
  const emptyChar = "\u2591"; // ░
  return filledChar.repeat(filled) + emptyChar.repeat(empty);
}

/**
 * Format duration in human-readable form.
 */
export function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

/**
 * Render the BDI dashboard as a compact terminal block (~6 lines).
 */
export function renderDashboard(state: BDIState): string {
  const lines: string[] = [];
  const width = 52;

  // Top border
  lines.push(chalk.dim("\u250C\u2500 JuhBDI ") + chalk.dim("\u2500".repeat(width - 10)) + chalk.dim("\u2510"));

  // BELIEFS line
  const beliefsByCategory = new Map<string, number>();
  for (const b of state.beliefs) {
    beliefsByCategory.set(b.category, (beliefsByCategory.get(b.category) || 0) + 1);
  }
  const beliefSummary = state.beliefs.length > 0
    ? Array.from(beliefsByCategory.entries())
        .map(([cat, count]) => `${cat}:${count}`)
        .join(" | ")
    : "none";
  lines.push(
    chalk.dim("\u2502 ") +
    chalk.cyan.bold("BELIEFS") +
    "  " +
    beliefSummary
  );

  // DESIRE line
  const desireBar = renderProgressBar(state.desire.progress_pct);
  const desireTaskId = state.desire.task_id ? chalk.dim(` [${state.desire.task_id}]`) : "";
  lines.push(
    chalk.dim("\u2502 ") +
    chalk.yellow.bold("DESIRE") +
    "   " +
    truncate(state.desire.goal, 24) +
    " " +
    desireBar +
    ` ${Math.round(state.desire.progress_pct)}%` +
    desireTaskId
  );

  // INTENT line
  const statusColor = STATUS_COLORS[state.intention.status];
  lines.push(
    chalk.dim("\u2502 ") +
    chalk.green.bold("INTENT") +
    "   " +
    chalk.dim(`[${state.intention.step}/${state.intention.total_steps}]`) +
    " " +
    statusColor(capitalize(state.intention.status)) +
    chalk.dim(" \u2500 ") +
    truncate(state.intention.action, 28)
  );

  // TRUST + CTX line
  const tierStr = state.trust_tier
    ? `${state.trust_tier}${state.trust_score !== undefined ? ` (${state.trust_score.toFixed(2)})` : ""}`
    : "N/A";
  const ctxBar = renderProgressBar(state.context_pct);
  const durationStr = formatDuration(state.session_duration_ms);
  lines.push(
    chalk.dim("\u2502 ") +
    chalk.magenta.bold("TRUST") +
    "    " +
    tierStr +
    chalk.dim(" | ") +
    "CTX " +
    `${Math.round(state.context_pct)}% ` +
    ctxBar +
    chalk.dim(" | ") +
    durationStr
  );

  // Bottom border
  lines.push(chalk.dim("\u2514") + chalk.dim("\u2500".repeat(width)) + chalk.dim("\u2518"));

  return lines.join("\n");
}

/**
 * Render a minimal one-line status (for statusline hook integration).
 */
export function renderStatusLine(state: BDIState): string {
  const stepStr = `[${state.intention.step}/${state.intention.total_steps}]`;
  const statusStr = capitalize(state.intention.status);
  const progressBar = renderProgressBar(state.desire.progress_pct, 5);
  const tierStr = state.trust_tier ? ` ${state.trust_tier[0]}` : "";
  return `JuhBDI ${stepStr} ${statusStr} ${progressBar} ${Math.round(state.desire.progress_pct)}%${tierStr}`;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + "...";
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

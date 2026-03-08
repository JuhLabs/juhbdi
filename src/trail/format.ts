// src/trail/format.ts
import chalk from "chalk";
import type { DecisionTrailEntry } from "../schemas/decision-trail";

const EVENT_COLORS: Record<DecisionTrailEntry["event_type"], (text: string) => string> = {
  routing: chalk.cyan,
  decision: chalk.yellow,
  command: chalk.green,
  recovery: chalk.red,
  override: chalk.magenta,
  conflict: chalk.red,
};

function badge(eventType: DecisionTrailEntry["event_type"]): string {
  const colorFn = EVENT_COLORS[eventType];
  return colorFn(`[${eventType}]`);
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}

export function formatTrail(entries: DecisionTrailEntry[]): string {
  const lines: string[] = [];

  lines.push(chalk.blue.bold("\nJuhBDI Decision Trail"));
  lines.push("");

  if (entries.length === 0) {
    lines.push(chalk.yellow("  No trail entries."));
    lines.push("");
    return lines.join("\n");
  }

  for (const entry of entries) {
    const hashIndicator = entry.entry_hash ? chalk.dim(` #${entry.entry_hash.slice(0, 8)}`) : "";
    lines.push(`  ${badge(entry.event_type)} ${chalk.dim(entry.timestamp)} ${entry.description}${hashIndicator}`);
    if (entry.reasoning) {
      lines.push(`    ${chalk.dim(truncate(entry.reasoning, 80))}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

// src/cost/format.ts
import chalk from "chalk";
import type { CostReport } from "./types";

function fmtUsd(value: number): string {
  return `$${value.toFixed(4)}`;
}

function fmtPct(value: number): string {
  return `${Math.floor(value)}%`;
}

function pluralTasks(n: number): string {
  return n === 1 ? "1 task" : `${n} tasks`;
}

export function formatCostReport(report: CostReport): string {
  const lines: string[] = [];

  lines.push(chalk.blue.bold("\nJuhBDI Cost Report"));
  lines.push("");

  if (report.total_tasks === 0) {
    lines.push(chalk.yellow("  No routing data. Run /juhbdi:execute first."));
    lines.push("");
    return lines.join("\n");
  }

  // Tier Distribution
  lines.push(chalk.white.bold("Tier Distribution:"));
  for (const tier of report.tier_breakdown) {
    lines.push(`  ${tier.tier.padEnd(8)} ${pluralTasks(tier.task_count).padEnd(10)} ${fmtUsd(tier.estimated_usd)}`);
  }
  lines.push(`  ${"total".padEnd(8)} ${pluralTasks(report.total_tasks).padEnd(10)} ${fmtUsd(report.total_estimated_usd)}`);
  lines.push("");

  // Wave Breakdown
  lines.push(chalk.white.bold("Wave Breakdown:"));
  for (const wave of report.wave_breakdown) {
    lines.push(`  ${wave.wave_id.padEnd(10)} ${pluralTasks(wave.task_count).padEnd(10)} ${fmtUsd(wave.estimated_usd)}`);
  }
  lines.push("");

  // Savings
  lines.push(chalk.white.bold("Savings:"));
  lines.push(`  Estimated spend:   ${fmtUsd(report.total_estimated_usd)}`);
  lines.push(`  vs always-opus:    ${fmtUsd(report.total_opus_usd)}`);
  const savingsColor = report.savings_pct > 50 ? chalk.green : chalk.white;
  lines.push(`  Savings:           ${savingsColor(`${fmtUsd(report.savings_usd)} (${fmtPct(report.savings_pct)})`)}`);
  lines.push("");

  // Routing Signals
  lines.push(chalk.white.bold("Routing Signals:"));
  lines.push(`  Overrides:    ${report.override_count}`);
  lines.push(`  Escalations:  ${report.escalation_count}`);
  lines.push("");

  return lines.join("\n");
}

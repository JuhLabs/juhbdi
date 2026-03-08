// src/audit/format.ts
import chalk from "chalk";
import type { DecisionTrailEntry } from "../schemas/decision-trail";
import type { AuditSummary, ComplianceReport } from "./types";

export function formatTable(entries: DecisionTrailEntry[]): string {
  if (entries.length === 0) {
    return chalk.yellow("No entries match the current filter.");
  }

  const lines: string[] = [];
  lines.push(
    chalk.white.bold(
      `  ${"Timestamp".padEnd(20)} ${"Type".padEnd(10)} ${"Outcome".padEnd(10)} ${"Task".padEnd(10)} Description`
    )
  );
  lines.push(chalk.gray("  " + "-".repeat(80)));

  for (const entry of entries) {
    const time = entry.timestamp.slice(0, 19).replace("T", " ");
    const taskId = entry.task_id ?? "-";
    const outcomeColor =
      entry.outcome === "approved"
        ? chalk.green
        : entry.outcome === "rejected"
          ? chalk.red
          : chalk.yellow;

    lines.push(
      `  ${chalk.gray(time)} ${chalk.cyan(entry.event_type.padEnd(10))} ${outcomeColor(entry.outcome.padEnd(10))} ${chalk.white(taskId.padEnd(10))} ${entry.description}`
    );
  }

  lines.push("");
  lines.push(chalk.gray(`  ${entries.length} entries displayed.`));

  return lines.join("\n");
}

export function formatSummary(summary: AuditSummary): string {
  const lines: string[] = [];

  lines.push(chalk.white.bold("\n  Audit Summary"));
  lines.push(chalk.gray("  " + "-".repeat(40)));
  lines.push(`  Total entries:  ${chalk.white(String(summary.total_entries))}`);
  lines.push(`  Unique tasks:   ${chalk.white(String(summary.unique_tasks))}`);
  lines.push(`  Unique waves:   ${chalk.white(String(summary.unique_waves))}`);

  if (summary.date_range) {
    const first = summary.date_range.first.slice(0, 19).replace("T", " ");
    const last = summary.date_range.last.slice(0, 19).replace("T", " ");
    lines.push(`  Date range:     ${chalk.gray(first)} to ${chalk.gray(last)}`);
  }

  lines.push("");
  lines.push(chalk.white.bold("  By Event Type:"));
  for (const [type, count] of Object.entries(summary.by_event_type)) {
    lines.push(`    ${chalk.cyan(type.padEnd(12))} ${count}`);
  }

  lines.push("");
  lines.push(chalk.white.bold("  By Outcome:"));
  for (const [outcome, count] of Object.entries(summary.by_outcome)) {
    const color =
      outcome === "approved"
        ? chalk.green
        : outcome === "rejected"
          ? chalk.red
          : chalk.yellow;
    lines.push(`    ${color(outcome.padEnd(12))} ${count}`);
  }

  return lines.join("\n");
}

export function formatComplianceReport(report: ComplianceReport): string {
  const lines: string[] = [];

  lines.push(chalk.white.bold("\n  Compliance Report (EU AI Act / ISO 42001)"));
  lines.push(chalk.gray("  " + "-".repeat(50)));

  const scoreColor =
    report.compliance_score >= 80
      ? chalk.green
      : report.compliance_score >= 50
        ? chalk.yellow
        : chalk.red;

  lines.push(
    `  Compliance Score: ${scoreColor(report.compliance_score + "%")}`
  );
  lines.push("");
  lines.push(`  Total decisions:             ${chalk.white(String(report.total_decisions))}`);
  lines.push(`  With reasoning:              ${chalk.white(String(report.decisions_with_reasoning))}`);
  lines.push(`  With alternatives:           ${chalk.white(String(report.decisions_with_alternatives))}`);
  lines.push(`  With constraint references:  ${chalk.white(String(report.decisions_with_constraints))}`);
  lines.push(`  Overrides:                   ${chalk.white(String(report.override_count))}`);
  lines.push(`  Escalations:                 ${chalk.white(String(report.escalation_count))}`);

  if (report.issues.length > 0) {
    lines.push("");
    lines.push(chalk.yellow.bold("  Issues:"));
    for (const issue of report.issues) {
      lines.push(chalk.yellow(`    - ${issue}`));
    }
  } else {
    lines.push("");
    lines.push(chalk.green("  No compliance issues found."));
  }

  return lines.join("\n");
}

// src/status/format.ts
import chalk from "chalk";
import type { ProjectStatus } from "./types";

export function formatProjectStatus(status: ProjectStatus): string {
  const lines: string[] = [];

  lines.push(chalk.blue.bold("\nJuhBDI Project Status\n"));

  // Beliefs
  if (status.beliefs) {
    lines.push(chalk.white.bold("Beliefs:"));
    lines.push(`  Project: ${status.beliefs.project_name}`);
    lines.push(`  Architecture: ${status.beliefs.architecture}`);
    lines.push(
      `  Conventions: ${status.beliefs.conventions.length > 0 ? status.beliefs.conventions.join(", ") : "none defined"}`
    );
    lines.push(`  Last Updated: ${status.beliefs.last_updated}`);
    if (status.beliefs.active_wave_id) {
      lines.push(`  Active Wave: ${status.beliefs.active_wave_id}`);
    }
    if (status.beliefs.active_task_id) {
      lines.push(`  Active Task: ${status.beliefs.active_task_id}`);
    }
    lines.push("");
  } else {
    lines.push(chalk.yellow("  No state.json found.\n"));
  }

  // Intentions
  if (status.intentions) {
    lines.push(chalk.white.bold("Intentions:"));
    if (status.intentions.wave_details.length === 0) {
      lines.push("  No waves planned. Run `juhbdi plan` to create a roadmap.");
    } else {
      lines.push(
        `  Progress: ${status.intentions.overall_progress}% (${status.intentions.total_tasks} tasks across ${status.intentions.total_waves} waves)`
      );
      for (const wave of status.intentions.wave_details) {
        const total =
          wave.pending + wave.running + wave.passed + wave.failed + wave.blocked;
        lines.push(
          `  Wave ${wave.id} (${wave.parallel ? "parallel" : "sequential"}): ` +
            `${wave.passed}/${total} passed, ${wave.running} running, ${wave.failed} failed` +
            (wave.blocked > 0 ? `, ${wave.blocked} blocked` : "")
        );
      }
    }
    lines.push("");
  } else {
    lines.push(chalk.yellow("  No roadmap-intent.json found.\n"));
  }

  // Decision Trail
  lines.push(chalk.white.bold("Decision Trail:"));
  lines.push(`  ${status.trail.total_entries} entries logged`);
  if (status.trail.latest_entry) {
    lines.push(
      `  Latest: [${status.trail.latest_entry.event_type}] ${status.trail.latest_entry.description}`
    );
  }
  lines.push("");

  // Recovery
  if (
    status.recovery.tasks_with_retries > 0 ||
    status.recovery.failure_patterns.length > 0
  ) {
    lines.push(chalk.white.bold("Recovery:"));
    lines.push(
      `  ${status.recovery.tasks_with_retries} tasks retried (${status.recovery.total_retries} total retries)`
    );
    if (status.recovery.banned_approaches.length > 0) {
      for (const ban of status.recovery.banned_approaches) {
        lines.push(
          `  [${ban.task_id}] Banned: ${ban.approaches.join(", ")}`
        );
      }
    }
    if (status.recovery.failure_patterns.length > 0) {
      lines.push(chalk.yellow("  Failure Patterns:"));
      for (const pattern of status.recovery.failure_patterns) {
        lines.push(
          chalk.yellow(
            `    "${pattern.pattern}" (${pattern.occurrences} tasks: ${pattern.task_ids.join(", ")})`
          )
        );
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

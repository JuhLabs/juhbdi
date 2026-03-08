import chalk from "chalk";
import { createInterface } from "readline";
import type { ChallengeReport } from "./types";

export type ConflictClassification = "no-conflicts" | "soft-only" | "has-hard";
export type HITLDecision = "proceed" | "override" | "reject";

export function classifyConflicts(report: ChallengeReport): ConflictClassification {
  if (report.conflicts.length === 0) return "no-conflicts";
  const hasHard = report.conflicts.some((c) => c.severity === "hard");
  return hasHard ? "has-hard" : "soft-only";
}

export function formatConflictsForDisplay(report: ChallengeReport): string {
  const lines: string[] = [];

  lines.push("Conflicts found:");
  for (const conflict of report.conflicts) {
    const tag = conflict.severity === "hard" ? chalk.red("[HARD]") : chalk.yellow("[SOFT]");
    lines.push(`  ${tag} [${conflict.constraint_id}] ${conflict.description}`);
  }

  if (report.suggestions.length > 0) {
    lines.push("");
    lines.push("Suggestions:");
    for (const suggestion of report.suggestions) {
      lines.push(`  - ${suggestion}`);
    }
  }

  return lines.join("\n");
}

export async function promptHITL(report: ChallengeReport): Promise<HITLDecision> {
  console.log(formatConflictsForDisplay(report));
  console.log();
  console.log(chalk.yellow("Hard constraint violations detected."));
  console.log(`Refined request: ${chalk.cyan(report.refined_request)}`);
  console.log();

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  return new Promise((resolve) => {
    rl.question(
      chalk.bold("Override and proceed anyway? (y/N): "),
      (answer) => {
        rl.close();
        const normalized = answer.trim().toLowerCase();
        resolve(normalized === "y" || normalized === "yes" ? "override" : "reject");
      }
    );
  });
}

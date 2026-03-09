// src/cli-utils/stats.ts
//
// User-facing stats — show productivity metrics from existing JuhBDI data.
import chalk from "chalk";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

export interface JuhBDIStats {
  // Lifetime stats
  total_tasks_executed: number;
  tasks_passed: number;
  tasks_failed: number;
  pass_rate: number; // 0-1

  // Trust
  current_trust_score: number;
  current_tier: string;

  // Memory
  reflexions_stored: number;
  principles_learned: number;
  experiences_banked: number;

  // Session
  session_tasks: number;
  session_pass_rate: number;

  // Trail
  total_decisions: number;
  governance_violations: number;
  overrides: number;
}

// Trust tier thresholds (same as trust.ts)
const W_PASS = 0.4;
const W_EFF = 0.3;
const W_VIOL = 0.3;

// Thresholds must match src/routing/tiered-autonomy.ts DEFAULT_TIERS
function computeTier(score: number): string {
  if (score >= 0.85) return "Principal";
  if (score >= 0.6) return "Senior";
  if (score >= 0.35) return "Junior";
  return "Intern";
}

/**
 * Gather stats from .juhbdi/ directory.
 * All reads are best-effort — missing files produce zero values.
 */
export async function gatherStats(juhbdiDir: string): Promise<JuhBDIStats> {
  const stats: JuhBDIStats = {
    total_tasks_executed: 0,
    tasks_passed: 0,
    tasks_failed: 0,
    pass_rate: 0,
    current_trust_score: 0.5,
    current_tier: "Intern",
    reflexions_stored: 0,
    principles_learned: 0,
    experiences_banked: 0,
    session_tasks: 0,
    session_pass_rate: 0,
    total_decisions: 0,
    governance_violations: 0,
    overrides: 0,
  };

  // Read decision trail
  const trailPath = join(juhbdiDir, "decision-trail.jsonl");
  if (existsSync(trailPath)) {
    try {
      const content = readFileSync(trailPath, "utf-8");
      const lines = content.trim().split("\n").filter(Boolean);
      stats.total_decisions = lines.length;

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);
          if (entry.event_type === "override" || entry.override === true) {
            stats.overrides++;
          }
          if (entry.event_type === "conflict" || entry.violation === true || entry.type === "violation") {
            stats.governance_violations++;
          }
        } catch {
          // Skip malformed lines
        }
      }
    } catch {
      // Non-fatal
    }
  }

  // Read trust store
  const trustPath = join(juhbdiDir, "trust-store.json");
  if (existsSync(trustPath)) {
    try {
      const content = readFileSync(trustPath, "utf-8");
      const store = JSON.parse(content);
      const records = Object.values(store.records || {}) as any[];
      if (records.length > 0) {
        const r = records[0];
        stats.total_tasks_executed = r.tasks_attempted || 0;
        stats.tasks_passed = r.tasks_passed || 0;
        stats.tasks_failed = stats.total_tasks_executed - stats.tasks_passed;
        stats.pass_rate = stats.total_tasks_executed > 0
          ? stats.tasks_passed / stats.total_tasks_executed
          : 0;

        // Compute trust score using same formula as trust.ts
        const passRate = stats.total_tasks_executed > 0
          ? stats.tasks_passed / stats.total_tasks_executed
          : 0.5;
        const efficiency = Math.max(0, 1 - (r.avg_strikes || 0) / 3);
        const violationScore = Math.max(0, 1 - (r.violation_count || 0) * 0.2);
        stats.current_trust_score = Math.min(
          1,
          passRate * W_PASS + efficiency * W_EFF + violationScore * W_VIOL
        );
        stats.current_tier = computeTier(stats.current_trust_score);
      }
    } catch {
      // Non-fatal
    }
  }

  // Read memory bank
  const memoryPath = join(juhbdiDir, "memory-bank.json");
  if (existsSync(memoryPath)) {
    try {
      const content = readFileSync(memoryPath, "utf-8");
      const bank = JSON.parse(content);
      stats.experiences_banked = (bank.entries || bank.experiences || []).length;
    } catch {
      // Non-fatal
    }
  }

  // Read reflexion bank
  const reflexionPath = join(juhbdiDir, "reflexion-bank.json");
  if (existsSync(reflexionPath)) {
    try {
      const content = readFileSync(reflexionPath, "utf-8");
      const bank = JSON.parse(content);
      stats.reflexions_stored = (bank.entries || []).length;
    } catch {
      // Non-fatal
    }
  }

  // Read principle bank
  const principlePath = join(juhbdiDir, "principle-bank.json");
  if (existsSync(principlePath)) {
    try {
      const content = readFileSync(principlePath, "utf-8");
      const bank = JSON.parse(content);
      stats.principles_learned = (bank.entries || bank.principles || []).length;
    } catch {
      // Non-fatal
    }
  }

  return stats;
}

/**
 * Format a single stat line with label and value.
 */
export function formatStatLine(
  label: string,
  value: string | number,
  color?: string
): string {
  const paddedLabel = label.padEnd(12);
  const valueStr = typeof value === "number" ? String(value) : value;
  if (color === "green") return `  ${chalk.white(paddedLabel)} ${chalk.green(valueStr)}`;
  if (color === "red") return `  ${chalk.white(paddedLabel)} ${chalk.red(valueStr)}`;
  if (color === "yellow") return `  ${chalk.white(paddedLabel)} ${chalk.yellow(valueStr)}`;
  if (color === "cyan") return `  ${chalk.white(paddedLabel)} ${chalk.cyan(valueStr)}`;
  return `  ${chalk.white(paddedLabel)} ${valueStr}`;
}

/**
 * Format stats for terminal display (chalk-colored).
 */
export function formatStats(stats: JuhBDIStats): string {
  const lines: string[] = [];

  lines.push(chalk.blue.bold("\nJuhBDI Stats"));
  lines.push(chalk.dim("\u2500".repeat(36)));

  // Tasks
  const passRatePct = Math.round(stats.pass_rate * 100);
  const passRateColor = passRatePct >= 80 ? "green" : passRatePct >= 50 ? "yellow" : "red";
  lines.push(formatStatLine(
    "Tasks",
    `${stats.total_tasks_executed} executed \u2502 ${passRatePct}% pass rate`,
    passRateColor
  ));

  // Trust
  const tierColor = stats.current_tier === "Principal" ? "cyan"
    : stats.current_tier === "Senior" ? "green"
    : stats.current_tier === "Junior" ? "yellow"
    : "red";
  lines.push(formatStatLine(
    "Trust",
    `${stats.current_tier} (${stats.current_trust_score.toFixed(2)})`,
    tierColor
  ));

  // Memory
  lines.push(formatStatLine(
    "Memory",
    `${stats.reflexions_stored} reflexions \u2502 ${stats.principles_learned} principles \u2502 ${stats.experiences_banked} experiences`
  ));

  // Trail
  const violColor = stats.governance_violations > 0 ? "red" : "green";
  lines.push(formatStatLine(
    "Trail",
    `${stats.total_decisions} decisions \u2502 ${stats.governance_violations} violations \u2502 ${stats.overrides} overrides`,
    violColor
  ));

  // Session
  const sessionPassPct = Math.round(stats.session_pass_rate * 100);
  lines.push(formatStatLine(
    "Session",
    `${stats.session_tasks} tasks \u2502 ${sessionPassPct}% pass rate`
  ));

  lines.push("");
  return lines.join("\n");
}

// CLI entrypoint
if (import.meta.main) {
  const juhbdiDir = process.argv[2] || join(process.cwd(), ".juhbdi");

  gatherStats(juhbdiDir)
    .then((stats) => {
      console.log(formatStats(stats));
    })
    .catch((err) => {
      console.error(JSON.stringify({ error: String(err) }));
      process.exit(1);
    });
}

// src/executor/recovery.ts
import type { Task } from "../schemas/roadmap-intent";
import type { DecisionTrailEntry } from "../schemas/decision-trail";
import { detectFailurePatterns } from "../core/patterns";

export interface RecoveryAction {
  action: "retry" | "give_up";
  updated_retry_count: number;
  updated_banned_approaches: string[];
  banned_approach?: string;
  failure_reason: string;
}

export function handleFailure(
  task: Task,
  approach: string,
  failureReason: string,
  maxRetries: number
): RecoveryAction {
  const newRetryCount = task.retry_count + 1;

  const existingBans = task.banned_approaches ?? [];
  const updatedBans = existingBans.includes(approach)
    ? existingBans
    : [...existingBans, approach];

  if (newRetryCount >= maxRetries) {
    return {
      action: "give_up",
      updated_retry_count: newRetryCount,
      updated_banned_approaches: updatedBans,
      banned_approach: approach,
      failure_reason: failureReason,
    };
  }

  return {
    action: "retry",
    updated_retry_count: newRetryCount,
    updated_banned_approaches: updatedBans,
    banned_approach: approach,
    failure_reason: failureReason,
  };
}

export interface FailureAnalysis {
  repeated_errors: { pattern: string; count: number; task_ids: string[] }[];
  systemic_issue: boolean;
  recommendation: string;
}

export function analyzeFailurePatterns(
  _tasks: Task[],
  trailEntries: DecisionTrailEntry[]
): FailureAnalysis {
  const patterns = detectFailurePatterns(trailEntries);
  const systemic = patterns.length > 0;

  // Map from shared FailurePattern (occurrences) to FailureAnalysis (count)
  const repeated_errors = patterns.map((p) => ({
    pattern: p.pattern,
    count: p.occurrences,
    task_ids: p.task_ids,
  }));

  let recommendation = "";
  if (systemic && repeated_errors.length > 0) {
    const top = repeated_errors[0];
    recommendation = `Systemic issue: ${top.count} tasks failing with '${top.pattern}'. Check project dependencies.`;
  }

  return { repeated_errors, systemic_issue: systemic, recommendation };
}

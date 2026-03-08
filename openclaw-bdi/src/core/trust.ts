import type { TrustRecord } from "./schemas.js";

const W_PASS = 0.4;
const W_EFF = 0.3;
const W_VIOL = 0.3;

export function computeTrustScore(record: TrustRecord): number {
  if (record.tasks_attempted === 0) return 0.5;
  const passRate = record.tasks_passed / record.tasks_attempted;
  const efficiency = Math.max(0, 1 - record.avg_strikes / 3);
  const violationScore = Math.max(0, 1 - record.violation_count * 0.2);
  return Math.min(1, passRate * W_PASS + efficiency * W_EFF + violationScore * W_VIOL);
}

export interface TaskFeedback {
  passed: boolean;
  strikes: number;
  violation: boolean;
}

export function updateTrustRecord(record: TrustRecord, feedback: TaskFeedback): TrustRecord {
  const newAttempted = record.tasks_attempted + 1;
  const newPassed = record.tasks_passed + (feedback.passed ? 1 : 0);
  const totalStrikes = record.avg_strikes * record.tasks_attempted + feedback.strikes;
  const newAvgStrikes = totalStrikes / newAttempted;
  const outcomes = [...record.last_10_outcomes, feedback.passed ? "pass" : "fail"] as Array<"pass" | "fail">;
  if (outcomes.length > 10) outcomes.shift();

  return {
    agent_tier: record.agent_tier,
    tasks_attempted: newAttempted,
    tasks_passed: newPassed,
    avg_strikes: newAvgStrikes,
    violation_count: record.violation_count + (feedback.violation ? 1 : 0),
    last_10_outcomes: outcomes,
  };
}

export function createDefaultTrustRecord(tier: string): TrustRecord {
  return {
    agent_tier: tier,
    tasks_attempted: 0,
    tasks_passed: 0,
    avg_strikes: 0,
    violation_count: 0,
    last_10_outcomes: [],
  };
}

import { estimateDifficulty, type DifficultyContext } from "../core/difficulty.js";
import { computeTrustScore, createDefaultTrustRecord } from "../core/trust.js";
import type { TrustStore } from "../core/schemas.js";

export interface AssessInput {
  description: string;
  affected_file_count?: number;
  model_id?: string;
}

export interface AssessResult {
  difficulty: {
    score: number;
    label: "trivial" | "easy" | "moderate" | "hard" | "complex";
  };
  trust: {
    score: number;
    label: "untested" | "low" | "moderate" | "high" | "excellent";
    tasks_attempted: number;
  } | null;
  recommendation: string;
}

function difficultyLabel(score: number): AssessResult["difficulty"]["label"] {
  if (score < 0.2) return "trivial";
  if (score < 0.4) return "easy";
  if (score < 0.6) return "moderate";
  if (score < 0.8) return "hard";
  return "complex";
}

function trustLabel(score: number, attempts: number): NonNullable<AssessResult["trust"]>["label"] {
  if (attempts === 0) return "untested";
  if (score < 0.4) return "low";
  if (score < 0.6) return "moderate";
  if (score < 0.8) return "high";
  return "excellent";
}

// Count technical terms in a description
const TECHNICAL_TERMS = /\b(api|auth|oauth|jwt|graphql|rest|sql|nosql|docker|kubernetes|k8s|ci\/cd|ssl|tls|cors|csrf|xss|regex|async|webhook|middleware|migration|schema|index|cache|queue|worker|cron|daemon|proxy|nginx|redis|postgres|mongo)\b/gi;

export function assess(input: AssessInput, trustStore: TrustStore): AssessResult {
  const technicalTerms = (input.description.match(TECHNICAL_TERMS) || []).length;

  const ctx: DifficultyContext = {
    description: input.description,
    affected_file_count: input.affected_file_count ?? 1,
    verification_type: "manual",
    historical_failure_rate: 0,
    technical_term_count: technicalTerms,
  };

  const diffScore = estimateDifficulty(ctx);
  const diffLabel = difficultyLabel(diffScore);

  let trust: AssessResult["trust"] = null;
  if (input.model_id) {
    const record = trustStore.records[input.model_id] ?? createDefaultTrustRecord(input.model_id);
    const trustScore = computeTrustScore(record);
    trust = {
      score: Math.round(trustScore * 100) / 100,
      label: trustLabel(trustScore, record.tasks_attempted),
      tasks_attempted: record.tasks_attempted,
    };
  }

  let recommendation: string;
  if (diffLabel === "complex" || diffLabel === "hard") {
    recommendation = "High difficulty task. Break into smaller subtasks. Verify intent and plan before executing.";
  } else if (trust && trust.label === "low") {
    recommendation = `Model ${input.model_id} has low trust (${trust.score}). Consider using a more reliable model for this task.`;
  } else {
    recommendation = "Task appears manageable. Proceed with standard governance.";
  }

  return {
    difficulty: { score: Math.round(diffScore * 100) / 100, label: diffLabel },
    trust,
    recommendation,
  };
}

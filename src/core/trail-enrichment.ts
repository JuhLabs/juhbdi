// src/core/trail-enrichment.ts — Enriches decision trail entries with EU AI Act Article 12 fields
import type { Article12Fields, AIActRiskClass } from "../schemas/eu-ai-act";

export interface TrailEnrichmentInput {
  taskId: string;
  projectDir: string;
  trustScore: number;
  tierName: string;
  operationStart: string; // ISO datetime
  operationEnd: string; // ISO datetime
  modelVersion: string;
  filesModified: string[];
  verificationResult?: {
    all_passed: boolean;
    steps_run: number;
    failed_at?: string;
    duration_ms: number;
  };
}

/**
 * Build Article 12 compliance fields from task context.
 * Maps trust tier + scope to risk classification and oversight level.
 */
export function buildArticle12Fields(
  input: TrailEnrichmentInput,
): NonNullable<Article12Fields> {
  const riskClass = classifyRisk(input.tierName, input.filesModified.length);

  return {
    ai_act_risk_class: riskClass,
    deployer_id: "juhlabs",
    system_id: `juhbdi-${input.projectDir.split("/").filter(Boolean).pop() ?? "unknown"}`,
    operation_start: input.operationStart,
    operation_end: input.operationEnd,
    model_version: input.modelVersion,
    human_oversight_level: mapTierToOversight(input.tierName),
  };
}

/**
 * Classify AI Act risk based on autonomy tier and operation scope.
 * Intern with many files = high risk (low trust, broad impact).
 * Senior/Principal = minimal risk (established trust).
 */
function classifyRisk(
  tier: string,
  fileCount: number,
): AIActRiskClass {
  if (tier === "intern" && fileCount > 5) return "high";
  if (tier === "intern") return "limited";
  if (tier === "junior") return "limited";
  if (tier === "senior") return "minimal";
  if (tier === "principal") return "minimal";
  return "limited"; // default for unknown tiers
}

/**
 * Map autonomy tier to Article 14 human oversight level.
 */
function mapTierToOversight(
  tier: string,
): "none" | "informed" | "approval_required" | "manual_override" {
  const map: Record<string, "none" | "informed" | "approval_required" | "manual_override"> = {
    intern: "manual_override",
    junior: "approval_required",
    senior: "informed",
    principal: "none",
  };
  return map[tier] ?? "manual_override";
}

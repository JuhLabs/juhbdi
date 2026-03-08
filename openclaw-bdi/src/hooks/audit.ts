import { appendTrailEntry } from "../core/trail.js";
import { updateTrustRecord, createDefaultTrustRecord } from "../core/trust.js";
import { extractKeywords, findRelated } from "../core/memory.js";
import type { ExperienceTriplet, TrustStore } from "../core/schemas.js";

export interface AgentRunResult {
  success: boolean;
  model_id: string;
  task_description: string;
  approach: string;
  duration_ms: number;
  files_modified?: string[];
  domain_tags?: string[];
  error_message?: string;
}

export interface AuditResult {
  trail_entry_hash: string;
  trust_updated: boolean;
  memory_recorded: boolean;
  new_trust_score?: number;
}

export async function auditAgentRun(
  run: AgentRunResult,
  trailPath: string,
  trustStore: TrustStore,
  existingMemories: ExperienceTriplet[]
): Promise<{ audit: AuditResult; updatedTrust: TrustStore; newMemory: ExperienceTriplet | null }> {
  // 1. Log trail entry
  const entry = await appendTrailEntry(trailPath, {
    event_type: "decision",
    description: `Agent run: ${run.task_description}`,
    reasoning: `Approach: ${run.approach}. Model: ${run.model_id}. Duration: ${run.duration_ms}ms. Result: ${run.success ? "pass" : "fail"}.${run.error_message ? ` Error: ${run.error_message}` : ""}`,
    alternatives_considered: [],
    constraint_refs: [],
    outcome: run.success ? "approved" : "rejected",
    risk_level: "low",
  });

  // 2. Update trust
  const record = trustStore.records[run.model_id] ?? createDefaultTrustRecord(run.model_id);
  const updated = updateTrustRecord(record, {
    passed: run.success,
    strikes: run.success ? 0 : 1,
    violation: false,
  });

  const updatedTrust: TrustStore = {
    ...trustStore,
    records: { ...trustStore.records, [run.model_id]: updated },
  };

  // 3. Record memory
  const triplet: ExperienceTriplet = {
    id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    intent: {
      goal_refs: [],
      task_description: run.task_description,
      domain_tags: run.domain_tags ?? [],
    },
    experience: {
      approach: run.approach,
      files_modified: run.files_modified ?? [],
      test_result: run.success ? "pass" : "fail",
      strikes_used: run.success ? 0 : 1,
      banned_approaches: [],
      model_tier: run.model_id,
    },
    utility: run.success ? 0.7 : 0.3,
    keywords: [],
    related_memories: [],
  };

  // Extract keywords and cross-link
  triplet.keywords = extractKeywords(triplet);
  triplet.related_memories = findRelated(triplet, existingMemories);

  const { computeTrustScore } = await import("../core/trust.js");
  const newScore = computeTrustScore(updated);

  return {
    audit: {
      trail_entry_hash: entry.entry_hash ?? "",
      trust_updated: true,
      memory_recorded: true,
      new_trust_score: Math.round(newScore * 100) / 100,
    },
    updatedTrust,
    newMemory: triplet,
  };
}

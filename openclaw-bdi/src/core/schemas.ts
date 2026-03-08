import { z } from "zod";

// ── Decision Trail ──────────────────────────────────────────

export const DecisionTrailEntrySchema = z.object({
  timestamp: z.string().datetime(),
  event_type: z.enum(["decision", "conflict", "override", "recovery", "command", "routing"]),
  task_id: z.string().optional(),
  wave_id: z.string().optional(),
  description: z.string().min(1),
  reasoning: z.string(),
  alternatives_considered: z.array(z.string()),
  constraint_refs: z.array(z.string()),
  outcome: z.enum(["approved", "rejected", "escalated"]),
  prev_hash: z.string().optional(),
  entry_hash: z.string().optional(),
  inputs_hash: z.string().optional(),
  risk_level: z.enum(["low", "medium", "high", "critical"]).optional(),
});

export type DecisionTrailEntry = z.infer<typeof DecisionTrailEntrySchema>;

// ── Memory ──────────────────────────────────────────────────

export const CrossLinkSchema = z.object({
  id: z.string().min(1),
  relation: z.string().min(1),
  strength: z.number().min(0).max(1),
});

export type CrossLink = z.infer<typeof CrossLinkSchema>;

export const ExperienceTripletSchema = z.object({
  id: z.string().min(1),
  timestamp: z.string().datetime(),
  intent: z.object({
    goal_refs: z.array(z.string()),
    task_description: z.string().min(1),
    domain_tags: z.array(z.string()),
  }),
  experience: z.object({
    approach: z.string().min(1),
    files_modified: z.array(z.string()),
    test_result: z.enum(["pass", "fail"]),
    strikes_used: z.number().int().min(0),
    banned_approaches: z.array(z.string()),
    error_category: z.string().optional(),
    model_tier: z.string().optional(),
    optimal_tier: z.string().optional(),
  }),
  utility: z.number().min(0).max(1),
  keywords: z.array(z.string()).default([]),
  related_memories: z.array(CrossLinkSchema).default([]),
});

export type ExperienceTriplet = z.infer<typeof ExperienceTripletSchema>;

export const MemoryBankSchema = z.object({
  version: z.string().default("2.0.0"),
  triplets: z.array(ExperienceTripletSchema),
});

export type MemoryBank = z.infer<typeof MemoryBankSchema>;

// ── Trust ───────────────────────────────────────────────────

export const TrustRecordSchema = z.object({
  agent_tier: z.string(),
  tasks_attempted: z.number().int().min(0),
  tasks_passed: z.number().int().min(0),
  avg_strikes: z.number().min(0),
  violation_count: z.number().int().min(0),
  last_10_outcomes: z.array(z.enum(["pass", "fail"])),
});

export type TrustRecord = z.infer<typeof TrustRecordSchema>;

export const TrustStoreSchema = z.object({
  version: z.literal("1.0.0"),
  records: z.record(z.string(), TrustRecordSchema),
});

export type TrustStore = z.infer<typeof TrustStoreSchema>;

// ── Principles ──────────────────────────────────────────────

export const PrincipleSchema = z.object({
  id: z.string(),
  principle: z.string(),
  source_tasks: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  times_applied: z.number().int().min(0).default(0),
  times_validated: z.number().int().min(0).default(0),
  domain_tags: z.array(z.string()),
  keywords: z.array(z.string()),
  created_at: z.string().datetime(),
});

export type Principle = z.infer<typeof PrincipleSchema>;

export const PrincipleBankSchema = z.object({
  version: z.literal("1.0.0"),
  principles: z.array(PrincipleSchema),
});

export type PrincipleBank = z.infer<typeof PrincipleBankSchema>;

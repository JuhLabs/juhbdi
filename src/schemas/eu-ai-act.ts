import { z } from "zod";

// Risk classification per EU AI Act Annex III
export const AIActRiskClassSchema = z.enum([
  "minimal",       // No obligations
  "limited",       // Transparency obligations only
  "high",          // Full compliance required (Article 12 applies)
  "unacceptable",  // Prohibited
]);

export type AIActRiskClass = z.infer<typeof AIActRiskClassSchema>;

// Article 12 record-keeping extension for decision trail entries
export const Article12FieldsSchema = z.object({
  // Required by Article 12(1) — automatic recording
  ai_act_risk_class: AIActRiskClassSchema.optional(),
  deployer_id: z.string().optional(),         // Organization deploying the AI system
  system_id: z.string().optional(),           // Unique identifier for the AI system instance
  operation_start: z.iso.datetime().optional(), // When this operation started
  operation_end: z.iso.datetime().optional(),   // When this operation ended

  // Required by Article 12(2) — traceability
  input_data_ref: z.string().optional(),      // Reference to input data (hash or path, never raw data)
  output_data_ref: z.string().optional(),     // Reference to output data
  model_version: z.string().optional(),       // Model used for this decision

  // Required by Article 12(3) — retention
  retention_policy: z.enum(["6_months", "1_year", "2_years", "indefinite"]).optional(),

  // Article 14 — human oversight
  human_oversight_level: z.enum(["none", "informed", "approval_required", "manual_override"]).optional(),
  human_reviewer: z.string().optional(),      // Who reviewed (anonymized ID, not PII)

  // NEW: Data origin tracking (Article 12(2))
  data_origin: z.enum(["user_input", "codebase", "external_api", "generated", "cached"]).optional(),

  // NEW: Model fingerprinting (Article 12(1))
  model_fingerprint: z.object({
    provider: z.string(),
    model_id: z.string(),
    version: z.string().optional(),
    capabilities: z.array(z.string()).optional(),
  }).optional(),

  // NEW: Intervention points (Article 14)
  intervention_points: z.array(z.object({
    point_id: z.string(),
    description: z.string(),
    requires_human: z.boolean(),
    triggered: z.boolean(),
  })).optional(),

  // NEW: Stakeholder annotations (Article 12(3))
  stakeholder_annotations: z.array(z.object({
    annotator_id: z.string(),  // anonymized
    annotation: z.string(),
    timestamp: z.iso.datetime(),
  })).optional(),

  // NEW: Immutability proof (Article 12(1))
  immutability_proof: z.object({
    hash_algorithm: z.literal("sha256"),
    entry_hash: z.string(),
    prev_hash: z.string(),
    chain_position: z.number().int().min(0),
  }).optional(),
}).optional();

export type Article12Fields = z.infer<typeof Article12FieldsSchema>;

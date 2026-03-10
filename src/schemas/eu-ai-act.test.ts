import { describe, expect, test } from "bun:test";
import { Article12FieldsSchema, AIActRiskClassSchema } from "./eu-ai-act";
import { z } from "zod";

describe("AIActRiskClassSchema", () => {
  test("accepts valid risk classes", () => {
    expect(AIActRiskClassSchema.parse("minimal")).toBe("minimal");
    expect(AIActRiskClassSchema.parse("limited")).toBe("limited");
    expect(AIActRiskClassSchema.parse("high")).toBe("high");
    expect(AIActRiskClassSchema.parse("unacceptable")).toBe("unacceptable");
  });

  test("rejects invalid risk class", () => {
    expect(() => AIActRiskClassSchema.parse("medium")).toThrow();
    expect(() => AIActRiskClassSchema.parse("")).toThrow();
    expect(() => AIActRiskClassSchema.parse(42)).toThrow();
  });
});

describe("Article12FieldsSchema", () => {
  test("all fields optional — empty object validates", () => {
    const result = Article12FieldsSchema.parse({});
    expect(result).toEqual({});
  });

  test("all fields optional — undefined validates", () => {
    const result = Article12FieldsSchema.parse(undefined);
    expect(result).toBeUndefined();
  });

  test("valid Article12Fields passes validation", () => {
    const fields = {
      ai_act_risk_class: "high",
      deployer_id: "org-acme-corp",
      system_id: "juhbdi-v1.5.0-prod",
      operation_start: "2026-03-09T10:00:00Z",
      operation_end: "2026-03-09T10:05:00Z",
      input_data_ref: "sha256:abc123",
      output_data_ref: "sha256:def456",
      model_version: "claude-opus-4-20250514",
      retention_policy: "2_years",
      human_oversight_level: "approval_required",
      human_reviewer: "reviewer-42",
    };
    const result = Article12FieldsSchema.parse(fields);
    expect(result).toBeDefined();
    expect(result!.ai_act_risk_class).toBe("high");
    expect(result!.deployer_id).toBe("org-acme-corp");
    expect(result!.retention_policy).toBe("2_years");
    expect(result!.human_oversight_level).toBe("approval_required");
  });

  test("invalid retention policy rejected", () => {
    expect(() =>
      Article12FieldsSchema.parse({ retention_policy: "3_years" }),
    ).toThrow();
  });

  test("invalid human oversight level rejected", () => {
    expect(() =>
      Article12FieldsSchema.parse({ human_oversight_level: "auto" }),
    ).toThrow();
  });

  test("schema accepts full compliance record", () => {
    const fullRecord = {
      ai_act_risk_class: "high",
      deployer_id: "deployer-001",
      system_id: "sys-001",
      operation_start: "2026-03-09T08:00:00Z",
      operation_end: "2026-03-09T08:30:00Z",
      input_data_ref: "hash:input",
      output_data_ref: "hash:output",
      model_version: "claude-opus-4-20250514",
      retention_policy: "indefinite",
      human_oversight_level: "manual_override",
      human_reviewer: "admin-1",
    };
    const result = Article12FieldsSchema.parse(fullRecord);
    expect(result).toBeDefined();
    expect(Object.keys(result!).length).toBe(11);
  });

  test("schema round-trips through JSON", () => {
    const original = {
      ai_act_risk_class: "limited" as const,
      deployer_id: "test-org",
      operation_start: "2026-01-01T00:00:00Z",
      retention_policy: "1_year" as const,
      human_oversight_level: "informed" as const,
    };
    const json = JSON.stringify(original);
    const parsed = JSON.parse(json);
    const result = Article12FieldsSchema.parse(parsed);
    expect(result).toBeDefined();
    expect(result!.ai_act_risk_class).toBe("limited");
    expect(result!.retention_policy).toBe("1_year");
  });

  test("partial fields are accepted", () => {
    const partial = {
      ai_act_risk_class: "minimal",
      model_version: "claude-sonnet-4-20250514",
    };
    const result = Article12FieldsSchema.parse(partial);
    expect(result).toBeDefined();
    expect(result!.ai_act_risk_class).toBe("minimal");
    expect(result!.deployer_id).toBeUndefined();
  });

  // M17: New fields
  test("data_origin accepts valid values", () => {
    for (const origin of ["user_input", "codebase", "external_api", "generated", "cached"] as const) {
      const result = Article12FieldsSchema.parse({ data_origin: origin });
      expect(result!.data_origin).toBe(origin);
    }
  });

  test("data_origin rejects invalid value", () => {
    expect(() => Article12FieldsSchema.parse({ data_origin: "unknown" })).toThrow();
  });

  test("model_fingerprint accepts valid object", () => {
    const result = Article12FieldsSchema.parse({
      model_fingerprint: {
        provider: "anthropic",
        model_id: "claude-opus-4-20250514",
        version: "4.0",
        capabilities: ["code", "analysis"],
      },
    });
    expect(result!.model_fingerprint!.provider).toBe("anthropic");
    expect(result!.model_fingerprint!.capabilities).toEqual(["code", "analysis"]);
  });

  test("model_fingerprint requires provider and model_id", () => {
    expect(() => Article12FieldsSchema.parse({
      model_fingerprint: { provider: "anthropic" },
    })).toThrow();
  });

  test("intervention_points accepts array of points", () => {
    const result = Article12FieldsSchema.parse({
      intervention_points: [
        { point_id: "hitl-1", description: "HITL gate", requires_human: true, triggered: false },
        { point_id: "review-1", description: "Code review", requires_human: false, triggered: true },
      ],
    });
    expect(result!.intervention_points).toHaveLength(2);
    expect(result!.intervention_points![0].point_id).toBe("hitl-1");
  });

  test("stakeholder_annotations accepts annotated entries", () => {
    const result = Article12FieldsSchema.parse({
      stakeholder_annotations: [
        { annotator_id: "reviewer-42", annotation: "Approved", timestamp: "2026-03-10T10:00:00Z" },
      ],
    });
    expect(result!.stakeholder_annotations).toHaveLength(1);
    expect(result!.stakeholder_annotations![0].annotator_id).toBe("reviewer-42");
  });

  test("immutability_proof accepts valid hash chain entry", () => {
    const result = Article12FieldsSchema.parse({
      immutability_proof: {
        hash_algorithm: "sha256",
        entry_hash: "abc123def456",
        prev_hash: "000000genesis",
        chain_position: 0,
      },
    });
    expect(result!.immutability_proof!.hash_algorithm).toBe("sha256");
    expect(result!.immutability_proof!.chain_position).toBe(0);
  });

  test("immutability_proof rejects non-sha256 algorithm", () => {
    expect(() => Article12FieldsSchema.parse({
      immutability_proof: {
        hash_algorithm: "md5",
        entry_hash: "abc",
        prev_hash: "def",
        chain_position: 0,
      },
    })).toThrow();
  });

  test("full record with all new fields validates", () => {
    const fullRecord = {
      ai_act_risk_class: "high",
      deployer_id: "org-001",
      system_id: "sys-001",
      operation_start: "2026-03-10T08:00:00Z",
      operation_end: "2026-03-10T08:30:00Z",
      input_data_ref: "hash:input",
      output_data_ref: "hash:output",
      model_version: "claude-opus-4-20250514",
      retention_policy: "2_years",
      human_oversight_level: "approval_required",
      human_reviewer: "admin-1",
      data_origin: "codebase",
      model_fingerprint: { provider: "anthropic", model_id: "claude-opus-4-20250514" },
      intervention_points: [{ point_id: "p1", description: "Gate", requires_human: true, triggered: false }],
      stakeholder_annotations: [{ annotator_id: "r1", annotation: "OK", timestamp: "2026-03-10T09:00:00Z" }],
      immutability_proof: { hash_algorithm: "sha256", entry_hash: "a1b2", prev_hash: "0000", chain_position: 5 },
    };
    const result = Article12FieldsSchema.parse(fullRecord);
    expect(result).toBeDefined();
    expect(Object.keys(result!).length).toBe(16);
  });
});

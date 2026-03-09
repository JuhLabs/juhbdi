import { describe, expect, test } from "bun:test";
import { checkGovernance, checkGovernanceWithTrust } from "./governance";
import type { TrustRecord } from "../routing/trust";

describe("checkGovernance", () => {
  test("allows normal file write", () => {
    const result = checkGovernance({
      action: "write_file",
      target: "src/auth/middleware.ts",
      task_id: "t1",
      intent_scope: ["g1"],
    });
    expect(result.allowed).toBe(true);
    expect(result.risk_level).toBe("low");
  });

  test("blocks credential patterns", () => {
    const result = checkGovernance({
      action: "write_file",
      target: "src/config.ts",
      task_id: "t1",
      intent_scope: ["g1"],
      content: 'const API_KEY = "sk-abc123def456"',
    });
    expect(result.allowed).toBe(false);
    expect(result.violations).toContain("Credential pattern detected in file content");
  });

  test("flags test modification as high risk", () => {
    const result = checkGovernance({
      action: "modify_test",
      target: "src/auth/auth.test.ts",
      task_id: "t1",
      intent_scope: ["g1"],
    });
    expect(result.risk_level).toBe("high");
    expect(result.requires_approval).toBe(true);
  });

  test("blocks destructive commands", () => {
    const result = checkGovernance({
      action: "run_command",
      target: "rm -rf /",
      task_id: "t1",
      intent_scope: ["g1"],
    });
    expect(result.allowed).toBe(false);
  });

  test("blocks git push --force", () => {
    const result = checkGovernance({
      action: "run_command",
      target: "git push --force origin main",
      task_id: "t1",
      intent_scope: ["g1"],
    });
    expect(result.allowed).toBe(false);
  });

  test("flags large file writes", () => {
    const bigContent = "x\n".repeat(600);
    const result = checkGovernance({
      action: "write_file",
      target: "src/generated.ts",
      task_id: "t1",
      intent_scope: ["g1"],
      content: bigContent,
    });
    expect(result.risk_level).toBe("high");
    expect(result.requires_approval).toBe(true);
  });

  test("allows normal commands", () => {
    const result = checkGovernance({
      action: "run_command",
      target: "bun test src/auth.test.ts",
      task_id: "t1",
      intent_scope: ["g1"],
    });
    expect(result.allowed).toBe(true);
  });
});

describe("checkGovernanceWithTrust", () => {
  const makeRecord = (overrides: Partial<TrustRecord> = {}): TrustRecord => ({
    agent_tier: "sonnet",
    tasks_attempted: 10,
    tasks_passed: 9,
    avg_strikes: 0.5,
    violation_count: 0,
    last_10_outcomes: ["pass", "pass", "pass", "pass", "pass", "pass", "pass", "pass", "pass", "fail"],
    ...overrides,
  });

  const baseCheck = {
    action: "write_file" as const,
    target: "src/foo.ts",
    task_id: "t1",
    intent_scope: ["g1"],
  };

  test("returns same result as checkGovernance when no trust record", () => {
    const base = checkGovernance(baseCheck);
    const enhanced = checkGovernanceWithTrust(baseCheck);
    expect(enhanced).toEqual(base);
  });

  test("prohibited action at intern tier overrides base allowed", () => {
    // Intern: trust ~0.2, deploy is prohibited
    const internRecord = makeRecord({ tasks_attempted: 10, tasks_passed: 2, avg_strikes: 2, violation_count: 3 });
    const result = checkGovernanceWithTrust(
      { action: "delete_file", target: "src/old.ts", task_id: "t1", intent_scope: ["g1"] },
      internRecord,
    );
    expect(result.allowed).toBe(false);
    expect(result.violations.some((v: string) => v.includes("prohibited at intern"))).toBe(true);
  });

  test("requires_approval at tier sets flag", () => {
    // Intern: write_files requires approval
    const internRecord = makeRecord({ tasks_attempted: 10, tasks_passed: 2, avg_strikes: 2, violation_count: 3 });
    const result = checkGovernanceWithTrust(baseCheck, internRecord);
    expect(result.requires_approval).toBe(true);
  });

  test("allowed action at senior tier returns base result", () => {
    // Senior: write_files is allowed
    const seniorRecord = makeRecord({ tasks_attempted: 20, tasks_passed: 18, avg_strikes: 0.3, violation_count: 0 });
    const base = checkGovernance(baseCheck);
    const result = checkGovernanceWithTrust(baseCheck, seniorRecord);
    expect(result.allowed).toBe(base.allowed);
    expect(result.requires_approval).toBe(base.requires_approval);
  });
});

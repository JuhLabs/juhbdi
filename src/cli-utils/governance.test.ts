import { describe, expect, test } from "bun:test";
import { checkGovernance } from "./governance";

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

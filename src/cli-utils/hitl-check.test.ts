import { describe, expect, test } from "bun:test";
import { matchHITLGates } from "./hitl-check";

describe("matchHITLGates", () => {
  const gates = [
    { action_pattern: "db:schema:*", approval_required: true },
    { action_pattern: "deploy:*", approval_required: true },
    { action_pattern: "config:security:*", approval_required: true },
  ];

  test("matches db:schema: pattern", () => {
    const result = matchHITLGates("db:schema:alter users table", gates);
    expect(result.requires_approval).toBe(true);
    expect(result.matching_gates).toContain("db:schema:*");
  });

  test("matches deploy: pattern", () => {
    const result = matchHITLGates("deploy:production release v2", gates);
    expect(result.requires_approval).toBe(true);
    expect(result.matching_gates).toContain("deploy:*");
  });

  test("does not match unrelated task", () => {
    const result = matchHITLGates("implement user authentication module", gates);
    expect(result.requires_approval).toBe(false);
    expect(result.matching_gates).toHaveLength(0);
  });

  test("returns empty for no gates", () => {
    const result = matchHITLGates("db:schema:alter", []);
    expect(result.requires_approval).toBe(false);
  });

  test("matches multiple gates", () => {
    const result = matchHITLGates("db:schema:deploy:production", gates);
    expect(result.matching_gates.length).toBeGreaterThanOrEqual(1);
  });

  test("case insensitive matching", () => {
    const result = matchHITLGates("DB:SCHEMA:ALTER users table", gates);
    expect(result.requires_approval).toBe(true);
  });

  test("skips gates where approval_required is false", () => {
    const mixedGates = [
      { action_pattern: "db:schema:*", approval_required: true },
      { action_pattern: "log:*", approval_required: false },
    ];
    const result = matchHITLGates("log:info something", mixedGates);
    expect(result.requires_approval).toBe(false);
    expect(result.matching_gates).toHaveLength(0);
  });

  test("provides reason string when gates match", () => {
    const result = matchHITLGates("db:schema:alter users table", gates);
    expect(result.reason).toContain("db:schema:*");
    expect(result.reason).toContain("Human approval required");
  });

  test("provides empty reason when no gates match", () => {
    const result = matchHITLGates("implement something", gates);
    expect(result.reason).toBe("");
  });

  test("matches multiple overlapping patterns", () => {
    const result = matchHITLGates("db:schema:deploy:production release", gates);
    expect(result.matching_gates).toContain("db:schema:*");
    expect(result.matching_gates).toContain("deploy:*");
    expect(result.matching_gates.length).toBe(2);
  });

  test("exact pattern match without glob", () => {
    const exactGates = [
      { action_pattern: "shutdown", approval_required: true },
    ];
    const result = matchHITLGates("shutdown the system", exactGates);
    expect(result.requires_approval).toBe(true);
    expect(result.matching_gates).toContain("shutdown");
  });

  test("catch-all '*' pattern matches any task description", () => {
    const catchAllGates = [
      { action_pattern: "*", approval_required: true },
    ];
    const result = matchHITLGates("any random task description", catchAllGates);
    expect(result.requires_approval).toBe(true);
    expect(result.matching_gates).toContain("*");
  });
});

import { describe, expect, test } from "bun:test";
import { quickGovernanceCheck } from "./govern";

describe("quickGovernanceCheck", () => {
  test("approves normal task descriptions", () => {
    const result = quickGovernanceCheck("Fix the login bug in auth.ts");
    expect(result.allowed).toBe(true);
    expect(result.violations).toEqual([]);
  });

  test("blocks task descriptions with credential patterns", () => {
    const result = quickGovernanceCheck('Set API_KEY = "sk-abc123def456ghi789"');
    expect(result.allowed).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  test("blocks task descriptions requesting destructive operations", () => {
    const result = quickGovernanceCheck("Run rm -rf / to clean up the project");
    expect(result.allowed).toBe(false);
  });

  test("warns about database operations", () => {
    const result = quickGovernanceCheck("Drop table users and recreate it");
    expect(result.allowed).toBe(false);
  });

  test("approves code modification tasks", () => {
    const result = quickGovernanceCheck("Refactor the user service to use dependency injection");
    expect(result.allowed).toBe(true);
  });
});

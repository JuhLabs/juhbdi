import { describe, expect, test } from "bun:test";
import {
  buildCriticPrompt,
  synthesizeDebate,
  DEFAULT_CRITICS,
  type FailureContext,
  type CriticAnalysis,
} from "./multi-persona-reflect";

const sampleFailure: FailureContext = {
  task_description: "Add user authentication to API",
  approach_taken: "Used JWT tokens with bcrypt hashing",
  error_summary: "Token validation fails on expired tokens",
  files_modified: ["src/auth.ts", "src/middleware.ts"],
  test_output: "FAIL: Expected 401 but got 500",
};

describe("multi-persona-reflect", () => {
  test("builds critic prompt with failure context", () => {
    const prompt = buildCriticPrompt(DEFAULT_CRITICS[0], sampleFailure);
    expect(prompt).toContain(DEFAULT_CRITICS[0].prompt_prefix);
    expect(prompt).toContain("Add user authentication to API");
    expect(prompt).toContain("JWT tokens with bcrypt hashing");
    expect(prompt).toContain("Token validation fails on expired tokens");
    expect(prompt).toContain("src/auth.ts, src/middleware.ts");
    expect(prompt).toContain("FAIL: Expected 401 but got 500");
    expect(prompt).toContain("ROOT_CAUSE:");
    expect(prompt).toContain("FIX:");
    expect(prompt).toContain("CONFIDENCE:");
    // No DISAGREES_WITH without previous analyses
    expect(prompt).not.toContain("DISAGREES_WITH:");
  });

  test("includes previous analyses in follow-up prompt", () => {
    const previousAnalyses: CriticAnalysis[] = [
      {
        persona: "Architect",
        root_cause: "Token expiry not handled in middleware",
        suggested_fix: "Add expiry check before validation",
        confidence: 0.8,
      },
    ];
    const prompt = buildCriticPrompt(DEFAULT_CRITICS[1], sampleFailure, previousAnalyses);
    expect(prompt).toContain("Previous analyses from other critics:");
    expect(prompt).toContain("Architect");
    expect(prompt).toContain("Token expiry not handled in middleware");
    expect(prompt).toContain("Do you agree or disagree?");
    expect(prompt).toContain("DISAGREES_WITH:");
  });

  test("synthesizes consensus when critics agree", () => {
    const analyses: CriticAnalysis[] = [
      {
        persona: "Architect",
        root_cause: "Missing expiry check in token validation",
        suggested_fix: "Add expiry check before validation",
        confidence: 0.8,
      },
      {
        persona: "Debugger",
        root_cause: "Token expiry not validated before use",
        suggested_fix: "Check token.exp before processing",
        confidence: 0.9,
      },
      {
        persona: "Pragmatist",
        root_cause: "No expiry handling in validation logic",
        suggested_fix: "Add early return on expired token",
        confidence: 0.7,
      },
    ];
    const result = synthesizeDebate(analyses);
    // All share "expiry" / "token" / "validation" keywords
    expect(result.consensus).toBe(true);
    expect(result.agreed_root_cause).toBeTruthy();
    expect(result.agreed_fix).toBeTruthy();
    expect(result.synthesized_lesson).toContain("Root cause:");
  });

  test("handles disagreement without consensus", () => {
    const analyses: CriticAnalysis[] = [
      {
        persona: "Architect",
        root_cause: "Database connection pool exhausted",
        suggested_fix: "Increase pool size",
        confidence: 0.6,
      },
      {
        persona: "Debugger",
        root_cause: "Race condition in async handler",
        suggested_fix: "Add mutex lock",
        confidence: 0.9,
        disagrees_with: "Architect",
      },
    ];
    const result = synthesizeDebate(analyses);
    expect(result.consensus).toBe(false);
    expect(result.agreed_root_cause).toBeUndefined();
    expect(result.agreed_fix).toBeUndefined();
    expect(result.synthesized_lesson).toContain("no consensus");
    // Should lead with highest confidence (Debugger at 0.9)
    expect(result.synthesized_lesson).toContain("Debugger");
  });

  test("weights by confidence in synthesis", () => {
    const analyses: CriticAnalysis[] = [
      {
        persona: "Low",
        root_cause: "Database timeout from pool exhaustion",
        suggested_fix: "Increase connection pool size",
        confidence: 0.2,
      },
      {
        persona: "High",
        root_cause: "Race condition in async middleware",
        suggested_fix: "Add mutex lock around critical section",
        confidence: 0.95,
        disagrees_with: "Low",
      },
    ];
    const result = synthesizeDebate(analyses);
    // No consensus (different root causes), highest confidence wins
    expect(result.consensus).toBe(false);
    expect(result.synthesized_lesson).toContain("High");
    expect(result.synthesized_lesson).toContain("95% confident");
  });

  test("default critics cover architecture, debugging, pragmatism", () => {
    expect(DEFAULT_CRITICS.length).toBe(3);
    const names = DEFAULT_CRITICS.map((c) => c.name);
    expect(names).toContain("Architect");
    expect(names).toContain("Debugger");
    expect(names).toContain("Pragmatist");

    // Each has unique perspective
    const perspectives = DEFAULT_CRITICS.map((c) => c.perspective);
    expect(new Set(perspectives).size).toBe(3);

    // Each has a prompt prefix
    for (const critic of DEFAULT_CRITICS) {
      expect(critic.prompt_prefix.length).toBeGreaterThan(20);
    }
  });
});

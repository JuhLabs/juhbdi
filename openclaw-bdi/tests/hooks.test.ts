import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildGovernanceInjection } from "../src/hooks/governance.js";
import type { ExperienceTriplet, Principle } from "../src/core/schemas.js";

describe("governance hook", () => {
  it("returns base rules for safe messages", () => {
    const result = buildGovernanceInjection("hello world", [], []);
    assert.ok(result.rules_text.includes("BDI Governance"));
    assert.equal(result.flags_raised, 0);
    assert.equal(result.memory_context, "");
    assert.equal(result.principle_context, "");
  });

  it("raises flags for destructive messages", () => {
    const result = buildGovernanceInjection("delete all files from the database", [], []);
    assert.ok(result.flags_raised > 0);
    assert.ok(result.rules_text.includes("Active Governance Flags"));
  });

  it("includes relevant memories in context", () => {
    const triplets: ExperienceTriplet[] = [
      {
        id: "m1",
        timestamp: "2026-03-01T00:00:00Z",
        intent: {
          goal_refs: [],
          task_description: "Build authentication API",
          domain_tags: ["auth", "api"],
        },
        experience: {
          approach: "JWT with refresh tokens",
          files_modified: ["src/auth.ts"],
          test_result: "pass",
          strikes_used: 0,
          banned_approaches: [],
        },
        utility: 0.9,
        keywords: ["auth", "api", "jwt", "authentication"],
        related_memories: [],
      },
    ];

    const result = buildGovernanceInjection("build authentication system", triplets, []);
    assert.ok(result.memory_context.includes("authentication"));
  });

  it("includes matching principles", () => {
    const principles: Principle[] = [
      {
        id: "p1",
        principle: "Always validate auth tokens before processing requests",
        source_tasks: ["t1"],
        confidence: 0.8,
        times_applied: 3,
        times_validated: 5,
        domain_tags: ["auth"],
        keywords: ["authentication", "validate", "tokens", "requests"],
        created_at: "2026-03-01T00:00:00Z",
      },
    ];

    const result = buildGovernanceInjection("implement authentication validation", [], principles);
    assert.ok(result.principle_context.includes("validate"));
  });
});

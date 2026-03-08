import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { verifyIntent } from "../src/tools/verify-intent.js";
import { recall } from "../src/tools/recall.js";
import { reflectOnOutcomes } from "../src/tools/reflect.js";
import { assess } from "../src/tools/assess.js";
import type { ExperienceTriplet, TrustStore } from "../src/core/schemas.js";

// ── verify-intent ───────────────────────────────────────────

describe("bdi_verify_intent", () => {
  it("returns low risk for safe messages", () => {
    const result = verifyIntent({ message: "add a comment to the header component" });
    assert.equal(result.risk_level, "low");
    assert.equal(result.should_proceed, true);
    assert.equal(result.flags.length, 0);
  });

  it("flags destructive actions as high risk or above", () => {
    const result = verifyIntent({ message: "delete all user data from the database" });
    assert.ok(result.risk_level === "high" || result.risk_level === "critical");
    assert.equal(result.should_proceed, false);
    assert.ok(result.flags.some((f) => f.rule_id === "verify-destructive"));
  });

  it("flags credential operations", () => {
    const result = verifyIntent({ message: "update the API key in .env" });
    assert.ok(result.flags.some((f) => f.rule_id === "verify-credentials"));
  });

  it("flags complex tasks for planning", () => {
    const result = verifyIntent({ message: "build a new authentication system with OAuth" });
    assert.ok(result.flags.some((f) => f.rule_id === "verify-complex"));
  });

  it("includes context in analysis", () => {
    const result = verifyIntent({
      message: "deploy it",
      context: "push to production",
    });
    assert.ok(result.flags.length > 0);
  });
});

// ── recall ──────────────────────────────────────────────────

describe("bdi_recall", () => {
  const triplets: ExperienceTriplet[] = [
    {
      id: "t1",
      timestamp: "2026-03-01T00:00:00Z",
      intent: {
        goal_refs: ["g1"],
        task_description: "Build REST API with authentication",
        domain_tags: ["api", "auth"],
      },
      experience: {
        approach: "Express with JWT middleware",
        files_modified: ["src/api/routes.ts", "src/auth/jwt.ts"],
        test_result: "pass",
        strikes_used: 0,
        banned_approaches: [],
      },
      utility: 0.9,
      keywords: ["rest", "api", "auth", "jwt", "express", "middleware"],
      related_memories: [],
    },
    {
      id: "t2",
      timestamp: "2026-03-02T00:00:00Z",
      intent: {
        goal_refs: ["g2"],
        task_description: "Build database migration system",
        domain_tags: ["database"],
      },
      experience: {
        approach: "Raw SQL migrations with version tracking",
        files_modified: ["src/db/migrate.ts"],
        test_result: "fail",
        strikes_used: 2,
        banned_approaches: ["ORM auto-migrations"],
      },
      utility: 0.3,
      keywords: ["database", "migration", "sql"],
      related_memories: [],
    },
  ];

  it("retrieves relevant passing experiences", () => {
    const result = recall({ query: "build an API with authentication" }, triplets, []);
    assert.ok(result.experiences.length > 0);
    assert.equal(result.experiences[0].test_result, "pass");
  });

  it("returns speculation with warnings from failures", () => {
    const result = recall({ query: "build database migration system" }, triplets, []);
    assert.ok(result.speculation !== null);
    assert.ok(result.speculation!.warnings.length > 0);
  });

  it("returns empty for unrelated queries", () => {
    const result = recall({ query: "paint the house blue" }, triplets, []);
    assert.equal(result.experiences.length, 0);
  });

  it("reports total memory count", () => {
    const result = recall({ query: "anything" }, triplets, []);
    assert.equal(result.total_memories, 2);
  });
});

// ── reflect ─────────────────────────────────────────────────

describe("bdi_reflect", () => {
  it("extracts principles from divergent outcomes", () => {
    const { result } = reflectOnOutcomes(
      {
        outcomes: [
          {
            task_id: "task-1",
            planned_approach: "Use ORM with auto-migrations",
            actual_approach: "Raw SQL migrations with version control and rollback support",
            description: "Database schema migration for user table",
            test_passed: true,
          },
        ],
      },
      { version: "1.0.0", principles: [] }
    );
    assert.ok(result.principles_extracted > 0);
    assert.ok(result.principles[0].confidence > 0.5);
  });

  it("skips non-divergent outcomes", () => {
    const { result } = reflectOnOutcomes(
      {
        outcomes: [
          {
            task_id: "task-2",
            planned_approach: "Add unit tests",
            actual_approach: "Add unit tests",
            description: "Write tests for helper module",
            test_passed: true,
          },
        ],
      },
      { version: "1.0.0", principles: [] }
    );
    assert.equal(result.principles_extracted, 0);
  });

  it("skips failed outcomes", () => {
    const { result } = reflectOnOutcomes(
      {
        outcomes: [
          {
            task_id: "task-3",
            planned_approach: "Use approach A",
            actual_approach: "Completely different approach B",
            description: "Some task",
            test_passed: false,
          },
        ],
      },
      { version: "1.0.0", principles: [] }
    );
    assert.equal(result.principles_extracted, 0);
  });
});

// ── assess ──────────────────────────────────────────────────

describe("bdi_assess", () => {
  const emptyTrust: TrustStore = { version: "1.0.0", records: {} };
  const populatedTrust: TrustStore = {
    version: "1.0.0",
    records: {
      "claude-opus": {
        agent_tier: "opus",
        tasks_attempted: 20,
        tasks_passed: 18,
        avg_strikes: 0.3,
        violation_count: 0,
        last_10_outcomes: ["pass", "pass", "pass", "pass", "pass", "pass", "pass", "pass", "fail", "pass"],
      },
    },
  };

  it("estimates low difficulty for simple tasks", () => {
    const result = assess({ description: "fix typo" }, emptyTrust);
    assert.ok(result.difficulty.score < 0.3);
    assert.equal(result.difficulty.label, "trivial");
  });

  it("estimates high difficulty for complex tasks", () => {
    const result = assess(
      {
        description:
          "Build a distributed OAuth2 authentication system with JWT tokens, CORS configuration, " +
          "Redis session caching, PostgreSQL user storage, rate limiting middleware, and Kubernetes deployment",
        affected_file_count: 15,
      },
      emptyTrust
    );
    assert.ok(result.difficulty.score > 0.5);
  });

  it("returns trust score when model_id provided", () => {
    const result = assess(
      { description: "some task", model_id: "claude-opus" },
      populatedTrust
    );
    assert.ok(result.trust !== null);
    assert.ok(result.trust!.score > 0.7);
    assert.equal(result.trust!.tasks_attempted, 20);
  });

  it("returns untested trust for unknown models", () => {
    const result = assess(
      { description: "some task", model_id: "unknown-model" },
      emptyTrust
    );
    assert.ok(result.trust !== null);
    assert.equal(result.trust!.label, "untested");
  });

  it("returns null trust when no model_id", () => {
    const result = assess({ description: "some task" }, emptyTrust);
    assert.equal(result.trust, null);
  });
});

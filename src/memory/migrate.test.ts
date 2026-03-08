// src/memory/migrate.test.ts
import { describe, expect, test } from "bun:test";
import { migrateBank } from "./migrate";

describe("migrateBank", () => {
  test("migrates v1 bank to v2 with keywords and empty links", () => {
    const v1 = {
      version: "1.0.0",
      triplets: [{
        id: "t1",
        timestamp: "2026-03-01T00:00:00.000Z",
        intent: { goal_refs: ["g1"], task_description: "implement auth", domain_tags: ["auth"] },
        experience: { approach: "JWT middleware", files_modified: ["src/auth.ts"], test_result: "pass" as const, strikes_used: 0, banned_approaches: [] },
        utility: 1.0,
      }],
    };
    const v2 = migrateBank(v1);
    expect(v2.version).toBe("2.0.0");
    expect(v2.triplets[0].keywords.length).toBeGreaterThan(0);
    expect(v2.triplets[0].related_memories).toEqual([]);
  });

  test("returns v2 bank unchanged", () => {
    const v2 = {
      version: "2.0.0",
      triplets: [{
        id: "t1",
        timestamp: "2026-03-08T00:00:00.000Z",
        intent: { goal_refs: [], task_description: "test", domain_tags: [] },
        experience: { approach: "done", files_modified: [], test_result: "pass" as const, strikes_used: 0, banned_approaches: [] },
        utility: 0.5,
        keywords: ["test"],
        related_memories: [],
      }],
    };
    const result = migrateBank(v2);
    expect(result).toEqual(v2);
  });

  test("handles empty v1 bank", () => {
    const v1 = { version: "1.0.0", triplets: [] };
    const v2 = migrateBank(v1);
    expect(v2.version).toBe("2.0.0");
    expect(v2.triplets).toEqual([]);
  });

  test("generates cross-links during migration for related triplets", () => {
    const v1 = {
      version: "1.0.0",
      triplets: [
        {
          id: "t1",
          timestamp: "2026-03-01T00:00:00.000Z",
          intent: { goal_refs: [], task_description: "auth login", domain_tags: ["auth"] },
          experience: { approach: "JWT", files_modified: ["src/auth.ts"], test_result: "pass" as const, strikes_used: 0, banned_approaches: [] },
          utility: 1.0,
        },
        {
          id: "t2",
          timestamp: "2026-03-01T01:00:00.000Z",
          intent: { goal_refs: [], task_description: "auth session", domain_tags: ["auth"] },
          experience: { approach: "express-session", files_modified: ["src/auth.ts"], test_result: "pass" as const, strikes_used: 0, banned_approaches: [] },
          utility: 0.9,
        },
      ],
    };
    const v2 = migrateBank(v1);
    expect(v2.triplets[0].related_memories.length).toBeGreaterThan(0);
    expect(v2.triplets[1].related_memories.length).toBeGreaterThan(0);
  });

  test("preserves all v1 fields", () => {
    const v1 = {
      version: "1.0.0",
      triplets: [{
        id: "t1",
        timestamp: "2026-03-01T00:00:00.000Z",
        intent: { goal_refs: ["g1", "g2"], task_description: "complex task", domain_tags: ["backend"] },
        experience: { approach: "microservices", files_modified: ["a.ts", "b.ts"], test_result: "pass" as const, strikes_used: 1, banned_approaches: ["monolith"], model_tier: "sonnet" as const, optimal_tier: "haiku" as const },
        utility: 0.8,
      }],
    };
    const v2 = migrateBank(v1);
    expect(v2.triplets[0].intent.goal_refs).toEqual(["g1", "g2"]);
    expect(v2.triplets[0].experience.model_tier).toBe("sonnet");
    expect(v2.triplets[0].experience.optimal_tier).toBe("haiku");
    expect(v2.triplets[0].experience.banned_approaches).toEqual(["monolith"]);
  });
});

import { describe, expect, test } from "bun:test";
import { generateSessionContext } from "./session-primer";
import type { ExperienceTriplet } from "../schemas/memory";
import type { ExperienceTripletV2 } from "../memory/types";

describe("generateSessionContext", () => {
  test("returns empty context when no memory exists", () => {
    const ctx = generateSessionContext([], "src/auth");
    expect(ctx.memory_summary).toBe("No past experiences recorded.");
    expect(ctx.relevant_experiences).toEqual([]);
  });

  test("surfaces relevant experiences for directory context", () => {
    const triplets: ExperienceTriplet[] = [{
      id: "1",
      timestamp: "2026-03-01T00:00:00.000Z",
      intent: {
        goal_refs: ["g1"],
        task_description: "implement authentication middleware",
        domain_tags: ["auth", "middleware"],
      },
      experience: {
        approach: "JWT + bcrypt",
        files_modified: ["src/auth/middleware.ts"],
        test_result: "pass",
        strikes_used: 0,
        banned_approaches: [],
        model_tier: "sonnet",
      },
      utility: 1.0,
    }];
    const ctx = generateSessionContext(triplets, "src/auth");
    expect(ctx.relevant_experiences.length).toBe(1);
    expect(ctx.memory_summary).toContain("1 past experience");
  });

  test("includes total experience count in summary", () => {
    const triplets: ExperienceTriplet[] = Array.from({ length: 5 }, (_, i) => ({
      id: `t${i}`,
      timestamp: "2026-03-01T00:00:00.000Z",
      intent: { goal_refs: ["g1"], task_description: `task ${i}`, domain_tags: [] },
      experience: {
        approach: "test", files_modified: [], test_result: "pass" as const,
        strikes_used: 0, banned_approaches: [],
      },
      utility: 0.8,
    }));
    const ctx = generateSessionContext(triplets, "src/unrelated");
    expect(ctx.memory_summary).toContain("5 total experiences");
  });

  test("limits relevant experiences to top 3", () => {
    const triplets: ExperienceTriplet[] = Array.from({ length: 10 }, (_, i) => ({
      id: `t${i}`,
      timestamp: "2026-03-01T00:00:00.000Z",
      intent: { goal_refs: ["g1"], task_description: `auth middleware task ${i}`, domain_tags: ["auth"] },
      experience: {
        approach: "test", files_modified: ["src/auth/file.ts"], test_result: "pass" as const,
        strikes_used: 0, banned_approaches: [],
      },
      utility: 0.9,
    }));
    const ctx = generateSessionContext(triplets, "src/auth");
    expect(ctx.relevant_experiences.length).toBeLessThanOrEqual(3);
  });

  test("includes pending_task_count when provided", () => {
    const ctx = generateSessionContext([], "/tmp", { pendingTaskCount: 5 });
    expect(ctx.pending_task_count).toBe(5);
    expect(ctx.memory_summary).toContain("5 pending");
  });

  test("includes top_insight when triplets > 10", () => {
    // Create 12 triplets with "typescript" domain tag
    const manyTriplets: ExperienceTripletV2[] = Array.from({ length: 12 }, (_, i) => ({
      id: `t-${i}`,
      timestamp: "2026-03-08T10:00:00Z",
      intent: {
        goal_refs: ["g-1"],
        task_description: `Task ${i} description`,
        domain_tags: ["typescript"],
      },
      experience: {
        approach: "Used Zod schemas with strict parsing",
        files_modified: [`src/file-${i}.ts`],
        test_result: "pass" as const,
        strikes_used: 0,
        banned_approaches: [],
      },
      utility: 0.8,
      keywords: ["typescript", "zod"],
      related_memories: [],
    }));
    const ctx = generateSessionContext(manyTriplets, "/tmp");
    expect(ctx.top_insight).toBeDefined();
    expect(ctx.top_insight!.length).toBeGreaterThan(0);
  });

  test("no top_insight when triplets <= 10", () => {
    const fewTriplets: ExperienceTripletV2[] = Array.from({ length: 3 }, (_, i) => ({
      id: `t-${i}`,
      timestamp: "2026-03-08T10:00:00Z",
      intent: {
        goal_refs: ["g-1"],
        task_description: `Task ${i}`,
        domain_tags: ["typescript"],
      },
      experience: {
        approach: "Some approach",
        files_modified: [],
        test_result: "pass" as const,
        strikes_used: 0,
        banned_approaches: [],
      },
      utility: 0.8,
      keywords: [],
      related_memories: [],
    }));
    const ctx = generateSessionContext(fewTriplets, "/tmp");
    expect(ctx.top_insight).toBeUndefined();
  });
});

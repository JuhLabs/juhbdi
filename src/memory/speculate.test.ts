import { describe, expect, test } from "bun:test";
import { speculate, type SpeculationResult } from "./speculate";
import type { ExperienceTripletV2 } from "./types";
import type { Principle } from "./principle-types";

function makeTriplet(overrides: Partial<ExperienceTripletV2> = {}): ExperienceTripletV2 {
  return {
    id: "t-1",
    timestamp: "2026-03-08T10:00:00Z",
    intent: {
      goal_refs: ["g-1"],
      task_description: "Create a Zod schema for user data",
      domain_tags: ["typescript", "zod"],
    },
    experience: {
      approach: "Used z.object with z.string and z.number fields",
      files_modified: ["src/schemas/user.ts"],
      test_result: "pass",
      strikes_used: 0,
      banned_approaches: [],
    },
    utility: 0.9,
    keywords: ["zod", "schema", "user", "typescript"],
    related_memories: [],
    ...overrides,
  };
}

describe("speculate", () => {
  test("returns recommended approach for similar task", () => {
    const triplets = [makeTriplet()];
    const result = speculate("Create a Zod schema for product data", triplets, []);
    expect(result).not.toBeNull();
    expect(result!.recommended_approach).toContain("z.object");
    expect(result!.confidence).toBeGreaterThan(0.5);
    expect(result!.source).toBe("memory");
  });

  test("returns null for unrelated task", () => {
    const triplets = [makeTriplet()];
    const result = speculate("Deploy the application to production", triplets, []);
    expect(result).toBeNull();
  });

  test("returns failure warning if past failure matches", () => {
    const failedTriplet = makeTriplet({
      id: "t-fail",
      experience: {
        approach: "Used raw string validation without Zod",
        files_modified: ["src/schemas/user.ts"],
        test_result: "fail",
        strikes_used: 2,
        banned_approaches: ["raw string validation"],
      },
      utility: 0.2,
    });
    const result = speculate("Create a Zod schema for user data", [failedTriplet, makeTriplet()], []);
    expect(result).not.toBeNull();
    expect(result!.warnings.length).toBeGreaterThan(0);
  });

  test("includes matching principles", () => {
    const principles: Principle[] = [{
      id: "p-1",
      principle: "Use z.iso.datetime() not z.string().datetime() in Zod v4",
      source_tasks: ["t-1"],
      confidence: 0.9,
      times_applied: 3,
      times_validated: 2,
      domain_tags: ["typescript", "zod"],
      keywords: ["zod", "datetime", "schema"],
      created_at: "2026-03-08T10:00:00Z",
    }];
    const result = speculate("Create a Zod schema with datetime fields", [], principles);
    expect(result).not.toBeNull();
    expect(result!.principles.length).toBe(1);
    expect(result!.source).toBe("principles");
  });

  test("combines memory and principles when both match", () => {
    const triplets = [makeTriplet()];
    const principles: Principle[] = [{
      id: "p-1",
      principle: "Always validate with Zod parse, not safeParse for required fields",
      source_tasks: ["t-x"],
      confidence: 0.85,
      times_applied: 2,
      times_validated: 2,
      domain_tags: ["zod"],
      keywords: ["zod", "parse", "validate", "schema"],
      created_at: "2026-03-08T10:00:00Z",
    }];
    const result = speculate("Build a Zod schema for order data", triplets, principles);
    expect(result).not.toBeNull();
    expect(result!.recommended_approach).toBeDefined();
    expect(result!.principles.length).toBeGreaterThan(0);
    expect(result!.source).toBe("both");
  });
});

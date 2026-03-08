import { describe, expect, test } from "bun:test";
import { buildTriplet, buildTrailEntry } from "./record";
import type { QuickResult } from "./types";

describe("buildTriplet", () => {
  const result: QuickResult = {
    task_id: "quick-abc",
    status: "passed",
    approach: "Used Zod validation",
    files_modified: ["src/forms/signup.ts"],
    model_tier: "sonnet",
  };

  test("creates valid experience triplet from quick result", () => {
    const triplet = buildTriplet(result, "Add input validation");
    expect(triplet.id).toBe("quick-abc");
    expect(triplet.intent.task_description).toBe("Add input validation");
    expect(triplet.experience.approach).toBe("Used Zod validation");
    expect(triplet.experience.test_result).toBe("pass");
    expect(triplet.experience.model_tier).toBe("sonnet");
    expect(triplet.utility).toBe(1.0);
  });

  test("sets utility to 0 for failed result", () => {
    const failed: QuickResult = { ...result, status: "failed" };
    const triplet = buildTriplet(failed, "Add validation");
    expect(triplet.utility).toBe(0);
    expect(triplet.experience.test_result).toBe("fail");
  });

  test("infers optimal_tier for first-try pass", () => {
    const triplet = buildTriplet(result, "Add validation");
    expect(triplet.experience.optimal_tier).toBe("haiku");
  });
});

describe("buildTrailEntry", () => {
  test("creates trail entry for quick task", () => {
    const entry = buildTrailEntry("quick-abc", "sonnet", "passed", "Add validation");
    expect(entry.event_type).toBe("command");
    expect(entry.description).toContain("quick");
    expect(entry.description).toContain("quick-abc");
    expect(entry.outcome).toBe("approved");
  });

  test("sets outcome to escalated for failed tasks", () => {
    const entry = buildTrailEntry("quick-abc", "sonnet", "failed", "Add validation");
    expect(entry.outcome).toBe("escalated");
  });
});

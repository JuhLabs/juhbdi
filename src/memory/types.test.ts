import { describe, expect, test } from "bun:test";
import { CrossLinkSchema, ExperienceTripletV2Schema, MemoryBankV2Schema } from "./types";

describe("CrossLinkSchema", () => {
  test("parses valid cross-link", () => {
    const link = CrossLinkSchema.parse({ id: "t-abc123", relation: "similar_approach", strength: 0.85 });
    expect(link.id).toBe("t-abc123");
    expect(link.relation).toBe("similar_approach");
    expect(link.strength).toBe(0.85);
  });

  test("rejects empty id", () => {
    expect(() => CrossLinkSchema.parse({ id: "", relation: "same_file", strength: 0.5 })).toThrow();
  });

  test("rejects strength below 0", () => {
    expect(() => CrossLinkSchema.parse({ id: "t1", relation: "related", strength: -0.1 })).toThrow();
  });

  test("rejects strength above 1", () => {
    expect(() => CrossLinkSchema.parse({ id: "t1", relation: "related", strength: 1.5 })).toThrow();
  });
});

describe("ExperienceTripletV2Schema", () => {
  test("parses v2 triplet with keywords and related_memories", () => {
    const triplet = ExperienceTripletV2Schema.parse({
      id: "t1",
      timestamp: "2026-03-08T00:00:00.000Z",
      intent: { goal_refs: ["g1"], task_description: "add auth", domain_tags: ["auth"] },
      experience: { approach: "JWT middleware", files_modified: ["src/auth.ts"], test_result: "pass", strikes_used: 0, banned_approaches: [] },
      utility: 1.0,
      keywords: ["auth", "jwt", "middleware"],
      related_memories: [{ id: "t2", relation: "similar_approach", strength: 0.8 }],
    });
    expect(triplet.keywords).toEqual(["auth", "jwt", "middleware"]);
    expect(triplet.related_memories).toHaveLength(1);
  });

  test("defaults keywords and related_memories to empty arrays", () => {
    const triplet = ExperienceTripletV2Schema.parse({
      id: "t2", timestamp: "2026-03-08T00:00:00.000Z",
      intent: { goal_refs: [], task_description: "test", domain_tags: [] },
      experience: { approach: "direct", files_modified: [], test_result: "pass", strikes_used: 0, banned_approaches: [] },
      utility: 0.5,
    });
    expect(triplet.keywords).toEqual([]);
    expect(triplet.related_memories).toEqual([]);
  });

  test("is backward-compatible with v1 triplets", () => {
    const v1 = {
      id: "legacy1", timestamp: "2026-03-01T00:00:00.000Z",
      intent: { goal_refs: ["g1"], task_description: "old task", domain_tags: ["db"] },
      experience: { approach: "raw sql", files_modified: ["db.ts"], test_result: "pass", strikes_used: 1, banned_approaches: [], model_tier: "sonnet" },
      utility: 0.8,
    };
    const parsed = ExperienceTripletV2Schema.parse(v1);
    expect(parsed.keywords).toEqual([]);
    expect(parsed.related_memories).toEqual([]);
    expect(parsed.experience.model_tier).toBe("sonnet");
  });
});

describe("MemoryBankV2Schema", () => {
  test("parses v2 bank", () => {
    const bank = MemoryBankV2Schema.parse({ version: "2.0.0", triplets: [] });
    expect(bank.version).toBe("2.0.0");
  });

  test("defaults version to 2.0.0", () => {
    const bank = MemoryBankV2Schema.parse({ triplets: [] });
    expect(bank.version).toBe("2.0.0");
  });
});

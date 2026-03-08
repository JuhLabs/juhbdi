import { describe, expect, test } from "bun:test";
import { extractKeywords } from "./keywords";
import type { ExperienceTripletV2 } from "./types";

const makeTriplet = (overrides: Partial<ExperienceTripletV2> & { intent: ExperienceTripletV2["intent"]; experience: ExperienceTripletV2["experience"] }): ExperienceTripletV2 => ({
  id: "t1", timestamp: "2026-03-08T00:00:00.000Z", utility: 1.0, keywords: [], related_memories: [],
  ...overrides,
});

describe("extractKeywords", () => {
  test("extracts from task description", () => {
    const t = makeTriplet({
      intent: { goal_refs: [], task_description: "implement user authentication with JWT tokens", domain_tags: [] },
      experience: { approach: "direct", files_modified: [], test_result: "pass", strikes_used: 0, banned_approaches: [] },
    });
    const kw = extractKeywords(t);
    expect(kw).toContain("authentication");
    expect(kw).toContain("tokens");
  });

  test("extracts from approach", () => {
    const t = makeTriplet({
      intent: { goal_refs: [], task_description: "add auth", domain_tags: [] },
      experience: { approach: "Used jsonwebtoken library with middleware pattern", files_modified: [], test_result: "pass", strikes_used: 0, banned_approaches: [] },
    });
    const kw = extractKeywords(t);
    expect(kw).toContain("jsonwebtoken");
    expect(kw).toContain("middleware");
  });

  test("extracts from file paths", () => {
    const t = makeTriplet({
      intent: { goal_refs: [], task_description: "fix bug", domain_tags: [] },
      experience: { approach: "patched", files_modified: ["src/repomap/graph.ts", "src/schemas/memory.ts"], test_result: "pass", strikes_used: 0, banned_approaches: [] },
    });
    const kw = extractKeywords(t);
    expect(kw).toContain("repomap");
    expect(kw).toContain("graph");
    expect(kw).toContain("memory");
  });

  test("includes domain tags", () => {
    const t = makeTriplet({
      intent: { goal_refs: [], task_description: "task", domain_tags: ["auth", "api"] },
      experience: { approach: "done", files_modified: [], test_result: "pass", strikes_used: 0, banned_approaches: [] },
    });
    const kw = extractKeywords(t);
    expect(kw).toContain("auth");
    expect(kw).toContain("api");
  });

  test("deduplicates and lowercases", () => {
    const t = makeTriplet({
      intent: { goal_refs: [], task_description: "Auth AUTH auth", domain_tags: ["auth"] },
      experience: { approach: "auth module", files_modified: [], test_result: "pass", strikes_used: 0, banned_approaches: [] },
    });
    const kw = extractKeywords(t);
    expect(kw.filter((k) => k === "auth").length).toBe(1);
  });

  test("filters stop words and short words", () => {
    const t = makeTriplet({
      intent: { goal_refs: [], task_description: "the quick brown fox with a hat", domain_tags: [] },
      experience: { approach: "ran it", files_modified: [], test_result: "pass", strikes_used: 0, banned_approaches: [] },
    });
    const kw = extractKeywords(t);
    expect(kw).not.toContain("the");
    expect(kw).not.toContain("with");
  });

  test("limits to max 20 keywords", () => {
    const longDesc = Array.from({ length: 30 }, (_, i) => `keyword${i}`).join(" ");
    const t = makeTriplet({
      intent: { goal_refs: [], task_description: longDesc, domain_tags: [] },
      experience: { approach: "done", files_modified: [], test_result: "pass", strikes_used: 0, banned_approaches: [] },
    });
    expect(extractKeywords(t).length).toBeLessThanOrEqual(20);
  });
});

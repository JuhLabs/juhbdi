// src/memory/retrieve.test.ts
import { describe, expect, test } from "bun:test";
import { retrieveWithContext } from "./retrieve";
import type { ExperienceTripletV2 } from "./types";

const makeV2 = (id: string, desc: string, kw: string[], utility: number, related: Array<{ id: string; relation: string; strength: number }> = []): ExperienceTripletV2 => ({
  id,
  timestamp: "2026-03-08T00:00:00.000Z",
  intent: { goal_refs: [], task_description: desc, domain_tags: [] },
  experience: { approach: "direct", files_modified: [], test_result: "pass", strikes_used: 0, banned_approaches: [] },
  utility,
  keywords: kw,
  related_memories: related,
});

describe("retrieveWithContext", () => {
  test("returns direct matches ranked by relevance", () => {
    const bank = [
      makeV2("t1", "authentication jwt", ["auth", "jwt"], 1.0),
      makeV2("t2", "database pool", ["database", "pool"], 0.9),
    ];
    const results = retrieveWithContext("implement auth jwt", bank, 3);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].id).toBe("t1");
  });

  test("includes 1-hop linked neighbors in results", () => {
    const bank = [
      makeV2("t1", "auth jwt", ["auth", "jwt"], 1.0, [
        { id: "t2", relation: "similar_keywords", strength: 0.8 },
      ]),
      makeV2("t2", "session management", ["session", "auth"], 0.9),
      makeV2("t3", "unrelated db work", ["database"], 0.5),
    ];
    const results = retrieveWithContext("auth jwt", bank, 5);
    const ids = results.map((r) => r.id);
    expect(ids).toContain("t1");
    expect(ids).toContain("t2");
  });

  test("boosts corroborated memories (linked by multiple paths)", () => {
    const bank = [
      makeV2("t1", "auth login", ["auth", "login"], 0.7, [
        { id: "t2", relation: "similar", strength: 0.9 },
        { id: "t3", relation: "shared_files", strength: 0.7 },
      ]),
      makeV2("t2", "auth session", ["auth", "session"], 0.7, [
        { id: "t1", relation: "similar", strength: 0.9 },
      ]),
      makeV2("t3", "auth tokens", ["auth", "tokens"], 0.7, [
        { id: "t1", relation: "shared_files", strength: 0.7 },
      ]),
    ];
    const results = retrieveWithContext("auth", bank, 5);
    expect(results[0].id).toBe("t1");
  });

  test("filters out failed experiences", () => {
    const failed: ExperienceTripletV2 = {
      ...makeV2("t1", "auth", ["auth"], 0.0),
      experience: { approach: "bad", files_modified: [], test_result: "fail", strikes_used: 3, banned_approaches: [] },
    };
    const results = retrieveWithContext("auth", [failed], 3);
    expect(results).toEqual([]);
  });

  test("respects topK limit", () => {
    const bank = Array.from({ length: 10 }, (_, i) =>
      makeV2(`t${i}`, "auth task", ["auth"], 0.9)
    );
    const results = retrieveWithContext("auth", bank, 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  test("returns empty for no matches", () => {
    const bank = [makeV2("t1", "database", ["database"], 1.0)];
    const results = retrieveWithContext("frontend react", bank, 3);
    expect(results).toEqual([]);
  });

  test("handles empty bank", () => {
    const results = retrieveWithContext("anything", [], 3);
    expect(results).toEqual([]);
  });
});

import { describe, expect, test } from "bun:test";
import { extractKnowledge, type CodeFact } from "./knowledge";
import type { RepoMap } from "./types";

function makeMap(): RepoMap {
  return {
    files: [
      { path: "src/core.ts", symbols: [
        { name: "processData", kind: "function", exported: true, line: 10 },
        { name: "validateInput", kind: "function", exported: true, line: 25 },
      ], imports: [{ specifier: "./utils" }], hash: "abc" },
      { path: "src/utils.ts", symbols: [
        { name: "formatDate", kind: "function", exported: true, line: 5 },
      ], imports: [], hash: "def" },
      { path: "src/api.ts", symbols: [
        { name: "handleRequest", kind: "function", exported: true, line: 8 },
      ], imports: [{ specifier: "./core" }, { specifier: "./utils" }], hash: "ghi" },
    ],
    edges: [
      { from_file: "src/core.ts", to_file: "src/utils.ts", identifiers: ["formatDate"], weight: 1 },
      { from_file: "src/api.ts", to_file: "src/core.ts", identifiers: ["processData"], weight: 1 },
      { from_file: "src/api.ts", to_file: "src/utils.ts", identifiers: ["formatDate"], weight: 1 },
    ],
    pagerank: { "src/utils.ts": 0.5, "src/core.ts": 0.35, "src/api.ts": 0.15 },
    generated_at: "2026-03-08T10:00:00Z",
    token_count: 100,
  };
}

describe("extractKnowledge", () => {
  test("returns facts about the repo", () => {
    const facts = extractKnowledge(makeMap());
    expect(facts.length).toBeGreaterThan(0);
    expect(facts.length).toBeLessThanOrEqual(10);
  });

  test("identifies hot paths (high inbound edges)", () => {
    const facts = extractKnowledge(makeMap());
    const hotPath = facts.find((f) => f.type === "hot_path");
    expect(hotPath).toBeDefined();
    expect(hotPath!.subject).toBe("src/utils.ts");
  });

  test("identifies leaf nodes (no dependents)", () => {
    const facts = extractKnowledge(makeMap());
    const leaf = facts.find((f) => f.type === "leaf_node");
    expect(leaf).toBeDefined();
    expect(leaf!.subject).toBe("src/api.ts");
  });

  test("identifies dependency relationships", () => {
    const facts = extractKnowledge(makeMap());
    const dep = facts.find((f) => f.type === "dependency");
    expect(dep).toBeDefined();
  });

  test("returns at most topK facts", () => {
    const facts = extractKnowledge(makeMap(), 2);
    expect(facts.length).toBeLessThanOrEqual(2);
  });

  test("formats facts as readable strings", () => {
    const facts = extractKnowledge(makeMap());
    for (const f of facts) {
      expect(f.description.length).toBeGreaterThan(10);
      expect(typeof f.description).toBe("string");
    }
  });
});

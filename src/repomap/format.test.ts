// src/repomap/format.test.ts
import { describe, expect, test } from "bun:test";
import { estimateTokens, formatRepoMap } from "./format";
import type { RepoMap, FileNode } from "./types";

function makeFile(path: string, symbols: FileNode["symbols"], imports: FileNode["imports"] = []): FileNode {
  return { path, symbols, imports, hash: "h" };
}

function makeMap(files: FileNode[], pagerank: Record<string, number>): RepoMap {
  return {
    files,
    edges: [],
    pagerank,
    generated_at: new Date().toISOString(),
    token_count: 100,
  };
}

describe("estimateTokens", () => {
  test("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  test("estimates tokens as ceil(chars / 4)", () => {
    expect(estimateTokens("abcdefgh")).toBe(2); // 8 / 4 = 2
    expect(estimateTokens("abcde")).toBe(2); // 5 / 4 = 1.25 → 2
    expect(estimateTokens("a")).toBe(1); // 1 / 4 = 0.25 → 1
  });
});

describe("formatRepoMap", () => {
  test("sorts files by PageRank descending", () => {
    const files = [
      makeFile("src/low.ts", [{ name: "low", kind: "function", exported: true, line: 1 }]),
      makeFile("src/high.ts", [{ name: "high", kind: "function", exported: true, line: 1 }]),
      makeFile("src/mid.ts", [{ name: "mid", kind: "function", exported: true, line: 1 }]),
    ];
    const pagerank = { "src/low.ts": 0.1, "src/high.ts": 0.6, "src/mid.ts": 0.3 };
    const map = makeMap(files, pagerank);
    const output = formatRepoMap(map, 4096);
    const lines = output.split("\n").filter((l) => l.endsWith(":"));
    expect(lines[0]).toBe("src/high.ts:");
    expect(lines[1]).toBe("src/mid.ts:");
    expect(lines[2]).toBe("src/low.ts:");
  });

  test("filters to exported symbols only", () => {
    const files = [
      makeFile("src/mixed.ts", [
        { name: "publicFn", kind: "function", exported: true, line: 1 },
        { name: "privateFn", kind: "function", exported: false, line: 5 },
        { name: "PublicClass", kind: "class", exported: true, line: 10 },
      ]),
    ];
    const pagerank = { "src/mixed.ts": 0.5 };
    const map = makeMap(files, pagerank);
    const output = formatRepoMap(map);
    expect(output).toContain("function publicFn");
    expect(output).toContain("class PublicClass");
    expect(output).not.toContain("privateFn");
  });

  test("uses correct kind prefixes", () => {
    const files = [
      makeFile("src/all-kinds.ts", [
        { name: "myFunc", kind: "function", exported: true, line: 1 },
        { name: "MyClass", kind: "class", exported: true, line: 2 },
        { name: "MyInterface", kind: "interface", exported: true, line: 3 },
        { name: "MyType", kind: "type", exported: true, line: 4 },
        { name: "MyEnum", kind: "enum", exported: true, line: 5 },
        { name: "MY_CONST", kind: "variable", exported: true, line: 6 },
      ]),
    ];
    const pagerank = { "src/all-kinds.ts": 0.5 };
    const map = makeMap(files, pagerank);
    const output = formatRepoMap(map, 4096);
    expect(output).toContain("  function myFunc");
    expect(output).toContain("  class MyClass");
    expect(output).toContain("  interface MyInterface");
    expect(output).toContain("  type MyType");
    expect(output).toContain("  enum MyEnum");
    expect(output).toContain("  const MY_CONST");
  });

  test("respects token budget with 20% tolerance", () => {
    // Create many files with lots of symbols to exceed a small budget
    const files: FileNode[] = [];
    const pagerank: Record<string, number> = {};
    for (let i = 0; i < 50; i++) {
      const path = `src/file${String(i).padStart(3, "0")}.ts`;
      files.push(makeFile(path, [
        { name: `exportedFunction${i}`, kind: "function", exported: true, line: 1 },
        { name: `ExportedClass${i}`, kind: "class", exported: true, line: 10 },
      ]));
      pagerank[path] = (50 - i) / 50; // Descending rank
    }
    const map = makeMap(files, pagerank);
    const budget = 64; // Very small budget
    const output = formatRepoMap(map, budget);
    const tokenCount = estimateTokens(output);
    // Should be within budget + 20% tolerance
    expect(tokenCount).toBeLessThanOrEqual(Math.ceil(budget * 1.2));
    // Should include some files but not all
    expect(output.length).toBeGreaterThan(0);
    const fileHeaders = output.split("\n").filter((l) => l.endsWith(":"));
    expect(fileHeaders.length).toBeLessThan(50);
    expect(fileHeaders.length).toBeGreaterThan(0);
  });

  test("returns empty string for empty map", () => {
    const map = makeMap([], {});
    expect(formatRepoMap(map)).toBe("");
  });

  test("returns empty string when no files have exported symbols", () => {
    const files = [
      makeFile("src/private.ts", [
        { name: "helper", kind: "function", exported: false, line: 1 },
      ]),
    ];
    const pagerank = { "src/private.ts": 0.5 };
    const map = makeMap(files, pagerank);
    expect(formatRepoMap(map)).toBe("");
  });
});

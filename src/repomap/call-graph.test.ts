import { describe, test, expect } from "bun:test";
import { buildCallGraph } from "./call-graph";
import { analyzeFile } from "./ast-analyzer";

describe("call-graph", () => {
  test("identifies entry points (uncalled functions)", () => {
    const a = analyzeFile("src/a.ts", `
      export function main() { return process(); }
      function process() { return 1; }
    `);
    const graph = buildCallGraph([a]);
    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(graph.entry_points.length).toBeGreaterThanOrEqual(1);
  });

  test("builds edges for cross-file imports", () => {
    const a = analyzeFile("src/a.ts", `
      export function helper() { return 42; }
    `);
    const b = analyzeFile("src/b.ts", `
      import { helper } from "./a";
      export function main() { return helper(); }
    `);
    const graph = buildCallGraph([a, b]);
    expect(graph.edges.length).toBeGreaterThan(0);
    const edge = graph.edges.find(
      (e) => e.callee.includes("helper") && e.caller.includes("main"),
    );
    expect(edge).toBeDefined();
  });

  test("handles external module imports", () => {
    const a = analyzeFile("src/a.ts", `
      import { z } from "zod";
      export function validate() { return z.string(); }
    `);
    const graph = buildCallGraph([a]);
    const extEdge = graph.edges.find((e) => e.callee.includes("external:"));
    expect(extEdge).toBeDefined();
  });

  test("returns empty graph for empty input", () => {
    const graph = buildCallGraph([]);
    expect(graph.nodes).toHaveLength(0);
    expect(graph.edges).toHaveLength(0);
  });

  test("identifies hot paths (most-called functions)", () => {
    const lib = analyzeFile("src/lib.ts", `
      export function utils() { return 1; }
    `);
    const a = analyzeFile("src/a.ts", `
      import { utils } from "./lib";
      export function foo() { return utils(); }
    `);
    const b = analyzeFile("src/b.ts", `
      import { utils } from "./lib";
      export function bar() { return utils(); }
    `);
    const graph = buildCallGraph([lib, a, b]);
    // utils should be called from both foo and bar
    const utilsEdges = graph.edges.filter((e) => e.callee.includes("utils"));
    expect(utilsEdges.length).toBeGreaterThanOrEqual(2);
  });
});

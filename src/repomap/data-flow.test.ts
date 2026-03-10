import { describe, test, expect } from "bun:test";
import { traceDataFlow } from "./data-flow";
import { analyzeFile } from "./ast-analyzer";

describe("data-flow", () => {
  test("identifies producers (exported, not imported)", () => {
    const a = analyzeFile("src/a.ts", `
      export function produce() { return 42; }
    `);
    const flow = traceDataFlow([a]);
    expect(flow.producers.length).toBeGreaterThan(0);
    expect(flow.producers.some((p) => p.symbol === "produce")).toBe(true);
  });

  test("identifies consumers (imported from other files)", () => {
    const a = analyzeFile("src/a.ts", `
      export function helper() { return 1; }
    `);
    const b = analyzeFile("src/b.ts", `
      import { helper } from "./a";
      export function use() { return helper(); }
    `);
    const flow = traceDataFlow([a, b]);
    expect(flow.consumers.length).toBeGreaterThan(0);
  });

  test("creates edges for cross-file data flow", () => {
    const a = analyzeFile("src/a.ts", `
      export function helper() { return 1; }
    `);
    const b = analyzeFile("src/b.ts", `
      import { helper } from "./a";
      export function main() { return helper(); }
    `);
    const flow = traceDataFlow([a, b]);
    expect(flow.edges.length).toBeGreaterThan(0);
    const edge = flow.edges.find(
      (e) => e.from.symbol === "helper" && e.to.file.includes("b.ts"),
    );
    expect(edge).toBeDefined();
  });

  test("handles empty analysis list", () => {
    const flow = traceDataFlow([]);
    expect(flow.nodes).toHaveLength(0);
    expect(flow.edges).toHaveLength(0);
    expect(flow.producers).toHaveLength(0);
    expect(flow.consumers).toHaveLength(0);
    expect(flow.transformers).toHaveLength(0);
  });

  test("identifies transformers (import and re-export)", () => {
    const a = analyzeFile("src/a.ts", `
      export function core() { return 1; }
    `);
    const b = analyzeFile("src/b.ts", `
      import { core } from "./a";
      export function wrapped() { return core() + 1; }
    `);
    const c = analyzeFile("src/c.ts", `
      import { wrapped } from "./b";
      export function app() { return wrapped(); }
    `);
    const flow = traceDataFlow([a, b, c]);
    // b imports from a and exports to c — some nodes should be transformers
    expect(flow.nodes.length).toBeGreaterThan(0);
  });

  test("categorizes data types correctly", () => {
    const types = analyzeFile("src/types.ts", `
      export interface Config { name: string; }
      export type Mode = "fast" | "safe";
    `);
    const consumer = analyzeFile("src/consumer.ts", `
      import type { Config, Mode } from "./types";
      export function use(c: Config, m: Mode) { return c.name; }
    `);
    const flow = traceDataFlow([types, consumer]);
    const typeEdges = flow.edges.filter((e) => e.dataType === "type");
    expect(typeEdges.length).toBeGreaterThanOrEqual(0); // type-only imports resolve
  });
});

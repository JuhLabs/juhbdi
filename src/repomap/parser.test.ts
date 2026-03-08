import { describe, expect, test } from "bun:test";
import { TypeScriptParser } from "./parser";
import type { FileNode, LanguageParser } from "./types";

describe("TypeScriptParser", () => {
  const parser: LanguageParser = new TypeScriptParser();

  test("exposes correct extensions", () => {
    expect(parser.extensions).toEqual([".ts", ".tsx", ".js", ".jsx"]);
  });

  test("passes file path through to FileNode", () => {
    const node = parser.parse("src/foo/bar.ts", "export const x = 1;");
    expect(node.path).toBe("src/foo/bar.ts");
  });

  test("extracts exported function declarations", () => {
    const src = `export function routeTask(t: Task): ModelRoute { return {} as any; }`;
    const node = parser.parse("router.ts", src);
    const fn = node.symbols.find((s) => s.name === "routeTask");
    expect(fn).toBeDefined();
    expect(fn!.kind).toBe("function");
    expect(fn!.exported).toBe(true);
    expect(fn!.line).toBe(1);
  });

  test("extracts non-exported function declarations", () => {
    const src = `function helper() { return 42; }`;
    const node = parser.parse("util.ts", src);
    const fn = node.symbols.find((s) => s.name === "helper");
    expect(fn).toBeDefined();
    expect(fn!.kind).toBe("function");
    expect(fn!.exported).toBe(false);
  });

  test("extracts class declarations", () => {
    const src = `export class TaskRunner {\n  run() {}\n}`;
    const node = parser.parse("runner.ts", src);
    const cls = node.symbols.find((s) => s.name === "TaskRunner");
    expect(cls).toBeDefined();
    expect(cls!.kind).toBe("class");
    expect(cls!.exported).toBe(true);
  });

  test("extracts interface declarations", () => {
    const src = `export interface Config {\n  debug: boolean;\n}`;
    const node = parser.parse("config.ts", src);
    const iface = node.symbols.find((s) => s.name === "Config");
    expect(iface).toBeDefined();
    expect(iface!.kind).toBe("interface");
    expect(iface!.exported).toBe(true);
  });

  test("extracts type alias declarations", () => {
    const src = `export type ModelTier = "haiku" | "sonnet" | "opus";`;
    const node = parser.parse("types.ts", src);
    const alias = node.symbols.find((s) => s.name === "ModelTier");
    expect(alias).toBeDefined();
    expect(alias!.kind).toBe("type");
    expect(alias!.exported).toBe(true);
  });

  test("extracts enum declarations", () => {
    const src = `export enum Status {\n  Active = "active",\n  Inactive = "inactive",\n}`;
    const node = parser.parse("status.ts", src);
    const en = node.symbols.find((s) => s.name === "Status");
    expect(en).toBeDefined();
    expect(en!.kind).toBe("enum");
    expect(en!.exported).toBe(true);
  });

  test("extracts exported variable declarations", () => {
    const src = `export const DEFAULT_TIMEOUT = 5000;\nconst internal = true;`;
    const node = parser.parse("config.ts", src);
    const exported = node.symbols.find((s) => s.name === "DEFAULT_TIMEOUT");
    expect(exported).toBeDefined();
    expect(exported!.kind).toBe("variable");
    expect(exported!.exported).toBe(true);
    // Non-exported const should not appear as symbol
    const internal = node.symbols.find((s) => s.name === "internal");
    expect(internal).toBeUndefined();
  });

  test("extracts named import declarations", () => {
    const src = `import { routeTask, estimateCost } from "../cli-utils/model-router";\nimport type { ModelTier } from "../schemas/model-route";`;
    const node = parser.parse("consumer.ts", src);
    expect(node.imports.length).toBe(2);
    expect(node.imports[0].specifier).toBe("../cli-utils/model-router");
    expect(node.imports[1].specifier).toBe("../schemas/model-route");
  });

  test("extracts default imports", () => {
    const src = `import chalk from "chalk";`;
    const node = parser.parse("display.ts", src);
    expect(node.imports.length).toBe(1);
    expect(node.imports[0].specifier).toBe("chalk");
  });

  test("extracts re-exports", () => {
    const src = `export { FileNode, Symbol } from "./types";\nexport { buildGraph } from "./graph";`;
    const node = parser.parse("index.ts", src);
    // Re-exports should appear as imports (they reference other files)
    expect(node.imports.length).toBe(2);
    expect(node.imports[0].specifier).toBe("./types");
    expect(node.imports[1].specifier).toBe("./graph");
  });

  test("handles barrel files with multiple re-exports", () => {
    const src = [
      `export { TypeScriptParser } from "./parser";`,
      `export { buildDependencyGraph, computePageRank } from "./graph";`,
      `export type { FileNode, Symbol, RepoMap } from "./types";`,
    ].join("\n");
    const node = parser.parse("src/repomap/index.ts", src);
    expect(node.imports.length).toBe(3);
    expect(node.imports.map((i) => i.specifier).sort()).toEqual(
      ["./graph", "./parser", "./types"]
    );
  });

  test("handles empty files", () => {
    const node = parser.parse("empty.ts", "");
    expect(node.symbols).toEqual([]);
    expect(node.imports).toEqual([]);
    expect(node.hash).toBeTruthy();
  });

  test("handles TSX files", () => {
    const src = `import React from "react";\nexport function App(): JSX.Element {\n  return <div>Hello</div>;\n}`;
    const node = parser.parse("App.tsx", src);
    const app = node.symbols.find((s) => s.name === "App");
    expect(app).toBeDefined();
    expect(app!.kind).toBe("function");
    expect(app!.exported).toBe(true);
    expect(node.imports.length).toBe(1);
  });

  test("generates content-based hash", () => {
    const content = "export const x = 1;";
    const node1 = parser.parse("a.ts", content);
    const node2 = parser.parse("b.ts", content);
    // Same content => same hash regardless of path
    expect(node1.hash).toBe(node2.hash);

    const node3 = parser.parse("a.ts", "export const y = 2;");
    // Different content => different hash
    expect(node1.hash).not.toBe(node3.hash);
  });

  test("reports correct line numbers", () => {
    const src = [
      "// comment",
      "",
      "export function first() {}",
      "",
      "export class Second {}",
    ].join("\n");
    const node = parser.parse("multi.ts", src);
    const first = node.symbols.find((s) => s.name === "first");
    const second = node.symbols.find((s) => s.name === "Second");
    expect(first!.line).toBe(3);
    expect(second!.line).toBe(5);
  });

  test("extracts re_export symbols from named re-exports", () => {
    const src = `export { FileNode, Symbol } from "./types";\nexport { buildGraph } from "./graph";`;
    const node = parser.parse("index.ts", src);
    const reExports = node.symbols.filter((s) => s.kind === "re_export");
    expect(reExports.length).toBe(3);
    expect(reExports.map((s) => s.name).sort()).toEqual(["FileNode", "Symbol", "buildGraph"].sort());
    // All re_exports should be marked as exported
    for (const sym of reExports) {
      expect(sym.exported).toBe(true);
    }
  });

  test("extracts call_ref symbols for calls to imported functions", () => {
    const src = `import { buildGraph } from "./graph";\nconst result = buildGraph(files);`;
    const node = parser.parse("consumer.ts", src);
    const callRefs = node.symbols.filter((s) => s.kind === "call_ref");
    expect(callRefs.length).toBe(1);
    expect(callRefs[0].name).toBe("buildGraph");
    expect(callRefs[0].exported).toBe(false);
    expect(callRefs[0].line).toBe(2);
  });

  test("does not emit call_ref for calls to non-imported functions", () => {
    const src = `function localFn() {}\nlocalFn();`;
    const node = parser.parse("local.ts", src);
    const callRefs = node.symbols.filter((s) => s.kind === "call_ref");
    expect(callRefs.length).toBe(0);
  });

  test("emits call_ref for multiple calls to same imported function", () => {
    const src = `import { validate } from "./validator";\nvalidate(a);\nvalidate(b);`;
    const node = parser.parse("caller.ts", src);
    const callRefs = node.symbols.filter((s) => s.kind === "call_ref");
    expect(callRefs.length).toBe(2);
    expect(callRefs[0].name).toBe("validate");
    expect(callRefs[1].name).toBe("validate");
  });
});

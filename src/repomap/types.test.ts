import { describe, expect, test } from "bun:test";
import {
  SymbolSchema,
  FileNodeSchema,
  DependencyEdgeSchema,
  RepoMapSchema,
} from "./types";

describe("SymbolSchema", () => {
  test("parses valid symbol", () => {
    const sym = SymbolSchema.parse({
      name: "routeTask",
      kind: "function",
      exported: true,
      line: 42,
    });
    expect(sym.name).toBe("routeTask");
    expect(sym.kind).toBe("function");
    expect(sym.exported).toBe(true);
    expect(sym.line).toBe(42);
  });

  test("accepts all symbol kinds", () => {
    const kinds = ["function", "class", "interface", "type", "enum", "variable", "import", "call_ref", "re_export"] as const;
    for (const kind of kinds) {
      const sym = SymbolSchema.parse({ name: "x", kind, exported: false, line: 1 });
      expect(sym.kind).toBe(kind);
    }
  });

  test("rejects empty name", () => {
    expect(() => SymbolSchema.parse({ name: "", kind: "function", exported: true, line: 1 })).toThrow();
  });
});

describe("FileNodeSchema", () => {
  test("parses valid file node", () => {
    const node = FileNodeSchema.parse({
      path: "src/core/trail.ts",
      symbols: [{ name: "appendTrailEntry", kind: "function", exported: true, line: 10 }],
      imports: [{ specifier: "../schemas/decision-trail", resolved: "src/schemas/decision-trail.ts" }],
      hash: "abc123",
    });
    expect(node.path).toBe("src/core/trail.ts");
    expect(node.symbols).toHaveLength(1);
    expect(node.imports).toHaveLength(1);
  });

  test("accepts empty symbols and imports", () => {
    const node = FileNodeSchema.parse({
      path: "src/empty.ts",
      symbols: [],
      imports: [],
      hash: "def456",
    });
    expect(node.symbols).toEqual([]);
  });
});

describe("DependencyEdgeSchema", () => {
  test("parses valid edge", () => {
    const edge = DependencyEdgeSchema.parse({
      from_file: "src/core/trail.ts",
      to_file: "src/schemas/decision-trail.ts",
      identifiers: ["DecisionTrailEntry", "DecisionTrailEntrySchema"],
      weight: 1.0,
      edge_type: "import",
    });
    expect(edge.from_file).not.toBe(edge.to_file);
    expect(edge.identifiers).toHaveLength(2);
    expect(edge.weight).toBe(1.0);
    expect(edge.edge_type).toBe("import");
  });

  test("accepts all edge types", () => {
    const types = ["import", "call", "type_ref", "re_export"] as const;
    for (const edgeType of types) {
      const edge = DependencyEdgeSchema.parse({
        from_file: "a.ts",
        to_file: "b.ts",
        identifiers: ["x"],
        weight: 1.0,
        edge_type: edgeType,
      });
      expect(edge.edge_type).toBe(edgeType);
    }
  });

  test("rejects negative weight", () => {
    expect(() =>
      DependencyEdgeSchema.parse({
        from_file: "a.ts",
        to_file: "b.ts",
        identifiers: ["x"],
        weight: -1,
        edge_type: "import",
      })
    ).toThrow();
  });
});

describe("RepoMapSchema", () => {
  test("parses valid repo map", () => {
    const map = RepoMapSchema.parse({
      files: [{
        path: "src/index.ts",
        symbols: [{ name: "main", kind: "function", exported: true, line: 1 }],
        imports: [],
        hash: "h1",
      }],
      edges: [],
      pagerank: { "src/index.ts": 1.0 },
      generated_at: new Date().toISOString(),
      token_count: 50,
    });
    expect(map.files).toHaveLength(1);
    expect(map.pagerank["src/index.ts"]).toBe(1.0);
  });

  test("accepts empty repo map", () => {
    const map = RepoMapSchema.parse({
      files: [],
      edges: [],
      pagerank: {},
      generated_at: new Date().toISOString(),
      token_count: 0,
    });
    expect(map.files).toEqual([]);
  });
});

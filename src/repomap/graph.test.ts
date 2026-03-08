import { describe, expect, test } from "bun:test";
import { buildDependencyGraph, computePageRank } from "./graph";
import type { FileNode, DependencyEdge } from "./types";

function makeFile(path: string, imports: { specifier: string; resolved?: string }[] = [], symbols: { name: string; kind: "function" | "class" | "interface" | "type" | "enum" | "variable" | "import"; exported: boolean; line: number }[] = []): FileNode {
  return {
    path,
    symbols,
    imports,
    hash: `hash-${path}`,
  };
}

describe("buildDependencyGraph", () => {
  test("builds basic edges between files", () => {
    const files: FileNode[] = [
      makeFile("src/a.ts", [{ specifier: "./b", resolved: "src/b.ts" }], []),
      makeFile("src/b.ts", [], [{ name: "helper", kind: "function", exported: true, line: 1 }]),
    ];
    const edges = buildDependencyGraph(files);
    expect(edges.length).toBe(1);
    expect(edges[0].from_file).toBe("src/a.ts");
    expect(edges[0].to_file).toBe("src/b.ts");
    expect(edges[0].weight).toBeGreaterThan(0);
  });

  test("filters out external imports (not in file map)", () => {
    const files: FileNode[] = [
      makeFile("src/a.ts", [
        { specifier: "chalk" },
        { specifier: "./b", resolved: "src/b.ts" },
        { specifier: "zod" },
      ]),
      makeFile("src/b.ts", []),
    ];
    const edges = buildDependencyGraph(files);
    expect(edges.length).toBe(1);
    expect(edges[0].to_file).toBe("src/b.ts");
  });

  test("applies weight multiplier for long identifier names (>= 8 chars)", () => {
    const files: FileNode[] = [
      makeFile("src/a.ts",
        [{ specifier: "./b", resolved: "src/b.ts" }],
        []
      ),
      makeFile("src/b.ts", [],
        [{ name: "calculateComplexScore", kind: "function", exported: true, line: 1 }]
      ),
    ];
    const edges = buildDependencyGraph(files);
    // Long identifier name multiplies weight by 1.5
    expect(edges[0].weight).toBeGreaterThan(1.0);
    expect(edges[0].identifiers).toContain("calculateComplexScore");
  });

  test("applies weight multiplier for private identifiers (starts with _)", () => {
    const files: FileNode[] = [
      makeFile("src/a.ts",
        [{ specifier: "./b", resolved: "src/b.ts" }],
        []
      ),
      makeFile("src/b.ts", [],
        [{ name: "_internal", kind: "function", exported: true, line: 1 }]
      ),
    ];
    const edges = buildDependencyGraph(files);
    // Private identifier reduces weight by 0.1x
    expect(edges[0].weight).toBeLessThan(1.0);
  });

  test("applies weight multiplier for identifiers defined in many files", () => {
    // Create 6 files all defining "Config"
    const files: FileNode[] = [];
    for (let i = 0; i < 7; i++) {
      files.push(makeFile(
        `src/f${i}.ts`, [],
        [{ name: "Config", kind: "interface", exported: true, line: 1 }]
      ));
    }
    // Add a consumer that imports from f0
    files.push(makeFile(
      "src/consumer.ts",
      [{ specifier: "./f0", resolved: "src/f0.ts" }],
      []
    ));
    const edges = buildDependencyGraph(files);
    const edge = edges.find((e) => e.from_file === "src/consumer.ts");
    expect(edge).toBeDefined();
    // Multi-defined identifier (>5 files) reduces weight by 0.1x
    expect(edge!.weight).toBeLessThan(1.0);
  });

  test("handles circular dependencies gracefully", () => {
    const files: FileNode[] = [
      makeFile("src/a.ts",
        [{ specifier: "./b", resolved: "src/b.ts" }],
        [{ name: "fnA", kind: "function", exported: true, line: 1 }]
      ),
      makeFile("src/b.ts",
        [{ specifier: "./a", resolved: "src/a.ts" }],
        [{ name: "fnB", kind: "function", exported: true, line: 1 }]
      ),
    ];
    const edges = buildDependencyGraph(files);
    expect(edges.length).toBe(2);
    expect(edges.some((e) => e.from_file === "src/a.ts" && e.to_file === "src/b.ts")).toBe(true);
    expect(edges.some((e) => e.from_file === "src/b.ts" && e.to_file === "src/a.ts")).toBe(true);
  });

  test("returns empty edges for empty input", () => {
    const edges = buildDependencyGraph([]);
    expect(edges).toEqual([]);
  });

  test("assigns edge_type 'import' by default", () => {
    const files: FileNode[] = [
      makeFile("src/a.ts", [{ specifier: "./b", resolved: "src/b.ts" }], []),
      makeFile("src/b.ts", [], [{ name: "helper", kind: "function", exported: true, line: 1 }]),
    ];
    const edges = buildDependencyGraph(files);
    expect(edges[0].edge_type).toBe("import");
  });

  test("assigns edge_type 'call' when source has call_ref symbols", () => {
    const files: FileNode[] = [
      makeFile("src/a.ts",
        [{ specifier: "./b", resolved: "src/b.ts" }],
        [{ name: "helper", kind: "call_ref", exported: false, line: 2 }]
      ),
      makeFile("src/b.ts", [],
        [{ name: "helper", kind: "function", exported: true, line: 1 }]
      ),
    ];
    const edges = buildDependencyGraph(files);
    expect(edges[0].edge_type).toBe("call");
  });

  test("assigns edge_type 're_export' when source has re_export symbols", () => {
    const files: FileNode[] = [
      makeFile("src/index.ts",
        [{ specifier: "./b", resolved: "src/b.ts" }],
        [{ name: "helper", kind: "re_export", exported: true, line: 1 }]
      ),
      makeFile("src/b.ts", [],
        [{ name: "helper", kind: "function", exported: true, line: 1 }]
      ),
    ];
    const edges = buildDependencyGraph(files);
    expect(edges[0].edge_type).toBe("re_export");
  });

  test("re_export takes priority over call when both present", () => {
    const files: FileNode[] = [
      makeFile("src/index.ts",
        [{ specifier: "./b", resolved: "src/b.ts" }],
        [
          { name: "helper", kind: "re_export", exported: true, line: 1 },
          { name: "helper", kind: "call_ref", exported: false, line: 2 },
        ]
      ),
      makeFile("src/b.ts", [],
        [{ name: "helper", kind: "function", exported: true, line: 1 }]
      ),
    ];
    const edges = buildDependencyGraph(files);
    expect(edges[0].edge_type).toBe("re_export");
  });
});

describe("computePageRank", () => {
  test("returns equal rank for disconnected files", () => {
    const files: FileNode[] = [
      makeFile("src/a.ts"),
      makeFile("src/b.ts"),
      makeFile("src/c.ts"),
    ];
    const ranks = computePageRank(files, []);
    expect(Object.keys(ranks).length).toBe(3);
    // Disconnected files should all have ~1/3 rank
    const expected = 1 / 3;
    for (const rank of Object.values(ranks)) {
      expect(rank).toBeCloseTo(expected, 2);
    }
  });

  test("hub file gets higher rank than leaf files", () => {
    const hub = makeFile("src/hub.ts", [], [
      { name: "utilA", kind: "function", exported: true, line: 1 },
    ]);
    const leaf1 = makeFile("src/leaf1.ts", [{ specifier: "./hub", resolved: "src/hub.ts" }]);
    const leaf2 = makeFile("src/leaf2.ts", [{ specifier: "./hub", resolved: "src/hub.ts" }]);
    const leaf3 = makeFile("src/leaf3.ts", [{ specifier: "./hub", resolved: "src/hub.ts" }]);

    const files = [hub, leaf1, leaf2, leaf3];
    const edges = buildDependencyGraph(files);
    const ranks = computePageRank(files, edges);

    expect(ranks["src/hub.ts"]).toBeGreaterThan(ranks["src/leaf1.ts"]);
    expect(ranks["src/hub.ts"]).toBeGreaterThan(ranks["src/leaf2.ts"]);
    expect(ranks["src/hub.ts"]).toBeGreaterThan(ranks["src/leaf3.ts"]);
  });

  test("ranks sum approximately to 1.0", () => {
    const files: FileNode[] = [
      makeFile("src/a.ts", [{ specifier: "./b", resolved: "src/b.ts" }]),
      makeFile("src/b.ts", [{ specifier: "./c", resolved: "src/c.ts" }]),
      makeFile("src/c.ts"),
    ];
    const edges = buildDependencyGraph(files);
    const ranks = computePageRank(files, edges);

    const sum = Object.values(ranks).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 4);
  });

  test("personalization boosts specific files", () => {
    const files: FileNode[] = [
      makeFile("src/a.ts"),
      makeFile("src/b.ts"),
      makeFile("src/c.ts"),
    ];
    // Boost src/a.ts via personalization
    const personalization: Record<string, number> = {
      "src/a.ts": 0.8,
      "src/b.ts": 0.1,
      "src/c.ts": 0.1,
    };
    const ranks = computePageRank(files, [], personalization);

    expect(ranks["src/a.ts"]).toBeGreaterThan(ranks["src/b.ts"]);
    expect(ranks["src/a.ts"]).toBeGreaterThan(ranks["src/c.ts"]);
  });

  test("converges with default parameters", () => {
    const files: FileNode[] = [
      makeFile("src/a.ts", [{ specifier: "./b", resolved: "src/b.ts" }]),
      makeFile("src/b.ts", [{ specifier: "./c", resolved: "src/c.ts" }]),
      makeFile("src/c.ts", [{ specifier: "./a", resolved: "src/a.ts" }]),
    ];
    const edges = buildDependencyGraph(files);

    // Run with different iteration counts — should converge
    const ranks20 = computePageRank(files, edges, undefined, 0.85, 20);
    const ranks50 = computePageRank(files, edges, undefined, 0.85, 50);

    for (const path of Object.keys(ranks20)) {
      expect(ranks20[path]).toBeCloseTo(ranks50[path], 4);
    }
  });

  test("returns empty record for empty input", () => {
    const ranks = computePageRank([], []);
    expect(ranks).toEqual({});
  });
});

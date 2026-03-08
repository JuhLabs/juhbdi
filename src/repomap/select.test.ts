// src/repomap/select.test.ts
import { describe, expect, test } from "bun:test";
import { selectRelevantFiles } from "./select";
import type { RepoMap, FileNode, DependencyEdge } from "./types";

function makeFile(path: string, symbols: FileNode["symbols"], imports: FileNode["imports"] = []): FileNode {
  return { path, symbols, imports, hash: "h" };
}

function makeMap(
  files: FileNode[],
  pagerank: Record<string, number>,
  edges: DependencyEdge[] = [],
): RepoMap {
  return {
    files,
    edges,
    pagerank,
    generated_at: new Date().toISOString(),
    token_count: 100,
  };
}

describe("selectRelevantFiles", () => {
  test("ranks files with matching symbol names higher", () => {
    const files = [
      makeFile("src/auth.ts", [
        { name: "authenticate", kind: "function", exported: true, line: 1 },
      ]),
      makeFile("src/format.ts", [
        { name: "formatOutput", kind: "function", exported: true, line: 1 },
      ]),
      makeFile("src/logger.ts", [
        { name: "logMessage", kind: "function", exported: true, line: 1 },
      ]),
    ];
    const pagerank = { "src/auth.ts": 0.33, "src/format.ts": 0.33, "src/logger.ts": 0.34 };
    const map = makeMap(files, pagerank);
    const output = selectRelevantFiles("fix authentication bug", map, 4096);
    // auth.ts should appear first due to symbol match on "authenticate"
    const lines = output.split("\n").filter((l) => l.endsWith(":"));
    expect(lines[0]).toBe("src/auth.ts:");
  });

  test("ranks files with matching path segments", () => {
    const files = [
      makeFile("src/routing/router.ts", [
        { name: "dispatch", kind: "function", exported: true, line: 1 },
      ]),
      makeFile("src/utils/helper.ts", [
        { name: "compute", kind: "function", exported: true, line: 1 },
      ]),
    ];
    const pagerank = { "src/routing/router.ts": 0.5, "src/utils/helper.ts": 0.5 };
    const map = makeMap(files, pagerank);
    const output = selectRelevantFiles("update the router logic", map, 4096);
    const lines = output.split("\n").filter((l) => l.endsWith(":"));
    expect(lines[0]).toBe("src/routing/router.ts:");
  });

  test("boosts dependency neighbors of high-scoring files", () => {
    const files = [
      makeFile("src/auth.ts", [
        { name: "authenticate", kind: "function", exported: true, line: 1 },
      ]),
      makeFile("src/session.ts", [
        { name: "createSession", kind: "function", exported: true, line: 1 },
      ]),
      makeFile("src/logger.ts", [
        { name: "logEvent", kind: "function", exported: true, line: 1 },
      ]),
    ];
    const edges: DependencyEdge[] = [
      { from_file: "src/auth.ts", to_file: "src/session.ts", identifiers: ["createSession"], weight: 1.0, edge_type: "import" },
    ];
    const pagerank = { "src/auth.ts": 0.33, "src/session.ts": 0.33, "src/logger.ts": 0.34 };
    const map = makeMap(files, pagerank, edges);
    const output = selectRelevantFiles("fix authentication", map, 4096);
    const lines = output.split("\n").filter((l) => l.endsWith(":"));
    // session.ts should be boosted as a neighbor of auth.ts (which matches "authentication")
    const sessionIdx = lines.indexOf("src/session.ts:");
    const loggerIdx = lines.indexOf("src/logger.ts:");
    expect(sessionIdx).toBeLessThan(loggerIdx);
  });

  test("respects token budget", () => {
    const files: FileNode[] = [];
    const pagerank: Record<string, number> = {};
    for (let i = 0; i < 30; i++) {
      const path = `src/module${String(i).padStart(3, "0")}.ts`;
      files.push(makeFile(path, [
        { name: `exportedFunc${i}`, kind: "function", exported: true, line: 1 },
        { name: `ExportedClass${i}`, kind: "class", exported: true, line: 10 },
      ]));
      pagerank[path] = (30 - i) / 30;
    }
    const map = makeMap(files, pagerank);
    const budget = 64;
    const output = selectRelevantFiles("add a new feature", map, budget);
    // Should include some but not all files
    const fileHeaders = output.split("\n").filter((l) => l.endsWith(":"));
    expect(fileHeaders.length).toBeGreaterThan(0);
    expect(fileHeaders.length).toBeLessThan(30);
  });

  test("returns empty for empty map", () => {
    const map = makeMap([], {});
    expect(selectRelevantFiles("anything", map)).toBe("");
  });

  test("filters out stopwords from description", () => {
    const files = [
      makeFile("src/auth.ts", [
        { name: "authenticate", kind: "function", exported: true, line: 1 },
      ]),
      makeFile("src/the.ts", [
        { name: "theHelper", kind: "function", exported: true, line: 1 },
      ]),
    ];
    const pagerank = { "src/auth.ts": 0.5, "src/the.ts": 0.5 };
    const map = makeMap(files, pagerank);
    // "the" is a stopword — should not boost "src/the.ts"
    // "authenticate" keyword should match auth.ts symbol
    const output = selectRelevantFiles("the authentication module", map, 4096);
    const lines = output.split("\n").filter((l) => l.endsWith(":"));
    expect(lines[0]).toBe("src/auth.ts:");
  });
});

describe("selectRelevantFiles — multi-hop", () => {
  test("boosts 2-hop neighbors of high-scoring files", () => {
    // Chain: auth → session → db
    // "auth" matches directly. session is 1-hop, db is 2-hop.
    // db should get a boost from being 2 hops away via session.
    const files = [
      makeFile("src/auth.ts", [
        { name: "authenticate", kind: "function", exported: true, line: 1 },
      ]),
      makeFile("src/session.ts", [
        { name: "createSession", kind: "function", exported: true, line: 1 },
      ]),
      makeFile("src/db.ts", [
        { name: "queryDatabase", kind: "function", exported: true, line: 1 },
      ]),
      makeFile("src/unrelated.ts", [
        { name: "unrelatedFunc", kind: "function", exported: true, line: 1 },
      ]),
    ];
    const edges: DependencyEdge[] = [
      { from_file: "src/auth.ts", to_file: "src/session.ts", identifiers: ["createSession"], weight: 1.0, edge_type: "import" },
      { from_file: "src/session.ts", to_file: "src/db.ts", identifiers: ["queryDatabase"], weight: 1.0, edge_type: "import" },
    ];
    const pagerank = {
      "src/auth.ts": 0.25,
      "src/session.ts": 0.25,
      "src/db.ts": 0.25,
      "src/unrelated.ts": 0.25,
    };
    const map = makeMap(files, pagerank, edges);
    const output = selectRelevantFiles("fix authentication", map, 4096);
    const lines = output.split("\n").filter((l) => l.endsWith(":"));

    // db.ts (2-hop) should rank higher than unrelated.ts (no connection)
    const dbIdx = lines.indexOf("src/db.ts:");
    const unrelatedIdx = lines.indexOf("src/unrelated.ts:");
    expect(dbIdx).toBeLessThan(unrelatedIdx);
  });

  test("edge type weights reduce boost for re_export edges", () => {
    // Two 1-hop neighbors: one via "import" edge, one via "re_export" edge.
    // Import edge has weight 1.0, re_export has weight 0.5.
    // The import neighbor should get a stronger boost.
    const files = [
      makeFile("src/auth.ts", [
        { name: "authenticate", kind: "function", exported: true, line: 1 },
      ]),
      makeFile("src/direct-dep.ts", [
        { name: "directHelper", kind: "function", exported: true, line: 1 },
      ]),
      makeFile("src/re-exporter.ts", [
        { name: "reExportHelper", kind: "function", exported: true, line: 1 },
      ]),
    ];
    const edges: DependencyEdge[] = [
      { from_file: "src/auth.ts", to_file: "src/direct-dep.ts", identifiers: ["directHelper"], weight: 1.0, edge_type: "import" },
      { from_file: "src/auth.ts", to_file: "src/re-exporter.ts", identifiers: ["reExportHelper"], weight: 1.0, edge_type: "re_export" },
    ];
    const pagerank = {
      "src/auth.ts": 0.34,
      "src/direct-dep.ts": 0.33,
      "src/re-exporter.ts": 0.33,
    };
    const map = makeMap(files, pagerank, edges);
    const output = selectRelevantFiles("fix authentication", map, 4096);
    const lines = output.split("\n").filter((l) => l.endsWith(":"));

    // direct-dep (import edge, weight 1.0) should rank above re-exporter (re_export edge, weight 0.5)
    const directIdx = lines.indexOf("src/direct-dep.ts:");
    const reExportIdx = lines.indexOf("src/re-exporter.ts:");
    expect(directIdx).toBeLessThan(reExportIdx);
  });

  test("call edges propagate 2-hop boost with call weight", () => {
    // auth → (call) → session → (import) → config
    // config is 2-hop from auth via a call edge then import edge
    const files = [
      makeFile("src/auth.ts", [
        { name: "authenticate", kind: "function", exported: true, line: 1 },
      ]),
      makeFile("src/session.ts", [
        { name: "createSession", kind: "function", exported: true, line: 1 },
      ]),
      makeFile("src/config.ts", [
        { name: "loadConfig", kind: "function", exported: true, line: 1 },
      ]),
      makeFile("src/isolated.ts", [
        { name: "isolatedFunc", kind: "function", exported: true, line: 1 },
      ]),
    ];
    const edges: DependencyEdge[] = [
      { from_file: "src/auth.ts", to_file: "src/session.ts", identifiers: ["createSession"], weight: 1.0, edge_type: "call" },
      { from_file: "src/session.ts", to_file: "src/config.ts", identifiers: ["loadConfig"], weight: 1.0, edge_type: "import" },
    ];
    const pagerank = {
      "src/auth.ts": 0.25,
      "src/session.ts": 0.25,
      "src/config.ts": 0.25,
      "src/isolated.ts": 0.25,
    };
    const map = makeMap(files, pagerank, edges);
    const output = selectRelevantFiles("fix authentication", map, 4096);
    const lines = output.split("\n").filter((l) => l.endsWith(":"));

    // config.ts (2-hop) should rank above isolated.ts (no edges)
    const configIdx = lines.indexOf("src/config.ts:");
    const isolatedIdx = lines.indexOf("src/isolated.ts:");
    expect(configIdx).toBeLessThan(isolatedIdx);
  });

  test("2-hop boost does not back-propagate to origin", () => {
    // auth → session → auth (cycle). The 2-hop from session back to auth
    // should be skipped (origin node).
    const files = [
      makeFile("src/auth.ts", [
        { name: "authenticate", kind: "function", exported: true, line: 1 },
      ]),
      makeFile("src/session.ts", [
        { name: "createSession", kind: "function", exported: true, line: 1 },
      ]),
    ];
    const edges: DependencyEdge[] = [
      { from_file: "src/auth.ts", to_file: "src/session.ts", identifiers: ["createSession"], weight: 1.0, edge_type: "import" },
      { from_file: "src/session.ts", to_file: "src/auth.ts", identifiers: ["authenticate"], weight: 1.0, edge_type: "import" },
    ];
    const pagerank = { "src/auth.ts": 0.5, "src/session.ts": 0.5 };
    const map = makeMap(files, pagerank, edges);

    // Should not crash or produce infinite boosting
    const output = selectRelevantFiles("fix authentication", map, 4096);
    expect(output.length).toBeGreaterThan(0);
    const lines = output.split("\n").filter((l) => l.endsWith(":"));
    expect(lines).toContain("src/auth.ts:");
    expect(lines).toContain("src/session.ts:");
  });
});

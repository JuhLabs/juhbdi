// src/repomap/waves.test.ts
import { describe, test, expect } from "bun:test";
import { estimateAffectedFiles, buildConflictGraph, optimizeWaves } from "./waves";
import type { RepoMap, FileNode, DependencyEdge } from "./types";
import type { Task } from "../schemas/roadmap-intent";

// ── Test Helpers ──

function makeFile(path: string, symbols: string[] = [], imports: string[] = []): FileNode {
  return {
    path,
    symbols: symbols.map((name) => ({ name, kind: "function", exported: true, line: 1 })),
    imports: imports.map((specifier) => ({ specifier })),
    hash: "abc123",
  };
}

function makeEdge(from: string, to: string, ids: string[] = ["dep"]): DependencyEdge {
  return { from_file: from, to_file: to, identifiers: ids, weight: 1, edge_type: "import" };
}

function makeRepoMap(files: FileNode[], edges: DependencyEdge[] = []): RepoMap {
  const pagerank: Record<string, number> = {};
  for (const f of files) pagerank[f.path] = 1 / files.length;
  return { files, edges, pagerank, generated_at: new Date().toISOString(), token_count: 0 };
}

function makeTask(id: string, description: string): Task {
  return {
    id,
    description,
    goal_refs: ["g1"],
    status: "pending",
    verification: { type: "test", command: `bun test ${id}` },
    retry_count: 0,
    model_tier: "auto",
  };
}

// ── estimateAffectedFiles ──

describe("estimateAffectedFiles", () => {
  test("matches keywords against symbol names", () => {
    const repoMap = makeRepoMap([
      makeFile("src/auth/login.ts", ["authenticateUser", "validateToken"]),
      makeFile("src/db/query.ts", ["runQuery", "buildSchema"]),
    ]);

    const task = makeTask("t1", "Authenticate the user with token validation");
    const affected = estimateAffectedFiles(task, repoMap);

    expect(affected).toContain("src/auth/login.ts");
  });

  test("includes 1-hop dependency neighbors of matched files", () => {
    const files = [
      makeFile("src/auth/login.ts", ["authenticateUser"]),
      makeFile("src/auth/session.ts", ["createSession"]),
      makeFile("src/db/query.ts", ["runQuery"]),
    ];
    const edges = [
      makeEdge("src/auth/login.ts", "src/auth/session.ts", ["createSession"]),
    ];
    const repoMap = makeRepoMap(files, edges);

    const task = makeTask("t1", "Authenticate users");
    const affected = estimateAffectedFiles(task, repoMap);

    // login.ts matches directly, session.ts is 1-hop neighbor
    expect(affected).toContain("src/auth/login.ts");
    expect(affected).toContain("src/auth/session.ts");
    // query.ts should not be included (no match, no neighbor)
    expect(affected).not.toContain("src/db/query.ts");
  });

  test("returns empty array when no keywords match", () => {
    const repoMap = makeRepoMap([
      makeFile("src/auth/login.ts", ["authenticateUser"]),
    ]);

    const task = makeTask("t1", "Run the tests");
    const affected = estimateAffectedFiles(task, repoMap);

    expect(affected).toEqual([]);
  });

  test("matches keywords against file paths", () => {
    const repoMap = makeRepoMap([
      makeFile("src/auth/login.ts", []),
      makeFile("src/db/query.ts", []),
    ]);

    const task = makeTask("t1", "Fix the auth login flow");
    const affected = estimateAffectedFiles(task, repoMap);

    expect(affected).toContain("src/auth/login.ts");
  });
});

// ── buildConflictGraph ──

describe("buildConflictGraph", () => {
  test("detects overlapping files between tasks", () => {
    const affected = new Map<string, string[]>([
      ["t1", ["src/auth/login.ts", "src/auth/session.ts"]],
      ["t2", ["src/auth/login.ts", "src/db/query.ts"]],
      ["t3", ["src/ui/render.ts"]],
    ]);

    const conflicts = buildConflictGraph(affected);

    // t1 and t2 share login.ts
    expect(conflicts.get("t1")).toContain("t2");
    expect(conflicts.get("t2")).toContain("t1");
    // t3 has no conflicts
    expect(conflicts.get("t3") ?? []).toEqual([]);
  });

  test("returns empty adjacency for no conflicts", () => {
    const affected = new Map<string, string[]>([
      ["t1", ["src/auth/login.ts"]],
      ["t2", ["src/db/query.ts"]],
    ]);

    const conflicts = buildConflictGraph(affected);

    expect(conflicts.get("t1") ?? []).toEqual([]);
    expect(conflicts.get("t2") ?? []).toEqual([]);
  });
});

// ── optimizeWaves ──

describe("optimizeWaves", () => {
  test("parallelizes independent tasks into single wave", () => {
    const repoMap = makeRepoMap([
      makeFile("src/auth/login.ts", ["authenticateUser"]),
      makeFile("src/db/query.ts", ["runQuery"]),
    ]);

    const tasks = [
      makeTask("t1", "Authenticate users"),
      makeTask("t2", "Build query engine"),
    ];

    const waves = optimizeWaves(tasks, repoMap);

    expect(waves.length).toBe(1);
    expect(waves[0].parallel).toBe(true);
    expect(waves[0].tasks.length).toBe(2);
  });

  test("sequentializes conflicting tasks into separate waves", () => {
    const files = [
      makeFile("src/auth/login.ts", ["authenticateUser", "queryUser"]),
    ];
    const repoMap = makeRepoMap(files);

    const tasks = [
      makeTask("t1", "Authenticate users"),
      makeTask("t2", "Query the user database via queryUser"),
    ];

    const waves = optimizeWaves(tasks, repoMap);

    expect(waves.length).toBe(2);
    expect(waves[0].tasks.length).toBe(1);
    expect(waves[1].tasks.length).toBe(1);
  });

  test("handles single task", () => {
    const repoMap = makeRepoMap([makeFile("src/app.ts", ["main"])]);
    const tasks = [makeTask("t1", "Build the main app")];

    const waves = optimizeWaves(tasks, repoMap);

    expect(waves.length).toBe(1);
    expect(waves[0].parallel).toBe(false);
    expect(waves[0].tasks.length).toBe(1);
    expect(waves[0].tasks[0].id).toBe("t1");
  });

  test("creates chain of waves for all-conflict tasks", () => {
    const files = [makeFile("src/shared.ts", ["sharedUtil", "sharedHelper", "sharedProcess"])];
    const repoMap = makeRepoMap(files);

    const tasks = [
      makeTask("t1", "Refactor sharedUtil function"),
      makeTask("t2", "Update sharedHelper behavior"),
      makeTask("t3", "Optimize sharedProcess logic"),
    ];

    const waves = optimizeWaves(tasks, repoMap);

    // Each task conflicts with each other, so each goes in its own wave
    expect(waves.length).toBe(3);
    for (const wave of waves) {
      expect(wave.tasks.length).toBe(1);
      expect(wave.parallel).toBe(false);
    }
  });

  test("preserves task properties in output waves", () => {
    const repoMap = makeRepoMap([makeFile("src/foo.ts", ["fooFunc"])]);
    const task = makeTask("t1", "Implement fooFunc");
    task.model_tier = "opus";
    task.banned_approaches = ["approach1"];

    const waves = optimizeWaves([task], repoMap);

    const outputTask = waves[0].tasks[0];
    expect(outputTask.id).toBe("t1");
    expect(outputTask.description).toBe("Implement fooFunc");
    expect(outputTask.model_tier).toBe("opus");
    expect(outputTask.banned_approaches).toEqual(["approach1"]);
  });

  test("assigns sequential wave IDs", () => {
    const files = [
      makeFile("src/a.ts", ["alphaFunc"]),
      makeFile("src/b.ts", ["betaFunc"]),
      makeFile("src/shared.ts", ["alphaFunc", "betaFunc"]),
    ];
    const edges = [
      makeEdge("src/a.ts", "src/shared.ts", ["alphaFunc"]),
      makeEdge("src/b.ts", "src/shared.ts", ["betaFunc"]),
    ];
    const repoMap = makeRepoMap(files, edges);

    // t1 affects a.ts + shared.ts, t2 affects b.ts + shared.ts — they conflict via shared.ts
    const tasks = [
      makeTask("t1", "Refactor alphaFunc"),
      makeTask("t2", "Refactor betaFunc"),
    ];

    const waves = optimizeWaves(tasks, repoMap);

    for (let i = 0; i < waves.length; i++) {
      expect(waves[i].id).toBe(`w${i + 1}`);
    }
  });

  test("places tasks with no file matches into same wave", () => {
    const repoMap = makeRepoMap([makeFile("src/app.ts", ["main"])]);

    // These tasks have no keyword matches in the repo map
    const tasks = [
      makeTask("t1", "Write documentation pages"),
      makeTask("t2", "Set up CI pipeline"),
    ];

    const waves = optimizeWaves(tasks, repoMap);

    // No files matched = no conflicts, so they should be in one wave
    expect(waves.length).toBe(1);
    expect(waves[0].parallel).toBe(true);
    expect(waves[0].tasks.length).toBe(2);
  });
});

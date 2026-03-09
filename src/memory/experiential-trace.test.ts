// src/memory/experiential-trace.test.ts
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { tmpdir } from "os";
import { join } from "path";
import { mkdtemp, rm } from "fs/promises";
import {
  storeTrace,
  loadTraceStore,
  retrieveTraces,
  formatTraceForPrompt,
  type ExecutionTrace,
  type TraceStep,
} from "./experiential-trace";

function makeTrace(overrides: Partial<ExecutionTrace> = {}): ExecutionTrace {
  return {
    task_id: "t-001",
    task_description: "Create authentication JWT module",
    domain_tags: ["auth", "security"],
    approach: "Implement JWT signing with RS256 algorithm",
    steps: [
      { action: "read", target: "src/auth/index.ts", summary: "Read existing auth module" },
      { action: "write", target: "src/auth/jwt.ts", summary: "Created JWT signing function" },
      { action: "test", target: "bun test src/auth", summary: "Ran auth test suite" },
    ],
    files_created: ["src/auth/jwt.ts"],
    files_modified: ["src/auth/index.ts"],
    test_command: "bun test src/auth",
    test_passed: true,
    duration_ms: 4500,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe("storeTrace and loadTraceStore", () => {
  let tmpDir: string;
  let tracePath: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "trace-test-"));
    tracePath = join(tmpDir, "traces.json");
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("writes valid trace and reads it back", async () => {
    const trace = makeTrace();
    await storeTrace(tracePath, trace);
    const store = await loadTraceStore(tracePath);
    expect(store.traces.length).toBe(1);
    expect(store.traces[0].task_id).toBe("t-001");
    expect(store.traces[0].steps.length).toBe(3);
  });

  test("only stores passing traces (skips failures)", async () => {
    const failedTrace = makeTrace({ test_passed: false });
    await storeTrace(tracePath, failedTrace);
    const store = await loadTraceStore(tracePath);
    expect(store.traces.length).toBe(0);
  });

  test("multiple traces stored and retrieved correctly", async () => {
    await storeTrace(tracePath, makeTrace({ task_id: "t-001" }));
    await storeTrace(tracePath, makeTrace({ task_id: "t-002" }));
    await storeTrace(tracePath, makeTrace({ task_id: "t-003" }));
    const store = await loadTraceStore(tracePath);
    expect(store.traces.length).toBe(3);
    expect(store.traces.map((t) => t.task_id)).toEqual(["t-001", "t-002", "t-003"]);
  });

  test("loadTraceStore returns empty store for missing file", async () => {
    const store = await loadTraceStore(join(tmpDir, "nonexistent.json"));
    expect(store.traces).toEqual([]);
  });
});

describe("retrieveTraces", () => {
  test("finds similar tasks by description keywords", () => {
    const traces = [
      makeTrace({ task_id: "t-auth", task_description: "authentication jwt tokens" }),
      makeTrace({ task_id: "t-db", task_description: "database migration scripts" }),
    ];
    const results = retrieveTraces("implement jwt authentication", traces, 5);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].task_id).toBe("t-auth");
  });

  test("ranks by relevance (better matches first)", () => {
    const traces = [
      makeTrace({ task_id: "t1", task_description: "auth module basic" }),
      makeTrace({
        task_id: "t2",
        task_description: "auth jwt tokens security encryption",
        approach: "jwt implementation with security best practices",
      }),
    ];
    const results = retrieveTraces("auth jwt security", traces, 5);
    expect(results.length).toBe(2);
    expect(results[0].task_id).toBe("t2");
  });

  test("handles empty trace store", () => {
    const results = retrieveTraces("anything", [], 5);
    expect(results).toEqual([]);
  });

  test("returns empty for no matching keywords", () => {
    const traces = [makeTrace({ task_description: "database schema" })];
    const results = retrieveTraces("frontend react components", traces, 5);
    expect(results).toEqual([]);
  });

  test("respects topK limit", () => {
    const traces = Array.from({ length: 10 }, (_, i) =>
      makeTrace({ task_id: `t-${i}`, task_description: "auth jwt task" }),
    );
    const results = retrieveTraces("auth jwt", traces, 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });
});

describe("formatTraceForPrompt", () => {
  test("produces concise step-by-step markdown", () => {
    const trace = makeTrace();
    const output = formatTraceForPrompt(trace);
    expect(output).toContain("### Trace:");
    expect(output).toContain("**Approach**:");
    expect(output).toContain("**Steps**:");
    expect(output).toContain("[read]");
    expect(output).toContain("[write]");
    expect(output).toContain("[test]");
    expect(output).toContain("src/auth/jwt.ts");
  });

  test("includes created and modified files", () => {
    const trace = makeTrace();
    const output = formatTraceForPrompt(trace);
    expect(output).toContain("**Created**:");
    expect(output).toContain("**Modified**:");
  });

  test("includes duration", () => {
    const trace = makeTrace({ duration_ms: 12345 });
    const output = formatTraceForPrompt(trace);
    expect(output).toContain("12345ms");
  });
});

describe("ExecutionTrace validation", () => {
  test("trace has required fields", () => {
    const trace = makeTrace();
    expect(trace.task_id).toBeDefined();
    expect(trace.task_description).toBeDefined();
    expect(trace.steps).toBeInstanceOf(Array);
    expect(trace.steps.length).toBeGreaterThan(0);
    expect(trace.test_passed).toBe(true);
  });
});

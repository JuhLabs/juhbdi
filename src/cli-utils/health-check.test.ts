import { describe, test, expect, mock, afterEach } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  checkProjectDir,
  checkStateSchema,
  checkDashboard,
  checkDecisionTrail,
  runHealthChecks,
} from "./health-check";

const VALID_STATE = JSON.stringify({
  version: "1.0.0",
  project_name: "test",
  conventions: ["typescript"],
  architecture: "monolith",
  compressed_history: "",
  last_updated: "2026-01-01T00:00:00.000Z",
});

async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "juhbdi-health-test-"));
}

// ─── checkProjectDir ─────────────────────────────────────────────────────────

describe("checkProjectDir", () => {
  test("passes when .juhbdi/ exists", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, ".juhbdi"));
    const result = await checkProjectDir(dir);
    expect(result.name).toBe("project_dir");
    expect(result.status).toBe("pass");
    expect(result.detail).toContain(".juhbdi/");
    await rm(dir, { recursive: true, force: true });
  });

  test("fails when .juhbdi/ is missing", async () => {
    const dir = await makeTempDir();
    const result = await checkProjectDir(dir);
    expect(result.name).toBe("project_dir");
    expect(result.status).toBe("fail");
    expect(result.detail).toContain(".juhbdi/");
    await rm(dir, { recursive: true, force: true });
  });
});

// ─── checkStateSchema ────────────────────────────────────────────────────────

describe("checkStateSchema", () => {
  test("passes with valid state.json", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, ".juhbdi"));
    await writeFile(join(dir, ".juhbdi", "state.json"), VALID_STATE, "utf-8");
    const result = await checkStateSchema(dir);
    expect(result.name).toBe("state_schema");
    expect(result.status).toBe("pass");
    expect(result.detail).toContain("valid");
    await rm(dir, { recursive: true, force: true });
  });

  test("fails with invalid state.json (missing required fields)", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, ".juhbdi"));
    await writeFile(
      join(dir, ".juhbdi", "state.json"),
      JSON.stringify({ version: "1.0.0" }),
      "utf-8"
    );
    const result = await checkStateSchema(dir);
    expect(result.name).toBe("state_schema");
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("invalid");
    await rm(dir, { recursive: true, force: true });
  });

  test("fails when state.json is missing", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, ".juhbdi"));
    const result = await checkStateSchema(dir);
    expect(result.name).toBe("state_schema");
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("Could not read");
    await rm(dir, { recursive: true, force: true });
  });

  test("fails when state.json contains malformed JSON", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, ".juhbdi"));
    await writeFile(join(dir, ".juhbdi", "state.json"), "{ bad json }", "utf-8");
    const result = await checkStateSchema(dir);
    expect(result.name).toBe("state_schema");
    expect(result.status).toBe("fail");
    await rm(dir, { recursive: true, force: true });
  });
});

// ─── checkDashboard ──────────────────────────────────────────────────────────

describe("checkDashboard", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("passes when fetch returns 200", async () => {
    globalThis.fetch = mock(async () => ({ status: 200 } as Response)) as any;
    const result = await checkDashboard();
    expect(result.name).toBe("dashboard");
    expect(result.status).toBe("pass");
    expect(result.detail).toContain("reachable");
  });

  test("fails when fetch returns non-200 status", async () => {
    globalThis.fetch = mock(async () => ({ status: 503 } as Response)) as any;
    const result = await checkDashboard();
    expect(result.name).toBe("dashboard");
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("503");
  });

  test("fails on connection refused", async () => {
    globalThis.fetch = mock(async () => {
      throw new Error("ECONNREFUSED: Connection refused");
    }) as any;
    const result = await checkDashboard();
    expect(result.name).toBe("dashboard");
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("Connection refused");
  });

  test("fails on timeout", async () => {
    globalThis.fetch = mock(async () => {
      const err = new Error("TimeoutError: request timed out");
      err.name = "TimeoutError";
      throw err;
    }) as any;
    const result = await checkDashboard();
    expect(result.name).toBe("dashboard");
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("timed out");
  });

  test("fails on generic network error", async () => {
    globalThis.fetch = mock(async () => {
      throw new Error("Network failure");
    }) as any;
    const result = await checkDashboard();
    expect(result.name).toBe("dashboard");
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("unreachable");
  });
});

// ─── checkDecisionTrail ──────────────────────────────────────────────────────

describe("checkDecisionTrail", () => {
  test("passes when decision-trail.log exists with entries", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, ".juhbdi"));
    await writeFile(
      join(dir, ".juhbdi", "decision-trail.log"),
      "entry1\nentry2\nentry3\n",
      "utf-8"
    );
    const result = await checkDecisionTrail(dir);
    expect(result.name).toBe("decision_trail");
    expect(result.status).toBe("pass");
    expect(result.detail).toContain("3 entries");
    await rm(dir, { recursive: true, force: true });
  });

  test("passes when decision-trail.log exists with single entry", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, ".juhbdi"));
    await writeFile(
      join(dir, ".juhbdi", "decision-trail.log"),
      "single entry",
      "utf-8"
    );
    const result = await checkDecisionTrail(dir);
    expect(result.name).toBe("decision_trail");
    expect(result.status).toBe("pass");
    await rm(dir, { recursive: true, force: true });
  });

  test("fails when decision-trail.log is missing", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, ".juhbdi"));
    const result = await checkDecisionTrail(dir);
    expect(result.name).toBe("decision_trail");
    expect(result.status).toBe("fail");
    expect(result.detail).toContain("not found");
    await rm(dir, { recursive: true, force: true });
  });
});

// ─── runHealthChecks ─────────────────────────────────────────────────────────

describe("runHealthChecks", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("returns correct summary counts when all checks pass", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, ".juhbdi"));
    await writeFile(join(dir, ".juhbdi", "state.json"), VALID_STATE, "utf-8");
    await writeFile(
      join(dir, ".juhbdi", "decision-trail.log"),
      "entry1\n",
      "utf-8"
    );
    globalThis.fetch = mock(async () => ({ status: 200 } as Response)) as any;

    const report = await runHealthChecks(dir);
    expect(report.checks.length).toBe(4);
    expect(report.summary.total).toBe(4);
    expect(report.summary.passed).toBe(4);
    expect(report.summary.failed).toBe(0);
    expect(report.healthy).toBe(true);

    await rm(dir, { recursive: true, force: true });
  });

  test("healthy is false when any check fails", async () => {
    const dir = await makeTempDir();
    // No .juhbdi/ dir — all fs checks fail
    globalThis.fetch = mock(async () => {
      throw new Error("ECONNREFUSED");
    }) as any;

    const report = await runHealthChecks(dir);
    expect(report.summary.total).toBe(4);
    expect(report.summary.failed).toBeGreaterThan(0);
    expect(report.healthy).toBe(false);

    await rm(dir, { recursive: true, force: true });
  });

  test("returns correct summary counts when some checks fail", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, ".juhbdi"));
    // state.json and decision-trail.log missing — 2 fail
    // .juhbdi exists — 1 pass
    globalThis.fetch = mock(async () => ({ status: 200 } as Response)) as any;

    const report = await runHealthChecks(dir);
    expect(report.summary.total).toBe(4);
    expect(report.summary.passed).toBe(2); // project_dir + dashboard
    expect(report.summary.failed).toBe(2); // state_schema + decision_trail
    expect(report.healthy).toBe(false);

    await rm(dir, { recursive: true, force: true });
  });

  test("report contains all four named checks", async () => {
    const dir = await makeTempDir();
    globalThis.fetch = mock(async () => {
      throw new Error("ECONNREFUSED");
    }) as any;

    const report = await runHealthChecks(dir);
    const names = report.checks.map((c) => c.name);
    expect(names).toContain("project_dir");
    expect(names).toContain("state_schema");
    expect(names).toContain("dashboard");
    expect(names).toContain("decision_trail");

    await rm(dir, { recursive: true, force: true });
  });
});

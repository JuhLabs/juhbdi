// src/cli-utils/router-calibration.test.ts
import { describe, test, expect, afterEach } from "bun:test";
import { mkdtemp, rm, readFile, mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  RouterCalibrationSchema,
  loadCalibration,
  saveCalibration,
  mergeOutcome,
  shouldPromote,
  defaultCalibration,
} from "./router-calibration";
import type { RoutingOutcome } from "../schemas/model-route";

async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "juhbdi-cal-test-"));
}

function makeOutcome(overrides: Partial<RoutingOutcome> = {}): RoutingOutcome {
  return {
    task_id: "t1",
    recommended_tier: "sonnet",
    actual_outcome: "correct",
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe("RouterCalibrationSchema", () => {
  test("validates a well-formed calibration object", () => {
    const cal = {
      recent_decisions: [makeOutcome()],
      accuracy: 0.85,
      opus_threshold: 4,
      haiku_threshold: -4,
      total_routed: 10,
      updated: new Date().toISOString(),
    };
    const result = RouterCalibrationSchema.safeParse(cal);
    expect(result.success).toBe(true);
  });

  test("rejects missing required fields", () => {
    const result = RouterCalibrationSchema.safeParse({ accuracy: 0.5 });
    expect(result.success).toBe(false);
  });

  test("accepts empty recent_decisions array", () => {
    const cal = {
      recent_decisions: [],
      accuracy: 0,
      opus_threshold: 4,
      haiku_threshold: -4,
      total_routed: 0,
      updated: new Date().toISOString(),
    };
    const result = RouterCalibrationSchema.safeParse(cal);
    expect(result.success).toBe(true);
  });

  test("accepts 25 decisions", () => {
    const decisions = Array.from({ length: 25 }, (_, i) =>
      makeOutcome({ task_id: `t${i}` })
    );
    const cal = {
      recent_decisions: decisions,
      accuracy: 0.8,
      opus_threshold: 4,
      haiku_threshold: -4,
      total_routed: 25,
      updated: new Date().toISOString(),
    };
    const result = RouterCalibrationSchema.safeParse(cal);
    expect(result.success).toBe(true);
  });
});

describe("loadCalibration", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  test("returns null when file does not exist", async () => {
    tempDir = await makeTempDir();
    const cal = await loadCalibration(tempDir);
    expect(cal).toBeNull();
  });

  test("returns parsed calibration when file exists", async () => {
    tempDir = await makeTempDir();
    const juhbdiDir = join(tempDir, ".juhbdi");
    await mkdir(juhbdiDir, { recursive: true });
    const cal = {
      recent_decisions: [makeOutcome()],
      accuracy: 0.9,
      opus_threshold: 5,
      haiku_threshold: -3,
      total_routed: 20,
      updated: new Date().toISOString(),
    };
    await writeFile(
      join(juhbdiDir, "router-calibration.json"),
      JSON.stringify(cal, null, 2)
    );
    const loaded = await loadCalibration(tempDir);
    expect(loaded).not.toBeNull();
    expect(loaded!.accuracy).toBe(0.9);
    expect(loaded!.total_routed).toBe(20);
    expect(loaded!.opus_threshold).toBe(5);
    expect(loaded!.haiku_threshold).toBe(-3);
  });

  test("returns null for corrupted JSON", async () => {
    tempDir = await makeTempDir();
    const juhbdiDir = join(tempDir, ".juhbdi");
    await mkdir(juhbdiDir, { recursive: true });
    await writeFile(
      join(juhbdiDir, "router-calibration.json"),
      "not valid json {{{",
    );
    const loaded = await loadCalibration(tempDir);
    expect(loaded).toBeNull();
  });

  test("returns null for invalid schema shape", async () => {
    tempDir = await makeTempDir();
    const juhbdiDir = join(tempDir, ".juhbdi");
    await mkdir(juhbdiDir, { recursive: true });
    await writeFile(
      join(juhbdiDir, "router-calibration.json"),
      JSON.stringify({ wrong: "shape" }),
    );
    const loaded = await loadCalibration(tempDir);
    expect(loaded).toBeNull();
  });
});

describe("saveCalibration", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  test("creates .juhbdi/ and writes calibration file", async () => {
    tempDir = await makeTempDir();
    const cal = {
      recent_decisions: [makeOutcome()],
      accuracy: 0.75,
      opus_threshold: 4,
      haiku_threshold: -4,
      total_routed: 5,
      updated: new Date().toISOString(),
    };
    await saveCalibration(tempDir, cal);
    const raw = await readFile(
      join(tempDir, ".juhbdi", "router-calibration.json"),
      "utf-8",
    );
    const parsed = JSON.parse(raw);
    expect(parsed.accuracy).toBe(0.75);
    expect(parsed.total_routed).toBe(5);
  });

  test("overwrites existing calibration", async () => {
    tempDir = await makeTempDir();
    const cal1 = {
      recent_decisions: [] as RoutingOutcome[],
      accuracy: 0.5,
      opus_threshold: 4,
      haiku_threshold: -4,
      total_routed: 1,
      updated: new Date().toISOString(),
    };
    await saveCalibration(tempDir, cal1);

    const cal2 = {
      recent_decisions: [makeOutcome()],
      accuracy: 0.9,
      opus_threshold: 5,
      haiku_threshold: -3,
      total_routed: 10,
      updated: new Date().toISOString(),
    };
    await saveCalibration(tempDir, cal2);

    const raw = await readFile(
      join(tempDir, ".juhbdi", "router-calibration.json"),
      "utf-8",
    );
    const parsed = JSON.parse(raw);
    expect(parsed.accuracy).toBe(0.9);
    expect(parsed.total_routed).toBe(10);
  });
});

describe("mergeOutcome", () => {
  test("adds outcome to empty calibration", () => {
    const cal = defaultCalibration();
    const outcome = makeOutcome({ actual_outcome: "correct" });
    const merged = mergeOutcome(cal, outcome);
    expect(merged.recent_decisions).toHaveLength(1);
    expect(merged.total_routed).toBe(1);
    expect(merged.accuracy).toBe(1.0);
  });

  test("keeps only last 20 decisions", () => {
    const decisions = Array.from({ length: 20 }, (_, i) =>
      makeOutcome({ task_id: `t${i}`, actual_outcome: "correct" })
    );
    const cal = {
      recent_decisions: decisions,
      accuracy: 1.0,
      opus_threshold: 4,
      haiku_threshold: -4,
      total_routed: 20,
      updated: new Date().toISOString(),
    };
    const outcome = makeOutcome({ task_id: "t20", actual_outcome: "escalated" });
    const merged = mergeOutcome(cal, outcome);
    expect(merged.recent_decisions).toHaveLength(20);
    expect(merged.recent_decisions[0].task_id).toBe("t1");
    expect(merged.recent_decisions[19].task_id).toBe("t20");
    expect(merged.total_routed).toBe(21);
  });

  test("recalculates accuracy from recent window", () => {
    const decisions = [
      makeOutcome({ task_id: "t1", actual_outcome: "correct" }),
      makeOutcome({ task_id: "t2", actual_outcome: "escalated" }),
    ];
    const cal = {
      recent_decisions: decisions,
      accuracy: 0.5,
      opus_threshold: 4,
      haiku_threshold: -4,
      total_routed: 2,
      updated: new Date().toISOString(),
    };
    const outcome = makeOutcome({ task_id: "t3", actual_outcome: "correct" });
    const merged = mergeOutcome(cal, outcome);
    expect(merged.accuracy).toBeCloseTo(2 / 3, 4);
  });

  test("adjusts thresholds when accuracy drops below 0.7", () => {
    const decisions = Array.from({ length: 9 }, (_, i) =>
      makeOutcome({ task_id: `t${i}`, actual_outcome: "escalated" })
    );
    const cal = {
      recent_decisions: decisions,
      accuracy: 0.0,
      opus_threshold: 4,
      haiku_threshold: -4,
      total_routed: 9,
      updated: new Date().toISOString(),
    };
    const outcome = makeOutcome({ task_id: "t9", actual_outcome: "escalated" });
    const merged = mergeOutcome(cal, outcome);
    expect(merged.opus_threshold).toBe(3);
    expect(merged.haiku_threshold).toBe(-5);
  });

  test("relaxes thresholds when accuracy exceeds 0.9", () => {
    const decisions = Array.from({ length: 19 }, (_, i) =>
      makeOutcome({ task_id: `t${i}`, actual_outcome: "correct" })
    );
    const cal = {
      recent_decisions: decisions,
      accuracy: 1.0,
      opus_threshold: 4,
      haiku_threshold: -4,
      total_routed: 19,
      updated: new Date().toISOString(),
    };
    const outcome = makeOutcome({ task_id: "t19", actual_outcome: "correct" });
    const merged = mergeOutcome(cal, outcome);
    expect(merged.opus_threshold).toBe(5);
    expect(merged.haiku_threshold).toBe(-3);
  });

  test("keeps default thresholds when accuracy is between 0.7 and 0.9", () => {
    const decisions = [
      makeOutcome({ task_id: "t1", actual_outcome: "correct" }),
      makeOutcome({ task_id: "t2", actual_outcome: "correct" }),
      makeOutcome({ task_id: "t3", actual_outcome: "correct" }),
      makeOutcome({ task_id: "t4", actual_outcome: "escalated" }),
    ];
    const cal = {
      recent_decisions: decisions,
      accuracy: 0.75,
      opus_threshold: 4,
      haiku_threshold: -4,
      total_routed: 4,
      updated: new Date().toISOString(),
    };
    const outcome = makeOutcome({ task_id: "t5", actual_outcome: "correct" });
    const merged = mergeOutcome(cal, outcome);
    expect(merged.opus_threshold).toBe(4);
    expect(merged.haiku_threshold).toBe(-4);
  });

  test("updates the timestamp", () => {
    const cal = defaultCalibration();
    cal.updated = "2026-01-01T00:00:00.000Z";
    const outcome = makeOutcome();
    const merged = mergeOutcome(cal, outcome);
    expect(merged.updated).not.toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("shouldPromote", () => {
  test("returns false when total_routed < 50", () => {
    const cal = { ...defaultCalibration(), total_routed: 49 };
    expect(shouldPromote(cal)).toBe(false);
  });

  test("returns true when total_routed >= 50", () => {
    const cal = { ...defaultCalibration(), total_routed: 50 };
    expect(shouldPromote(cal)).toBe(true);
  });

  test("returns true when total_routed is well above 50", () => {
    const cal = { ...defaultCalibration(), total_routed: 200 };
    expect(shouldPromote(cal)).toBe(true);
  });
});

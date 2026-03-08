import { describe, expect, test, afterEach } from "bun:test";
import { writeProgress, readProgress, ExecProgressSchema } from "./exec-progress";
import { unlinkSync } from "fs";

const TEST_PATH = "/tmp/juhbdi-exec-progress-test.json";

describe("ExecProgressSchema", () => {
  test("parses valid progress", () => {
    const progress = ExecProgressSchema.parse({
      started_at: "2026-03-07T00:00:00.000Z",
      current_wave: 2,
      total_waves: 5,
      tasks_passed: 4,
      tasks_failed: 0,
      tasks_skipped: 1,
      last_wave_result: "passed",
      status: "running",
    });
    expect(progress.current_wave).toBe(2);
    expect(progress.status).toBe("running");
  });

  test("rejects invalid status", () => {
    expect(() =>
      ExecProgressSchema.parse({
        started_at: "2026-03-07T00:00:00.000Z",
        current_wave: 1,
        total_waves: 3,
        tasks_passed: 0,
        tasks_failed: 0,
        tasks_skipped: 0,
        last_wave_result: "passed",
        status: "invalid",
      })
    ).toThrow();
  });
});

describe("writeProgress", () => {
  afterEach(() => {
    try { unlinkSync(TEST_PATH); } catch { /* ok */ }
  });

  test("writes progress file to disk", async () => {
    await writeProgress(TEST_PATH, {
      started_at: "2026-03-07T00:00:00.000Z",
      current_wave: 1,
      total_waves: 3,
      tasks_passed: 2,
      tasks_failed: 0,
      tasks_skipped: 0,
      last_wave_result: "passed",
      status: "running",
    });
    const result = await readProgress(TEST_PATH);
    expect(result).not.toBeNull();
    expect(result!.current_wave).toBe(1);
    expect(result!.tasks_passed).toBe(2);
  });

  test("overwrites existing progress file", async () => {
    await writeProgress(TEST_PATH, {
      started_at: "2026-03-07T00:00:00.000Z",
      current_wave: 1,
      total_waves: 3,
      tasks_passed: 0,
      tasks_failed: 0,
      tasks_skipped: 0,
      last_wave_result: "passed",
      status: "running",
    });
    await writeProgress(TEST_PATH, {
      started_at: "2026-03-07T00:00:00.000Z",
      current_wave: 2,
      total_waves: 3,
      tasks_passed: 3,
      tasks_failed: 1,
      tasks_skipped: 0,
      last_wave_result: "failed",
      status: "running",
    });
    const result = await readProgress(TEST_PATH);
    expect(result!.current_wave).toBe(2);
    expect(result!.tasks_passed).toBe(3);
    expect(result!.last_wave_result).toBe("failed");
  });
});

describe("readProgress", () => {
  test("returns null for missing file", async () => {
    const result = await readProgress("/tmp/juhbdi-nonexistent-progress.json");
    expect(result).toBeNull();
  });
});

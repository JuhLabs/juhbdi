// src/cli-utils/router-calibration-integration.test.ts
import { describe, test, expect, afterEach } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  loadCalibration,
  saveCalibration,
  mergeOutcome,
  shouldPromote,
  defaultCalibration,
} from "./router-calibration";
import type { RoutingOutcome } from "../schemas/model-route";

async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "juhbdi-cal-int-"));
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

describe("router-calibration lifecycle", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  test("full lifecycle: load → merge → save → reload → promote", async () => {
    tempDir = await makeTempDir();

    // 1. Load from empty → null
    const initial = await loadCalibration(tempDir);
    expect(initial).toBeNull();

    // 2. Start with defaults, merge 50 correct outcomes
    let cal = defaultCalibration();
    for (let i = 0; i < 50; i++) {
      cal = mergeOutcome(cal, makeOutcome({ task_id: `t${i}` }));
    }

    // 3. Check state after 50 merges
    expect(cal.total_routed).toBe(50);
    expect(cal.accuracy).toBe(1.0);
    expect(cal.recent_decisions).toHaveLength(20); // capped at 20

    // 4. Save
    await saveCalibration(tempDir, cal);

    // 5. Reload — should match
    const reloaded = await loadCalibration(tempDir);
    expect(reloaded).not.toBeNull();
    expect(reloaded!.total_routed).toBe(50);
    expect(reloaded!.accuracy).toBe(1.0);

    // 6. Should promote (>= 50)
    expect(shouldPromote(reloaded!)).toBe(true);
  });

  test("threshold adjustment through accuracy degradation", async () => {
    tempDir = await makeTempDir();

    // Start with 10 correct outcomes
    let cal = defaultCalibration();
    for (let i = 0; i < 10; i++) {
      cal = mergeOutcome(cal, makeOutcome({ task_id: `c${i}` }));
    }
    // All correct → accuracy 1.0, relaxed thresholds
    expect(cal.accuracy).toBe(1.0);
    expect(cal.opus_threshold).toBe(5); // relaxed
    expect(cal.haiku_threshold).toBe(-3); // relaxed

    // Add 15 escalated outcomes to drop accuracy
    for (let i = 0; i < 15; i++) {
      cal = mergeOutcome(
        cal,
        makeOutcome({ task_id: `e${i}`, actual_outcome: "escalated" })
      );
    }

    // Window is last 20: 5 correct + 15 escalated = 25% accuracy
    expect(cal.accuracy).toBeLessThan(0.7);
    expect(cal.opus_threshold).toBe(3); // tightened
    expect(cal.haiku_threshold).toBe(-5); // tightened

    // Save and reload preserves thresholds
    await saveCalibration(tempDir, cal);
    const reloaded = await loadCalibration(tempDir);
    expect(reloaded!.opus_threshold).toBe(3);
    expect(reloaded!.haiku_threshold).toBe(-5);
  });

  test("graceful degradation: load from non-existent dir", async () => {
    const result = await loadCalibration("/tmp/does-not-exist-juhbdi-test");
    expect(result).toBeNull();
  });

  test("not promoted before 50 decisions", async () => {
    let cal = defaultCalibration();
    for (let i = 0; i < 49; i++) {
      cal = mergeOutcome(cal, makeOutcome({ task_id: `t${i}` }));
    }
    expect(shouldPromote(cal)).toBe(false);
    cal = mergeOutcome(cal, makeOutcome({ task_id: "t49" }));
    expect(shouldPromote(cal)).toBe(true);
  });
});

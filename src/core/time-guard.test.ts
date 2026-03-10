import { describe, test, expect } from "bun:test";
import {
  estimateTaskTime,
  checkTaskDuration,
  MAX_TASK_MINUTES,
  WARNING_MINUTES,
} from "./time-guard";

describe("time-guard", () => {
  describe("estimateTaskTime", () => {
    test("estimates small task under threshold", () => {
      const est = estimateTaskTime(2, 0.3, false, false);
      // 2 * 5 * (0.5 + 0.3) = 8 min
      expect(est.estimated_minutes).toBe(8);
      expect(est.should_decompose).toBe(false);
      expect(est.suggested_subtasks).toBe(1);
      expect(est.warning).toBeNull();
    });

    test("warns when approaching threshold", () => {
      // Need ~26-35 min → e.g., 4 files, complexity 0.8 → 4 * 5 * 1.3 = 26
      const est = estimateTaskTime(4, 0.8, false, false);
      expect(est.estimated_minutes).toBeGreaterThan(WARNING_MINUTES);
      expect(est.estimated_minutes).toBeLessThanOrEqual(MAX_TASK_MINUTES);
      expect(est.should_decompose).toBe(false);
      expect(est.warning).toContain("Approaching 35-minute threshold");
    });

    test("recommends decomposition for large tasks", () => {
      // 10 files, high complexity, tests, refactor → way over 35 min
      const est = estimateTaskTime(10, 0.9, true, true);
      expect(est.estimated_minutes).toBeGreaterThan(MAX_TASK_MINUTES);
      expect(est.should_decompose).toBe(true);
      expect(est.suggested_subtasks).toBeGreaterThan(1);
      expect(est.warning).toContain("Recommend decomposing");
    });

    test("test flag adds 40% overhead", () => {
      const noTest = estimateTaskTime(3, 0.5, false, false);
      const withTest = estimateTaskTime(3, 0.5, true, false);
      expect(withTest.estimated_minutes).toBeGreaterThan(noTest.estimated_minutes);
      // Check ~40% increase
      const ratio = withTest.estimated_minutes / noTest.estimated_minutes;
      expect(ratio).toBeGreaterThanOrEqual(1.3); // rounding may affect exact 1.4
      expect(ratio).toBeLessThanOrEqual(1.5);
    });

    test("refactor flag adds 30% overhead", () => {
      const noRef = estimateTaskTime(3, 0.5, false, false);
      const withRef = estimateTaskTime(3, 0.5, false, true);
      expect(withRef.estimated_minutes).toBeGreaterThan(noRef.estimated_minutes);
    });
  });

  describe("checkTaskDuration", () => {
    test("returns no warning for short tasks", () => {
      const start = Date.now();
      const now = start + 10 * 60 * 1000; // 10 min
      const result = checkTaskDuration(start, now);
      expect(result.elapsed_minutes).toBe(10);
      expect(result.overtime).toBe(false);
      expect(result.warning).toBeNull();
    });

    test("warns when approaching limit", () => {
      const start = Date.now();
      const now = start + 28 * 60 * 1000; // 28 min
      const result = checkTaskDuration(start, now);
      expect(result.elapsed_minutes).toBe(28);
      expect(result.overtime).toBe(false);
      expect(result.warning).toContain("minutes remaining");
    });

    test("flags overtime when past limit", () => {
      const start = Date.now();
      const now = start + 40 * 60 * 1000; // 40 min
      const result = checkTaskDuration(start, now);
      expect(result.elapsed_minutes).toBe(40);
      expect(result.overtime).toBe(true);
      expect(result.warning).toContain("Quality degradation expected");
    });
  });
});

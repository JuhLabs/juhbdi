// src/cli-utils/context-budget.test.ts
import { describe, test, expect } from "bun:test";
import { estimateBudget } from "./context-budget";

describe("estimateBudget", () => {
  test("small pipeline fits comfortably", () => {
    const result = estimateBudget(
      2, 1,
      ["test", "lint"],
      80, // 80% remaining
      200000
    );
    expect(result.fits).toBe(true);
    expect(result.warning).toBeNull();
    expect(result.total_estimated_tokens).toBeGreaterThan(0);
    expect(result.estimated_usage_pct).toBeLessThan(70);
  });

  test("large pipeline with low context triggers warning", () => {
    const result = estimateBudget(
      15, 5,
      Array(15).fill("test"),
      30, // only 30% remaining
      200000
    );
    expect(result.fits).toBe(false);
    expect(result.warning).not.toBeNull();
    expect(result.warning!).toContain("exhaust");
  });

  test("medium pipeline with moderate context warns about tightness", () => {
    const result = estimateBudget(
      8, 3,
      Array(8).fill("test"),
      40,
      200000
    );
    // 8 test tasks = 64000 + 3 waves * 2000 + 6000 overhead = 76000
    // 40% of 200k = 80000 remaining
    // usage = 76000/80000 = 95% → doesn't fit
    expect(result.warning).not.toBeNull();
  });

  test("zero tasks returns minimal overhead", () => {
    const result = estimateBudget(0, 0, [], 100, 200000);
    expect(result.total_estimated_tokens).toBe(6000); // pipeline overhead only
    expect(result.fits).toBe(true);
    expect(result.tokens_per_task).toBe(0);
  });

  test("estimated_usage_pct is reasonable", () => {
    const result = estimateBudget(
      5, 2,
      ["test", "test", "lint", "lint", "manual"],
      100,
      200000
    );
    expect(result.estimated_usage_pct).toBeGreaterThan(0);
    expect(result.estimated_usage_pct).toBeLessThan(50);
  });

  test("lint tasks use fewer tokens than test tasks", () => {
    const testBudget = estimateBudget(3, 1, ["test", "test", "test"], 100, 200000);
    const lintBudget = estimateBudget(3, 1, ["lint", "lint", "lint"], 100, 200000);
    expect(lintBudget.total_estimated_tokens).toBeLessThan(testBudget.total_estimated_tokens);
  });

  test("unknown verification type uses default", () => {
    const result = estimateBudget(1, 1, ["custom"], 100, 200000);
    expect(result.total_estimated_tokens).toBe(6000 + 5000 + 2000);
  });

  test("fits is false when usage exceeds 85%", () => {
    // 10 test tasks = 80000 + 3 waves * 2000 + 6000 = 92000
    // 50% of 200k = 100000 remaining → 92% usage → doesn't fit
    const result = estimateBudget(10, 3, Array(10).fill("test"), 50, 200000);
    expect(result.fits).toBe(false);
  });
});

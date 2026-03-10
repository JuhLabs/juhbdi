import { describe, test, expect } from "bun:test";
import { checkTestRegression } from "./execution-wiring";
import type { TestSnapshot } from "../memory/tnr-types";

describe("checkTestRegression", () => {
  test("returns no_baseline when no previous snapshot", () => {
    const result = checkTestRegression("5 pass\n0 fail\nRan 5 tests");
    expect(result.verdict).toBe("no_baseline");
    expect(result.snapshot.total).toBe(5);
    expect(result.snapshot.passed).toBe(5);
    expect(result.snapshot.failed).toBe(0);
    expect(result.recommendation).toBeUndefined();
  });

  test("returns stable when no regressions", () => {
    const previous: TestSnapshot = {
      total: 10,
      passed: 10,
      failed: 0,
      failure_names: [],
    };
    const result = checkTestRegression(
      "10 pass\n0 fail\nRan 10 tests",
      previous,
    );
    expect(result.verdict).toBe("stable");
    expect(result.recommendation).toBeUndefined();
  });

  test("returns improved when tests are added", () => {
    const previous: TestSnapshot = {
      total: 10,
      passed: 10,
      failed: 0,
      failure_names: [],
    };
    const result = checkTestRegression(
      "15 pass\n0 fail\nRan 15 tests",
      previous,
    );
    expect(result.verdict).toBe("improved");
  });

  test("returns regressed with revert recommendation on new failures", () => {
    const previous: TestSnapshot = {
      total: 10,
      passed: 10,
      failed: 0,
      failure_names: [],
    };
    const result = checkTestRegression(
      "8 pass\n2 fail\nFAIL src/foo.test.ts > should work\nFAIL src/bar.test.ts > handles edge case\nRan 10 tests",
      previous,
    );
    expect(result.verdict).toBe("regressed");
    expect(result.recommendation).toBe("revert");
    expect(result.snapshot.failed).toBe(2);
  });

  test("returns improved when failures are fixed", () => {
    const previous: TestSnapshot = {
      total: 10,
      passed: 8,
      failed: 2,
      failure_names: ["should work", "handles edge case"],
    };
    const result = checkTestRegression(
      "10 pass\n0 fail\nRan 10 tests",
      previous,
    );
    expect(result.verdict).toBe("improved");
    expect(result.recommendation).toBeUndefined();
  });

  test("snapshot contains parsed data from output", () => {
    const result = checkTestRegression("973 pass\n0 fail\nRan 973 tests");
    expect(result.snapshot).toEqual({
      total: 973,
      passed: 973,
      failed: 0,
      failure_names: [],
    });
  });
});

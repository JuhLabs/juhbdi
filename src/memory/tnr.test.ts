import { describe, expect, test } from "bun:test";
import { parseTestOutput, compareSnapshots, shouldRevert } from "./tnr";
import type { TestSnapshot } from "./tnr-types";

describe("parseTestOutput", () => {
  test("parses bun test output with passes and failures", () => {
    const output = ` 3 pass\n 1 fail\n 10 expect() calls\nRan 4 tests across 2 files. [50.00ms]\n\n FAIL  src/foo.test.ts > FooTest > test_bar\n`;
    const snap = parseTestOutput(output);
    expect(snap.total).toBe(4);
    expect(snap.passed).toBe(3);
    expect(snap.failed).toBe(1);
    expect(snap.failure_names).toContain("FooTest > test_bar");
  });

  test("parses all-passing output", () => {
    const output = ` 10 pass\n 0 fail\n 20 expect() calls\nRan 10 tests across 5 files. [100.00ms]\n`;
    const snap = parseTestOutput(output);
    expect(snap.total).toBe(10);
    expect(snap.passed).toBe(10);
    expect(snap.failed).toBe(0);
    expect(snap.failure_names).toEqual([]);
  });

  test("handles no test output gracefully", () => {
    const snap = parseTestOutput("");
    expect(snap.total).toBe(0);
    expect(snap.passed).toBe(0);
    expect(snap.failed).toBe(0);
  });

  test("parses multiple failures", () => {
    const output = ` 8 pass\n 2 fail\n 20 expect() calls\nRan 10 tests across 3 files. [80.00ms]\n\n FAIL  src/a.test.ts > Suite > test_one\n FAIL  src/b.test.ts > Other > test_two\n`;
    const snap = parseTestOutput(output);
    expect(snap.failure_names).toHaveLength(2);
    expect(snap.failure_names).toContain("Suite > test_one");
    expect(snap.failure_names).toContain("Other > test_two");
  });
});

describe("compareSnapshots", () => {
  const makeSnap = (total: number, passed: number, failed: number, names: string[]): TestSnapshot =>
    ({ total, passed, failed, failure_names: names });

  test("detects stable (no change)", () => {
    const result = compareSnapshots(makeSnap(10, 10, 0, []), makeSnap(10, 10, 0, []));
    expect(result.verdict).toBe("stable");
  });

  test("detects improved (fewer failures)", () => {
    const result = compareSnapshots(makeSnap(10, 8, 2, ["test_a", "test_b"]), makeSnap(10, 9, 1, ["test_b"]));
    expect(result.verdict).toBe("improved");
    expect(result.fixed_failures).toEqual(["test_a"]);
  });

  test("detects regressed (new failures)", () => {
    const result = compareSnapshots(makeSnap(10, 10, 0, []), makeSnap(10, 8, 2, ["test_x", "test_y"]));
    expect(result.verdict).toBe("regressed");
    expect(result.new_failures).toEqual(["test_x", "test_y"]);
  });

  test("detects regression even if some fixed", () => {
    const result = compareSnapshots(makeSnap(10, 9, 1, ["test_a"]), makeSnap(10, 8, 2, ["test_b", "test_c"]));
    expect(result.verdict).toBe("regressed");
    expect(result.new_failures).toEqual(["test_b", "test_c"]);
    expect(result.fixed_failures).toEqual(["test_a"]);
  });

  test("handles new tests added", () => {
    const result = compareSnapshots(makeSnap(10, 10, 0, []), makeSnap(12, 12, 0, []));
    expect(result.verdict).toBe("improved");
  });
});

describe("shouldRevert", () => {
  test("returns true for regressed", () => {
    expect(shouldRevert({ verdict: "regressed", new_failures: ["x"], fixed_failures: [] })).toBe(true);
  });

  test("returns false for stable", () => {
    expect(shouldRevert({ verdict: "stable", new_failures: [], fixed_failures: [] })).toBe(false);
  });

  test("returns false for improved", () => {
    expect(shouldRevert({ verdict: "improved", new_failures: [], fixed_failures: ["x"] })).toBe(false);
  });
});

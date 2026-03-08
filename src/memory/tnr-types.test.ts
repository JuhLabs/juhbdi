import { describe, expect, test } from "bun:test";
import { TestSnapshotSchema, TNRCheckpointSchema, TNRResultSchema } from "./tnr-types";

describe("TestSnapshotSchema", () => {
  test("parses valid snapshot", () => {
    const snap = TestSnapshotSchema.parse({ total: 100, passed: 98, failed: 2, failure_names: ["test_auth", "test_db"] });
    expect(snap.total).toBe(100);
    expect(snap.failure_names).toHaveLength(2);
  });

  test("rejects negative counts", () => {
    expect(() => TestSnapshotSchema.parse({ total: -1, passed: 0, failed: 0, failure_names: [] })).toThrow();
  });
});

describe("TNRCheckpointSchema", () => {
  test("parses valid checkpoint", () => {
    const cp = TNRCheckpointSchema.parse({
      hash: "abc123def456", timestamp: "2026-03-08T00:00:00.000Z",
      test_snapshot: { total: 50, passed: 50, failed: 0, failure_names: [] },
    });
    expect(cp.hash).toBe("abc123def456");
  });

  test("rejects empty hash", () => {
    expect(() => TNRCheckpointSchema.parse({
      hash: "", timestamp: "2026-03-08T00:00:00.000Z",
      test_snapshot: { total: 0, passed: 0, failed: 0, failure_names: [] },
    })).toThrow();
  });
});

describe("TNRResultSchema", () => {
  const makeSnapshot = (total: number, passed: number, failed: number, names: string[]) =>
    ({ total, passed, failed, failure_names: names });

  test("parses improved result", () => {
    const result = TNRResultSchema.parse({
      checkpoint: { hash: "abc", timestamp: "2026-03-08T00:00:00.000Z", test_snapshot: makeSnapshot(10, 8, 2, ["test_a", "test_b"]) },
      post_attempt: makeSnapshot(10, 9, 1, ["test_b"]),
      verdict: "improved", new_failures: [], fixed_failures: ["test_a"],
    });
    expect(result.verdict).toBe("improved");
    expect(result.fixed_failures).toEqual(["test_a"]);
  });

  test("parses regressed result", () => {
    const result = TNRResultSchema.parse({
      checkpoint: { hash: "abc", timestamp: "2026-03-08T00:00:00.000Z", test_snapshot: makeSnapshot(10, 10, 0, []) },
      post_attempt: makeSnapshot(10, 8, 2, ["test_x", "test_y"]),
      verdict: "regressed", new_failures: ["test_x", "test_y"], fixed_failures: [],
    });
    expect(result.verdict).toBe("regressed");
    expect(result.new_failures).toHaveLength(2);
  });

  test("accepts all verdict types", () => {
    for (const verdict of ["improved", "stable", "regressed"] as const) {
      const result = TNRResultSchema.parse({
        checkpoint: { hash: "h", timestamp: "2026-03-08T00:00:00.000Z", test_snapshot: makeSnapshot(1, 1, 0, []) },
        post_attempt: makeSnapshot(1, 1, 0, []),
        verdict, new_failures: [], fixed_failures: [],
      });
      expect(result.verdict).toBe(verdict);
    }
  });
});

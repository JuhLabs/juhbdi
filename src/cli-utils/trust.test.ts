import { describe, test, expect } from "bun:test";
import { computeTrustScore, updateTrustRecord, TrustStoreSchema } from "../routing/trust";
import type { TrustRecord, TaskFeedback } from "../routing/trust";

function makeRecord(overrides: Partial<TrustRecord> = {}): TrustRecord {
  return {
    agent_tier: "sonnet",
    tasks_attempted: 10,
    tasks_passed: 8,
    avg_strikes: 0.5,
    violation_count: 1,
    last_10_outcomes: ["pass", "pass", "fail", "pass", "pass", "pass", "pass", "pass", "fail", "pass"],
    ...overrides,
  };
}

describe("trust CLI integration", () => {
  test("TrustStoreSchema parses valid store", () => {
    const store = TrustStoreSchema.parse({
      version: "1.0.0",
      records: {
        sonnet: makeRecord(),
      },
    });
    expect(store.version).toBe("1.0.0");
    expect(store.records.sonnet).toBeDefined();
  });

  test("TrustStoreSchema accepts empty records", () => {
    const store = TrustStoreSchema.parse({
      version: "1.0.0",
      records: {},
    });
    expect(Object.keys(store.records)).toHaveLength(0);
  });

  test("computeTrustScore returns 0.5 for zero-attempt record", () => {
    const record = makeRecord({ tasks_attempted: 0 });
    expect(computeTrustScore(record)).toBe(0.5);
  });

  test("computeTrustScore is higher for clean record", () => {
    const clean = makeRecord({ tasks_passed: 10, avg_strikes: 0, violation_count: 0 });
    const dirty = makeRecord({ tasks_passed: 3, avg_strikes: 2.5, violation_count: 5 });
    expect(computeTrustScore(clean)).toBeGreaterThan(computeTrustScore(dirty));
  });

  test("updateTrustRecord increments tasks_attempted", () => {
    const record = makeRecord();
    const feedback: TaskFeedback = { passed: true, strikes: 0, violation: false };
    const updated = updateTrustRecord(record, feedback);
    expect(updated.tasks_attempted).toBe(11);
    expect(updated.tasks_passed).toBe(9);
  });

  test("updateTrustRecord adds violation on violation feedback", () => {
    const record = makeRecord();
    const feedback: TaskFeedback = { passed: false, strikes: 2, violation: true };
    const updated = updateTrustRecord(record, feedback);
    expect(updated.violation_count).toBe(2);
    expect(updated.last_10_outcomes).toContain("fail");
  });

  test("updateTrustRecord caps last_10_outcomes at 10", () => {
    const record = makeRecord();
    const feedback: TaskFeedback = { passed: true, strikes: 0, violation: false };
    const updated = updateTrustRecord(record, feedback);
    expect(updated.last_10_outcomes.length).toBeLessThanOrEqual(10);
  });

  test("default record initializes from zero", () => {
    const fresh: TrustRecord = {
      agent_tier: "haiku",
      tasks_attempted: 0,
      tasks_passed: 0,
      avg_strikes: 0,
      violation_count: 0,
      last_10_outcomes: [],
    };
    const feedback: TaskFeedback = { passed: true, strikes: 1, violation: false };
    const updated = updateTrustRecord(fresh, feedback);
    expect(updated.tasks_attempted).toBe(1);
    expect(updated.tasks_passed).toBe(1);
    expect(updated.avg_strikes).toBe(1);
    expect(computeTrustScore(updated)).toBeGreaterThan(0);
  });
});

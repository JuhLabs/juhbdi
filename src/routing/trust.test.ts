import { describe, expect, test } from "bun:test";
import {
  TrustRecordSchema, TrustStoreSchema,
  computeTrustScore, updateTrustRecord,
  type TrustRecord,
} from "./trust";

function makeRecord(overrides: Partial<TrustRecord> = {}): TrustRecord {
  return {
    agent_tier: "sonnet",
    tasks_attempted: 10,
    tasks_passed: 8,
    avg_strikes: 0.5,
    violation_count: 0,
    last_10_outcomes: ["pass","pass","fail","pass","pass","pass","pass","pass","pass","pass"],
    ...overrides,
  };
}

describe("TrustRecordSchema", () => {
  test("parses valid record", () => {
    const record = TrustRecordSchema.parse(makeRecord());
    expect(record.agent_tier).toBe("sonnet");
  });

  test("rejects invalid tier", () => {
    expect(() => TrustRecordSchema.parse(makeRecord({ agent_tier: "gpt-4" as any }))).toThrow();
  });
});

describe("computeTrustScore", () => {
  test("returns high score for perfect record", () => {
    const record = makeRecord({
      tasks_attempted: 20, tasks_passed: 20,
      avg_strikes: 0, violation_count: 0,
      last_10_outcomes: Array(10).fill("pass"),
    });
    const score = computeTrustScore(record);
    expect(score).toBeGreaterThan(0.9);
    expect(score).toBeLessThanOrEqual(1);
  });

  test("returns low score for poor record", () => {
    const record = makeRecord({
      tasks_attempted: 10, tasks_passed: 3,
      avg_strikes: 2.5, violation_count: 4,
      last_10_outcomes: Array(7).fill("fail").concat(Array(3).fill("pass")),
    });
    const score = computeTrustScore(record);
    expect(score).toBeLessThan(0.4);
  });

  test("returns 0.5 for empty record", () => {
    const record = makeRecord({
      tasks_attempted: 0, tasks_passed: 0,
      avg_strikes: 0, violation_count: 0, last_10_outcomes: [],
    });
    expect(computeTrustScore(record)).toBe(0.5);
  });

  test("penalizes violations heavily", () => {
    const clean = makeRecord({ violation_count: 0 });
    const dirty = makeRecord({ violation_count: 5 });
    expect(computeTrustScore(clean)).toBeGreaterThan(computeTrustScore(dirty));
  });
});

describe("updateTrustRecord", () => {
  test("updates on pass", () => {
    const record = makeRecord({ tasks_attempted: 5, tasks_passed: 4 });
    const updated = updateTrustRecord(record, { passed: true, strikes: 0, violation: false });
    expect(updated.tasks_attempted).toBe(6);
    expect(updated.tasks_passed).toBe(5);
    expect(updated.last_10_outcomes).toContain("pass");
  });

  test("updates on fail", () => {
    const record = makeRecord({ tasks_attempted: 5, tasks_passed: 4 });
    const updated = updateTrustRecord(record, { passed: false, strikes: 2, violation: false });
    expect(updated.tasks_attempted).toBe(6);
    expect(updated.tasks_passed).toBe(4);
  });

  test("increments violation_count on violation", () => {
    const record = makeRecord({ violation_count: 1 });
    const updated = updateTrustRecord(record, { passed: true, strikes: 0, violation: true });
    expect(updated.violation_count).toBe(2);
  });

  test("caps last_10_outcomes at 10", () => {
    const record = makeRecord({ last_10_outcomes: Array(10).fill("pass") });
    const updated = updateTrustRecord(record, { passed: false, strikes: 1, violation: false });
    expect(updated.last_10_outcomes.length).toBe(10);
    expect(updated.last_10_outcomes[9]).toBe("fail");
  });
});

describe("TrustStoreSchema", () => {
  test("parses store with records", () => {
    const store = TrustStoreSchema.parse({
      version: "1.0.0",
      records: { sonnet: makeRecord() },
    });
    expect(store.records.sonnet).toBeDefined();
  });
});

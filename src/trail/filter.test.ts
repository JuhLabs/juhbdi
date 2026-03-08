// src/trail/filter.test.ts
import { describe, expect, test } from "bun:test";
import { filterTrail } from "./filter";
import type { DecisionTrailEntry } from "../schemas/decision-trail";

function makeEntry(overrides: Partial<DecisionTrailEntry> = {}): DecisionTrailEntry {
  return {
    timestamp: "2026-03-05T10:00:00.000Z",
    event_type: "decision",
    description: "Test entry",
    reasoning: "test reasoning",
    alternatives_considered: [],
    constraint_refs: [],
    outcome: "approved",
    ...overrides,
  };
}

describe("filterTrail", () => {
  test("returns empty array for empty input", () => {
    const result = filterTrail([], {});
    expect(result).toEqual([]);
  });

  test("no filter returns all entries sorted descending by timestamp", () => {
    const entries = [
      makeEntry({ timestamp: "2026-03-05T10:00:00.000Z", description: "first" }),
      makeEntry({ timestamp: "2026-03-05T12:00:00.000Z", description: "third" }),
      makeEntry({ timestamp: "2026-03-05T11:00:00.000Z", description: "second" }),
    ];
    const result = filterTrail(entries, {});
    expect(result).toHaveLength(3);
    expect(result[0].description).toBe("third");
    expect(result[1].description).toBe("second");
    expect(result[2].description).toBe("first");
  });

  test("type filter returns only matching event_type", () => {
    const entries = [
      makeEntry({ event_type: "routing", description: "route-1" }),
      makeEntry({ event_type: "decision", description: "decision-1" }),
      makeEntry({ event_type: "routing", description: "route-2" }),
      makeEntry({ event_type: "command", description: "cmd-1" }),
    ];
    const result = filterTrail(entries, { type: "routing" });
    expect(result).toHaveLength(2);
    expect(result.every(e => e.event_type === "routing")).toBe(true);
  });

  test("last limit returns only N most recent entries", () => {
    const entries = [
      makeEntry({ timestamp: "2026-03-05T10:00:00.000Z", description: "oldest" }),
      makeEntry({ timestamp: "2026-03-05T12:00:00.000Z", description: "newest" }),
      makeEntry({ timestamp: "2026-03-05T11:00:00.000Z", description: "middle" }),
    ];
    const result = filterTrail(entries, { last: 2 });
    expect(result).toHaveLength(2);
    expect(result[0].description).toBe("newest");
    expect(result[1].description).toBe("middle");
  });

  test("task_id filter returns only matching entries", () => {
    const entries = [
      makeEntry({ task_id: "w1-t1", description: "task-1a" }),
      makeEntry({ task_id: "w1-t2", description: "task-2" }),
      makeEntry({ task_id: "w1-t1", description: "task-1b" }),
      makeEntry({ description: "no-task-id" }),
    ];
    const result = filterTrail(entries, { task_id: "w1-t1" });
    expect(result).toHaveLength(2);
    expect(result.every(e => e.task_id === "w1-t1")).toBe(true);
  });

  test("wave_id filter returns only matching entries", () => {
    const entries = [
      makeEntry({ wave_id: "wave-1", description: "w1-entry" }),
      makeEntry({ wave_id: "wave-2", description: "w2-entry" }),
      makeEntry({ wave_id: "wave-1", description: "w1-entry-2" }),
      makeEntry({ description: "no-wave-id" }),
    ];
    const result = filterTrail(entries, { wave_id: "wave-1" });
    expect(result).toHaveLength(2);
    expect(result.every(e => e.wave_id === "wave-1")).toBe(true);
  });

  test("combined filters apply AND logic (type + last)", () => {
    const entries = [
      makeEntry({ event_type: "routing", timestamp: "2026-03-05T10:00:00.000Z", description: "route-old" }),
      makeEntry({ event_type: "decision", timestamp: "2026-03-05T11:00:00.000Z", description: "decision" }),
      makeEntry({ event_type: "routing", timestamp: "2026-03-05T12:00:00.000Z", description: "route-mid" }),
      makeEntry({ event_type: "routing", timestamp: "2026-03-05T13:00:00.000Z", description: "route-new" }),
    ];
    const result = filterTrail(entries, { type: "routing", last: 2 });
    expect(result).toHaveLength(2);
    expect(result[0].description).toBe("route-new");
    expect(result[1].description).toBe("route-mid");
  });

  test("combined filters apply AND logic (task_id + wave_id)", () => {
    const entries = [
      makeEntry({ task_id: "w1-t1", wave_id: "wave-1", description: "match" }),
      makeEntry({ task_id: "w1-t1", wave_id: "wave-2", description: "wrong-wave" }),
      makeEntry({ task_id: "w2-t1", wave_id: "wave-1", description: "wrong-task" }),
    ];
    const result = filterTrail(entries, { task_id: "w1-t1", wave_id: "wave-1" });
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe("match");
  });

  test("does not mutate the original array", () => {
    const entries = [
      makeEntry({ timestamp: "2026-03-05T12:00:00.000Z" }),
      makeEntry({ timestamp: "2026-03-05T10:00:00.000Z" }),
    ];
    const copy = [...entries];
    filterTrail(entries, {});
    expect(entries[0].timestamp).toBe(copy[0].timestamp);
    expect(entries[1].timestamp).toBe(copy[1].timestamp);
  });
});

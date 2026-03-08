import { describe, expect, test } from "bun:test";
import { DecisionTrailEntrySchema, type DecisionTrailEntry } from "./decision-trail";

describe("DecisionTrailEntrySchema", () => {
  const validEntry: DecisionTrailEntry = {
    timestamp: "2026-03-02T12:00:00.000Z",
    event_type: "decision",
    description: "Chose TypeScript over Rust for CLI",
    reasoning: "Faster iteration, JSON-native, matches team expertise",
    alternatives_considered: ["Rust", "Python", "Go"],
    constraint_refs: [],
    outcome: "approved",
  };

  test("validates a correct entry", () => {
    const result = DecisionTrailEntrySchema.safeParse(validEntry);
    expect(result.success).toBe(true);
  });

  test("allows optional task_id and wave_id", () => {
    const withIds = { ...validEntry, task_id: "t1", wave_id: "w1" };
    const result = DecisionTrailEntrySchema.safeParse(withIds);
    expect(result.success).toBe(true);
  });

  test("rejects invalid event_type", () => {
    const invalid = { ...validEntry, event_type: "log" };
    const result = DecisionTrailEntrySchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  test("rejects invalid outcome", () => {
    const invalid = { ...validEntry, outcome: "maybe" };
    const result = DecisionTrailEntrySchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  test("rejects invalid timestamp format", () => {
    const invalid = { ...validEntry, timestamp: "not-a-date" };
    const result = DecisionTrailEntrySchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  test("accepts routing event_type", () => {
    const entry = {
      timestamp: "2026-03-04T00:00:00.000Z",
      event_type: "routing",
      description: "Routed task t1 to haiku",
      reasoning: "Heuristic: simple rename task",
      alternatives_considered: ["sonnet", "opus"],
      constraint_refs: [],
      outcome: "approved",
    };
    const result = DecisionTrailEntrySchema.safeParse(entry);
    expect(result.success).toBe(true);
  });
});

import { describe, expect, test } from "bun:test";
import { computeEntryHash, verifyChain } from "./trail-verify";
import type { DecisionTrailEntry } from "../schemas/decision-trail";

describe("computeEntryHash", () => {
  test("produces consistent hash for same input", () => {
    const entry = {
      timestamp: "2026-03-02T00:00:00.000Z",
      event_type: "decision" as const,
      description: "test",
      reasoning: "test",
      alternatives_considered: [],
      constraint_refs: [],
      outcome: "approved" as const,
      prev_hash: "0",
      entry_hash: "",
      inputs_hash: "abc",
      risk_level: "low" as const,
    };
    const hash1 = computeEntryHash(entry);
    const hash2 = computeEntryHash(entry);
    expect(hash1).toBe(hash2);
  });

  test("produces different hash for different input", () => {
    const entry1 = {
      timestamp: "2026-03-02T00:00:00.000Z",
      event_type: "decision" as const,
      description: "test1",
      reasoning: "test",
      alternatives_considered: [],
      constraint_refs: [],
      outcome: "approved" as const,
      prev_hash: "0",
      entry_hash: "",
      inputs_hash: "abc",
      risk_level: "low" as const,
    };
    const entry2 = { ...entry1, description: "test2" };
    expect(computeEntryHash(entry1)).not.toBe(computeEntryHash(entry2));
  });
});

describe("verifyChain", () => {
  test("verifies valid chain", () => {
    const entry1: any = {
      timestamp: "2026-03-02T00:00:00.000Z",
      event_type: "decision",
      description: "first",
      reasoning: "r",
      alternatives_considered: [],
      constraint_refs: [],
      outcome: "approved",
      prev_hash: "0",
      entry_hash: "",
      inputs_hash: "abc",
      risk_level: "low",
    };
    entry1.entry_hash = computeEntryHash(entry1);

    const entry2: any = {
      timestamp: "2026-03-02T00:01:00.000Z",
      event_type: "command",
      description: "second",
      reasoning: "r",
      alternatives_considered: [],
      constraint_refs: [],
      outcome: "approved",
      prev_hash: entry1.entry_hash,
      entry_hash: "",
      inputs_hash: "def",
      risk_level: "low",
    };
    entry2.entry_hash = computeEntryHash(entry2);

    const result = verifyChain([entry1, entry2]);
    expect(result.valid).toBe(true);
    expect(result.broken_at).toBeUndefined();
  });

  test("detects tampered entry", () => {
    const entry1: any = {
      timestamp: "2026-03-02T00:00:00.000Z",
      event_type: "decision",
      description: "first",
      reasoning: "r",
      alternatives_considered: [],
      constraint_refs: [],
      outcome: "approved",
      prev_hash: "0",
      entry_hash: "",
      inputs_hash: "abc",
      risk_level: "low",
    };
    entry1.entry_hash = computeEntryHash(entry1);

    const tampered = { ...entry1, description: "tampered" };

    const result = verifyChain([tampered]);
    expect(result.valid).toBe(false);
    expect(result.broken_at).toBe(0);
  });

  test("verifies empty chain", () => {
    const result = verifyChain([]);
    expect(result.valid).toBe(true);
  });
});

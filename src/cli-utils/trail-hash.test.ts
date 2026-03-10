import { describe, test, expect } from "bun:test";
import {
  computeEntryHash,
  computeInputsHash,
  validateHashChain,
  hashEntry,
} from "./trail-hash";

describe("trail-hash", () => {
  test("computeEntryHash produces consistent SHA-256 hex", () => {
    const entry = { event_type: "decision", description: "test", timestamp: "2026-03-10" };
    const hash1 = computeEntryHash(entry);
    const hash2 = computeEntryHash(entry);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64); // SHA-256 hex = 64 chars
  });

  test("computeEntryHash excludes hash fields from computation", () => {
    const base = { event_type: "decision", description: "test" };
    const withHash = { ...base, entry_hash: "abc123", prev_hash: "def456" };
    expect(computeEntryHash(base)).toBe(computeEntryHash(withHash));
  });

  test("computeEntryHash is order-independent for keys", () => {
    const a = { b: 2, a: 1 };
    const b = { a: 1, b: 2 };
    expect(computeEntryHash(a)).toBe(computeEntryHash(b));
  });

  test("computeInputsHash produces valid SHA-256", () => {
    const hash = computeInputsHash({ files: ["a.ts", "b.ts"], command: "bun test" });
    expect(hash).toHaveLength(64);
  });

  test("computeEntryHash is order-independent for nested keys", () => {
    const a = { meta: { z: 3, a: 1 }, event_type: "decision" };
    const b = { event_type: "decision", meta: { a: 1, z: 3 } };
    expect(computeEntryHash(a)).toBe(computeEntryHash(b));
  });

  test("validateHashChain passes for valid chain", () => {
    const e1 = hashEntry({ event_type: "decision", description: "first" });
    const e2 = hashEntry({ event_type: "decision", description: "second" }, e1.entry_hash as string);
    const e3 = hashEntry({ event_type: "decision", description: "third" }, e2.entry_hash as string);
    const result = validateHashChain([e1, e2, e3]);
    expect(result.valid).toBe(true);
    expect(result.total).toBe(3);
    expect(result.broken_at).toBeUndefined();
  });

  test("validateHashChain detects tampered entry", () => {
    const e1 = hashEntry({ event_type: "decision", description: "first" });
    const e2 = hashEntry({ event_type: "decision", description: "second" }, e1.entry_hash as string);
    // Tamper with e1's description after hashing
    const tampered = { ...e1, description: "TAMPERED" };
    const result = validateHashChain([tampered, e2]);
    expect(result.valid).toBe(false);
    expect(result.broken_at).toBe(0);
  });

  test("validateHashChain detects broken chain link", () => {
    const e1 = hashEntry({ event_type: "decision", description: "first" });
    const e2 = hashEntry({ event_type: "decision", description: "second" }, "wrong_prev_hash");
    const result = validateHashChain([e1, e2]);
    expect(result.valid).toBe(false);
    expect(result.broken_at).toBe(1);
  });

  test("validateHashChain passes for entries without hash fields", () => {
    // Legacy entries without hashes should pass
    const entries = [
      { event_type: "decision", description: "old entry 1" },
      { event_type: "decision", description: "old entry 2" },
    ];
    const result = validateHashChain(entries);
    expect(result.valid).toBe(true);
    expect(result.total).toBe(2);
  });

  test("hashEntry adds entry_hash and prev_hash", () => {
    const entry = { event_type: "decision", description: "test" };
    const hashed = hashEntry(entry, "prev123");
    expect(hashed.entry_hash).toHaveLength(64);
    expect(hashed.prev_hash).toBe("prev123");
    expect(hashed.event_type).toBe("decision");
  });
});

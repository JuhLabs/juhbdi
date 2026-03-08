import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { computeEntryHash, verifyChain, appendTrailEntry, readTrail } from "../src/core/trail.js";
import type { DecisionTrailEntry } from "../src/core/schemas.js";

describe("trail (audit chain)", () => {
  let tempDir: string;
  let trailFile: string;

  before(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "bdi-test-"));
    trailFile = join(tempDir, "trail.jsonl");
  });

  after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("computes deterministic SHA-256 hashes", () => {
    const entry: DecisionTrailEntry = {
      timestamp: "2026-03-01T00:00:00.000Z",
      event_type: "decision",
      description: "Test decision",
      reasoning: "Testing",
      alternatives_considered: [],
      constraint_refs: [],
      outcome: "approved",
      entry_hash: "",
    };

    const hash1 = computeEntryHash(entry);
    const hash2 = computeEntryHash(entry);
    assert.equal(hash1, hash2);
    assert.equal(hash1.length, 64); // SHA-256 hex
  });

  it("appends and reads trail entries", async () => {
    await appendTrailEntry(trailFile, {
      event_type: "decision",
      description: "First decision",
      reasoning: "Because reasons",
      alternatives_considered: ["Option A", "Option B"],
      constraint_refs: [],
      outcome: "approved",
    });

    await appendTrailEntry(trailFile, {
      event_type: "decision",
      description: "Second decision",
      reasoning: "More reasons",
      alternatives_considered: [],
      constraint_refs: [],
      outcome: "approved",
    });

    const trail = await readTrail(trailFile);
    assert.equal(trail.length, 2);
    assert.equal(trail[0].description, "First decision");
    assert.equal(trail[1].description, "Second decision");
  });

  it("maintains hash chain integrity", async () => {
    const trail = await readTrail(trailFile);
    const verification = verifyChain(trail);
    assert.equal(verification.valid, true);
  });

  it("chains prev_hash correctly", async () => {
    const trail = await readTrail(trailFile);
    assert.equal(trail[0].prev_hash, "0");
    assert.equal(trail[1].prev_hash, trail[0].entry_hash);
  });

  it("returns empty array for missing file", async () => {
    const trail = await readTrail(join(tempDir, "nonexistent.jsonl"));
    assert.deepEqual(trail, []);
  });
});

describe("chain verification", () => {
  it("verifies empty chain", () => {
    const result = verifyChain([]);
    assert.equal(result.valid, true);
  });

  it("detects tampered entries", () => {
    const entry: DecisionTrailEntry = {
      timestamp: "2026-03-01T00:00:00.000Z",
      event_type: "decision",
      description: "Original",
      reasoning: "Test",
      alternatives_considered: [],
      constraint_refs: [],
      outcome: "approved",
      entry_hash: "",
      prev_hash: "0",
    };
    entry.entry_hash = computeEntryHash(entry);

    // Tamper with the description
    const tampered = { ...entry, description: "Tampered!" };
    const result = verifyChain([tampered]);
    assert.equal(result.valid, false);
    assert.equal(result.broken_at, 0);
  });
});

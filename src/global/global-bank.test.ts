// src/global/global-bank.test.ts
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readFile, writeFile, mkdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import {
  jaccardSimilarity,
  isDuplicate,
  promoteGlobalPrinciple,
  queryGlobalPrinciples,
  demoteStale,
  promoteGlobalMemory,
  queryGlobalMemory,
  loadGlobalCalibration,
  promoteCalibration,
  type RouterCalibration,
  _setGlobalDir,
} from "./global-bank";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "juhbdi-global-test-"));
  _setGlobalDir(tempDir);
});

afterEach(async () => {
  _setGlobalDir(null);
  await rm(tempDir, { recursive: true, force: true });
});

// ─── Jaccard Similarity ───────────────────────────────────────────────

describe("jaccardSimilarity", () => {
  test("identical strings return 1", () => {
    expect(jaccardSimilarity("hello world", "hello world")).toBe(1);
  });

  test("completely disjoint strings return 0", () => {
    expect(jaccardSimilarity("alpha beta", "gamma delta")).toBe(0);
  });

  test("partial overlap returns correct value", () => {
    // "hello world foo" -> {hello, world, foo}
    // "hello world bar" -> {hello, world, bar}
    // intersection = {hello, world} = 2, union = {hello, world, foo, bar} = 4
    const sim = jaccardSimilarity("hello world foo", "hello world bar");
    expect(sim).toBeCloseTo(0.5, 5);
  });

  test("case insensitive", () => {
    expect(jaccardSimilarity("Hello World", "hello world")).toBe(1);
  });

  test("empty strings return 0", () => {
    expect(jaccardSimilarity("", "")).toBe(0);
  });

  test("one empty string returns 0", () => {
    expect(jaccardSimilarity("hello", "")).toBe(0);
  });
});

// ─── isDuplicate ──────────────────────────────────────────────────────

describe("isDuplicate", () => {
  test("exact match is duplicate", () => {
    expect(isDuplicate("same text here", "same text here")).toBe(true);
  });

  test("above threshold is duplicate", () => {
    // 10 words each, 9 shared, 1 different → intersection=9, union=11 → 9/11 ≈ 0.818 > 0.8
    expect(isDuplicate(
      "alpha beta gamma delta epsilon zeta eta theta iota kappa",
      "alpha beta gamma delta epsilon zeta eta theta iota lambda"
    )).toBe(true);
  });

  test("below threshold is not duplicate", () => {
    expect(isDuplicate("completely different text", "nothing alike here")).toBe(false);
  });

  test("custom threshold", () => {
    // "a b c" vs "a b d" -> intersection=2, union=4 -> 0.5
    expect(isDuplicate("alpha beta gamma", "alpha beta delta", 0.4)).toBe(true);
    expect(isDuplicate("alpha beta gamma", "alpha beta delta", 0.6)).toBe(false);
  });
});

// ─── Promote Global Principles ────────────────────────────────────────

describe("promoteGlobalPrinciple", () => {
  test("promotes when confidence > 0.8 and times_validated >= 3", async () => {
    const result = await promoteGlobalPrinciple({
      text: "Always write tests before implementation",
      confidence: 0.9,
      times_validated: 5,
      times_applied: 10,
      domain_tags: ["testing", "tdd"],
      source_tasks: ["task-1"],
    }, "project-alpha");

    expect(result).toBe(true);

    const raw = await readFile(join(tempDir, "principles.json"), "utf-8");
    const data = JSON.parse(raw);
    expect(data.principles.length).toBe(1);
    expect(data.principles[0].text).toBe("Always write tests before implementation");
    expect(data.principles[0].source_project).toBe("project-alpha");
  });

  test("rejects when confidence <= 0.8", async () => {
    const result = await promoteGlobalPrinciple({
      text: "Low confidence principle",
      confidence: 0.7,
      times_validated: 5,
      times_applied: 10,
      domain_tags: [],
      source_tasks: [],
    }, "project-alpha");

    expect(result).toBe(false);
  });

  test("rejects when times_validated < 3", async () => {
    const result = await promoteGlobalPrinciple({
      text: "Under-validated principle",
      confidence: 0.95,
      times_validated: 2,
      times_applied: 10,
      domain_tags: [],
      source_tasks: [],
    }, "project-alpha");

    expect(result).toBe(false);
  });

  test("deduplicates by Jaccard > 0.8, keeping higher confidence", async () => {
    // Add first principle
    await promoteGlobalPrinciple({
      text: "always write unit tests before code implementation",
      confidence: 0.85,
      times_validated: 3,
      times_applied: 5,
      domain_tags: ["testing"],
      source_tasks: ["t1"],
    }, "project-a");

    // Add near-duplicate with higher confidence
    await promoteGlobalPrinciple({
      text: "always write unit tests before code implementation please",
      confidence: 0.95,
      times_validated: 4,
      times_applied: 8,
      domain_tags: ["testing"],
      source_tasks: ["t2"],
    }, "project-b");

    const raw = await readFile(join(tempDir, "principles.json"), "utf-8");
    const data = JSON.parse(raw);
    expect(data.principles.length).toBe(1);
    expect(data.principles[0].confidence).toBe(0.95);
  });

  test("keeps both when Jaccard <= 0.8", async () => {
    await promoteGlobalPrinciple({
      text: "always write unit tests before implementation",
      confidence: 0.85,
      times_validated: 3,
      times_applied: 5,
      domain_tags: ["testing"],
      source_tasks: [],
    }, "project-a");

    await promoteGlobalPrinciple({
      text: "prefer composition over inheritance in design",
      confidence: 0.9,
      times_validated: 4,
      times_applied: 8,
      domain_tags: ["design"],
      source_tasks: [],
    }, "project-b");

    const raw = await readFile(join(tempDir, "principles.json"), "utf-8");
    const data = JSON.parse(raw);
    expect(data.principles.length).toBe(2);
  });
});

// ─── Query Global Principles ──────────────────────────────────────────

describe("queryGlobalPrinciples", () => {
  test("ranks by relevance descending", async () => {
    // Pre-populate
    const principles = [
      { text: "always write tests before implementation code", confidence: 0.9, source_project: "p1", times_validated: 5, times_applied: 10, domain_tags: ["testing"] },
      { text: "prefer composition over deep inheritance chains", confidence: 0.85, source_project: "p2", times_validated: 3, times_applied: 5, domain_tags: ["design"] },
      { text: "database migrations should be reversible always", confidence: 0.88, source_project: "p3", times_validated: 4, times_applied: 7, domain_tags: ["database"] },
    ];
    await writeFile(join(tempDir, "principles.json"), JSON.stringify({ principles }, null, 2));

    const results = await queryGlobalPrinciples("write tests implementation");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].text).toContain("tests");
    expect(results[0].relevance).toBeGreaterThan(0);
  });

  test("returns empty for no matches", async () => {
    await writeFile(join(tempDir, "principles.json"), JSON.stringify({ principles: [] }, null, 2));
    const results = await queryGlobalPrinciples("something random");
    expect(results).toEqual([]);
  });

  test("returns empty when bank file missing", async () => {
    const results = await queryGlobalPrinciples("anything");
    expect(results).toEqual([]);
  });

  test("respects topK limit", async () => {
    const principles = Array.from({ length: 10 }, (_, i) => ({
      text: `principle about testing approach number ${i}`,
      confidence: 0.9,
      source_project: "p1",
      times_validated: 5,
      times_applied: 10,
      domain_tags: ["testing"],
    }));
    await writeFile(join(tempDir, "principles.json"), JSON.stringify({ principles }, null, 2));

    const results = await queryGlobalPrinciples("testing approach", 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });
});

// ─── Demote Stale Principles ──────────────────────────────────────────

describe("demoteStale", () => {
  test("decays confidence for underperforming principles", async () => {
    const principles = [
      { text: "stale principle that is rarely validated", confidence: 0.6, source_project: "p1", times_validated: 0, times_applied: 5, domain_tags: [] },
    ];
    await writeFile(join(tempDir, "principles.json"), JSON.stringify({ principles }, null, 2));

    const removed = await demoteStale();
    expect(removed).toBe(0); // decayed but not removed (0.6 - 0.1 = 0.5 > 0.3)

    const raw = await readFile(join(tempDir, "principles.json"), "utf-8");
    const data = JSON.parse(raw);
    expect(data.principles[0].confidence).toBeCloseTo(0.5, 5);
  });

  test("removes principles below 0.3 after decay", async () => {
    const principles = [
      { text: "very stale principle", confidence: 0.35, source_project: "p1", times_validated: 0, times_applied: 10, domain_tags: [] },
    ];
    await writeFile(join(tempDir, "principles.json"), JSON.stringify({ principles }, null, 2));

    const removed = await demoteStale();
    expect(removed).toBe(1);

    const raw = await readFile(join(tempDir, "principles.json"), "utf-8");
    const data = JSON.parse(raw);
    expect(data.principles.length).toBe(0);
  });

  test("no-op when all principles are healthy", async () => {
    const principles = [
      { text: "healthy principle", confidence: 0.9, source_project: "p1", times_validated: 4, times_applied: 5, domain_tags: [] },
    ];
    await writeFile(join(tempDir, "principles.json"), JSON.stringify({ principles }, null, 2));

    const removed = await demoteStale();
    expect(removed).toBe(0);

    const raw = await readFile(join(tempDir, "principles.json"), "utf-8");
    const data = JSON.parse(raw);
    expect(data.principles[0].confidence).toBe(0.9);
  });

  test("no-op when times_applied < 5", async () => {
    const principles = [
      { text: "new principle", confidence: 0.9, source_project: "p1", times_validated: 0, times_applied: 3, domain_tags: [] },
    ];
    await writeFile(join(tempDir, "principles.json"), JSON.stringify({ principles }, null, 2));

    const removed = await demoteStale();
    expect(removed).toBe(0);

    const raw = await readFile(join(tempDir, "principles.json"), "utf-8");
    const data = JSON.parse(raw);
    expect(data.principles[0].confidence).toBe(0.9);
  });

  test("handles missing file gracefully", async () => {
    const removed = await demoteStale();
    expect(removed).toBe(0);
  });
});

// ─── Promote Global Memory ───────────────────────────────────────────

describe("promoteGlobalMemory", () => {
  test("promotes when utility > 0.8, test pass, 0 strikes", async () => {
    const result = await promoteGlobalMemory({
      intent: { task_description: "implement auth module", domain_tags: ["auth"] },
      experience: { approach: "jwt-based", test_result: "pass", strikes_used: 0 },
      utility: 0.95,
    }, "project-alpha");

    expect(result).toBe(true);

    const raw = await readFile(join(tempDir, "memory-bank.json"), "utf-8");
    const data = JSON.parse(raw);
    expect(data.triplets.length).toBe(1);
    expect(data.triplets[0].source_project).toBe("project-alpha");
  });

  test("rejects when utility <= 0.8", async () => {
    const result = await promoteGlobalMemory({
      intent: { task_description: "low utility task", domain_tags: [] },
      experience: { approach: "direct", test_result: "pass", strikes_used: 0 },
      utility: 0.7,
    }, "project-alpha");

    expect(result).toBe(false);
  });

  test("rejects when test_result is not pass", async () => {
    const result = await promoteGlobalMemory({
      intent: { task_description: "failed task", domain_tags: [] },
      experience: { approach: "direct", test_result: "fail", strikes_used: 0 },
      utility: 0.95,
    }, "project-alpha");

    expect(result).toBe(false);
  });

  test("rejects when strikes_used > 0", async () => {
    const result = await promoteGlobalMemory({
      intent: { task_description: "retried task", domain_tags: [] },
      experience: { approach: "direct", test_result: "pass", strikes_used: 1 },
      utility: 0.95,
    }, "project-alpha");

    expect(result).toBe(false);
  });

  test("deduplicates by task_description Jaccard > 0.8", async () => {
    await promoteGlobalMemory({
      intent: { task_description: "implement authentication module with jwt tokens", domain_tags: ["auth"] },
      experience: { approach: "jwt", test_result: "pass", strikes_used: 0 },
      utility: 0.85,
    }, "project-a");

    await promoteGlobalMemory({
      intent: { task_description: "implement authentication module with jwt tokens securely", domain_tags: ["auth"] },
      experience: { approach: "jwt-v2", test_result: "pass", strikes_used: 0 },
      utility: 0.95,
    }, "project-b");

    const raw = await readFile(join(tempDir, "memory-bank.json"), "utf-8");
    const data = JSON.parse(raw);
    expect(data.triplets.length).toBe(1);
    expect(data.triplets[0].utility).toBe(0.95);
  });
});

// ─── Query Global Memory ─────────────────────────────────────────────

describe("queryGlobalMemory", () => {
  test("ranks results by relevance", async () => {
    const triplets = [
      {
        intent: { task_description: "implement authentication with jwt tokens", domain_tags: ["auth"] },
        experience: { approach: "jwt-based", test_result: "pass", strikes_used: 0 },
        utility: 0.95, source_project: "p1",
      },
      {
        intent: { task_description: "database migration schema update", domain_tags: ["database"] },
        experience: { approach: "alembic", test_result: "pass", strikes_used: 0 },
        utility: 0.9, source_project: "p2",
      },
    ];
    await writeFile(join(tempDir, "memory-bank.json"), JSON.stringify({ triplets }, null, 2));

    const results = await queryGlobalMemory("authentication tokens");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].task_description).toContain("authentication");
  });

  test("returns empty when no matches", async () => {
    await writeFile(join(tempDir, "memory-bank.json"), JSON.stringify({ triplets: [] }, null, 2));
    const results = await queryGlobalMemory("something random");
    expect(results).toEqual([]);
  });

  test("handles missing file", async () => {
    const results = await queryGlobalMemory("anything");
    expect(results).toEqual([]);
  });

  test("respects topK limit", async () => {
    const triplets = Array.from({ length: 10 }, (_, i) => ({
      intent: { task_description: `testing approach variant ${i}`, domain_tags: ["testing"] },
      experience: { approach: "direct", test_result: "pass", strikes_used: 0 },
      utility: 0.9, source_project: "p1",
    }));
    await writeFile(join(tempDir, "memory-bank.json"), JSON.stringify({ triplets }, null, 2));

    const results = await queryGlobalMemory("testing approach", 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });
});

// ─── Router Calibration ──────────────────────────────────────────────

describe("loadGlobalCalibration", () => {
  test("returns null when file missing", async () => {
    const result = await loadGlobalCalibration();
    expect(result).toBeNull();
  });

  test("loads existing calibration", async () => {
    const cal: RouterCalibration = {
      recent_decisions: [
        { task_id: "t1", recommended_tier: "sonnet", actual_tier: "sonnet", timestamp: "2026-03-10T00:00:00Z" },
      ],
      accuracy: 0.85,
      opus_threshold: 4,
      haiku_threshold: -4,
      total_routed: 100,
      updated: "2026-03-10T00:00:00Z",
    };
    await writeFile(join(tempDir, "router-calibration.json"), JSON.stringify(cal, null, 2));

    const result = await loadGlobalCalibration();
    expect(result).not.toBeNull();
    expect(result!.accuracy).toBe(0.85);
    expect(result!.recent_decisions.length).toBe(1);
  });
});

describe("promoteCalibration", () => {
  test("saves calibration when no existing file", async () => {
    const local: RouterCalibration = {
      recent_decisions: [
        { task_id: "t1", recommended_tier: "sonnet", actual_tier: "sonnet", timestamp: "2026-03-10T00:00:00Z" },
      ],
      accuracy: 0.9,
      opus_threshold: 4,
      haiku_threshold: -4,
      total_routed: 10,
      updated: "2026-03-10T00:00:00Z",
    };

    await promoteCalibration(local);

    const raw = await readFile(join(tempDir, "router-calibration.json"), "utf-8");
    const saved = JSON.parse(raw);
    expect(saved.total_routed).toBe(10);
  });

  test("merges decisions capped at 20", async () => {
    const existingDecisions = Array.from({ length: 15 }, (_, i) => ({
      task_id: `existing-${i}`,
      recommended_tier: "sonnet",
      actual_tier: "sonnet",
      timestamp: `2026-03-0${Math.min(9, i + 1)}T00:00:00Z`,
    }));
    const existing: RouterCalibration = {
      recent_decisions: existingDecisions,
      accuracy: 0.8,
      opus_threshold: 4,
      haiku_threshold: -4,
      total_routed: 50,
      updated: "2026-03-09T00:00:00Z",
    };
    await writeFile(join(tempDir, "router-calibration.json"), JSON.stringify(existing, null, 2));

    const local: RouterCalibration = {
      recent_decisions: Array.from({ length: 10 }, (_, i) => ({
        task_id: `local-${i}`,
        recommended_tier: "opus",
        actual_tier: "opus",
        timestamp: `2026-03-10T0${i}:00:00Z`,
      })),
      accuracy: 0.9,
      opus_threshold: 4,
      haiku_threshold: -4,
      total_routed: 10,
      updated: "2026-03-10T00:00:00Z",
    };

    await promoteCalibration(local);

    const raw = await readFile(join(tempDir, "router-calibration.json"), "utf-8");
    const saved = JSON.parse(raw);
    expect(saved.recent_decisions.length).toBeLessThanOrEqual(20);
    expect(saved.total_routed).toBe(60);
  });

  test("lowers thresholds when accuracy < 0.7", async () => {
    // All decisions mismatch: recommended sonnet, actual opus
    const decisions = Array.from({ length: 10 }, (_, i) => ({
      task_id: `t-${i}`,
      recommended_tier: "sonnet",
      actual_tier: "opus",
      timestamp: `2026-03-10T0${i}:00:00Z`,
    }));
    const existing: RouterCalibration = {
      recent_decisions: decisions,
      accuracy: 0.3,
      opus_threshold: 4,
      haiku_threshold: -4,
      total_routed: 10,
      updated: "2026-03-10T00:00:00Z",
    };
    await writeFile(join(tempDir, "router-calibration.json"), JSON.stringify(existing, null, 2));

    const local: RouterCalibration = {
      recent_decisions: [],
      accuracy: 0.5,
      opus_threshold: 4,
      haiku_threshold: -4,
      total_routed: 0,
      updated: "2026-03-10T01:00:00Z",
    };

    await promoteCalibration(local);

    const raw = await readFile(join(tempDir, "router-calibration.json"), "utf-8");
    const saved = JSON.parse(raw);
    // accuracy from merged: 0 correct / 10 = 0.0 < 0.7 → lower opus by 3, lower haiku by -5
    expect(saved.opus_threshold).toBeLessThan(4);
    expect(saved.haiku_threshold).toBeLessThan(-4);
  });

  test("raises thresholds when accuracy > 0.9", async () => {
    // All decisions match: recommended = actual
    const decisions = Array.from({ length: 10 }, (_, i) => ({
      task_id: `t-${i}`,
      recommended_tier: "sonnet",
      actual_tier: "sonnet",
      timestamp: `2026-03-10T0${i}:00:00Z`,
    }));
    const existing: RouterCalibration = {
      recent_decisions: decisions,
      accuracy: 0.95,
      opus_threshold: 4,
      haiku_threshold: -4,
      total_routed: 10,
      updated: "2026-03-10T00:00:00Z",
    };
    await writeFile(join(tempDir, "router-calibration.json"), JSON.stringify(existing, null, 2));

    const local: RouterCalibration = {
      recent_decisions: [],
      accuracy: 0.95,
      opus_threshold: 4,
      haiku_threshold: -4,
      total_routed: 0,
      updated: "2026-03-10T01:00:00Z",
    };

    await promoteCalibration(local);

    const raw = await readFile(join(tempDir, "router-calibration.json"), "utf-8");
    const saved = JSON.parse(raw);
    // accuracy from merged: 10 correct / 10 = 1.0 > 0.9 → raise opus by 5, raise haiku by -3
    expect(saved.opus_threshold).toBeGreaterThan(4);
    expect(saved.haiku_threshold).toBeGreaterThan(-4);
  });
});

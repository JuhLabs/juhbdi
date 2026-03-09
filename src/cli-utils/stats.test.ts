import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { gatherStats, formatStats, formatStatLine, type JuhBDIStats } from "./stats";
import { tmpdir } from "os";

const TEST_DIR = join(tmpdir(), `juhbdi-stats-test-${Date.now()}`);

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  try { rmSync(TEST_DIR, { recursive: true, force: true }); } catch { /* ignore */ }
});

function makeEmptyStats(): JuhBDIStats {
  return {
    total_tasks_executed: 0,
    tasks_passed: 0,
    tasks_failed: 0,
    pass_rate: 0,
    current_trust_score: 0.5,
    current_tier: "Intern",
    reflexions_stored: 0,
    principles_learned: 0,
    experiences_banked: 0,
    session_tasks: 0,
    session_pass_rate: 0,
    total_decisions: 0,
    governance_violations: 0,
    overrides: 0,
  };
}

describe("gatherStats", () => {
  test("returns valid stats object from empty directory", async () => {
    const stats = await gatherStats(TEST_DIR);
    expect(stats.total_tasks_executed).toBe(0);
    expect(stats.total_decisions).toBe(0);
    expect(stats.pass_rate).toBe(0);
    expect(stats.current_tier).toBe("Intern");
    expect(stats.current_trust_score).toBe(0.5);
  });

  test("counts trail entries correctly", async () => {
    const trailEntries = [
      JSON.stringify({ event_type: "decision", description: "chose approach A", timestamp: "2026-03-09T10:00:00Z" }),
      JSON.stringify({ event_type: "command", description: "ran tests", timestamp: "2026-03-09T10:01:00Z" }),
      JSON.stringify({ event_type: "override", description: "user override", timestamp: "2026-03-09T10:02:00Z" }),
      JSON.stringify({ event_type: "conflict", description: "governance conflict", timestamp: "2026-03-09T10:03:00Z" }),
    ];
    writeFileSync(join(TEST_DIR, "decision-trail.jsonl"), trailEntries.join("\n"));
    const stats = await gatherStats(TEST_DIR);
    expect(stats.total_decisions).toBe(4);
    expect(stats.overrides).toBe(1);
    expect(stats.governance_violations).toBe(1);
  });

  test("computes pass rate correctly from trust store", async () => {
    const store = {
      version: "1.0.0",
      records: {
        default: {
          agent_tier: "sonnet",
          tasks_attempted: 10,
          tasks_passed: 8,
          avg_strikes: 0.5,
          violation_count: 1,
          last_10_outcomes: ["pass", "pass", "pass", "pass", "pass", "pass", "pass", "pass", "fail", "fail"],
        },
      },
    };
    writeFileSync(join(TEST_DIR, "trust-store.json"), JSON.stringify(store));
    const stats = await gatherStats(TEST_DIR);
    expect(stats.total_tasks_executed).toBe(10);
    expect(stats.tasks_passed).toBe(8);
    expect(stats.pass_rate).toBeCloseTo(0.8, 5);
  });

  test("handles missing files gracefully", async () => {
    // Non-existent directory should still produce valid stats
    const stats = await gatherStats(join(TEST_DIR, "nonexistent"));
    expect(stats.total_tasks_executed).toBe(0);
    expect(stats.reflexions_stored).toBe(0);
  });

  test("reads reflexion and principle banks", async () => {
    writeFileSync(
      join(TEST_DIR, "reflexion-bank.json"),
      JSON.stringify({ entries: [{ id: "r1" }, { id: "r2" }, { id: "r3" }] })
    );
    writeFileSync(
      join(TEST_DIR, "principle-bank.json"),
      JSON.stringify({ entries: [{ id: "p1" }, { id: "p2" }] })
    );
    writeFileSync(
      join(TEST_DIR, "memory-bank.json"),
      JSON.stringify({ entries: [{ id: "m1" }] })
    );
    const stats = await gatherStats(TEST_DIR);
    expect(stats.reflexions_stored).toBe(3);
    expect(stats.principles_learned).toBe(2);
    expect(stats.experiences_banked).toBe(1);
  });

  test("computes correct tier from trust score", async () => {
    const store = {
      version: "1.0.0",
      records: {
        default: {
          agent_tier: "opus",
          tasks_attempted: 20,
          tasks_passed: 19,
          avg_strikes: 0.1,
          violation_count: 0,
          last_10_outcomes: Array(10).fill("pass"),
        },
      },
    };
    writeFileSync(join(TEST_DIR, "trust-store.json"), JSON.stringify(store));
    const stats = await gatherStats(TEST_DIR);
    // passRate=0.95, eff=max(0,1-0.1/3)=0.967, viol=1
    // score = 0.95*0.4 + 0.967*0.3 + 1*0.3 = 0.38 + 0.29 + 0.3 = 0.97 → Principal
    expect(stats.current_tier).toBe("Principal");
  });
});

describe("formatStats", () => {
  test("produces readable output with all sections", () => {
    const stats = makeEmptyStats();
    stats.total_tasks_executed = 47;
    stats.tasks_passed = 42;
    stats.pass_rate = 42 / 47;
    stats.current_tier = "Senior";
    stats.current_trust_score = 0.72;
    stats.total_decisions = 156;
    const output = formatStats(stats);
    expect(output).toContain("JuhBDI Stats");
    expect(output).toContain("Tasks");
    expect(output).toContain("Trust");
    expect(output).toContain("Memory");
    expect(output).toContain("Trail");
    expect(output).toContain("Session");
  });
});

describe("formatStatLine", () => {
  test("formats label and value", () => {
    const line = formatStatLine("Tasks", "47 executed");
    expect(line).toContain("Tasks");
    expect(line).toContain("47 executed");
  });

  test("applies color when specified", () => {
    // Just ensure it doesn't throw
    const line = formatStatLine("Trust", "Senior", "green");
    expect(line).toContain("Senior");
  });
});

import { describe, expect, test } from "bun:test";
import {
  determineTier,
  determineTierFromRecord,
  checkActionPermission,
  formatTierDisplay,
  getTierProgression,
  DEFAULT_TIERS,
  type TierConfig,
} from "./tiered-autonomy";
import type { TrustRecord } from "./trust";
import { computeTrustScore } from "./trust";

function makeRecord(overrides: Partial<TrustRecord> = {}): TrustRecord {
  return {
    agent_tier: "sonnet",
    tasks_attempted: 10,
    tasks_passed: 8,
    avg_strikes: 0.5,
    violation_count: 0,
    last_10_outcomes: ["pass", "pass", "fail", "pass", "pass", "pass", "pass", "pass", "pass", "pass"],
    ...overrides,
  };
}

describe("determineTier", () => {
  test("score 0.0 maps to intern tier", () => {
    const tier = determineTier(0.0);
    expect(tier.tier).toBe("intern");
  });

  test("score 0.35 maps to junior tier", () => {
    const tier = determineTier(0.35);
    expect(tier.tier).toBe("junior");
  });

  test("score 0.6 maps to senior tier", () => {
    const tier = determineTier(0.6);
    expect(tier.tier).toBe("senior");
  });

  test("score 0.85 maps to principal tier", () => {
    const tier = determineTier(0.85);
    expect(tier.tier).toBe("principal");
  });

  test("score 1.0 maps to principal tier", () => {
    const tier = determineTier(1.0);
    expect(tier.tier).toBe("principal");
  });

  test("boundary: 0.349 is intern, 0.35 is junior", () => {
    expect(determineTier(0.349).tier).toBe("intern");
    expect(determineTier(0.35).tier).toBe("junior");
  });

  test("negative scores clamp to intern", () => {
    expect(determineTier(-0.5).tier).toBe("intern");
  });

  test("scores above 1.0 clamp to principal", () => {
    expect(determineTier(1.5).tier).toBe("principal");
  });
});

describe("checkActionPermission", () => {
  test("intern + write_files returns requires_approval", () => {
    const intern = determineTier(0.0);
    expect(checkActionPermission(intern, "write_files")).toBe("requires_approval");
  });

  test("senior + read_files returns allowed", () => {
    const senior = determineTier(0.6);
    expect(checkActionPermission(senior, "read_files")).toBe("allowed");
  });

  test("intern + deploy returns prohibited", () => {
    const intern = determineTier(0.0);
    expect(checkActionPermission(intern, "deploy")).toBe("prohibited");
  });

  test("principal + push_code returns allowed", () => {
    const principal = determineTier(0.9);
    expect(checkActionPermission(principal, "push_code")).toBe("allowed");
  });

  test("junior + delete_files returns requires_approval", () => {
    const junior = determineTier(0.4);
    expect(checkActionPermission(junior, "delete_files")).toBe("requires_approval");
  });

  test("unlisted action defaults to requires_approval", () => {
    // Create a tier with empty lists
    const emptyTier: TierConfig = {
      tier: "intern",
      min_trust_score: 0,
      max_trust_score: 1,
      allowed_actions: [],
      requires_approval: [],
      prohibited_actions: [],
      description: "test",
    };
    expect(checkActionPermission(emptyTier, "deploy")).toBe("requires_approval");
  });
});

describe("determineTierFromRecord", () => {
  test("uses computeTrustScore correctly", () => {
    const record = makeRecord({
      tasks_attempted: 20,
      tasks_passed: 20,
      avg_strikes: 0,
      violation_count: 0,
      last_10_outcomes: Array(10).fill("pass"),
    });
    const score = computeTrustScore(record);
    const tier = determineTierFromRecord(record);
    expect(tier.tier).toBe(determineTier(score).tier);
  });

  test("poor record yields low tier", () => {
    const record = makeRecord({
      tasks_attempted: 10,
      tasks_passed: 2,
      avg_strikes: 2.5,
      violation_count: 5,
      last_10_outcomes: Array(8).fill("fail").concat(Array(2).fill("pass")),
    });
    const tier = determineTierFromRecord(record);
    expect(tier.tier).toBe("intern");
  });
});

describe("getTierProgression", () => {
  test("shows correct next tier and score gap", () => {
    const result = getTierProgression(0.2);
    expect(result.current).toBe("intern");
    expect(result.next).toBe("junior");
    expect(result.score_needed).toBe(0.15);
  });

  test("principal has no next tier", () => {
    const result = getTierProgression(0.95);
    expect(result.current).toBe("principal");
    expect(result.next).toBeNull();
    expect(result.score_needed).toBe(0);
  });

  test("unlocked actions match tier transition", () => {
    const result = getTierProgression(0.3);
    expect(result.current).toBe("intern");
    expect(result.next).toBe("junior");
    // Moving from intern to junior should unlock some previously prohibited actions
    expect(result.actions_unlocked.length).toBeGreaterThan(0);
  });

  test("score at boundary shows current tier", () => {
    const result = getTierProgression(0.6);
    expect(result.current).toBe("senior");
    expect(result.next).toBe("principal");
  });
});

describe("formatTierDisplay", () => {
  test("produces readable output", () => {
    const tier = determineTier(0.72);
    const display = formatTierDisplay(tier, 0.72);
    expect(display).toContain("SENIOR");
    expect(display).toContain("72%");
    expect(display).toContain(tier.description);
  });

  test("intern display contains tier name", () => {
    const tier = determineTier(0.1);
    const display = formatTierDisplay(tier, 0.1);
    expect(display).toContain("INTERN");
    expect(display).toContain("10%");
  });
});

describe("custom tier config", () => {
  test("overrides defaults", () => {
    const customTiers: TierConfig[] = [
      {
        tier: "intern",
        min_trust_score: 0,
        max_trust_score: 0.5,
        allowed_actions: ["read_files"],
        requires_approval: [],
        prohibited_actions: ["deploy"],
        description: "Custom intern",
      },
      {
        tier: "principal",
        min_trust_score: 0.5,
        max_trust_score: 1.0,
        allowed_actions: ["read_files", "write_files", "deploy"],
        requires_approval: [],
        prohibited_actions: [],
        description: "Custom principal",
      },
    ];

    expect(determineTier(0.3, customTiers).tier).toBe("intern");
    expect(determineTier(0.5, customTiers).tier).toBe("principal");
    expect(determineTier(0.8, customTiers).tier).toBe("principal");
  });
});

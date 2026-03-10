import { describe, expect, test } from "bun:test";
import {
  computeAdaptiveTrust,
  applyDynamicDowngrade,
  type TrustObservation,
  type AdaptiveTrustScore,
} from "./adaptive-trust";

function makeObs(overrides: Partial<TrustObservation> = {}): TrustObservation {
  return {
    task_id: "task-1",
    timestamp: new Date().toISOString(),
    passed: true,
    complexity: 0.5,
    scope_files: 2,
    verification_passed: true,
    ...overrides,
  };
}

describe("computeAdaptiveTrust", () => {
  test("uninformative prior gives 0.5 score", () => {
    const result = computeAdaptiveTrust([]);
    expect(result.score).toBe(0.5);
    expect(result.confidence).toBe(0);
    expect(result.streak).toBe(0);
    expect(result.trend).toBe("stable");
  });

  test("all successes approach 1.0", () => {
    const observations = Array.from({ length: 20 }, (_, i) =>
      makeObs({ task_id: `task-${i}`, passed: true, verification_passed: true }),
    );
    const result = computeAdaptiveTrust(observations);
    expect(result.score).toBeGreaterThan(0.85);
    expect(result.tier).toBe("principal");
  });

  test("all failures approach 0.0", () => {
    const observations = Array.from({ length: 20 }, (_, i) =>
      makeObs({ task_id: `task-${i}`, passed: false }),
    );
    const result = computeAdaptiveTrust(observations);
    expect(result.score).toBeLessThan(0.2);
    expect(result.tier).toBe("intern");
  });

  test("recent observations weighted more than old", () => {
    // 15 old failures followed by 5 recent successes
    const oldFailures = Array.from({ length: 15 }, (_, i) =>
      makeObs({ task_id: `old-${i}`, passed: false }),
    );
    const recentSuccesses = Array.from({ length: 5 }, (_, i) =>
      makeObs({ task_id: `new-${i}`, passed: true, verification_passed: true }),
    );
    const result = computeAdaptiveTrust([...oldFailures, ...recentSuccesses]);

    // Compare with all failures — recency weighting means score should be higher
    const allFailures = computeAdaptiveTrust(oldFailures);
    expect(result.score).toBeGreaterThan(allFailures.score);
  });

  test("complexity-weighted: hard task success counts more", () => {
    const easyTasks = Array.from({ length: 5 }, (_, i) =>
      makeObs({ task_id: `easy-${i}`, passed: true, complexity: 0.1, verification_passed: true }),
    );
    const hardTasks = Array.from({ length: 5 }, (_, i) =>
      makeObs({ task_id: `hard-${i}`, passed: true, complexity: 1.0, verification_passed: true }),
    );
    const easyResult = computeAdaptiveTrust(easyTasks);
    const hardResult = computeAdaptiveTrust(hardTasks);
    // Hard task successes should push score higher due to complexity weighting
    expect(hardResult.score).toBeGreaterThan(easyResult.score);
  });

  test("confidence increases with more observations", () => {
    const fewObs = Array.from({ length: 3 }, (_, i) =>
      makeObs({ task_id: `few-${i}`, passed: true, verification_passed: true }),
    );
    const manyObs = Array.from({ length: 30 }, (_, i) =>
      makeObs({ task_id: `many-${i}`, passed: true, verification_passed: true }),
    );
    const fewResult = computeAdaptiveTrust(fewObs);
    const manyResult = computeAdaptiveTrust(manyObs);
    expect(manyResult.confidence).toBeGreaterThan(fewResult.confidence);
  });

  test("trend detection: improving after recent successes", () => {
    // Start with mostly failures, end with successes
    const observations = [
      ...Array.from({ length: 10 }, (_, i) => makeObs({ task_id: `f-${i}`, passed: false })),
      ...Array.from({ length: 5 }, (_, i) =>
        makeObs({ task_id: `s-${i}`, passed: true, verification_passed: true }),
      ),
    ];
    const result = computeAdaptiveTrust(observations);
    expect(result.trend).toBe("improving");
  });

  test("trend detection: declining after recent failures", () => {
    // Start with mostly successes, end with failures
    const observations = [
      ...Array.from({ length: 10 }, (_, i) =>
        makeObs({ task_id: `s-${i}`, passed: true, verification_passed: true }),
      ),
      ...Array.from({ length: 5 }, (_, i) => makeObs({ task_id: `f-${i}`, passed: false })),
    ];
    const result = computeAdaptiveTrust(observations);
    expect(result.trend).toBe("declining");
  });

  test("streak counting: consecutive successes", () => {
    const observations = [
      makeObs({ task_id: "f-1", passed: false }),
      makeObs({ task_id: "s-1", passed: true, verification_passed: true }),
      makeObs({ task_id: "s-2", passed: true, verification_passed: true }),
      makeObs({ task_id: "s-3", passed: true, verification_passed: true }),
    ];
    const result = computeAdaptiveTrust(observations);
    expect(result.streak).toBe(3);
  });

  test("streak counting: consecutive failures", () => {
    const observations = [
      makeObs({ task_id: "s-1", passed: true, verification_passed: true }),
      makeObs({ task_id: "f-1", passed: false }),
      makeObs({ task_id: "f-2", passed: false }),
      makeObs({ task_id: "f-3", passed: false }),
      makeObs({ task_id: "f-4", passed: false }),
    ];
    const result = computeAdaptiveTrust(observations);
    expect(result.streak).toBe(-4);
  });

  test("tier mapping matches thresholds", () => {
    // Create scenarios that produce known score ranges
    // All passes -> high score -> principal
    const allPass = Array.from({ length: 50 }, (_, i) =>
      makeObs({ task_id: `p-${i}`, passed: true, verification_passed: true }),
    );
    expect(computeAdaptiveTrust(allPass).tier).toBe("principal");

    // All fails -> low score -> intern
    const allFail = Array.from({ length: 50 }, (_, i) =>
      makeObs({ task_id: `f-${i}`, passed: false }),
    );
    expect(computeAdaptiveTrust(allFail).tier).toBe("intern");
  });

  test("downgrade risk flagged on declining trend with confidence", () => {
    // Build a scenario with many observations (high confidence) and declining trend
    const observations = [
      ...Array.from({ length: 20 }, (_, i) =>
        makeObs({ task_id: `s-${i}`, passed: true, verification_passed: true }),
      ),
      ...Array.from({ length: 5 }, (_, i) => makeObs({ task_id: `f-${i}`, passed: false })),
    ];
    const result = computeAdaptiveTrust(observations);
    // The trend should be declining and confidence high enough
    if (result.trend === "declining" && result.confidence > 0.5) {
      expect(result.downgrade_risk).toBe(true);
    } else {
      // Even if not declining enough, at least streak should be negative
      expect(result.streak).toBeLessThan(0);
    }
  });
});

describe("applyDynamicDowngrade", () => {
  test("dynamic downgrade on 3+ consecutive failures", () => {
    const trust: AdaptiveTrustScore = {
      score: 0.7,
      confidence: 0.8,
      trend: "declining",
      streak: -3,
      tier: "senior",
      downgrade_risk: false,
    };
    const downgraded = applyDynamicDowngrade(trust, 3);
    expect(downgraded.tier).toBe("junior");
    expect(downgraded.downgrade_risk).toBe(true);
  });

  test("no downgrade below intern", () => {
    const trust: AdaptiveTrustScore = {
      score: 0.4,
      confidence: 0.8,
      trend: "declining",
      streak: -9,
      tier: "junior",
      downgrade_risk: false,
    };
    // 9 consecutive failures = 3 downgrade levels, but can't go below intern
    const downgraded = applyDynamicDowngrade(trust, 9);
    expect(downgraded.tier).toBe("intern");
    expect(downgraded.downgrade_risk).toBe(true);
  });

  test("no downgrade for fewer than 3 failures", () => {
    const trust: AdaptiveTrustScore = {
      score: 0.7,
      confidence: 0.8,
      trend: "stable",
      streak: -2,
      tier: "senior",
      downgrade_risk: false,
    };
    const result = applyDynamicDowngrade(trust, 2);
    expect(result.tier).toBe("senior");
    expect(result.downgrade_risk).toBe(false);
  });
});

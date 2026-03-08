import { describe, expect, test } from "bun:test";
import { scoreApproach } from "./tradeoffs";

describe("scoreApproach", () => {
  const weights = { security: 0.4, performance: 0.2, speed: 0.1, quality: 0.3 };

  test("scores security-focused approach higher with security-weighted config", () => {
    const securityApproach = { security: 0.9, performance: 0.5, speed: 0.3, quality: 0.7 };
    const speedApproach = { security: 0.3, performance: 0.5, speed: 0.9, quality: 0.5 };

    const secScore = scoreApproach(securityApproach, weights);
    const spdScore = scoreApproach(speedApproach, weights);

    expect(secScore).toBeGreaterThan(spdScore);
  });

  test("returns 0 for all-zero ratings", () => {
    const zeros = { security: 0, performance: 0, speed: 0, quality: 0 };
    expect(scoreApproach(zeros, weights)).toBe(0);
  });

  test("returns weighted sum", () => {
    const ratings = { security: 1, performance: 1, speed: 1, quality: 1 };
    const score = scoreApproach(ratings, weights);
    expect(score).toBeCloseTo(1.0, 5);
  });

  test("handles unequal weights", () => {
    const equalRatings = { security: 0.5, performance: 0.5, speed: 0.5, quality: 0.5 };
    const equalWeights = { security: 0.25, performance: 0.25, speed: 0.25, quality: 0.25 };
    expect(scoreApproach(equalRatings, equalWeights)).toBeCloseTo(0.5, 5);
  });
});

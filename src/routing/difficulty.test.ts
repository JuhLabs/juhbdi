import { describe, expect, test } from "bun:test";
import { estimateDifficulty, type DifficultyContext } from "./difficulty";

function makeCtx(overrides: Partial<DifficultyContext> = {}): DifficultyContext {
  return {
    description: "Add a simple log statement",
    affected_file_count: 1,
    verification_type: "lint",
    historical_failure_rate: 0,
    technical_term_count: 0,
    ...overrides,
  };
}

describe("estimateDifficulty", () => {
  test("returns low difficulty for simple task", () => {
    const score = estimateDifficulty(makeCtx());
    expect(score).toBeLessThan(0.3);
    expect(score).toBeGreaterThanOrEqual(0);
  });

  test("returns high difficulty for complex task", () => {
    const score = estimateDifficulty(makeCtx({
      description: "Refactor the authentication system to support OAuth2 with PKCE flow, update all middleware, and migrate existing sessions",
      affected_file_count: 15,
      verification_type: "test",
      historical_failure_rate: 0.6,
      technical_term_count: 8,
    }));
    expect(score).toBeGreaterThan(0.7);
    expect(score).toBeLessThanOrEqual(1);
  });

  test("word count increases difficulty", () => {
    const short = estimateDifficulty(makeCtx({ description: "Fix typo" }));
    const long = estimateDifficulty(makeCtx({
      description: "Implement a comprehensive data validation pipeline with input sanitization, schema enforcement, error aggregation, and detailed reporting for the ingestion service",
    }));
    expect(long).toBeGreaterThan(short);
  });

  test("more affected files increases difficulty", () => {
    const few = estimateDifficulty(makeCtx({ affected_file_count: 1 }));
    const many = estimateDifficulty(makeCtx({ affected_file_count: 12 }));
    expect(many).toBeGreaterThan(few);
  });

  test("test verification is harder than lint", () => {
    const lint = estimateDifficulty(makeCtx({ verification_type: "lint" }));
    const testV = estimateDifficulty(makeCtx({ verification_type: "test" }));
    expect(testV).toBeGreaterThan(lint);
  });

  test("historical failure rate increases difficulty", () => {
    const safe = estimateDifficulty(makeCtx({ historical_failure_rate: 0 }));
    const risky = estimateDifficulty(makeCtx({ historical_failure_rate: 0.8 }));
    expect(risky).toBeGreaterThan(safe);
  });

  test("clamps to [0, 1]", () => {
    const score = estimateDifficulty(makeCtx({
      description: "a".repeat(500),
      affected_file_count: 100,
      verification_type: "manual",
      historical_failure_rate: 1,
      technical_term_count: 50,
    }));
    expect(score).toBeLessThanOrEqual(1);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

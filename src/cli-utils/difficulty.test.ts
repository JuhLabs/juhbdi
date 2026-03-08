import { describe, test, expect } from "bun:test";
import { estimateDifficulty, type DifficultyContext } from "../routing/difficulty";

function makeContext(overrides: Partial<DifficultyContext> = {}): DifficultyContext {
  return {
    description: "implement user authentication with JWT tokens",
    affected_file_count: 3,
    verification_type: "test",
    historical_failure_rate: 0.1,
    technical_term_count: 2,
    ...overrides,
  };
}

describe("difficulty CLI integration", () => {
  test("estimateDifficulty returns value between 0 and 1", () => {
    const result = estimateDifficulty(makeContext());
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });

  test("simple task has lower difficulty than complex task", () => {
    const simple = estimateDifficulty(makeContext({
      description: "fix typo",
      affected_file_count: 1,
      verification_type: "lint",
      historical_failure_rate: 0,
      technical_term_count: 0,
    }));
    const complex = estimateDifficulty(makeContext({
      description: "architect the authentication layer with OAuth2 PKCE flow, integrate JWT validation, add session management, implement RBAC permissions, and configure rate limiting",
      affected_file_count: 10,
      verification_type: "test",
      historical_failure_rate: 0.8,
      technical_term_count: 8,
    }));
    expect(complex).toBeGreaterThan(simple);
  });

  test("more affected files increases difficulty", () => {
    const few = estimateDifficulty(makeContext({ affected_file_count: 1 }));
    const many = estimateDifficulty(makeContext({ affected_file_count: 10 }));
    expect(many).toBeGreaterThan(few);
  });

  test("higher failure rate increases difficulty", () => {
    const low = estimateDifficulty(makeContext({ historical_failure_rate: 0 }));
    const high = estimateDifficulty(makeContext({ historical_failure_rate: 0.9 }));
    expect(high).toBeGreaterThan(low);
  });

  test("more technical terms increases difficulty", () => {
    const few = estimateDifficulty(makeContext({ technical_term_count: 0 }));
    const many = estimateDifficulty(makeContext({ technical_term_count: 8 }));
    expect(many).toBeGreaterThan(few);
  });

  test("verification type affects difficulty (test > manual > lint)", () => {
    const lint = estimateDifficulty(makeContext({ verification_type: "lint" }));
    const manual = estimateDifficulty(makeContext({ verification_type: "manual" }));
    const test_ = estimateDifficulty(makeContext({ verification_type: "test" }));
    expect(test_).toBeGreaterThan(manual);
    expect(manual).toBeGreaterThan(lint);
  });

  test("difficulty clamps to [0, 1] range with extreme inputs", () => {
    const extreme = estimateDifficulty({
      description: "a ".repeat(100),
      affected_file_count: 100,
      verification_type: "test",
      historical_failure_rate: 1.0,
      technical_term_count: 100,
    });
    expect(extreme).toBeLessThanOrEqual(1);
    expect(extreme).toBeGreaterThanOrEqual(0);
  });
});

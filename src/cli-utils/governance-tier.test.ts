// src/cli-utils/governance-tier.test.ts
import { describe, test, expect } from "bun:test";
import { estimateTierFromRequest, refineTier, combineTiers } from "./governance-tier";

describe("estimateTierFromRequest", () => {
  test("micro: short simple request", () => {
    expect(estimateTierFromRequest("add a health check")).toBe("micro");
  });
  test("micro: single action request", () => {
    expect(estimateTierFromRequest("fix the login bug")).toBe("micro");
  });
  test("small: request with multiple clauses", () => {
    expect(estimateTierFromRequest("add health check with tests and also update the dashboard to show results")).toBe("small");
  });
  test("medium: complex multi-part request", () => {
    expect(estimateTierFromRequest(
      "refactor the authentication system to use JWT tokens and also update the middleware " +
      "and then add rate limiting plus update the API docs and additionally write integration tests"
    )).toBe("medium");
  });
  test("large: very long detailed request", () => {
    const longRequest = Array(20).fill("implement feature with tests and documentation and also").join(" ");
    expect(estimateTierFromRequest(longRequest)).toBe("large");
  });
});

describe("refineTier", () => {
  test("micro: 1 task, 5 min", () => { expect(refineTier(1, 5)).toBe("micro"); });
  test("micro: 2 tasks, 15 min", () => { expect(refineTier(2, 15)).toBe("micro"); });
  test("small: 3 tasks, 20 min", () => { expect(refineTier(3, 20)).toBe("small"); });
  test("small: 5 tasks, 30 min", () => { expect(refineTier(5, 30)).toBe("small"); });
  test("medium: 10 tasks, 60 min", () => { expect(refineTier(10, 60)).toBe("medium"); });
  test("large: 20 tasks, 120 min", () => { expect(refineTier(20, 120)).toBe("large"); });
  test("micro task count but long time -> small", () => { expect(refineTier(2, 45)).toBe("small"); });
});

describe("combineTiers", () => {
  test("takes higher tier", () => {
    expect(combineTiers("micro", "small")).toBe("small");
    expect(combineTiers("medium", "micro")).toBe("medium");
    expect(combineTiers("large", "small")).toBe("large");
  });
  test("same tier returns same", () => {
    expect(combineTiers("micro", "micro")).toBe("micro");
    expect(combineTiers("large", "large")).toBe("large");
  });
});

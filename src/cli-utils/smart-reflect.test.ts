// src/cli-utils/smart-reflect.test.ts
import { describe, test, expect } from "bun:test";
import {
  shouldReflect,
  reflectDepth,
  computeDivergence,
  classifyTier,
  refineTier,
} from "./smart-reflect";
import type { GovernanceTier } from "./smart-reflect";

describe("shouldReflect", () => {
  test("returns false for micro", () => {
    expect(shouldReflect("micro")).toBe(false);
  });

  test("returns true for small", () => {
    expect(shouldReflect("small")).toBe(true);
  });

  test("returns true for medium", () => {
    expect(shouldReflect("medium")).toBe(true);
  });

  test("returns true for large", () => {
    expect(shouldReflect("large")).toBe(true);
  });
});

describe("reflectDepth", () => {
  test("micro: no extraction, no librarian, impossible threshold", () => {
    const depth = reflectDepth("micro", 1);
    expect(depth.extract).toBe(false);
    expect(depth.librarian).toBe(false);
    expect(depth.divergenceThreshold).toBe(1.0);
  });

  test("small: extract but no librarian", () => {
    const depth = reflectDepth("small", 4);
    expect(depth.extract).toBe(true);
    expect(depth.librarian).toBe(false);
    expect(depth.divergenceThreshold).toBe(0.3);
  });

  test("medium with few tasks: extract, no librarian", () => {
    const depth = reflectDepth("medium", 7);
    expect(depth.extract).toBe(true);
    expect(depth.librarian).toBe(false);
  });

  test("medium with 10+ tasks: extract and librarian", () => {
    const depth = reflectDepth("medium", 10);
    expect(depth.extract).toBe(true);
    expect(depth.librarian).toBe(true);
  });

  test("large: always extract and librarian", () => {
    const depth = reflectDepth("large", 3);
    expect(depth.extract).toBe(true);
    expect(depth.librarian).toBe(true);
  });
});

describe("computeDivergence", () => {
  test("identical strings return 0", () => {
    expect(computeDivergence("implement auth", "implement auth")).toBe(0);
  });

  test("completely different strings return 1", () => {
    expect(computeDivergence("alpha beta", "gamma delta")).toBe(1);
  });

  test("partial overlap returns value between 0 and 1", () => {
    const div = computeDivergence(
      "implement user authentication",
      "implement JWT authentication"
    );
    expect(div).toBeGreaterThan(0);
    expect(div).toBeLessThan(1);
  });

  test("both empty returns 0", () => {
    expect(computeDivergence("", "")).toBe(0);
  });

  test("case insensitive", () => {
    expect(computeDivergence("Hello World", "hello world")).toBe(0);
  });

  test("high divergence exceeds 0.3 threshold", () => {
    const div = computeDivergence(
      "create REST API with Express",
      "build GraphQL schema with Apollo"
    );
    expect(div).toBeGreaterThan(0.3);
  });
});

describe("classifyTier", () => {
  test("short request is micro", () => {
    expect(classifyTier("fix the typo")).toBe("micro");
  });

  test("scope keywords inflate score", () => {
    // "add X and also Y" = 5 words + 2 scope keywords * 15 = 35 → small
    expect(classifyTier("add authentication and also validation")).toBe("small");
  });

  test("medium-length request is medium", () => {
    const req =
      "implement user auth with JWT tokens, add session management, then integrate with the existing database schema and validate all edge cases, also add rate limiting and logging plus error handling";
    expect(classifyTier(req)).toBe("medium");
  });

  test("very long request is large", () => {
    const words = Array.from({ length: 80 }, (_, i) => `word${i}`);
    words.splice(20, 0, "and", "also", "then");
    expect(classifyTier(words.join(" "))).toBe("large");
  });
});

describe("refineTier", () => {
  test("upgrades micro to small when tasks exceed threshold", () => {
    expect(refineTier("micro", 4, 25)).toBe("small");
  });

  test("never downgrades from initial tier", () => {
    expect(refineTier("medium", 2, 10)).toBe("medium");
  });

  test("keeps micro when tasks and time are small", () => {
    expect(refineTier("micro", 1, 5)).toBe("micro");
  });

  test("upgrades to large for many tasks", () => {
    expect(refineTier("small", 20, 200)).toBe("large");
  });

  test("keeps same tier when refined matches", () => {
    expect(refineTier("medium", 10, 60)).toBe("medium");
  });
});

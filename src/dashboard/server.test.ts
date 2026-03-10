import { describe, test, expect } from "bun:test";
import { getProjectState, getCostData, getMemoryStats, getActiveSessions } from "./api";

describe("Dashboard Server API", () => {
  test("getProjectState returns structured data", () => {
    const state = getProjectState("/tmp/nonexistent-juhbdi");
    expect(state).toHaveProperty("state");
    expect(state).toHaveProperty("roadmap");
    expect(state).toHaveProperty("timestamp");
  });

  test("getCostData returns numeric fields", () => {
    const cost = getCostData("/tmp/nonexistent-juhbdi");
    expect(typeof cost.total_spend).toBe("number");
    expect(typeof cost.savings_pct).toBe("number");
    expect(typeof cost.model_distribution).toBe("object");
  });

  test("getMemoryStats returns count fields", () => {
    const mem = getMemoryStats("/tmp/nonexistent-juhbdi");
    expect(typeof mem.reflexion_count).toBe("number");
    expect(typeof mem.trust_score).toBe("number");
  });

  test("getActiveSessions returns array", () => {
    const sessions = getActiveSessions();
    expect(Array.isArray(sessions)).toBe(true);
  });
});

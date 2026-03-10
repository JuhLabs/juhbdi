import { describe, test, expect } from "bun:test";
import { buildStateSummary, formatStateSummary } from "./state-summary";

describe("state-summary", () => {
  const baseInput = {
    waveId: "w1",
    completedTasks: [
      { id: "t1", description: "Create user model", passed: true, approach: "TDD" },
      { id: "t2", description: "Add auth endpoint", passed: true, approach: "integration test" },
      { id: "t3", description: "Setup logging", passed: false, approach: "manual", error: "missing dependency" },
    ],
    remainingTasks: [
      { id: "t4", description: "Add rate limiting" },
      { id: "t5", description: "Write API docs" },
    ],
    contextPct: 72,
    trustScore: 0.85,
  };

  test("buildStateSummary extracts evidence from passed tasks", () => {
    const state = buildStateSummary(baseInput);
    expect(state.evidence).toHaveLength(2);
    expect(state.evidence[0]).toContain("Create user model");
    expect(state.evidence[0]).toContain("TDD");
  });

  test("buildStateSummary captures failures with root causes", () => {
    const state = buildStateSummary(baseInput);
    expect(state.failures).toHaveLength(1);
    expect(state.failures[0].task_id).toBe("t3");
    expect(state.failures[0].root_cause).toBe("missing dependency");
  });

  test("buildStateSummary adds uncertainty when context is low", () => {
    const state = buildStateSummary({ ...baseInput, contextPct: 40 });
    expect(state.uncertainties.some(u => u.includes("Context at 40%"))).toBe(true);
  });

  test("buildStateSummary adds uncertainty when many tasks remain", () => {
    const manyTasks = Array.from({ length: 8 }, (_, i) => ({ id: `r${i}`, description: `Remaining ${i}` }));
    const state = buildStateSummary({ ...baseInput, remainingTasks: manyTasks });
    expect(state.uncertainties.some(u => u.includes("8 tasks remaining"))).toBe(true);
  });

  test("buildStateSummary prepends failure warning to future plans", () => {
    const state = buildStateSummary(baseInput);
    expect(state.future_plans[0]).toContain("Address 1 failure(s)");
  });

  test("buildStateSummary sets correct metrics", () => {
    const state = buildStateSummary(baseInput);
    expect(state.tasks_completed).toBe(2);
    expect(state.tasks_failed).toBe(1);
    expect(state.context_remaining_pct).toBe(72);
    expect(state.trust_score).toBe(0.85);
    expect(state.wave_id).toBe("w1");
  });

  test("formatStateSummary contains all sections", () => {
    const state = buildStateSummary(baseInput);
    const output = formatStateSummary(state);
    expect(output).toContain("=== Wave w1 State Summary ===");
    expect(output).toContain("2 passed, 1 failed");
    expect(output).toContain("Context: 72%");
    expect(output).toContain("Trust: 85%");
    expect(output).toContain("EVIDENCE (verified):");
    expect(output).toContain("FAILURES:");
    expect(output).toContain("NEXT:");
  });

  test("formatStateSummary omits empty sections", () => {
    const state = buildStateSummary({
      waveId: "w2",
      completedTasks: [{ id: "t1", description: "Task A", passed: true, approach: "unit test" }],
      remainingTasks: [],
      contextPct: 90,
      trustScore: 0.95,
    });
    const output = formatStateSummary(state);
    expect(output).toContain("EVIDENCE (verified):");
    expect(output).not.toContain("FAILURES:");
    expect(output).not.toContain("UNCERTAINTIES:");
    // NEXT section should be empty since no remaining tasks and no failures
    expect(output).not.toContain("NEXT:");
  });
});

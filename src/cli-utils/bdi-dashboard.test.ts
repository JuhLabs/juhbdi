import { describe, expect, test } from "bun:test";
import {
  renderDashboard,
  renderStatusLine,
  renderProgressBar,
  formatDuration,
  type BDIState,
} from "./bdi-dashboard";

function makeState(overrides: Partial<BDIState> = {}): BDIState {
  return {
    beliefs: [
      { category: "project", summary: "TypeScript + Bun runtime" },
      { category: "task", summary: "Implement auth module" },
      { category: "memory", summary: "3 reflexions loaded" },
    ],
    desire: {
      goal: "Add user authentication",
      task_id: "task-42",
      progress_pct: 80,
    },
    intention: {
      action: "Running test suite",
      step: 4,
      total_steps: 5,
      status: "verifying",
    },
    context_pct: 64,
    trust_tier: "Senior",
    trust_score: 0.72,
    session_duration_ms: 300000, // 5 minutes
    ...overrides,
  };
}

describe("renderDashboard", () => {
  test("produces string output", () => {
    const output = renderDashboard(makeState());
    expect(typeof output).toBe("string");
    expect(output.length).toBeGreaterThan(0);
  });

  test("includes all BDI components — beliefs, desire, intention", () => {
    const output = renderDashboard(makeState());
    expect(output).toContain("BELIEFS");
    expect(output).toContain("DESIRE");
    expect(output).toContain("INTENT");
  });

  test("shows trust tier when provided", () => {
    const output = renderDashboard(makeState({ trust_tier: "Principal", trust_score: 0.91 }));
    expect(output).toContain("Principal");
    expect(output).toContain("0.91");
  });

  test("shows context percentage", () => {
    const output = renderDashboard(makeState({ context_pct: 42 }));
    expect(output).toContain("42%");
  });

  test("handles missing trust tier gracefully", () => {
    const output = renderDashboard(makeState({ trust_tier: undefined, trust_score: undefined }));
    expect(output).toContain("N/A");
    // Should not throw
    expect(typeof output).toBe("string");
  });

  test("handles empty beliefs array gracefully", () => {
    const output = renderDashboard(makeState({ beliefs: [] }));
    expect(output).toContain("none");
  });

  test("shows desire progress percentage", () => {
    const output = renderDashboard(makeState({ desire: { goal: "Test goal", progress_pct: 55 } }));
    expect(output).toContain("55%");
  });

  test("shows intention step count", () => {
    const output = renderDashboard(makeState({
      intention: { action: "Compiling", step: 2, total_steps: 8, status: "executing" },
    }));
    expect(output).toContain("[2/8]");
  });
});

describe("renderProgressBar", () => {
  test("0% shows empty bar", () => {
    const bar = renderProgressBar(0);
    expect(bar).toBe("\u2591".repeat(10));
  });

  test("100% shows full bar", () => {
    const bar = renderProgressBar(100);
    expect(bar).toBe("\u2588".repeat(10));
  });

  test("50% shows half bar", () => {
    const bar = renderProgressBar(50);
    expect(bar).toBe("\u2588".repeat(5) + "\u2591".repeat(5));
  });

  test("clamps values above 100 to full bar", () => {
    const bar = renderProgressBar(150);
    expect(bar).toBe("\u2588".repeat(10));
  });

  test("clamps negative values to empty bar", () => {
    const bar = renderProgressBar(-10);
    expect(bar).toBe("\u2591".repeat(10));
  });

  test("custom width works", () => {
    const bar = renderProgressBar(50, 20);
    expect(bar.length).toBe(20);
    expect(bar).toBe("\u2588".repeat(10) + "\u2591".repeat(10));
  });
});

describe("renderStatusLine", () => {
  test("produces single-line output (no newlines)", () => {
    const line = renderStatusLine(makeState());
    expect(line).not.toContain("\n");
  });

  test("contains step info and status", () => {
    const line = renderStatusLine(makeState());
    expect(line).toContain("[4/5]");
    expect(line).toContain("Verifying");
  });

  test("includes trust tier initial when present", () => {
    const line = renderStatusLine(makeState({ trust_tier: "Senior" }));
    expect(line).toContain(" S");
  });
});

describe("formatDuration", () => {
  test("formats seconds correctly", () => {
    expect(formatDuration(5000)).toBe("5s");
    expect(formatDuration(45000)).toBe("45s");
  });

  test("formats minutes and seconds correctly", () => {
    expect(formatDuration(65000)).toBe("1m 5s");
    expect(formatDuration(300000)).toBe("5m 0s");
  });

  test("formats hours correctly", () => {
    expect(formatDuration(3600000)).toBe("1h 0m");
    expect(formatDuration(5400000)).toBe("1h 30m");
  });

  test("handles zero", () => {
    expect(formatDuration(0)).toBe("0s");
  });

  test("handles negative values", () => {
    expect(formatDuration(-1000)).toBe("0s");
  });
});

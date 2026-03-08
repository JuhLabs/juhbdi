// src/cost/format.test.ts
import { describe, expect, test } from "bun:test";
import { formatCostReport } from "./format";
import type { CostReport } from "./types";

function makeReport(overrides: Partial<CostReport> = {}): CostReport {
  return {
    tier_breakdown: [
      { tier: "haiku", task_count: 2, estimated_usd: 0.014 },
      { tier: "sonnet", task_count: 3, estimated_usd: 0.153 },
    ],
    wave_breakdown: [
      { wave_id: "wave-1", task_count: 3, estimated_usd: 0.102 },
      { wave_id: "wave-2", task_count: 2, estimated_usd: 0.065 },
    ],
    total_tasks: 5,
    total_estimated_usd: 0.167,
    total_opus_usd: 1.275,
    savings_usd: 1.108,
    savings_pct: 86.9,
    override_count: 0,
    escalation_count: 0,
    ...overrides,
  };
}

describe("formatCostReport", () => {
  test("includes header", () => {
    const output = formatCostReport(makeReport());
    expect(output).toContain("Cost Report");
  });

  test("shows tier breakdown", () => {
    const output = formatCostReport(makeReport());
    expect(output).toContain("haiku");
    expect(output).toContain("sonnet");
    expect(output).toContain("2 tasks");
    expect(output).toContain("3 tasks");
  });

  test("shows wave breakdown", () => {
    const output = formatCostReport(makeReport());
    expect(output).toContain("wave-1");
    expect(output).toContain("wave-2");
  });

  test("shows savings", () => {
    const output = formatCostReport(makeReport());
    expect(output).toContain("Savings");
    expect(output).toContain("86");
  });

  test("shows override and escalation counts", () => {
    const output = formatCostReport(makeReport({ override_count: 2, escalation_count: 1 }));
    expect(output).toContain("Overrides:    2");
    expect(output).toContain("Escalations:  1");
  });

  test("handles empty report", () => {
    const output = formatCostReport(makeReport({
      tier_breakdown: [],
      wave_breakdown: [],
      total_tasks: 0,
      total_estimated_usd: 0,
      total_opus_usd: 0,
      savings_usd: 0,
      savings_pct: 0,
    }));
    expect(output).toContain("No routing data");
  });
});

import { describe, expect, test } from "bun:test";
import { scoreMessage } from "../auto-trigger/score";
import { DEFAULT_RULES } from "../auto-trigger/rules";
import { extractPrinciples } from "../memory/reflect";
import { computeTrustScore } from "../routing/trust";
import { estimateDifficulty } from "../routing/difficulty";

describe("performance benchmarks", () => {
  test("auto-trigger scoring < 5ms per message", () => {
    const msgs = Array.from({ length: 100 }, (_, i) => `build feature ${i} for the system`);
    const start = performance.now();
    for (const m of msgs) scoreMessage(m, DEFAULT_RULES);
    const elapsed = performance.now() - start;
    console.log(`Auto-trigger: ${(elapsed/100).toFixed(2)}ms/msg`);
    expect(elapsed / 100).toBeLessThan(5);
  });

  test("trust scoring < 1ms per record", () => {
    const records = Array.from({ length: 100 }, () => ({
      agent_tier: "sonnet" as const, tasks_attempted: 50, tasks_passed: 40,
      avg_strikes: 0.5, violation_count: 1, last_10_outcomes: Array(10).fill("pass") as Array<"pass"|"fail">,
    }));
    const start = performance.now();
    for (const r of records) computeTrustScore(r);
    const elapsed = performance.now() - start;
    console.log(`Trust scoring: ${(elapsed/100).toFixed(3)}ms/record`);
    expect(elapsed / 100).toBeLessThan(1);
  });

  test("difficulty estimation < 1ms per task", () => {
    const tasks = Array.from({ length: 100 }, (_, i) => ({
      description: `Implement feature ${i} with complex logic`, affected_file_count: i%10+1,
      verification_type: "test" as const, historical_failure_rate: Math.random(), technical_term_count: i%8,
    }));
    const start = performance.now();
    for (const t of tasks) estimateDifficulty(t);
    const elapsed = performance.now() - start;
    console.log(`Difficulty: ${(elapsed/100).toFixed(3)}ms/task`);
    expect(elapsed / 100).toBeLessThan(1);
  });

  test("principle extraction < 10ms per wave", () => {
    const wave = { wave_id: "w1", outcomes: Array.from({ length: 5 }, (_, i) => ({
      task_id: `t-${i}`, planned_approach: `approach A ${i}`, actual_approach: `completely different B ${i}`,
      description: `Build component ${i}`, domain_tags: ["typescript"], test_passed: true, files_modified: [`src/c${i}.ts`],
    }))};
    const bank = { version: "1.0.0" as const, principles: [] };
    const start = performance.now();
    for (let i = 0; i < 20; i++) extractPrinciples(wave, bank);
    const elapsed = performance.now() - start;
    console.log(`Reflection: ${(elapsed/20).toFixed(2)}ms/wave`);
    expect(elapsed / 20).toBeLessThan(10);
  });
});

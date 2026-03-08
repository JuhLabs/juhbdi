// src/trail/format.test.ts
import { describe, expect, test } from "bun:test";
import chalk from "chalk";
import { formatTrail } from "./format";
import type { DecisionTrailEntry } from "../schemas/decision-trail";

function makeEntry(overrides: Partial<DecisionTrailEntry> = {}): DecisionTrailEntry {
  return {
    timestamp: "2026-03-05T12:00:00Z",
    event_type: "decision",
    description: "Chose TDD approach for task",
    reasoning: "TDD provides confidence in refactoring",
    alternatives_considered: ["manual testing"],
    constraint_refs: [],
    outcome: "approved",
    ...overrides,
  };
}

describe("formatTrail", () => {
  test("empty entries returns header with no-entries message", () => {
    const output = formatTrail([]);
    expect(output).toContain("Decision Trail");
    expect(output).toContain("No trail entries");
  });

  test("single entry shows badge, timestamp, and description", () => {
    const entry = makeEntry();
    const output = formatTrail([entry]);
    expect(output).toContain(chalk.yellow("[decision]"));
    expect(output).toContain("2026-03-05T12:00:00Z");
    expect(output).toContain("Chose TDD approach for task");
  });

  test("routing event type gets cyan badge", () => {
    const output = formatTrail([makeEntry({ event_type: "routing" })]);
    expect(output).toContain(chalk.cyan("[routing]"));
  });

  test("decision event type gets yellow badge", () => {
    const output = formatTrail([makeEntry({ event_type: "decision" })]);
    expect(output).toContain(chalk.yellow("[decision]"));
  });

  test("command event type gets green badge", () => {
    const output = formatTrail([makeEntry({ event_type: "command" })]);
    expect(output).toContain(chalk.green("[command]"));
  });

  test("recovery event type gets red badge", () => {
    const output = formatTrail([makeEntry({ event_type: "recovery" })]);
    expect(output).toContain(chalk.red("[recovery]"));
  });

  test("override event type gets magenta badge", () => {
    const output = formatTrail([makeEntry({ event_type: "override" })]);
    expect(output).toContain(chalk.magenta("[override]"));
  });

  test("conflict event type gets red badge", () => {
    const output = formatTrail([makeEntry({ event_type: "conflict" })]);
    expect(output).toContain(chalk.red("[conflict]"));
  });

  test("shows hash chain indicator when entry_hash present", () => {
    const hash = "abc12345deadbeef9999";
    const output = formatTrail([makeEntry({ entry_hash: hash })]);
    expect(output).toContain("#abc12345");
  });

  test("no hash indicator when entry_hash absent", () => {
    const output = formatTrail([makeEntry()]);
    expect(output).not.toContain("#");
  });

  test("reasoning truncated at 80 chars with ellipsis", () => {
    const longReasoning = "A".repeat(100);
    const output = formatTrail([makeEntry({ reasoning: longReasoning })]);
    expect(output).toContain("A".repeat(80) + "...");
    expect(output).not.toContain("A".repeat(81));
  });

  test("reasoning not truncated when 80 chars or fewer", () => {
    const shortReasoning = "B".repeat(80);
    const output = formatTrail([makeEntry({ reasoning: shortReasoning })]);
    expect(output).toContain("B".repeat(80));
    expect(output).not.toContain("...");
  });

  test("multiple entries all rendered", () => {
    const entries = [
      makeEntry({ event_type: "routing", description: "Route task-1" }),
      makeEntry({ event_type: "command", description: "Execute bun test" }),
      makeEntry({ event_type: "recovery", description: "Retry after failure" }),
    ];
    const output = formatTrail(entries);
    expect(output).toContain("Route task-1");
    expect(output).toContain("Execute bun test");
    expect(output).toContain("Retry after failure");
  });
});

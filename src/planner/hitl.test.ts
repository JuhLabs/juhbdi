import { describe, expect, test } from "bun:test";
import {
  classifyConflicts,
  formatConflictsForDisplay,
  type HITLDecision,
} from "./hitl";
import type { ChallengeReport } from "./types";

describe("classifyConflicts", () => {
  test("returns no-conflicts when report has no conflicts", () => {
    const report: ChallengeReport = {
      approved: true,
      conflicts: [],
      suggestions: [],
      refined_request: "test",
    };
    const result = classifyConflicts(report);
    expect(result).toBe("no-conflicts");
  });

  test("returns soft-only when all conflicts are soft", () => {
    const report: ChallengeReport = {
      approved: true,
      conflicts: [
        { constraint_id: "c1", description: "Minor issue", severity: "soft" },
      ],
      suggestions: [],
      refined_request: "test",
    };
    const result = classifyConflicts(report);
    expect(result).toBe("soft-only");
  });

  test("returns has-hard when any conflict is hard", () => {
    const report: ChallengeReport = {
      approved: false,
      conflicts: [
        { constraint_id: "c1", description: "Hard issue", severity: "hard" },
        { constraint_id: "c2", description: "Soft issue", severity: "soft" },
      ],
      suggestions: [],
      refined_request: "test",
    };
    const result = classifyConflicts(report);
    expect(result).toBe("has-hard");
  });
});

describe("formatConflictsForDisplay", () => {
  test("formats conflicts with severity markers", () => {
    const report: ChallengeReport = {
      approved: false,
      conflicts: [
        { constraint_id: "c1", description: "Violates test policy", severity: "hard" },
        { constraint_id: "c2", description: "May be slow", severity: "soft" },
      ],
      suggestions: ["Add tests"],
      refined_request: "Build API with tests",
    };
    const output = formatConflictsForDisplay(report);
    expect(output).toContain("c1");
    expect(output).toContain("HARD");
    expect(output).toContain("Violates test policy");
    expect(output).toContain("c2");
    expect(output).toContain("SOFT");
    expect(output).toContain("Add tests");
  });
});

import { describe, test, expect } from "bun:test";
import { buildArticle12Fields } from "./trail-enrichment";

describe("trail-enrichment", () => {
  test("builds Article 12 fields for intern tier", () => {
    const fields = buildArticle12Fields({
      taskId: "t1",
      projectDir: "/tmp/myproject",
      trustScore: 0.2,
      tierName: "intern",
      operationStart: "2026-03-10T10:00:00Z",
      operationEnd: "2026-03-10T10:05:00Z",
      modelVersion: "claude-opus-4-6",
      filesModified: ["src/auth.ts"],
    });
    expect(fields.ai_act_risk_class).toBe("limited");
    expect(fields.deployer_id).toBe("juhlabs");
    expect(fields.human_oversight_level).toBe("manual_override");
  });

  test("classifies high risk for intern with many files", () => {
    const fields = buildArticle12Fields({
      taskId: "t2",
      projectDir: "/tmp/myproject",
      trustScore: 0.1,
      tierName: "intern",
      operationStart: "2026-03-10T10:00:00Z",
      operationEnd: "2026-03-10T10:30:00Z",
      modelVersion: "claude-opus-4-6",
      filesModified: Array(10).fill("src/file.ts"),
    });
    expect(fields.ai_act_risk_class).toBe("high");
  });

  test("classifies minimal risk for principal tier", () => {
    const fields = buildArticle12Fields({
      taskId: "t3",
      projectDir: "/tmp/myproject",
      trustScore: 0.9,
      tierName: "principal",
      operationStart: "2026-03-10T10:00:00Z",
      operationEnd: "2026-03-10T10:01:00Z",
      modelVersion: "claude-opus-4-6",
      filesModified: ["src/utils.ts"],
    });
    expect(fields.ai_act_risk_class).toBe("minimal");
    expect(fields.human_oversight_level).toBe("none");
  });

  test("includes system_id derived from project dir", () => {
    const fields = buildArticle12Fields({
      taskId: "t4",
      projectDir: "/home/user/my-cool-project",
      trustScore: 0.5,
      tierName: "junior",
      operationStart: "2026-03-10T10:00:00Z",
      operationEnd: "2026-03-10T10:05:00Z",
      modelVersion: "claude-opus-4-6",
      filesModified: [],
    });
    expect(fields.system_id).toBe("juhbdi-my-cool-project");
  });

  test("classifies junior tier as limited risk", () => {
    const fields = buildArticle12Fields({
      taskId: "t5",
      projectDir: "/tmp/project",
      trustScore: 0.4,
      tierName: "junior",
      operationStart: "2026-03-10T10:00:00Z",
      operationEnd: "2026-03-10T10:05:00Z",
      modelVersion: "claude-opus-4-6",
      filesModified: ["src/a.ts", "src/b.ts"],
    });
    expect(fields.ai_act_risk_class).toBe("limited");
    expect(fields.human_oversight_level).toBe("approval_required");
  });

  test("classifies senior tier as minimal risk with informed oversight", () => {
    const fields = buildArticle12Fields({
      taskId: "t6",
      projectDir: "/tmp/project",
      trustScore: 0.7,
      tierName: "senior",
      operationStart: "2026-03-10T10:00:00Z",
      operationEnd: "2026-03-10T10:10:00Z",
      modelVersion: "claude-opus-4-6",
      filesModified: ["src/core.ts"],
    });
    expect(fields.ai_act_risk_class).toBe("minimal");
    expect(fields.human_oversight_level).toBe("informed");
  });

  test("unknown tier defaults to limited risk with manual_override", () => {
    const fields = buildArticle12Fields({
      taskId: "t7",
      projectDir: "/tmp/project",
      trustScore: 0.5,
      tierName: "unknown_tier",
      operationStart: "2026-03-10T10:00:00Z",
      operationEnd: "2026-03-10T10:05:00Z",
      modelVersion: "claude-opus-4-6",
      filesModified: ["src/x.ts"],
    });
    expect(fields.ai_act_risk_class).toBe("limited");
    expect(fields.human_oversight_level).toBe("manual_override");
  });

  test("preserves operation timestamps", () => {
    const start = "2026-03-10T08:00:00Z";
    const end = "2026-03-10T08:30:00Z";
    const fields = buildArticle12Fields({
      taskId: "t8",
      projectDir: "/tmp/project",
      trustScore: 0.5,
      tierName: "junior",
      operationStart: start,
      operationEnd: end,
      modelVersion: "claude-opus-4-6",
      filesModified: [],
    });
    expect(fields.operation_start).toBe(start);
    expect(fields.operation_end).toBe(end);
    expect(fields.model_version).toBe("claude-opus-4-6");
  });
});

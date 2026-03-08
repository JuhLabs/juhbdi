import { describe, expect, test } from "bun:test";
import {
  registerTool,
  queryTools,
  recordToolUsage,
  deprecateTool,
} from "./tool-bank";
import type { ToolBank, ToolBankEntry } from "./tool-types";

const makeEntry = (
  id: string,
  name: string,
  kw: string[],
  status: "active" | "deprecated" | "failed" = "active",
): ToolBankEntry => ({
  id,
  name,
  description: `Tool: ${name}`,
  script_path: `tools/${name}.ts`,
  language: "typescript",
  created_by_task: "t1",
  usage_count: 0,
  last_used: "2026-03-08T00:00:00.000Z",
  status,
  keywords: kw,
  related_memories: [],
});

const emptyBank = (): ToolBank => ({ version: "1.0.0", tools: [] });

describe("registerTool", () => {
  test("adds tool to bank", () => {
    const updated = registerTool(
      makeEntry("tool-1", "test-runner", ["test", "runner"]),
      emptyBank(),
    );
    expect(updated.tools).toHaveLength(1);
  });

  test("rejects duplicate tool id", () => {
    const bank = {
      ...emptyBank(),
      tools: [makeEntry("tool-1", "existing", ["x"])],
    };
    expect(() =>
      registerTool(makeEntry("tool-1", "duplicate", ["y"]), bank),
    ).toThrow();
  });
});

describe("queryTools", () => {
  test("finds tools by keyword match", () => {
    const bank = {
      ...emptyBank(),
      tools: [
        makeEntry("t1", "test-runner", ["test", "runner", "bun"]),
        makeEntry("t2", "lint-fixer", ["lint", "eslint", "fix"]),
      ],
    };
    const results = queryTools("run bun tests", bank, 3);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].id).toBe("t1");
  });

  test("excludes deprecated tools", () => {
    expect(
      queryTools(
        "test",
        {
          ...emptyBank(),
          tools: [makeEntry("t1", "old-tool", ["test"], "deprecated")],
        },
        3,
      ),
    ).toEqual([]);
  });

  test("excludes failed tools", () => {
    expect(
      queryTools(
        "test",
        {
          ...emptyBank(),
          tools: [makeEntry("t1", "broken", ["test"], "failed")],
        },
        3,
      ),
    ).toEqual([]);
  });

  test("returns empty for no matches", () => {
    expect(
      queryTools(
        "frontend react",
        {
          ...emptyBank(),
          tools: [makeEntry("t1", "unrelated", ["database"])],
        },
        3,
      ),
    ).toEqual([]);
  });

  test("respects topK", () => {
    const bank = {
      ...emptyBank(),
      tools: Array.from({ length: 10 }, (_, i) =>
        makeEntry(`t${i}`, `tool${i}`, ["common"]),
      ),
    };
    expect(queryTools("common", bank, 2).length).toBeLessThanOrEqual(2);
  });
});

describe("recordToolUsage", () => {
  test("increments usage count and updates last_used", () => {
    const updated = recordToolUsage("t1", {
      ...emptyBank(),
      tools: [makeEntry("t1", "tool", ["x"])],
    });
    expect(updated.tools[0].usage_count).toBe(1);
    expect(updated.tools[0].last_used).not.toBe("2026-03-08T00:00:00.000Z");
  });

  test("throws for unknown tool id", () => {
    expect(() => recordToolUsage("nonexistent", emptyBank())).toThrow();
  });
});

describe("deprecateTool", () => {
  test("marks tool as deprecated", () => {
    expect(
      deprecateTool("t1", {
        ...emptyBank(),
        tools: [makeEntry("t1", "old", ["x"])],
      }).tools[0].status,
    ).toBe("deprecated");
  });

  test("throws for unknown tool id", () => {
    expect(() => deprecateTool("nonexistent", emptyBank())).toThrow();
  });
});

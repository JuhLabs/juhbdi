import { describe, expect, test } from "bun:test";
import { StateSchema, type State, serializeState, parseState } from "./state";

describe("StateSchema (JSON)", () => {
  const validState = {
    version: "1.0.0",
    project_name: "test-project",
    conventions: ["Use camelCase", "Tests required"],
    architecture: "Layered: CLI -> Core -> Schemas",
    active_context: {
      current_wave: 1,
      current_task: "t1",
      focus: "implementing auth",
    },
    compressed_history: "Project initialized. Added auth module.",
    last_updated: "2026-03-02T00:00:00.000Z",
  };

  test("parses valid state JSON", () => {
    const result = StateSchema.safeParse(validState);
    expect(result.success).toBe(true);
  });

  test("parses state without active_context", () => {
    const { active_context, ...minimal } = validState;
    const result = StateSchema.safeParse(minimal);
    expect(result.success).toBe(true);
  });

  test("rejects state without project_name", () => {
    const { project_name, ...invalid } = validState;
    const result = StateSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  test("serializeState produces valid JSON", () => {
    const json = serializeState(validState as State);
    const parsed = JSON.parse(json);
    expect(parsed.project_name).toBe("test-project");
    expect(parsed.conventions).toEqual(["Use camelCase", "Tests required"]);
  });

  test("parseState round-trips correctly", () => {
    const json = serializeState(validState as State);
    const parsed = parseState(json);
    expect(parsed.project_name).toBe(validState.project_name);
    expect(parsed.conventions).toEqual(validState.conventions);
    expect(parsed.architecture).toBe(validState.architecture);
    expect(parsed.compressed_history).toBe(validState.compressed_history);
  });

  test("parseState throws on invalid JSON", () => {
    expect(() => parseState("not json")).toThrow();
  });

  test("validates state with context_health in active_context", () => {
    const state = {
      project_name: "test",
      conventions: [],
      architecture: "monolith",
      active_context: {
        current_wave: 2,
        context_health: {
          remaining_pct: 52.3,
          trend: "declining",
          waves_remaining_estimate: 2,
          last_checked: "2026-03-03T18:40:00.000Z",
        },
      },
      compressed_history: "",
      last_updated: "2026-03-03T18:40:00.000Z",
    };
    expect(() => StateSchema.parse(state)).not.toThrow();
    const parsed = StateSchema.parse(state);
    expect(parsed.active_context?.context_health?.trend).toBe("declining");
  });

  test("allows state without context_health (backwards compatible)", () => {
    const state = {
      project_name: "test",
      conventions: [],
      architecture: "monolith",
      active_context: { current_wave: 1 },
      compressed_history: "",
      last_updated: "2026-03-03T18:40:00.000Z",
    };
    expect(() => StateSchema.parse(state)).not.toThrow();
  });
});

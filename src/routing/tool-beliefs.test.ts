import { describe, test, expect } from "bun:test";
import {
  createEmptyStore,
  recordToolUse,
  getToolReliability,
  suggestAlternativeTool,
  getTopTools,
  type ToolBeliefStore,
} from "./tool-beliefs";

function seedStore(): ToolBeliefStore {
  let store = createEmptyStore();
  // Tool A: 8/10 success for file_edit
  for (let i = 0; i < 8; i++) store = recordToolUse(store, "Edit", "file_edit", true, 200);
  for (let i = 0; i < 2; i++) store = recordToolUse(store, "Edit", "file_edit", false, 500, "ENOENT");
  // Tool B: 3/10 success for file_edit
  for (let i = 0; i < 3; i++) store = recordToolUse(store, "Write", "file_edit", true, 300);
  for (let i = 0; i < 7; i++) store = recordToolUse(store, "Write", "file_edit", false, 600, "EPERM");
  return store;
}

describe("tool-beliefs", () => {
  test("createEmptyStore returns valid store", () => {
    const store = createEmptyStore();
    expect(store.version).toBe("1.0.0");
    expect(store.beliefs).toHaveLength(0);
    expect(store.updated).toBeDefined();
  });

  test("recordToolUse creates new belief on first use", () => {
    let store = createEmptyStore();
    store = recordToolUse(store, "Bash", "test_run", true, 1500);
    expect(store.beliefs).toHaveLength(1);
    expect(store.beliefs[0].tool_name).toBe("Bash");
    expect(store.beliefs[0].task_type).toBe("test_run");
    expect(store.beliefs[0].attempts).toBe(1);
    expect(store.beliefs[0].successes).toBe(1);
    expect(store.beliefs[0].failures).toBe(0);
    expect(store.beliefs[0].avg_duration_ms).toBe(1500);
  });

  test("recordToolUse increments failures and stores errors", () => {
    let store = createEmptyStore();
    store = recordToolUse(store, "Bash", "test_run", false, 100, "timeout");
    store = recordToolUse(store, "Bash", "test_run", false, 200, "crash");
    expect(store.beliefs[0].failures).toBe(2);
    expect(store.beliefs[0].recent_errors).toEqual(["timeout", "crash"]);
  });

  test("recordToolUse caps recent_errors at 3", () => {
    let store = createEmptyStore();
    store = recordToolUse(store, "Bash", "test_run", false, 100, "err1");
    store = recordToolUse(store, "Bash", "test_run", false, 100, "err2");
    store = recordToolUse(store, "Bash", "test_run", false, 100, "err3");
    store = recordToolUse(store, "Bash", "test_run", false, 100, "err4");
    expect(store.beliefs[0].recent_errors).toHaveLength(3);
    expect(store.beliefs[0].recent_errors).toEqual(["err2", "err3", "err4"]);
  });

  test("recordToolUse computes running average duration", () => {
    let store = createEmptyStore();
    store = recordToolUse(store, "Bash", "test_run", true, 100);
    store = recordToolUse(store, "Bash", "test_run", true, 300);
    // (100 * 1 + 300) / 2 = 200
    expect(store.beliefs[0].avg_duration_ms).toBe(200);
  });

  test("getToolReliability returns 0.5 for unknown tool", () => {
    const store = createEmptyStore();
    expect(getToolReliability(store, "Unknown", "test_run")).toBe(0.5);
  });

  test("getToolReliability returns correct rate", () => {
    const store = seedStore();
    expect(getToolReliability(store, "Edit", "file_edit")).toBe(0.8);
    expect(getToolReliability(store, "Write", "file_edit")).toBe(0.3);
  });

  test("suggestAlternativeTool returns better tool", () => {
    const store = seedStore();
    // Write failed for file_edit — Edit has better success rate
    const alt = suggestAlternativeTool(store, "Write", "file_edit");
    expect(alt).toBe("Edit");
  });

  test("suggestAlternativeTool returns null when no alternatives", () => {
    const store = createEmptyStore();
    expect(suggestAlternativeTool(store, "Edit", "file_edit")).toBeNull();
  });

  test("suggestAlternativeTool requires minimum 3 attempts", () => {
    let store = createEmptyStore();
    store = recordToolUse(store, "Edit", "file_edit", true, 100);
    store = recordToolUse(store, "Edit", "file_edit", true, 100);
    // Only 2 attempts — not enough to suggest
    expect(suggestAlternativeTool(store, "Write", "file_edit")).toBeNull();
  });

  test("getTopTools returns sorted by reliability", () => {
    const store = seedStore();
    const top = getTopTools(store, "file_edit");
    expect(top).toHaveLength(2);
    expect(top[0].tool_name).toBe("Edit");
    expect(top[1].tool_name).toBe("Write");
  });
});

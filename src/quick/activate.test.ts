import { describe, expect, test } from "bun:test";
import { generateActivationBlock, shouldAppend } from "./activate";

describe("generateActivationBlock", () => {
  test("generates markdown block with JuhBDI section", () => {
    const block = generateActivationBlock("my-project");
    expect(block).toContain("## JuhBDI Governance");
    expect(block).toContain("intent-spec.json");
    expect(block).toContain("memory-bank.json");
    expect(block).toContain("/juhbdi:quick");
    expect(block).toContain("decision-trail.log");
  });

  test("includes project name in output", () => {
    const block = generateActivationBlock("awesome-app");
    expect(block).toContain("awesome-app");
  });

  test("includes governance rules", () => {
    const block = generateActivationBlock("test");
    expect(block).toContain("credential");
    expect(block).toContain("destructive");
  });
});

describe("shouldAppend", () => {
  test("returns true for empty CLAUDE.md content", () => {
    expect(shouldAppend("")).toBe(true);
  });

  test("returns false if JuhBDI section already exists", () => {
    expect(shouldAppend("## JuhBDI Governance\nStuff here")).toBe(false);
  });

  test("returns true if CLAUDE.md has other content but no JuhBDI", () => {
    expect(shouldAppend("# My Project\nSome instructions")).toBe(true);
  });
});

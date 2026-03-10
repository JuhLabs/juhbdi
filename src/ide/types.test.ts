// src/ide/types.test.ts
import { describe, test, expect } from "bun:test";
import { PlatformConfigSchema } from "./types";

describe("PlatformConfigSchema", () => {
  test("validates a slash-command platform", () => {
    const result = PlatformConfigSchema.parse({
      name: "Cursor",
      code: "cursor",
      target_dir: ".cursor/commands/",
      template_type: "slash-command",
    });
    expect(result.name).toBe("Cursor");
    expect(result.file_extension).toBe(".md");
    expect(result.supports_agents).toBe(false);
  });

  test("validates a manifest platform", () => {
    const result = PlatformConfigSchema.parse({
      name: "Kilo Code",
      code: "kilo",
      target_dir: ".kilocodemodes",
      template_type: "manifest",
      file_extension: ".json",
    });
    expect(result.template_type).toBe("manifest");
  });

  test("validates copilot dual-directory platform", () => {
    const result = PlatformConfigSchema.parse({
      name: "GitHub Copilot",
      code: "github-copilot",
      target_dir: ".github/",
      template_type: "copilot",
      supports_agents: true,
      agent_dir: ".github/agents/",
    });
    expect(result.supports_agents).toBe(true);
    expect(result.agent_dir).toBe(".github/agents/");
  });

  test("rejects invalid template_type", () => {
    expect(() => PlatformConfigSchema.parse({
      name: "Bad",
      code: "bad",
      target_dir: ".",
      template_type: "invalid",
    })).toThrow();
  });
});

import { describe, test, expect } from "bun:test";
import { transformCommand, toManifest, toSlashCommand, toToml, toCopilotAgent, toKiroSteering } from "./template-engine";
import type { CommandMeta, PlatformConfig } from "./types";

const sampleCmd: CommandMeta = {
  name: "plan",
  description: "Generate a governed execution roadmap",
  allowed_tools: ["Bash", "Read", "AskUserQuestion"],
  argument_hint: "[development request]",
  body: "## Steps\n\n1. Discover intent\n2. Generate waves\n3. Write roadmap",
};

const cursorPlatform: PlatformConfig = {
  name: "Cursor", code: "cursor",
  target_dir: ".cursor/commands/", template_type: "slash-command",
  file_extension: ".md", frontmatter_format: "yaml", supports_agents: false,
};

describe("Template Engine", () => {
  test("slash-command preserves body and adds juhbdi prefix", () => {
    const result = toSlashCommand(sampleCmd, cursorPlatform);
    expect(result).toContain("name: juhbdi-plan");
    expect(result).toContain("[JuhBDI] Generate a governed execution roadmap");
    expect(result).toContain("## Steps");
  });

  test("toml format has correct structure", () => {
    const result = toToml(sampleCmd);
    expect(result).toContain('[command]');
    expect(result).toContain('name = "juhbdi-plan"');
    expect(result).toContain("[command.prompt]");
  });

  test("copilot agent includes tools", () => {
    const result = toCopilotAgent(sampleCmd);
    expect(result).toContain("tools:");
    expect(result).toContain("run_terminal_command");
    expect(result).toContain("# JuhBDI plan");
  });

  test("kiro steering is plain markdown", () => {
    const result = toKiroSteering(sampleCmd);
    expect(result).toContain("# JuhBDI: plan");
    expect(result).toContain("## Instructions");
  });

  test("manifest generates valid JSON for kilo", () => {
    const kiloConfig: PlatformConfig = {
      name: "Kilo Code", code: "kilo",
      target_dir: ".kilocodemodes", template_type: "manifest",
      file_extension: ".json", frontmatter_format: "yaml", supports_agents: false,
    };
    const result = toManifest([sampleCmd], kiloConfig);
    const parsed = JSON.parse(result);
    expect(parsed).toBeArray();
    expect(parsed[0].slug).toBe("juhbdi-plan");
  });

  test("manifest generates VS Code tasks.json", () => {
    const vscodeConfig: PlatformConfig = {
      name: "VS Code", code: "vscode",
      target_dir: ".vscode/", template_type: "manifest",
      file_extension: ".json", frontmatter_format: "yaml", supports_agents: false,
    };
    const result = toManifest([sampleCmd], vscodeConfig);
    const parsed = JSON.parse(result);
    expect(parsed.version).toBe("2.0.0");
    expect(parsed.tasks[0].label).toBe("JuhBDI: plan");
  });

  test("transformCommand dispatches correctly", () => {
    const files = transformCommand(sampleCmd, cursorPlatform);
    expect(files.length).toBe(1);
    expect(files[0].filename).toBe("juhbdi-plan.md");
  });

  test("copilot generates two files", () => {
    const copilotConfig: PlatformConfig = {
      name: "GitHub Copilot", code: "github-copilot",
      target_dir: ".github/prompts/", template_type: "copilot",
      file_extension: ".md", frontmatter_format: "yaml",
      supports_agents: true, agent_dir: ".github/agents/",
    };
    const files = transformCommand(sampleCmd, copilotConfig);
    expect(files.length).toBe(2);
    expect(files[0].filename).toEndWith(".agent.md");
    expect(files[1].filename).toEndWith(".prompt.md");
  });
});

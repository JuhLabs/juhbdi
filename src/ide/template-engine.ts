import type { CommandMeta, PlatformConfig } from "./types";

// Slash command: keep markdown, adapt frontmatter format
export function toSlashCommand(cmd: CommandMeta, platform: PlatformConfig): string {
  const header = `---
name: juhbdi-${cmd.name}
description: "[JuhBDI] ${cmd.description}"
---`;
  return `${header}\n\n${cmd.body}`;
}

// Manifest: aggregate all commands into single JSON (Kilo, VS Code)
export function toManifest(commands: CommandMeta[], platform: PlatformConfig): string {
  if (platform.code === "vscode") {
    return toVSCodeTasks(commands);
  }
  // Kilo Code modes manifest
  const modes = commands.map((cmd) => ({
    slug: `juhbdi-${cmd.name}`,
    name: `JuhBDI: ${cmd.description}`,
    roleDefinition: `You are the JuhBDI ${cmd.name} agent. ${cmd.description}.`,
    groups: ["read", "edit", "command"],
    customInstructions: cmd.body.slice(0, 2000),
  }));
  return JSON.stringify(modes, null, 2);
}

function toVSCodeTasks(commands: CommandMeta[]): string {
  const tasks = commands.map((cmd) => ({
    label: `JuhBDI: ${cmd.name}`,
    type: "shell",
    command: `claude --plugin-dir .claude-plugin -p "/juhbdi:${cmd.name}"`,
    group: "none",
    presentation: { reveal: "always", panel: "shared" },
  }));
  return JSON.stringify({ version: "2.0.0", tasks }, null, 2);
}

// TOML: Gemini CLI format
export function toToml(cmd: CommandMeta): string {
  const escaped = cmd.description.replace(/"/g, '\\"');
  return `[command]
name = "juhbdi-${cmd.name}"
description = "${escaped}"

[command.prompt]
text = """
${cmd.body.slice(0, 3000)}
"""
`;
}

// Copilot: dual-file (.agent.md + .prompt.md)
export function toCopilotAgent(cmd: CommandMeta): string {
  return `---
name: juhbdi-${cmd.name}
description: "${cmd.description}"
tools:
  - run_terminal_command
  - read_file
  - edit_file
---

# JuhBDI ${cmd.name}

${cmd.body}
`;
}

export function toCopilotPrompt(cmd: CommandMeta): string {
  return `---
name: juhbdi-${cmd.name}
description: "${cmd.description}"
---

Run the JuhBDI ${cmd.name} workflow: ${cmd.description}.
${cmd.argument_hint ? `\nArgument: ${cmd.argument_hint}` : ""}
`;
}

// Kiro: steering file with include syntax
export function toKiroSteering(cmd: CommandMeta): string {
  return `# JuhBDI: ${cmd.name}

${cmd.description}

## Instructions

${cmd.body}
`;
}

// Main transform dispatcher
export function transformCommand(
  cmd: CommandMeta,
  platform: PlatformConfig,
): { filename: string; content: string }[] {
  switch (platform.template_type) {
    case "slash-command":
      return [{ filename: `juhbdi-${cmd.name}${platform.file_extension}`, content: toSlashCommand(cmd, platform) }];
    case "toml":
      return [{ filename: `juhbdi-${cmd.name}.toml`, content: toToml(cmd) }];
    case "copilot":
      return [
        { filename: `juhbdi-${cmd.name}.agent.md`, content: toCopilotAgent(cmd) },
        { filename: `juhbdi-${cmd.name}.prompt.md`, content: toCopilotPrompt(cmd) },
      ];
    case "kiro-steering":
      return [{ filename: `juhbdi-${cmd.name}.md`, content: toKiroSteering(cmd) }];
    case "manifest":
      // Manifests are handled at the batch level, not per-command
      return [];
    default:
      return [{ filename: `juhbdi-${cmd.name}.md`, content: toSlashCommand(cmd, platform) }];
  }
}

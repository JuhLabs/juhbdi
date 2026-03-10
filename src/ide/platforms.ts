import type { PlatformConfig } from "./types";

const D = { file_extension: ".md", frontmatter_format: "yaml", supports_agents: false } as const;

export const PLATFORMS: Record<string, PlatformConfig> = {
  "claude-code": {
    ...D, name: "Claude Code", code: "claude-code",
    target_dir: ".claude-plugin/", template_type: "slash-command",
    supports_agents: true, agent_dir: ".claude-plugin/agents/",
    notes: "Native — JuhBDI is already a Claude Code plugin",
  },
  cursor: {
    ...D, name: "Cursor", code: "cursor",
    target_dir: ".cursor/commands/", template_type: "slash-command",
    supports_agents: true, agent_dir: ".cursor/agents/",
  },
  windsurf: {
    ...D, name: "Windsurf", code: "windsurf",
    target_dir: ".windsurf/workflows/", template_type: "slash-command",
  },
  kilo: {
    ...D, name: "Kilo Code", code: "kilo",
    target_dir: ".kilocodemodes", template_type: "manifest",
    file_extension: ".json",
  },
  kiro: {
    ...D, name: "Kiro", code: "kiro",
    target_dir: ".kiro/steering/", template_type: "kiro-steering",
  },
  roo: {
    ...D, name: "Roo Code", code: "roo",
    target_dir: ".roo/commands/", template_type: "slash-command",
  },
  cline: {
    ...D, name: "Cline", code: "cline",
    target_dir: ".clinerules/workflows/", template_type: "slash-command",
  },
  opencode: {
    ...D, name: "OpenCode", code: "opencode",
    target_dir: ".opencode/commands/", template_type: "slash-command",
    supports_agents: true, agent_dir: ".opencode/agents/",
  },
  "github-copilot": {
    ...D, name: "GitHub Copilot", code: "github-copilot",
    target_dir: ".github/prompts/", template_type: "copilot",
    supports_agents: true, agent_dir: ".github/agents/",
  },
  codex: {
    ...D, name: "Codex CLI", code: "codex",
    target_dir: ".agents/skills/", template_type: "slash-command",
  },
  gemini: {
    ...D, name: "Gemini CLI", code: "gemini",
    target_dir: ".gemini/commands/", template_type: "toml",
    file_extension: ".toml", frontmatter_format: "none",
  },
  antigravity: {
    ...D, name: "Google Antigravity", code: "antigravity",
    target_dir: ".agent/workflows/", template_type: "slash-command",
  },
  auggie: {
    ...D, name: "Augment Code", code: "auggie",
    target_dir: ".augment/commands/", template_type: "slash-command",
  },
  codebuddy: {
    ...D, name: "CodeBuddy", code: "codebuddy",
    target_dir: ".codebuddy/commands/", template_type: "slash-command",
  },
  trae: {
    ...D, name: "Trae", code: "trae",
    target_dir: ".trae/rules/", template_type: "slash-command",
  },
  qwen: {
    ...D, name: "QwenCoder", code: "qwen",
    target_dir: ".qwen/commands/", template_type: "slash-command",
  },
  vscode: {
    ...D, name: "VS Code", code: "vscode",
    target_dir: ".vscode/", template_type: "manifest",
    file_extension: ".json",
    notes: "Generates tasks.json with JuhBDI commands",
  },
};

export function getPlatform(code: string): PlatformConfig | undefined {
  return PLATFORMS[code];
}

export function listPlatforms(): PlatformConfig[] {
  return Object.values(PLATFORMS);
}

export function detectInstalledIDEs(projectDir: string): string[] {
  const fs = require("fs");
  const path = require("path");
  const detected: string[] = [];
  for (const [code, config] of Object.entries(PLATFORMS)) {
    if (code === "claude-code") continue;
    const targetPath = path.join(projectDir, config.target_dir.split("/")[0]);
    if (fs.existsSync(targetPath)) {
      detected.push(code);
    }
  }
  return detected;
}

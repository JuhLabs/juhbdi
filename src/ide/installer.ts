import fs from "fs";
import path from "path";
import type { InstallResult, CommandMeta, PlatformConfig } from "./types";
import { getPlatform, listPlatforms, detectInstalledIDEs, PLATFORMS } from "./platforms";
import { parseAllCommands } from "./command-parser";
import { transformCommand, toManifest } from "./template-engine";

export interface InstallerOptions {
  projectDir: string;
  pluginRoot: string;
  ideCode: string;
  dryRun?: boolean;
}

export function install(options: InstallerOptions): InstallResult[] {
  const { projectDir, pluginRoot, ideCode, dryRun } = options;
  const commandsDir = path.join(pluginRoot, "commands");
  const commands = parseAllCommands(commandsDir);

  if (commands.length === 0) {
    return [{ platform: ideCode, files_written: [], agents_written: [], success: false, error: "No commands found" }];
  }

  const codes = ideCode === "all"
    ? Object.keys(PLATFORMS).filter((c) => c !== "claude-code")
    : [ideCode];

  const results: InstallResult[] = [];

  for (const code of codes) {
    const platform = getPlatform(code);
    if (!platform) {
      results.push({ platform: code, files_written: [], agents_written: [], success: false, error: `Unknown platform: ${code}` });
      continue;
    }

    if (code === "claude-code") {
      results.push({ platform: code, files_written: [], agents_written: [], success: true, error: "Already native" });
      continue;
    }

    try {
      const result = installForPlatform(projectDir, commands, platform, dryRun);
      results.push(result);
    } catch (err: any) {
      results.push({ platform: code, files_written: [], agents_written: [], success: false, error: err.message });
    }
  }

  return results;
}

function installForPlatform(
  projectDir: string,
  commands: CommandMeta[],
  platform: PlatformConfig,
  dryRun?: boolean,
): InstallResult {
  const filesWritten: string[] = [];
  const agentsWritten: string[] = [];
  const targetDir = path.join(projectDir, platform.target_dir);

  if (!dryRun) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  if (platform.template_type === "manifest") {
    const content = toManifest(commands, platform);
    const filename = platform.code === "vscode" ? "tasks.json" : `juhbdi-modes${platform.file_extension}`;
    const filePath = path.join(targetDir, filename);
    if (!dryRun) fs.writeFileSync(filePath, content);
    filesWritten.push(filePath);
  } else {
    for (const cmd of commands) {
      const files = transformCommand(cmd, platform);
      for (const { filename, content } of files) {
        const isAgent = filename.endsWith(".agent.md") && platform.agent_dir;
        const dir = isAgent ? path.join(projectDir, platform.agent_dir!) : targetDir;
        if (!dryRun) fs.mkdirSync(dir, { recursive: true });
        const filePath = path.join(dir, filename);
        if (!dryRun) fs.writeFileSync(filePath, content);
        if (isAgent) agentsWritten.push(filePath);
        else filesWritten.push(filePath);
      }
    }
  }

  return { platform: platform.code, files_written: filesWritten, agents_written: agentsWritten, success: true };
}

export function uninstall(projectDir: string, ideCode: string): { removed: string[]; success: boolean } {
  const platform = getPlatform(ideCode);
  if (!platform) return { removed: [], success: false };

  const targetDir = path.join(projectDir, platform.target_dir);
  const removed: string[] = [];

  if (!fs.existsSync(targetDir)) return { removed: [], success: true };

  for (const file of fs.readdirSync(targetDir)) {
    if (file.startsWith("juhbdi-") || file === "juhbdi-modes.json") {
      const filePath = path.join(targetDir, file);
      fs.unlinkSync(filePath);
      removed.push(filePath);
    }
  }

  return { removed, success: true };
}

export { detectInstalledIDEs, listPlatforms };

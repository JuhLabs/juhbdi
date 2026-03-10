import fs from "fs";
import path from "path";
import type { CommandMeta } from "./types";

export function parseCommandFile(filePath: string): CommandMeta | null {
  const raw = fs.readFileSync(filePath, "utf-8");
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) return null;

  const frontmatter = fmMatch[1];
  const body = fmMatch[2].trim();

  const name = frontmatter.match(/name:\s*(.+)/)?.[1]?.trim() || "";
  const description = frontmatter.match(/description:\s*(.+)/)?.[1]?.trim() || "";
  const argumentHint = frontmatter.match(/argument-hint:\s*"?(.+?)"?\s*$/m)?.[1]?.trim();

  let allowedTools: string[] = [];
  const toolsMatch = frontmatter.match(/allowed-tools:\s*\[([^\]]*)\]/);
  if (toolsMatch) {
    allowedTools = toolsMatch[1]
      .split(",")
      .map((t) => t.trim().replace(/"/g, ""))
      .filter(Boolean);
  }

  if (!name) return null;

  return { name, description, allowed_tools: allowedTools, argument_hint: argumentHint, body };
}

export function parseAllCommands(commandsDir: string): CommandMeta[] {
  if (!fs.existsSync(commandsDir)) return [];
  return fs.readdirSync(commandsDir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => parseCommandFile(path.join(commandsDir, f)))
    .filter((c): c is CommandMeta => c !== null);
}

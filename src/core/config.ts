import { readFile, stat } from "fs/promises";
import { join, dirname } from "path";
import { z } from "zod";

export const JUHBDI_DIR = ".juhbdi";

const ProjectConfigSchema = z.object({
  model: z.string().default("claude-sonnet-4-6"),
  hitl_mode: z.enum(["prompt", "auto", "deny"]).default("prompt"),
  max_retries: z.number().int().positive().default(3),
  test_timeout_ms: z.number().int().positive().default(60000),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

export async function findProjectRoot(
  startDir: string
): Promise<string | null> {
  let current = startDir;

  while (true) {
    try {
      const juhbdiPath = join(current, JUHBDI_DIR);
      const s = await stat(juhbdiPath);
      if (s.isDirectory()) return current;
    } catch {
      // Not found, go up
    }

    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export async function loadConfig(projectRoot: string): Promise<ProjectConfig> {
  const configPath = join(projectRoot, JUHBDI_DIR, "config.json");

  try {
    const raw = await readFile(configPath, "utf-8");
    return ProjectConfigSchema.parse(JSON.parse(raw));
  } catch {
    return ProjectConfigSchema.parse({});
  }
}

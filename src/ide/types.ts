// src/ide/types.ts
import { z } from "zod";

export const PlatformConfigSchema = z.object({
  name: z.string(),
  code: z.string(),
  target_dir: z.string(),
  template_type: z.enum(["slash-command", "manifest", "toml", "copilot", "kiro-steering"]),
  file_extension: z.string().default(".md"),
  frontmatter_format: z.enum(["yaml", "none"]).default("yaml"),
  supports_agents: z.boolean().default(false),
  agent_dir: z.string().optional(),
  notes: z.string().optional(),
});

export type PlatformConfig = z.infer<typeof PlatformConfigSchema>;
export type PlatformConfigInput = z.input<typeof PlatformConfigSchema>;

export const PlatformRegistrySchema = z.object({
  platforms: z.record(z.string(), PlatformConfigSchema),
});

export type PlatformRegistry = z.infer<typeof PlatformRegistrySchema>;

export interface CommandMeta {
  name: string;
  description: string;
  allowed_tools: string[];
  argument_hint?: string;
  body: string;
}

export interface InstallResult {
  platform: string;
  files_written: string[];
  agents_written: string[];
  success: boolean;
  error?: string;
}

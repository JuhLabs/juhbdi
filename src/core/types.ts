import type { ProjectConfig } from "./config";

export interface BDIContext {
  projectRoot: string;
  juhbdiDir: string;
  config: ProjectConfig;
  trailPath: string;
}

export interface CommandDef {
  name: string;
  description: string;
  execute: (args: string[], context: BDIContext) => Promise<void>;
}

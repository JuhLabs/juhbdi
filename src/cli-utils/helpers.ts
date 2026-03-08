import { join } from "path";
import { findProjectRoot, loadConfig, JUHBDI_DIR } from "../core/config";

export async function resolveContext() {
  const cwd = process.cwd();
  const projectRoot = await findProjectRoot(cwd);
  if (!projectRoot) {
    console.error(JSON.stringify({ error: "No .juhbdi/ directory found. Run /juhbdi:init first." }));
    process.exit(1);
  }
  const juhbdiDir = join(projectRoot, JUHBDI_DIR);
  const trailPath = join(juhbdiDir, "decision-trail.log");
  const config = await loadConfig(projectRoot);
  return { projectRoot, juhbdiDir, trailPath, config };
}

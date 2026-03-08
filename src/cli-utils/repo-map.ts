// src/cli-utils/repo-map.ts — CLI entry point for repo map operations
import { join } from "path";
import { resolveContext } from "./helpers";
import { generateRepoMap } from "../repomap/generate";
import { formatRepoMap } from "../repomap/format";
import { selectRelevantFiles } from "../repomap/select";
import { optimizeWaves } from "../repomap/waves";
import type { RepoMap } from "../repomap/types";
import type { Task } from "../schemas/roadmap-intent";

const REPO_MAP_FILE = "repo-map.json";

async function loadOrGenerate(juhbdiDir: string, projectRoot: string): Promise<RepoMap> {
  const mapPath = join(juhbdiDir, REPO_MAP_FILE);
  try {
    const content = await Bun.file(mapPath).text();
    return JSON.parse(content) as RepoMap;
  } catch {
    // No cached map — generate fresh
    const map = generateRepoMap(projectRoot);
    await Bun.write(mapPath, JSON.stringify(map, null, 2));
    return map;
  }
}

async function cmdGenerate() {
  const { juhbdiDir, projectRoot } = await resolveContext();
  const map = generateRepoMap(projectRoot);
  const mapPath = join(juhbdiDir, REPO_MAP_FILE);
  await Bun.write(mapPath, JSON.stringify(map, null, 2));
  console.log(
    JSON.stringify({
      status: "ok",
      files: map.files.length,
      edges: map.edges.length,
      path: mapPath,
    })
  );
}

async function cmdFormat(budgetStr?: string) {
  const { juhbdiDir, projectRoot } = await resolveContext();
  const map = await loadOrGenerate(juhbdiDir, projectRoot);
  const budget = budgetStr ? parseInt(budgetStr, 10) : undefined;
  const output = formatRepoMap(map, budget);
  console.log(output);
}

async function cmdSelect(description: string, budgetStr?: string) {
  const { juhbdiDir, projectRoot } = await resolveContext();
  const map = await loadOrGenerate(juhbdiDir, projectRoot);
  const budget = budgetStr ? parseInt(budgetStr, 10) : undefined;
  const output = selectRelevantFiles(description, map, budget);
  console.log(output);
}

async function cmdWaves(tasksJson: string) {
  const { juhbdiDir, projectRoot } = await resolveContext();
  const map = await loadOrGenerate(juhbdiDir, projectRoot);

  let tasks: Task[];
  try {
    tasks = JSON.parse(tasksJson);
  } catch {
    console.error(JSON.stringify({ error: "Invalid JSON for tasks" }));
    process.exit(1);
    return; // unreachable, satisfies TS
  }

  const waves = optimizeWaves(tasks, map);
  console.log(JSON.stringify(waves, null, 2));
}

function printUsage() {
  console.error(
    [
      "Usage: repo-map.ts <subcommand> [args]",
      "",
      "Subcommands:",
      "  generate              Scan project, write .juhbdi/repo-map.json",
      "  format [budget]       Format repo map to stdout (optional token budget)",
      "  select <desc> [budget] Select relevant files for a task description",
      "  waves <tasks_json>    Optimize task waves using dependency analysis",
    ].join("\n")
  );
}

async function main() {
  const args = process.argv.slice(2);
  const subcommand = args[0];

  switch (subcommand) {
    case "generate":
      return cmdGenerate();
    case "format":
      return cmdFormat(args[1]);
    case "select":
      if (!args[1]) {
        console.error(JSON.stringify({ error: "Missing description argument for select" }));
        process.exit(1);
      }
      return cmdSelect(args[1], args[2]);
    case "waves":
      if (!args[1]) {
        console.error(JSON.stringify({ error: "Missing tasks JSON argument for waves" }));
        process.exit(1);
      }
      return cmdWaves(args[1]);
    default:
      printUsage();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ error: String(err) }));
  process.exit(1);
});

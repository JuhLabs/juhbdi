import { mkdir, writeFile, stat } from "fs/promises";
import { join, basename } from "path";
import { JUHBDI_DIR } from "../core/config";
import { IntentSpecSchema, type IntentSpec } from "../schemas/intent-spec";
import { serializeState, type State } from "../schemas/state";
import { appendTrailEntry } from "../core/trail";

const DEFAULT_INTENT_SPEC: IntentSpec = {
  version: "1.0.0",
  project: {
    name: "my-project",
    description: "A new JuhBDI-managed project",
  },
  goals: [
    {
      id: "g1",
      description: "Build a working MVP",
      metric: "feature_completeness",
      target: "100%",
      weight: 1.0,
    },
  ],
  constraints: [
    {
      id: "c1",
      description: "All changes must pass tests before merge",
      severity: "hard",
      hitl_required: false,
    },
  ],
  tradeoff_weights: {
    security: 0.3,
    performance: 0.2,
    speed: 0.3,
    quality: 0.2,
  },
  hitl_gates: [
    {
      action_pattern: "db:schema:*",
      approval_required: true,
    },
  ],
};

/**
 * Minimal init for zero-config auto pipeline.
 * Creates only: state.json, config.json, decision-trail.log.
 * No intent-spec, no user-preferences, no roadmap.
 * Idempotent — safe to call if .juhbdi/ already exists.
 */
export async function quickInit(cwd: string): Promise<void> {
  const juhbdiDir = join(cwd, JUHBDI_DIR);
  await mkdir(juhbdiDir, { recursive: true });

  const projectName = basename(cwd) || "project";

  const state: State = {
    version: "1.0.0",
    project_name: projectName,
    conventions: [],
    architecture: "Not yet analyzed",
    compressed_history: "Quick-initialized for auto pipeline.",
    last_updated: new Date().toISOString(),
  };
  await writeFile(join(juhbdiDir, "state.json"), serializeState(state));

  const configPath = join(juhbdiDir, "config.json");
  try { await stat(configPath); } catch {
    await writeFile(configPath, JSON.stringify({ model: "claude-sonnet-4-6", hitl_mode: "prompt" }, null, 2) + "\n");
  }

  const trailPath = join(juhbdiDir, "decision-trail.log");
  try { await stat(trailPath); } catch {
    await appendTrailEntry(trailPath, {
      event_type: "command",
      description: "Quick-initialized JuhBDI project (zero-config auto)",
      reasoning: "Auto pipeline needs minimal .juhbdi/ state",
      alternatives_considered: ["full interactive init"],
      constraint_refs: [],
      outcome: "approved",
    });
  }
}

async function main() {
  const cwd = process.cwd();

  // Support --quick flag for zero-config auto pipeline
  if (process.argv.includes("--quick")) {
    await quickInit(cwd);
    console.log(JSON.stringify({ success: true, mode: "quick", files: ["state.json", "config.json", "decision-trail.log"] }));
    return;
  }

  const juhbdiDir = join(cwd, JUHBDI_DIR);
  const trailPath = join(juhbdiDir, "decision-trail.log");

  // Check if already initialized
  try {
    const s = await stat(juhbdiDir);
    if (s.isDirectory()) {
      console.log(JSON.stringify({ error: "Project already initialized. .juhbdi/ exists." }));
      process.exit(1);
    }
  } catch {
    // Not found — proceed
  }

  // Create .juhbdi/ directory
  await mkdir(juhbdiDir, { recursive: true });

  // Write intent-spec.json
  const intentSpec = IntentSpecSchema.parse(DEFAULT_INTENT_SPEC);
  await writeFile(join(juhbdiDir, "intent-spec.json"), JSON.stringify(intentSpec, null, 2) + "\n");

  // Write roadmap-intent.json
  const emptyRoadmap = { version: "1.0.0", intent_spec_ref: ".juhbdi/intent-spec.json", waves: [] };
  await writeFile(join(juhbdiDir, "roadmap-intent.json"), JSON.stringify(emptyRoadmap, null, 2) + "\n");

  // Write state.json
  const initialState: State = {
    version: "1.0.0",
    project_name: "my-project",
    conventions: [],
    architecture: "Not yet defined",
    compressed_history: "Project initialized.",
    last_updated: new Date().toISOString(),
  };
  await writeFile(join(juhbdiDir, "state.json"), serializeState(initialState));

  // Write config.json
  await writeFile(
    join(juhbdiDir, "config.json"),
    JSON.stringify({ model: "claude-sonnet-4-6", hitl_mode: "prompt" }, null, 2) + "\n"
  );

  // Append trail entry
  await appendTrailEntry(trailPath, {
    event_type: "command",
    description: "Initialized JuhBDI project",
    reasoning: "User ran juhbdi init",
    alternatives_considered: [],
    constraint_refs: [],
    outcome: "approved",
  });

  // Output result
  console.log(
    JSON.stringify({
      success: true,
      files: [
        "intent-spec.json",
        "roadmap-intent.json",
        "state.json",
        "config.json",
        "decision-trail.log",
      ],
    })
  );
}

if (import.meta.path === Bun.main) {
  main().catch((err) => {
    console.error(JSON.stringify({ error: String(err) }));
    process.exit(1);
  });
}

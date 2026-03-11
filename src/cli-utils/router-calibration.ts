// src/cli-utils/router-calibration.ts
import { z } from "zod/v4";
import { join } from "path";
import { mkdir, readFile, writeFile } from "fs/promises";
import { RoutingOutcomeSchema } from "../schemas/model-route";
import type { RoutingOutcome } from "../schemas/model-route";

// ── Schema ──────────────────────────────────────────────────────────

export const RouterCalibrationSchema = z.object({
  recent_decisions: z.array(RoutingOutcomeSchema),
  accuracy: z.number().min(0).max(1),
  opus_threshold: z.number(),
  haiku_threshold: z.number(),
  total_routed: z.number().int().min(0),
  updated: z.string(),
});

export type RouterCalibration = z.infer<typeof RouterCalibrationSchema>;

// ── Constants ───────────────────────────────────────────────────────

const CALIBRATION_FILE = "router-calibration.json";
const JUHBDI_DIR = ".juhbdi";
const MAX_RECENT = 20;
const PROMOTE_THRESHOLD = 50;

const DEFAULT_OPUS_THRESHOLD = 4;
const DEFAULT_HAIKU_THRESHOLD = -4;

// ── Defaults ────────────────────────────────────────────────────────

export function defaultCalibration(): RouterCalibration {
  return {
    recent_decisions: [],
    accuracy: 0,
    opus_threshold: DEFAULT_OPUS_THRESHOLD,
    haiku_threshold: DEFAULT_HAIKU_THRESHOLD,
    total_routed: 0,
    updated: new Date().toISOString(),
  };
}

// ── Load ────────────────────────────────────────────────────────────

export async function loadCalibration(
  cwd: string
): Promise<RouterCalibration | null> {
  const filePath = join(cwd, JUHBDI_DIR, CALIBRATION_FILE);
  try {
    const raw = await readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    const result = RouterCalibrationSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

// ── Save ────────────────────────────────────────────────────────────

export async function saveCalibration(
  cwd: string,
  calibration: RouterCalibration
): Promise<void> {
  const dir = join(cwd, JUHBDI_DIR);
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, CALIBRATION_FILE);
  await writeFile(filePath, JSON.stringify(calibration, null, 2) + "\n");
}

// ── Merge ───────────────────────────────────────────────────────────

export function mergeOutcome(
  calibration: RouterCalibration,
  outcome: RoutingOutcome
): RouterCalibration {
  const allDecisions = [...calibration.recent_decisions, outcome];
  const recent = allDecisions.slice(-MAX_RECENT);

  const correctCount = recent.filter(
    (o) => o.actual_outcome === "correct"
  ).length;
  const accuracy = recent.length > 0 ? correctCount / recent.length : 0;

  let opusThreshold = DEFAULT_OPUS_THRESHOLD;
  let haikuThreshold = DEFAULT_HAIKU_THRESHOLD;
  if (accuracy < 0.7) {
    opusThreshold = 3;
    haikuThreshold = -5;
  } else if (accuracy > 0.9) {
    opusThreshold = 5;
    haikuThreshold = -3;
  }

  return {
    recent_decisions: recent,
    accuracy,
    opus_threshold: opusThreshold,
    haiku_threshold: haikuThreshold,
    total_routed: calibration.total_routed + 1,
    updated: new Date().toISOString(),
  };
}

// ── Promote Gate ────────────────────────────────────────────────────

export function shouldPromote(calibration: RouterCalibration): boolean {
  return calibration.total_routed >= PROMOTE_THRESHOLD;
}

// ── CLI ─────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  const cwd = process.cwd();

  switch (command) {
    case "load": {
      const cal = await loadCalibration(cwd);
      console.log(JSON.stringify(cal ?? defaultCalibration(), null, 2));
      break;
    }
    case "save": {
      const data = args[1];
      if (!data) {
        console.error("Usage: router-calibration.ts save '<json>'");
        process.exit(1);
      }
      const parsed = RouterCalibrationSchema.safeParse(JSON.parse(data));
      if (!parsed.success) {
        console.error("Invalid calibration:", parsed.error.message);
        process.exit(1);
      }
      await saveCalibration(cwd, parsed.data);
      console.log(JSON.stringify({ success: true, total_routed: parsed.data.total_routed }));
      break;
    }
    case "merge": {
      const outcomeJson = args[1];
      if (!outcomeJson) {
        console.error("Usage: router-calibration.ts merge '<outcome_json>'");
        process.exit(1);
      }
      const existing = (await loadCalibration(cwd)) ?? defaultCalibration();
      const outcome = JSON.parse(outcomeJson) as RoutingOutcome;
      const merged = mergeOutcome(existing, outcome);
      await saveCalibration(cwd, merged);
      console.log(JSON.stringify({
        success: true,
        accuracy: merged.accuracy,
        total_routed: merged.total_routed,
        should_promote: shouldPromote(merged),
      }));
      break;
    }
    default:
      console.error("Usage: router-calibration.ts <load|save|merge> [args]");
      process.exit(1);
  }
}

if (import.meta.path === Bun.main) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

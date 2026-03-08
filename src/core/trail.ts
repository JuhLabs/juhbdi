import { appendFile, readFile } from "fs/promises";
import {
  DecisionTrailEntrySchema,
  type DecisionTrailEntry,
} from "../schemas/decision-trail";
import { computeEntryHash } from "./trail-verify";

type TrailInput = Omit<DecisionTrailEntry, "timestamp" | "prev_hash" | "entry_hash">;

export async function appendTrailEntry(
  logPath: string,
  input: TrailInput
): Promise<void> {
  // Read existing trail to get last entry's hash for chaining
  const existing = await readTrail(logPath);
  const lastHash = existing.length > 0
    ? (existing[existing.length - 1].entry_hash ?? "0")
    : "0";

  const entry: DecisionTrailEntry = {
    ...input,
    timestamp: new Date().toISOString(),
    prev_hash: lastHash,
    risk_level: input.risk_level ?? "low",
  };

  // Compute entry_hash (computeEntryHash zeroes entry_hash before hashing)
  entry.entry_hash = computeEntryHash(entry);

  const validated = DecisionTrailEntrySchema.parse(entry);
  await appendFile(logPath, JSON.stringify(validated) + "\n");
}

export async function readTrail(
  logPath: string
): Promise<DecisionTrailEntry[]> {
  let content: string;
  try {
    content = await readFile(logPath, "utf-8");
  } catch {
    return [];
  }

  return content
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      try {
        return DecisionTrailEntrySchema.parse(JSON.parse(line));
      } catch {
        return null;
      }
    })
    .filter((entry): entry is DecisionTrailEntry => entry !== null);
}

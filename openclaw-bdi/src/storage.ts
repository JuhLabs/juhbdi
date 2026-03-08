import { readFile, writeFile, mkdir, appendFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import type {
  ExperienceTriplet,
  TrustStore,
  PrincipleBank,
  DecisionTrailEntry,
} from "./core/schemas.js";
import { ExperienceTripletSchema, TrustStoreSchema, PrincipleBankSchema, DecisionTrailEntrySchema } from "./core/schemas.js";

const DATA_DIR = join(homedir(), ".openclaw", "extensions", "juhbdi");

export async function ensureDataDir(): Promise<string> {
  await mkdir(DATA_DIR, { recursive: true });
  return DATA_DIR;
}

function filePath(name: string): string {
  return join(DATA_DIR, name);
}

// ── Memory ──────────────────────────────────────────────────

export async function loadMemory(): Promise<ExperienceTriplet[]> {
  try {
    const content = await readFile(filePath("memory.jsonl"), "utf-8");
    return content
      .trim()
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => ExperienceTripletSchema.parse(JSON.parse(line)));
  } catch {
    return [];
  }
}

export async function appendMemory(triplet: ExperienceTriplet): Promise<void> {
  await ensureDataDir();
  await appendFile(filePath("memory.jsonl"), JSON.stringify(triplet) + "\n");
}

// ── Trail ───────────────────────────────────────────────────

export async function loadTrail(): Promise<DecisionTrailEntry[]> {
  try {
    const content = await readFile(filePath("trail.jsonl"), "utf-8");
    return content
      .trim()
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => DecisionTrailEntrySchema.parse(JSON.parse(line)));
  } catch {
    return [];
  }
}

export function trailPath(): string {
  return filePath("trail.jsonl");
}

// ── Trust ───────────────────────────────────────────────────

export async function loadTrust(): Promise<TrustStore> {
  try {
    const content = await readFile(filePath("trust.json"), "utf-8");
    return TrustStoreSchema.parse(JSON.parse(content));
  } catch {
    return { version: "1.0.0", records: {} };
  }
}

export async function saveTrust(store: TrustStore): Promise<void> {
  await ensureDataDir();
  await writeFile(filePath("trust.json"), JSON.stringify(store, null, 2) + "\n");
}

// ── Principles ──────────────────────────────────────────────

export async function loadPrinciples(): Promise<PrincipleBank> {
  try {
    const content = await readFile(filePath("principles.json"), "utf-8");
    return PrincipleBankSchema.parse(JSON.parse(content));
  } catch {
    return { version: "1.0.0", principles: [] };
  }
}

export async function savePrinciples(bank: PrincipleBank): Promise<void> {
  await ensureDataDir();
  await writeFile(filePath("principles.json"), JSON.stringify(bank, null, 2) + "\n");
}

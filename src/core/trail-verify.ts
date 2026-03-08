import { createHash } from "crypto";
import type { DecisionTrailEntry } from "../schemas/decision-trail";

export function computeEntryHash(entry: DecisionTrailEntry): string {
  const toHash = { ...entry, entry_hash: "" };
  const json = JSON.stringify(toHash, Object.keys(toHash).sort());
  return createHash("sha256").update(json).digest("hex");
}

export interface ChainVerification {
  valid: boolean;
  broken_at?: number;
  message: string;
}

export function verifyChain(entries: DecisionTrailEntry[]): ChainVerification {
  if (entries.length === 0) {
    return { valid: true, message: "Empty chain" };
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    if (!entry.entry_hash) continue;

    const computed = computeEntryHash(entry);
    if (computed !== entry.entry_hash) {
      return {
        valid: false,
        broken_at: i,
        message: `Entry ${i} hash mismatch: expected ${entry.entry_hash}, computed ${computed}`,
      };
    }

    if (i > 0 && entry.prev_hash) {
      const prevEntry = entries[i - 1];
      const expectedPrev = prevEntry.entry_hash ?? "0";
      if (entry.prev_hash !== expectedPrev) {
        return {
          valid: false,
          broken_at: i,
          message: `Entry ${i} prev_hash mismatch: expected ${expectedPrev}, got ${entry.prev_hash}`,
        };
      }
    }
  }

  return { valid: true, message: `Chain verified: ${entries.length} entries` };
}

// Trail Hash Chain — SHA-256 hash computation
// Makes prev_hash, entry_hash, inputs_hash REAL instead of empty

import { createHash } from "crypto";

// Recursively sort all object keys for deterministic serialization
function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

export function computeEntryHash(entry: Record<string, unknown>): string {
  // Hash everything except the hash fields themselves
  const toHash = { ...entry };
  delete toHash.entry_hash;
  delete toHash.prev_hash;
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(toHash)))
    .digest("hex");
}

export function computeInputsHash(inputs: Record<string, unknown>): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(inputs)))
    .digest("hex");
}

export function validateHashChain(entries: Array<Record<string, unknown>>): {
  valid: boolean;
  broken_at?: number;
  total: number;
} {
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const computed = computeEntryHash(entry);

    if (entry.entry_hash && entry.entry_hash !== computed) {
      return { valid: false, broken_at: i, total: entries.length };
    }

    if (i > 0 && entry.prev_hash) {
      const prevEntry = entries[i - 1];
      if (entry.prev_hash !== prevEntry.entry_hash) {
        return { valid: false, broken_at: i, total: entries.length };
      }
    }
  }

  return { valid: true, total: entries.length };
}

export function hashEntry(
  entry: Record<string, unknown>,
  prevHash: string = ""
): Record<string, unknown> {
  const entryHash = computeEntryHash(entry);
  return {
    ...entry,
    entry_hash: entryHash,
    prev_hash: prevHash,
  };
}

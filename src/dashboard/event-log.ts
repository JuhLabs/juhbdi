// src/dashboard/event-log.ts
import { appendFile, writeFile, stat } from "fs/promises";
import { existsSync, createReadStream } from "fs";
import { createInterface } from "readline";

export interface DashboardEvent {
  timestamp: string;
  type: string;
  data: any;
}

// Max log size before auto-truncation (50 MB)
const MAX_LOG_BYTES = 50 * 1024 * 1024;

/**
 * Append a single event as a JSON line to the JSONL log.
 * Auto-truncates if the file exceeds MAX_LOG_BYTES.
 */
export async function appendEvent(logPath: string, event: DashboardEvent): Promise<void> {
  const line = JSON.stringify(event) + "\n";
  await appendFile(logPath, line, "utf-8");

  // Size guard — truncate to empty if file grows too large
  try {
    const info = await stat(logPath);
    if (info.size > MAX_LOG_BYTES) {
      await writeFile(logPath, "", "utf-8");
    }
  } catch { /* non-fatal */ }
}

/**
 * Replay events from the JSONL log using streaming reads.
 * Optionally filter to events >= sinceTimestamp.
 * Skips malformed lines gracefully.
 */
export async function replayEvents(
  logPath: string,
  sinceTimestamp?: string,
): Promise<DashboardEvent[]> {
  if (!existsSync(logPath)) return [];

  // Safety: skip files over 50 MB
  try {
    const info = await stat(logPath);
    if (info.size > MAX_LOG_BYTES) return [];
  } catch { return []; }

  const events: DashboardEvent[] = [];
  const sinceMs = sinceTimestamp ? new Date(sinceTimestamp).getTime() : 0;

  const rl = createInterface({
    input: createReadStream(logPath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const event: DashboardEvent = JSON.parse(line);
      if (sinceTimestamp) {
        const eventMs = new Date(event.timestamp).getTime();
        if (eventMs < sinceMs) continue;
      }
      events.push(event);
    } catch {
      // Skip malformed lines
    }
  }

  return events;
}

/**
 * Compact the event log: keep only events from the last maxAgeDays.
 * Uses streaming reads to avoid OOM on large files.
 */
export async function compactEvents(
  logPath: string,
  archivePath: string,
  maxAgeDays: number = 7,
): Promise<{ archived: number; retained: number }> {
  if (!existsSync(logPath)) return { archived: 0, retained: 0 };

  // Safety: if file is enormous, just truncate it
  try {
    const info = await stat(logPath);
    if (info.size > MAX_LOG_BYTES) {
      await writeFile(logPath, "", "utf-8");
      return { archived: 0, retained: 0 };
    }
  } catch { return { archived: 0, retained: 0 }; }

  const cutoff = Date.now() - maxAgeDays * 86400000;
  const retained: string[] = [];
  const toArchive: string[] = [];

  const rl = createInterface({
    input: createReadStream(logPath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const event: DashboardEvent = JSON.parse(line);
      const eventMs = new Date(event.timestamp).getTime();
      if (eventMs < cutoff) {
        toArchive.push(line);
      } else {
        retained.push(line);
      }
    } catch {
      // Drop malformed lines during compaction
    }
  }

  // Append old events to archive
  if (toArchive.length > 0) {
    const archiveContent = toArchive.map(l => l + "\n").join("");
    await appendFile(archivePath, archiveContent, "utf-8");
  }

  // Rewrite main log with only retained events
  const retainedContent = retained.length > 0
    ? retained.map(l => l + "\n").join("")
    : "";
  await writeFile(logPath, retainedContent, "utf-8");

  return { archived: toArchive.length, retained: retained.length };
}

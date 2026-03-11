// src/dashboard/event-log.ts
import { appendFile, readFile, writeFile } from "fs/promises";
import { existsSync } from "fs";

export interface DashboardEvent {
  timestamp: string;
  type: string;
  data: any;
}

/**
 * Append a single event as a JSON line to the JSONL log.
 * Creates the file on first write.
 */
export async function appendEvent(logPath: string, event: DashboardEvent): Promise<void> {
  const line = JSON.stringify(event) + "\n";
  await appendFile(logPath, line, "utf-8");
}

/**
 * Replay all events from the JSONL log.
 * Optionally filter to events >= sinceTimestamp.
 * Skips malformed lines gracefully.
 */
export async function replayEvents(
  logPath: string,
  sinceTimestamp?: string,
): Promise<DashboardEvent[]> {
  if (!existsSync(logPath)) return [];

  const raw = await readFile(logPath, "utf-8");
  const lines = raw.trim().split("\n").filter(Boolean);
  const events: DashboardEvent[] = [];

  const sinceMs = sinceTimestamp ? new Date(sinceTimestamp).getTime() : 0;

  for (const line of lines) {
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
 * Compact the event log: move events older than 7 days to an archive file.
 * Returns count of archived and retained events.
 */
export async function compactEvents(
  logPath: string,
  archivePath: string,
  maxAgeDays: number = 7,
): Promise<{ archived: number; retained: number }> {
  if (!existsSync(logPath)) return { archived: 0, retained: 0 };

  const raw = await readFile(logPath, "utf-8");
  const lines = raw.trim().split("\n").filter(Boolean);

  const cutoff = Date.now() - maxAgeDays * 86400000;
  const retained: string[] = [];
  const toArchive: string[] = [];

  for (const line of lines) {
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

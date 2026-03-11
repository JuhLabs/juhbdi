// src/dashboard/event-log.test.ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, readFile, stat, appendFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  appendEvent,
  replayEvents,
  compactEvents,
  type DashboardEvent,
} from "./event-log";

async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "juhbdi-eventlog-test-"));
}

describe("appendEvent", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await makeTempDir();
  });

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  test("creates JSONL file on first append", async () => {
    const logPath = join(tempDir, "dashboard-events.jsonl");
    const event: DashboardEvent = {
      timestamp: new Date().toISOString(),
      type: "broadcast",
      data: { state: { project_name: "test" } },
    };
    await appendEvent(logPath, event);
    const s = await stat(logPath);
    expect(s.isFile()).toBe(true);
  });

  test("appends one JSON line per event", async () => {
    const logPath = join(tempDir, "dashboard-events.jsonl");
    await appendEvent(logPath, {
      timestamp: "2026-03-11T10:00:00.000Z",
      type: "broadcast",
      data: { state: { project_name: "a" } },
    });
    await appendEvent(logPath, {
      timestamp: "2026-03-11T10:01:00.000Z",
      type: "broadcast",
      data: { state: { project_name: "b" } },
    });
    const raw = await readFile(logPath, "utf-8");
    const lines = raw.trim().split("\n");
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0]).timestamp).toBe("2026-03-11T10:00:00.000Z");
    expect(JSON.parse(lines[1]).timestamp).toBe("2026-03-11T10:01:00.000Z");
  });

  test("each line is valid JSON", async () => {
    const logPath = join(tempDir, "dashboard-events.jsonl");
    for (let i = 0; i < 5; i++) {
      await appendEvent(logPath, {
        timestamp: new Date(Date.now() + i * 1000).toISOString(),
        type: "broadcast",
        data: { idx: i },
      });
    }
    const raw = await readFile(logPath, "utf-8");
    const lines = raw.trim().split("\n");
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });
});

describe("replayEvents", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await makeTempDir();
  });

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  test("returns empty array if file does not exist", async () => {
    const logPath = join(tempDir, "dashboard-events.jsonl");
    const events = await replayEvents(logPath);
    expect(events).toEqual([]);
  });

  test("returns all events from file", async () => {
    const logPath = join(tempDir, "dashboard-events.jsonl");
    for (let i = 0; i < 3; i++) {
      await appendEvent(logPath, {
        timestamp: new Date(Date.now() + i * 1000).toISOString(),
        type: "broadcast",
        data: { idx: i },
      });
    }
    const events = await replayEvents(logPath);
    expect(events.length).toBe(3);
    expect(events[0].data.idx).toBe(0);
    expect(events[2].data.idx).toBe(2);
  });

  test("filters events by sinceTimestamp", async () => {
    const logPath = join(tempDir, "dashboard-events.jsonl");
    const base = new Date("2026-03-01T00:00:00.000Z");
    for (let i = 0; i < 10; i++) {
      await appendEvent(logPath, {
        timestamp: new Date(base.getTime() + i * 86400000).toISOString(), // 1 day apart
        type: "broadcast",
        data: { day: i },
      });
    }
    // Replay events since day 7 (2026-03-08)
    const since = new Date("2026-03-08T00:00:00.000Z").toISOString();
    const events = await replayEvents(logPath, since);
    expect(events.length).toBe(3); // day 7, 8, 9
    expect(events[0].data.day).toBe(7);
  });

  test("skips malformed lines gracefully", async () => {
    const logPath = join(tempDir, "dashboard-events.jsonl");
    await appendEvent(logPath, {
      timestamp: "2026-03-11T10:00:00.000Z",
      type: "broadcast",
      data: { ok: true },
    });
    // Manually append a bad line
    await appendFile(logPath, "NOT VALID JSON\n");
    await appendEvent(logPath, {
      timestamp: "2026-03-11T10:01:00.000Z",
      type: "broadcast",
      data: { ok: true },
    });
    const events = await replayEvents(logPath);
    expect(events.length).toBe(2); // skipped the bad line
  });
});

describe("compactEvents", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await makeTempDir();
  });

  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  test("moves events older than 7 days to archive", async () => {
    const logPath = join(tempDir, "dashboard-events.jsonl");
    const archivePath = join(tempDir, "dashboard-events.archive.jsonl");

    const now = Date.now();
    const eightDaysAgo = new Date(now - 8 * 86400000).toISOString();
    const sixDaysAgo = new Date(now - 6 * 86400000).toISOString();
    const today = new Date(now).toISOString();

    await appendEvent(logPath, { timestamp: eightDaysAgo, type: "broadcast", data: { age: "old" } });
    await appendEvent(logPath, { timestamp: sixDaysAgo, type: "broadcast", data: { age: "recent" } });
    await appendEvent(logPath, { timestamp: today, type: "broadcast", data: { age: "today" } });

    const result = await compactEvents(logPath, archivePath);
    expect(result.archived).toBe(1);
    expect(result.retained).toBe(2);

    // Verify main file has only recent events
    const remaining = await replayEvents(logPath);
    expect(remaining.length).toBe(2);
    expect(remaining[0].data.age).toBe("recent");

    // Verify archive file has old events
    const archived = await replayEvents(archivePath);
    expect(archived.length).toBe(1);
    expect(archived[0].data.age).toBe("old");
  });

  test("appends to existing archive (does not overwrite)", async () => {
    const logPath = join(tempDir, "dashboard-events.jsonl");
    const archivePath = join(tempDir, "dashboard-events.archive.jsonl");

    const now = Date.now();

    // Pre-populate archive with one event
    await appendEvent(archivePath, {
      timestamp: new Date(now - 20 * 86400000).toISOString(),
      type: "broadcast",
      data: { pre: true },
    });

    // Add old + new events to main log
    await appendEvent(logPath, {
      timestamp: new Date(now - 10 * 86400000).toISOString(),
      type: "broadcast",
      data: { age: "old" },
    });
    await appendEvent(logPath, {
      timestamp: new Date(now).toISOString(),
      type: "broadcast",
      data: { age: "today" },
    });

    await compactEvents(logPath, archivePath);

    const archived = await replayEvents(archivePath);
    expect(archived.length).toBe(2); // pre-existing + newly archived
  });

  test("no-op when no events are older than 7 days", async () => {
    const logPath = join(tempDir, "dashboard-events.jsonl");
    const archivePath = join(tempDir, "dashboard-events.archive.jsonl");

    await appendEvent(logPath, {
      timestamp: new Date().toISOString(),
      type: "broadcast",
      data: { age: "today" },
    });

    const result = await compactEvents(logPath, archivePath);
    expect(result.archived).toBe(0);
    expect(result.retained).toBe(1);
  });

  test("no-op when log file does not exist", async () => {
    const logPath = join(tempDir, "dashboard-events.jsonl");
    const archivePath = join(tempDir, "dashboard-events.archive.jsonl");

    const result = await compactEvents(logPath, archivePath);
    expect(result.archived).toBe(0);
    expect(result.retained).toBe(0);
  });
});

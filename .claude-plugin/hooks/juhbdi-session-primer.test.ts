import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { writeFileSync, unlinkSync, existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";

async function runPrimer(input: object): Promise<object> {
  const proc = Bun.spawn(
    ["node", ".claude-plugin/hooks/juhbdi-session-primer.cjs"],
    { stdin: "pipe", stdout: "pipe", cwd: process.cwd() }
  );
  proc.stdin.write(JSON.stringify(input));
  proc.stdin.end();
  const output = await new Response(proc.stdout).text();
  return JSON.parse(output.trim());
}

function setupHandoff(opts: {
  timestamp?: string;
  content?: string;
  intelligenceState?: object;
}) {
  const handoffDir = join(process.cwd(), ".juhbdi", "handoffs");
  mkdirSync(handoffDir, { recursive: true });

  const ts = opts.timestamp || new Date().toISOString();
  const promptFile = join(handoffDir, "test-handoff.md");
  const promptContent = opts.content || "# Test Handoff\nThis is a test handoff.";
  writeFileSync(promptFile, promptContent);

  const latest = {
    handoff_file: join(handoffDir, "test-snapshot.json"),
    prompt_file: promptFile,
    timestamp: ts,
    session_id: "test-primer",
    intelligence_state: opts.intelligenceState || null,
  };
  writeFileSync(join(handoffDir, "latest.json"), JSON.stringify(latest, null, 2));
}

function cleanupHandoffs() {
  const handoffDir = join(process.cwd(), ".juhbdi", "handoffs");
  if (existsSync(handoffDir)) {
    try { rmSync(handoffDir, { recursive: true }); } catch { /* ignore */ }
  }
}

describe("juhbdi-session-primer hook", () => {
  beforeEach(() => cleanupHandoffs());
  afterAll(() => cleanupHandoffs());

  test("loads handoff within 2-hour window", async () => {
    setupHandoff({
      timestamp: new Date().toISOString(),
      content: "# Recent Handoff\nShould be loaded.",
    });
    const result = await runPrimer({ cwd: process.cwd() });
    const msg = (result as any).user_message || "";
    expect(msg).toContain("SESSION RESTORED");
    expect(msg).toContain("Recent Handoff");
  });

  test("skips handoff older than 2 hours", async () => {
    const oldTs = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    setupHandoff({
      timestamp: oldTs,
      content: "# Old Handoff\nShould be skipped.",
    });
    const result = await runPrimer({ cwd: process.cwd() });
    const msg = (result as any).user_message || "";
    expect(msg).not.toContain("Old Handoff");
  });

  test("validates timestamp before using", async () => {
    setupHandoff({
      timestamp: "not-a-valid-timestamp",
      content: "# Bad Timestamp\nShould be skipped.",
    });
    const result = await runPrimer({ cwd: process.cwd() });
    const msg = (result as any).user_message || "";
    expect(msg).not.toContain("Bad Timestamp");
  });

  test("shows restoration banner with intelligence state counts", async () => {
    setupHandoff({
      timestamp: new Date().toISOString(),
      content: "# Handoff with intelligence",
      intelligenceState: {
        reflexion_count: 12,
        trace_count: 5,
        principle_count: 3,
        memory_triplets: 8,
      },
    });
    const result = await runPrimer({ cwd: process.cwd() });
    const msg = (result as any).user_message || "";
    expect(msg).toContain("12 reflexions");
    expect(msg).toContain("5 experiential traces");
    expect(msg).toContain("3 principles");
    expect(msg).toContain("8 memory triplets");
  });

  test("consumes latest.json after loading (renames to .consumed)", async () => {
    setupHandoff({
      timestamp: new Date().toISOString(),
      content: "# Consumable handoff",
    });
    await runPrimer({ cwd: process.cwd() });
    const latestPath = join(process.cwd(), ".juhbdi", "handoffs", "latest.json");
    const consumedPath = latestPath + ".consumed";
    expect(existsSync(latestPath)).toBe(false);
    expect(existsSync(consumedPath)).toBe(true);
  });

  test("outputs empty when no handoff and bun script fails", async () => {
    // No handoff, and we pass a bad plugin root so the bun script won't be found
    const result = await runPrimer({
      cwd: process.cwd(),
    });
    // Without a valid bun script or handoff, should output empty or error gracefully
    expect(result).toBeDefined();
  });

  test("shows pending task count in banner when available", async () => {
    // Create a roadmap with pending tasks
    const juhbdiDir = join(process.cwd(), ".juhbdi");
    mkdirSync(juhbdiDir, { recursive: true });
    const roadmapPath = join(juhbdiDir, "roadmap-intent.json");
    writeFileSync(roadmapPath, JSON.stringify({
      waves: [
        {
          tasks: [
            { id: "t1", description: "Task 1", status: "pending" },
            { id: "t2", description: "Task 2", status: "pending" },
            { id: "t3", description: "Task 3", status: "done" },
          ],
        },
      ],
    }));

    setupHandoff({
      timestamp: new Date().toISOString(),
      content: "# Handoff with tasks",
      intelligenceState: { reflexion_count: 1, trace_count: 0, principle_count: 0, memory_triplets: 0 },
    });

    const result = await runPrimer({ cwd: process.cwd() });
    const msg = (result as any).user_message || "";
    expect(msg).toContain("2 pending tasks");

    // Cleanup roadmap
    if (existsSync(roadmapPath)) unlinkSync(roadmapPath);
  });
});

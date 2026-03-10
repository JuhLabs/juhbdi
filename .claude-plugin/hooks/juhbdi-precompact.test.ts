import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import {
  writeFileSync, unlinkSync, existsSync, mkdirSync, rmSync,
  readFileSync, readdirSync,
} from "fs";
import { join } from "path";

async function runPrecompact(input: object): Promise<object> {
  const proc = Bun.spawn(
    ["node", ".claude-plugin/hooks/juhbdi-precompact.cjs"],
    { stdin: "pipe", stdout: "pipe", cwd: process.cwd() }
  );
  proc.stdin.write(JSON.stringify(input));
  proc.stdin.end();
  const output = await new Response(proc.stdout).text();
  return JSON.parse(output.trim());
}

const sid = "test-precompact";

function setupJuhbdiDir() {
  const juhbdiDir = join(process.cwd(), ".juhbdi");
  mkdirSync(juhbdiDir, { recursive: true });
  return juhbdiDir;
}

function writeBridge(sessionId: string, remainingPct: number) {
  writeFileSync(
    `/tmp/juhbdi-ctx-${sessionId}.json`,
    JSON.stringify({
      session_id: sessionId,
      remaining_pct: remainingPct,
      usable_pct: Math.max(0, remainingPct - 16.5),
      timestamp: new Date().toISOString(),
    })
  );
}

function cleanupAll() {
  const bridgePath = `/tmp/juhbdi-ctx-${sid}.json`;
  if (existsSync(bridgePath)) unlinkSync(bridgePath);

  const handoffDir = join(process.cwd(), ".juhbdi", "handoffs");
  if (existsSync(handoffDir)) {
    try { rmSync(handoffDir, { recursive: true }); } catch { /* ignore */ }
  }

  // Clean up test intelligence files
  const juhbdiDir = join(process.cwd(), ".juhbdi");
  const testFiles = [
    "reflexion-bank.json", "trust-store.json",
    "experiential-traces.json", "principle-bank.json",
    "memory-bank.json", "bdi-state.json",
  ];
  for (const f of testFiles) {
    const p = join(juhbdiDir, f);
    if (existsSync(p)) unlinkSync(p);
  }
}

describe("juhbdi-precompact hook", () => {
  beforeEach(() => {
    cleanupAll();
    writeBridge(sid, 20);
  });
  afterAll(() => cleanupAll());

  test("creates handoff files in .juhbdi/handoffs/", async () => {
    setupJuhbdiDir();
    await runPrecompact({ session_id: sid, cwd: process.cwd() });
    const handoffDir = join(process.cwd(), ".juhbdi", "handoffs");
    expect(existsSync(handoffDir)).toBe(true);
    const files = readdirSync(handoffDir);
    const precompactFiles = files.filter((f) => f.startsWith("precompact-"));
    const continueFiles = files.filter((f) => f.startsWith("continue-"));
    expect(precompactFiles.length).toBeGreaterThan(0);
    expect(continueFiles.length).toBeGreaterThan(0);
  });

  test("creates latest.json pointer", async () => {
    setupJuhbdiDir();
    await runPrecompact({ session_id: sid, cwd: process.cwd() });
    const latestPath = join(process.cwd(), ".juhbdi", "handoffs", "latest.json");
    expect(existsSync(latestPath)).toBe(true);
    const latest = JSON.parse(readFileSync(latestPath, "utf-8"));
    expect(latest.session_id).toBe(sid);
    expect(latest.timestamp).toBeDefined();
    expect(latest.handoff_file).toBeDefined();
    expect(latest.prompt_file).toBeDefined();
  });

  test("saves reflexion bank in snapshot", async () => {
    const juhbdiDir = setupJuhbdiDir();
    writeFileSync(
      join(juhbdiDir, "reflexion-bank.json"),
      JSON.stringify({ entries: [{ id: "r1", summary: "test reflexion" }] })
    );
    await runPrecompact({ session_id: sid, cwd: process.cwd() });
    const latestPath = join(juhbdiDir, "handoffs", "latest.json");
    const latest = JSON.parse(readFileSync(latestPath, "utf-8"));
    expect(latest.intelligence_state.reflexion_count).toBe(1);
  });

  test("saves trust store in snapshot", async () => {
    const juhbdiDir = setupJuhbdiDir();
    writeFileSync(
      join(juhbdiDir, "trust-store.json"),
      JSON.stringify({ records: { agent1: { tasks_attempted: 5, tasks_passed: 4 } } })
    );
    await runPrecompact({ session_id: sid, cwd: process.cwd() });
    // Check the precompact snapshot includes trust store
    const handoffDir = join(juhbdiDir, "handoffs");
    const files = readdirSync(handoffDir).filter((f) => f.startsWith("precompact-"));
    expect(files.length).toBeGreaterThan(0);
    const snapshot = JSON.parse(readFileSync(join(handoffDir, files[0]), "utf-8"));
    expect(snapshot.saved_state.trust_store).toBeDefined();
    expect(snapshot.saved_state.trust_store.records.agent1.tasks_passed).toBe(4);
  });

  test("saves experiential traces in snapshot", async () => {
    const juhbdiDir = setupJuhbdiDir();
    writeFileSync(
      join(juhbdiDir, "experiential-traces.json"),
      JSON.stringify({ traces: [{ id: "t1" }, { id: "t2" }] })
    );
    await runPrecompact({ session_id: sid, cwd: process.cwd() });
    const latestPath = join(juhbdiDir, "handoffs", "latest.json");
    const latest = JSON.parse(readFileSync(latestPath, "utf-8"));
    expect(latest.intelligence_state.trace_count).toBe(2);
  });

  test("intelligence_state includes all counts", async () => {
    const juhbdiDir = setupJuhbdiDir();
    writeFileSync(
      join(juhbdiDir, "reflexion-bank.json"),
      JSON.stringify({ entries: [{ id: "r1" }, { id: "r2" }, { id: "r3" }] })
    );
    writeFileSync(
      join(juhbdiDir, "experiential-traces.json"),
      JSON.stringify({ traces: [{ id: "t1" }] })
    );
    writeFileSync(
      join(juhbdiDir, "principle-bank.json"),
      JSON.stringify({ principles: [{ id: "p1" }, { id: "p2" }] })
    );
    writeFileSync(
      join(juhbdiDir, "memory-bank.json"),
      JSON.stringify({ triplets: [{ s: "a", p: "b", o: "c" }] })
    );

    await runPrecompact({ session_id: sid, cwd: process.cwd() });
    const latestPath = join(juhbdiDir, "handoffs", "latest.json");
    const latest = JSON.parse(readFileSync(latestPath, "utf-8"));
    expect(latest.intelligence_state.reflexion_count).toBe(3);
    expect(latest.intelligence_state.trace_count).toBe(1);
    expect(latest.intelligence_state.principle_count).toBe(2);
    expect(latest.intelligence_state.memory_triplets).toBe(1);
  });

  test("respects auto_save_on_compact=false setting", async () => {
    // Write a settings file that disables auto-save
    const settingsDir = join(process.env.HOME || "", ".claude");
    const settingsPath = join(settingsDir, "juhbdi-settings.json");
    let origSettings: string | null = null;
    if (existsSync(settingsPath)) {
      origSettings = readFileSync(settingsPath, "utf-8");
    }
    try {
      mkdirSync(settingsDir, { recursive: true });
      writeFileSync(settingsPath, JSON.stringify({ auto_save_on_compact: false }));
      const result = await runPrecompact({ session_id: sid, cwd: process.cwd() });
      const ctx = (result as any).additionalContext;
      expect(ctx).toContain("Auto-save is DISABLED");
    } finally {
      // Restore original settings
      if (origSettings !== null) {
        writeFileSync(settingsPath, origSettings);
      } else if (existsSync(settingsPath)) {
        unlinkSync(settingsPath);
      }
    }
  });

  test("outputs intelligence counts in context message", async () => {
    const juhbdiDir = setupJuhbdiDir();
    writeFileSync(
      join(juhbdiDir, "reflexion-bank.json"),
      JSON.stringify({ entries: [{ id: "r1" }] })
    );
    const result = await runPrecompact({ session_id: sid, cwd: process.cwd() });
    const ctx = (result as any).additionalContext;
    expect(ctx).toContain("reflexion");
    expect(ctx).toContain("PRE-COMPACT");
    expect(ctx).toContain("/juhbdi:resume");
  });

  test("handles missing .juhbdi directory gracefully", async () => {
    // Don't create .juhbdi dir — hook should create it
    const result = await runPrecompact({ session_id: sid, cwd: process.cwd() });
    const ctx = (result as any).additionalContext;
    expect(ctx).toContain("PRE-COMPACT");
    const handoffDir = join(process.cwd(), ".juhbdi", "handoffs");
    expect(existsSync(handoffDir)).toBe(true);
  });
});

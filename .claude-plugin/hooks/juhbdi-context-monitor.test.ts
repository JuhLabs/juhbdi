import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { writeFileSync, unlinkSync, existsSync, readdirSync, rmSync } from "fs";
import { join } from "path";

async function runMonitor(input: object): Promise<object> {
  const proc = Bun.spawn(
    ["node", ".claude-plugin/hooks/juhbdi-context-monitor.cjs"],
    { stdin: "pipe", stdout: "pipe", cwd: process.cwd() }
  );
  proc.stdin.write(JSON.stringify(input));
  proc.stdin.end();
  const output = await new Response(proc.stdout).text();
  return JSON.parse(output.trim());
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

function cleanup(sessionId: string) {
  const paths = [
    `/tmp/juhbdi-ctx-${sessionId}.json`,
    `/tmp/juhbdi-monitor-${sessionId}.json`,
  ];
  for (const p of paths) {
    if (existsSync(p)) unlinkSync(p);
  }
  // Clean up any handoff files created during tests
  const juhbdiDir = join(process.cwd(), ".juhbdi");
  if (existsSync(juhbdiDir)) {
    const files = readdirSync(juhbdiDir).filter((f) => f.startsWith("handoff-"));
    for (const f of files) {
      unlinkSync(join(juhbdiDir, f));
    }
  }
  // Clean up handoffs directory
  const handoffDir = join(juhbdiDir, "handoffs");
  if (existsSync(handoffDir)) {
    try {
      rmSync(handoffDir, { recursive: true });
    } catch { /* ignore */ }
  }
}

describe("juhbdi-context-monitor hook", () => {
  const sid = "test-monitor";

  beforeEach(() => cleanup(sid));
  afterAll(() => cleanup(sid));

  // === 4-Level Threshold Tests ===

  test("no warning when context is healthy (above 45%)", async () => {
    writeBridge(sid, 60);
    const result = await runMonitor({ session_id: sid });
    expect((result as any).additionalContext).toBeUndefined();
  });

  test("no warning at exactly 46%", async () => {
    writeBridge(sid, 46);
    const result = await runMonitor({ session_id: sid });
    expect((result as any).additionalContext).toBeUndefined();
  });

  test("WARNING when remaining <= 45%", async () => {
    writeBridge(sid, 42);
    const result = await runMonitor({ session_id: sid });
    expect((result as any).additionalContext).toContain("CONTEXT WARNING");
  });

  test("WARNING at exactly 45%", async () => {
    writeBridge(sid, 45);
    const result = await runMonitor({ session_id: sid });
    expect((result as any).additionalContext).toContain("CONTEXT WARNING");
  });

  test("URGENT when remaining <= 35%", async () => {
    writeBridge(sid, 33);
    const result = await runMonitor({ session_id: sid });
    expect((result as any).additionalContext).toContain("CONTEXT URGENT");
  });

  test("CRITICAL when remaining <= 28%", async () => {
    writeBridge(sid, 26);
    const result = await runMonitor({ session_id: sid, cwd: process.cwd() });
    const ctx = (result as any).additionalContext;
    expect(ctx).toContain("CONTEXT CRITICAL");
    expect(ctx).toContain("MUST stop");
  });

  test("EMERGENCY when remaining <= 22%", async () => {
    writeBridge(sid, 18);
    const result = await runMonitor({ session_id: sid, cwd: process.cwd() });
    const ctx = (result as any).additionalContext;
    expect(ctx).toContain("EMERGENCY");
    expect(ctx).toContain("STOP ALL WORK");
    expect(ctx).toContain("DO NOT execute any more tool calls");
  });

  test("EMERGENCY demands session end", async () => {
    writeBridge(sid, 15);
    const result = await runMonitor({ session_id: sid, cwd: process.cwd() });
    const ctx = (result as any).additionalContext;
    expect(ctx).toContain("new session");
    expect(ctx).toContain("/juhbdi:resume");
  });

  // === Auto-save Tests ===

  test("CRITICAL auto-writes handoff file", async () => {
    writeBridge(sid, 25);
    await runMonitor({ session_id: sid, cwd: process.cwd() });
    const juhbdiDir = join(process.cwd(), ".juhbdi");
    const handoffs = existsSync(juhbdiDir)
      ? readdirSync(juhbdiDir).filter((f) => f.startsWith("handoff-"))
      : [];
    expect(handoffs.length).toBeGreaterThan(0);
  });

  test("EMERGENCY auto-saves state to handoffs directory", async () => {
    writeBridge(sid, 18);
    await runMonitor({ session_id: sid, cwd: process.cwd() });
    const handoffDir = join(process.cwd(), ".juhbdi", "handoffs");
    expect(existsSync(handoffDir)).toBe(true);
    const files = readdirSync(handoffDir);
    const snapshots = files.filter((f) => f.startsWith("context-snapshot-"));
    expect(snapshots.length).toBeGreaterThan(0);
  });

  // === Debounce Tests ===

  test("debounces repeated warnings", async () => {
    writeBridge(sid, 42);
    const r1 = await runMonitor({ session_id: sid });
    expect((r1 as any).additionalContext).toContain("WARNING");
    const r2 = await runMonitor({ session_id: sid });
    expect((r2 as any).additionalContext).toBeUndefined();
  });

  test("debounce expires after correct number of tool uses", async () => {
    writeBridge(sid, 42);
    // First call: fires warning (isFirstWarning=true), state resets to tool_uses_since_warning=0
    await runMonitor({ session_id: sid });
    // Calls check >= 4 BEFORE incrementing: 0->1, 1->2, 2->3, 3->4 (4 silent)
    for (let i = 0; i < 4; i++) {
      const r = await runMonitor({ session_id: sid });
      expect((r as any).additionalContext).toBeUndefined();
    }
    // Now tool_uses_since_warning=4, checks 4 >= 4 = true, fires!
    const r5 = await runMonitor({ session_id: sid });
    expect((r5 as any).additionalContext).toContain("WARNING");
  });

  // === Escalation Tests ===

  test("escalation bypasses debounce (WARNING -> URGENT)", async () => {
    writeBridge(sid, 42);
    await runMonitor({ session_id: sid });
    writeBridge(sid, 33);
    const r2 = await runMonitor({ session_id: sid });
    expect((r2 as any).additionalContext).toContain("URGENT");
  });

  test("escalation bypasses debounce (URGENT -> CRITICAL)", async () => {
    writeBridge(sid, 33);
    await runMonitor({ session_id: sid });
    writeBridge(sid, 26);
    const r2 = await runMonitor({ session_id: sid, cwd: process.cwd() });
    expect((r2 as any).additionalContext).toContain("CRITICAL");
  });

  test("escalation bypasses debounce (CRITICAL -> EMERGENCY)", async () => {
    writeBridge(sid, 26);
    await runMonitor({ session_id: sid, cwd: process.cwd() });
    writeBridge(sid, 18);
    const r2 = await runMonitor({ session_id: sid, cwd: process.cwd() });
    expect((r2 as any).additionalContext).toContain("EMERGENCY");
  });

  // === Edge Cases ===

  test("bridge file missing outputs fallback warning", async () => {
    cleanup(sid);
    const result = await runMonitor({ session_id: sid });
    const ctx = (result as any).additionalContext;
    expect(ctx).toContain("bridge file missing");
  });

  test("bridge file parse failure returns empty", async () => {
    writeFileSync(`/tmp/juhbdi-ctx-${sid}.json`, "not valid json {{{");
    const result = await runMonitor({ session_id: sid });
    expect((result as any).additionalContext).toBeUndefined();
    // Cleanup
    unlinkSync(`/tmp/juhbdi-ctx-${sid}.json`);
  });

  test("handoff only written once per session", async () => {
    writeBridge(sid, 25);
    await runMonitor({ session_id: sid, cwd: process.cwd() });
    // Run again many times at critical — handoff_written flag prevents duplicates
    for (let i = 0; i < 8; i++) {
      await runMonitor({ session_id: sid, cwd: process.cwd() });
    }
    const juhbdiDir = join(process.cwd(), ".juhbdi");
    const handoffs = existsSync(juhbdiDir)
      ? readdirSync(juhbdiDir).filter((f) => f.startsWith("handoff-"))
      : [];
    expect(handoffs.length).toBe(1);
  });

  test("handles NaN remaining_pct gracefully", async () => {
    writeFileSync(
      `/tmp/juhbdi-ctx-${sid}.json`,
      JSON.stringify({ session_id: sid, remaining_pct: NaN })
    );
    const result = await runMonitor({ session_id: sid });
    // NaN should be caught and treated as no valid data
    expect((result as any).additionalContext).toBeUndefined();
    unlinkSync(`/tmp/juhbdi-ctx-${sid}.json`);
  });
});

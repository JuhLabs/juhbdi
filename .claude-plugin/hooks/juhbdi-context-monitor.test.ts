import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { writeFileSync, unlinkSync, existsSync, readdirSync } from "fs";
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
    const handoffs = readdirSync(juhbdiDir).filter((f) => f.startsWith("handoff-"));
    for (const f of handoffs) {
      unlinkSync(join(juhbdiDir, f));
    }
  }
}

describe("juhbdi-context-monitor hook", () => {
  const sid = "test-monitor";

  beforeEach(() => cleanup(sid));
  afterAll(() => cleanup(sid));

  test("no warning when context is healthy", async () => {
    writeBridge(sid, 60);
    const result = await runMonitor({ session_id: sid });
    expect((result as any).additionalContext).toBeUndefined();
  });

  test("WARNING when remaining <= 35%", async () => {
    writeBridge(sid, 30);
    const result = await runMonitor({ session_id: sid });
    expect((result as any).additionalContext).toContain("CONTEXT WARNING");
  });

  test("URGENT when remaining <= 25%", async () => {
    writeBridge(sid, 22);
    const result = await runMonitor({ session_id: sid });
    expect((result as any).additionalContext).toContain("CONTEXT URGENT");
  });

  test("CRITICAL when remaining <= 18%", async () => {
    writeBridge(sid, 15);
    const result = await runMonitor({ session_id: sid, cwd: process.cwd() });
    const ctx = (result as any).additionalContext;
    expect(ctx).toContain("CONTEXT CRITICAL");
    expect(ctx).toContain("MUST stop");
    expect(ctx).toContain("memory");
  });

  test("CRITICAL auto-writes handoff file", async () => {
    writeBridge(sid, 12);
    await runMonitor({ session_id: sid, cwd: process.cwd() });
    const juhbdiDir = join(process.cwd(), ".juhbdi");
    const handoffs = existsSync(juhbdiDir)
      ? readdirSync(juhbdiDir).filter((f) => f.startsWith("handoff-"))
      : [];
    expect(handoffs.length).toBeGreaterThan(0);
  });

  test("debounces repeated warnings", async () => {
    writeBridge(sid, 30);
    const r1 = await runMonitor({ session_id: sid });
    expect((r1 as any).additionalContext).toContain("WARNING");
    const r2 = await runMonitor({ session_id: sid });
    expect((r2 as any).additionalContext).toBeUndefined();
  });

  test("escalation bypasses debounce (WARNING → URGENT)", async () => {
    writeBridge(sid, 30);
    await runMonitor({ session_id: sid });
    writeBridge(sid, 22);
    const r2 = await runMonitor({ session_id: sid });
    expect((r2 as any).additionalContext).toContain("URGENT");
  });

  test("escalation bypasses debounce (URGENT → CRITICAL)", async () => {
    writeBridge(sid, 22);
    await runMonitor({ session_id: sid });
    writeBridge(sid, 15);
    const r2 = await runMonitor({ session_id: sid, cwd: process.cwd() });
    expect((r2 as any).additionalContext).toContain("CRITICAL");
  });

  test("no output when no bridge file exists", async () => {
    cleanup(sid);
    const result = await runMonitor({ session_id: sid });
    expect((result as any).additionalContext).toBeUndefined();
  });

  test("handoff only written once per session", async () => {
    writeBridge(sid, 12);
    await runMonitor({ session_id: sid, cwd: process.cwd() });
    // Run again at critical — shouldn't write a second handoff
    // (debounce will suppress the second call anyway, so trigger via debounce expiry)
    for (let i = 0; i < 5; i++) {
      await runMonitor({ session_id: sid, cwd: process.cwd() });
    }
    const juhbdiDir = join(process.cwd(), ".juhbdi");
    const handoffs = existsSync(juhbdiDir)
      ? readdirSync(juhbdiDir).filter((f) => f.startsWith("handoff-"))
      : [];
    expect(handoffs.length).toBe(1);
  });
});

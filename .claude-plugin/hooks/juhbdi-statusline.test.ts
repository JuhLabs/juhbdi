import { describe, test, expect } from "bun:test";
import { readFileSync, unlinkSync, existsSync } from "fs";

async function runHook(input: object): Promise<string> {
  const proc = Bun.spawn(
    ["node", ".claude-plugin/hooks/juhbdi-statusline.cjs"],
    { stdin: "pipe", stdout: "pipe", cwd: process.cwd() }
  );
  proc.stdin.write(JSON.stringify(input));
  proc.stdin.end();
  return (await new Response(proc.stdout).text()).trim();
}

describe("juhbdi-statusline hook", () => {
  test("outputs fallback when no context data", async () => {
    const result = await runHook({ session_id: "test-no-ctx" });
    expect(result).toContain("JuhBDI");
  });

  test("outputs progress bar with context data", async () => {
    const result = await runHook({
      session_id: "test-bar",
      context_window: { used_percentage: 40, remaining_percentage: 60 },
    });
    expect(result).toContain("JuhBDI");
    expect(result).toContain("40%");
    // Should NOT contain JSON wrapper
    expect(result).not.toContain('"status_line"');
  });

  test("writes bridge file", async () => {
    const sessionId = "test-bridge-write";
    const bridgePath = `/tmp/juhbdi-ctx-${sessionId}.json`;
    if (existsSync(bridgePath)) unlinkSync(bridgePath);

    await runHook({
      session_id: sessionId,
      context_window: { remaining_percentage: 50 },
    });

    expect(existsSync(bridgePath)).toBe(true);
    const bridge = JSON.parse(readFileSync(bridgePath, "utf-8"));
    expect(bridge.remaining_pct).toBe(50);
    expect(bridge.session_id).toBe(sessionId);
    unlinkSync(bridgePath);
  });
});

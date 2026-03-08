import { describe, test, expect } from "bun:test";
import { readFileSync, unlinkSync, existsSync } from "fs";

async function runHook(input: object): Promise<object> {
  const proc = Bun.spawn(
    ["node", ".claude-plugin/hooks/juhbdi-statusline.cjs"],
    { stdin: "pipe", stdout: "pipe", cwd: process.cwd() }
  );
  proc.stdin.write(JSON.stringify(input));
  proc.stdin.end();
  const output = await new Response(proc.stdout).text();
  return JSON.parse(output.trim());
}

describe("juhbdi-statusline hook", () => {
  test("outputs empty status_line when no context data", async () => {
    const result = await runHook({ session_id: "test-no-ctx" });
    expect((result as any).status_line).toBe("");
  });

  test("outputs progress bar with context data", async () => {
    const result = await runHook({
      session_id: "test-bar",
      context_window: { remaining_percentage: 60 },
    });
    const line = (result as any).status_line;
    expect(line).toContain("JuhBDI");
    expect(line).toContain("40%"); // 100 - 60 = 40% used
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

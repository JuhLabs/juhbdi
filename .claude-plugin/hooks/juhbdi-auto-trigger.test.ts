import { describe, test, expect } from "bun:test";
import { mkdirSync, rmSync } from "fs";

async function runAutoTrigger(input: object): Promise<object> {
  const proc = Bun.spawn(
    ["node", ".claude-plugin/hooks/juhbdi-auto-trigger.cjs"],
    { stdin: "pipe", stdout: "pipe", cwd: process.cwd() }
  );
  proc.stdin.write(JSON.stringify(input));
  proc.stdin.end();
  const output = await new Response(proc.stdout).text();
  return JSON.parse(output.trim());
}

describe("juhbdi-auto-trigger hook", () => {
  test("skips messages starting with /", async () => {
    const result = await runAutoTrigger({
      user_message: "/juhbdi:status",
      cwd: process.cwd(),
    });
    expect((result as any).additionalContext).toBeUndefined();
  });

  test("skips empty messages", async () => {
    const result = await runAutoTrigger({
      user_message: "",
      cwd: process.cwd(),
    });
    expect((result as any).additionalContext).toBeUndefined();
  });

  test("skips when no user_message provided", async () => {
    const result = await runAutoTrigger({
      cwd: process.cwd(),
    });
    expect((result as any).additionalContext).toBeUndefined();
  });

  test("handles bun script timeout gracefully (returns empty)", async () => {
    // With an invalid plugin root, the bun script path won't exist
    // so it should fail gracefully and return empty object (no additionalContext)
    const result = await runAutoTrigger({
      user_message: "build me a todo app",
      cwd: "/tmp/nonexistent-project",
    });
    expect(result).toBeDefined();
    expect((result as any).additionalContext).toBeUndefined();
  });

  test("handles missing roadmap gracefully", async () => {
    // Ensure no roadmap exists — the hook should not crash
    const fakeCwd = "/tmp/juhbdi-test-auto-trigger-" + Date.now();
    mkdirSync(fakeCwd, { recursive: true });
    const result = await runAutoTrigger({
      user_message: "deploy the project",
      cwd: fakeCwd,
    });
    expect(result).toBeDefined();
    expect((result as any).additionalContext).toBeUndefined();
    // Cleanup
    try {
      rmSync(fakeCwd, { recursive: true });
    } catch { /* ignore */ }
  });
});

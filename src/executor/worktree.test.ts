// src/executor/worktree.test.ts
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { createWorktree, removeWorktree, mergeWorktree } from "./worktree";

let spawnCalls: { cmd: string[]; cwd?: string }[] = [];
let spawnExitCode = 0;
const originalSpawn = Bun.spawn;

function mockSpawn() {
  spawnCalls = [];
  // @ts-expect-error — mocking Bun.spawn
  Bun.spawn = (cmd: string[], opts?: { cwd?: string }) => {
    spawnCalls.push({ cmd: Array.from(cmd), cwd: opts?.cwd });
    return {
      exited: Promise.resolve(spawnExitCode),
      stdout: new ReadableStream(),
      stderr: new ReadableStream(),
    };
  };
}

function restoreSpawn() {
  // @ts-expect-error — restoring
  Bun.spawn = originalSpawn;
}

describe("worktree", () => {
  beforeEach(() => {
    spawnExitCode = 0;
    mockSpawn();
  });

  afterEach(() => {
    restoreSpawn();
  });

  test("createWorktree runs correct git command", async () => {
    await createWorktree("w1-t1", "/project/.juhbdi/worktrees", "/project");
    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0].cmd).toEqual([
      "git", "worktree", "add",
      "/project/.juhbdi/worktrees/w1-t1",
      "-b", "juhbdi/w1-t1",
    ]);
    expect(spawnCalls[0].cwd).toBe("/project");
  });

  test("removeWorktree runs remove then branch delete", async () => {
    await removeWorktree("w1-t1", "/project/.juhbdi/worktrees", "/project");
    expect(spawnCalls).toHaveLength(2);
    expect(spawnCalls[0].cmd).toEqual([
      "git", "worktree", "remove",
      "/project/.juhbdi/worktrees/w1-t1",
      "--force",
    ]);
    expect(spawnCalls[1].cmd).toEqual([
      "git", "branch", "-D", "juhbdi/w1-t1",
    ]);
  });

  test("mergeWorktree runs merge then cleanup", async () => {
    await mergeWorktree("w1-t1", "/project/.juhbdi/worktrees", "/project");
    expect(spawnCalls).toHaveLength(3);
    expect(spawnCalls[0].cmd).toEqual([
      "git", "merge", "juhbdi/w1-t1",
      "--no-ff", "-m", "juhbdi: task w1-t1 passed",
    ]);
    expect(spawnCalls[1].cmd[1]).toBe("worktree");
    expect(spawnCalls[2].cmd[1]).toBe("branch");
  });

  test("createWorktree throws on non-zero exit", async () => {
    spawnExitCode = 128;
    await expect(
      createWorktree("w1-t1", "/project/.juhbdi/worktrees", "/project")
    ).rejects.toThrow();
  });
});

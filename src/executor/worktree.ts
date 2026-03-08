// src/executor/worktree.ts
import { join } from "path";

async function runGit(args: string[], cwd: string): Promise<void> {
  const proc = Bun.spawn(["git", ...args], { cwd });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed with exit code ${exitCode}`);
  }
}

export async function createWorktree(
  taskId: string,
  worktreeBase: string,
  projectRoot: string
): Promise<string> {
  const worktreePath = join(worktreeBase, taskId);
  const branchName = `juhbdi/${taskId}`;
  await runGit(["worktree", "add", worktreePath, "-b", branchName], projectRoot);
  return worktreePath;
}

export async function removeWorktree(
  taskId: string,
  worktreeBase: string,
  projectRoot: string
): Promise<void> {
  const worktreePath = join(worktreeBase, taskId);
  const branchName = `juhbdi/${taskId}`;
  await runGit(["worktree", "remove", worktreePath, "--force"], projectRoot);
  await runGit(["branch", "-D", branchName], projectRoot);
}

export async function mergeWorktree(
  taskId: string,
  worktreeBase: string,
  projectRoot: string
): Promise<void> {
  const branchName = `juhbdi/${taskId}`;
  await runGit(
    ["merge", branchName, "--no-ff", "-m", `juhbdi: task ${taskId} passed`],
    projectRoot
  );
  await removeWorktree(taskId, worktreeBase, projectRoot);
}

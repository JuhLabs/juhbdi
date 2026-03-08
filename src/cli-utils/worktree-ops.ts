import { join } from "path";
import { createWorktree, mergeWorktree, removeWorktree } from "../executor/worktree";
import { resolveContext } from "./helpers";

async function main() {
  const { juhbdiDir, projectRoot } = await resolveContext();

  const action = process.argv[2];
  const taskId = process.argv[3];

  if (!action || !taskId) {
    console.error(JSON.stringify({ error: "Usage: worktree-ops.ts <create|merge|remove> <task_id>" }));
    process.exit(1);
  }

  const worktreeBase = join(juhbdiDir, "worktrees");

  switch (action) {
    case "create": {
      const worktreePath = await createWorktree(taskId, worktreeBase, projectRoot);
      console.log(JSON.stringify({ path: worktreePath }));
      break;
    }
    case "merge": {
      await mergeWorktree(taskId, worktreeBase, projectRoot);
      console.log(JSON.stringify({ success: true }));
      break;
    }
    case "remove": {
      await removeWorktree(taskId, worktreeBase, projectRoot);
      console.log(JSON.stringify({ success: true }));
      break;
    }
    default:
      console.error(JSON.stringify({ error: `Unknown action: ${action}. Use create, merge, or remove.` }));
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ error: String(err) }));
  process.exit(1);
});

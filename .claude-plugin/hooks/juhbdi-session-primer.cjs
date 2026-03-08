// .claude-plugin/hooks/juhbdi-session-primer.cjs
//
// SessionStart hook — primes context with relevant memory on every session.
// Uses execFileSync (not execSync) to avoid shell injection risks.

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

async function main() {
  const input = JSON.parse(await new Promise((resolve) => {
    let data = "";
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
  }));

  const cwd = input.cwd || process.cwd();
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, "..");

  // Check for auto-handoff from previous session compaction
  let handoffContext = null;
  try {
    const latestPath = path.join(cwd, ".juhbdi", "handoffs", "latest.json");
    if (fs.existsSync(latestPath)) {
      const latest = JSON.parse(fs.readFileSync(latestPath, "utf-8"));
      // Only load if handoff is recent (within last 2 hours)
      const handoffAge = Date.now() - new Date(latest.timestamp).getTime();
      if (handoffAge < 2 * 60 * 60 * 1000 && latest.prompt_file) {
        try {
          handoffContext = fs.readFileSync(latest.prompt_file, "utf-8");
          // Clear the latest pointer so it doesn't reload next time (rename to avoid race with precompact)
          fs.renameSync(latestPath, latestPath + ".consumed");
        } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }

  // Count pending tasks from roadmap
  let pendingCount = 0;
  try {
    const roadmapPath = path.join(cwd, ".juhbdi", "roadmap-intent.json");
    if (fs.existsSync(roadmapPath)) {
      const roadmap = JSON.parse(fs.readFileSync(roadmapPath, "utf-8"));
      pendingCount = (roadmap.waves || [])
        .flatMap((w) => w.tasks || [])
        .filter((t) => t.status === "pending").length;
    }
  } catch { /* ignore */ }

  try {
    const bunPath = path.join(process.env.HOME || "", ".bun", "bin", "bun");
    const scriptPath = path.join(pluginRoot, "src", "quick", "session-primer.ts");

    const args = ["run", scriptPath];
    if (pendingCount > 0) {
      args.push(String(pendingCount));
    }

    const output = execFileSync(bunPath, args, {
      cwd,
      timeout: 5000,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    const ctx = JSON.parse(output.trim());

    // Build extras: pending tasks + top insight
    const extras = [];
    if (ctx.pending_task_count && ctx.pending_task_count > 0) {
      extras.push(`You have ${ctx.pending_task_count} pending tasks. Run \`/juhbdi:execute\` to continue.`);
    }
    if (ctx.top_insight) {
      extras.push(`Top insight: ${ctx.top_insight}`);
    }
    const extraBlock = extras.length > 0 ? "\n" + extras.join("\n") : "";

    // Prepend handoff context if available
    const handoffBlock = handoffContext
      ? `[JUHBDI SESSION RESTORED] Previous session was compacted. Handoff loaded:\n${handoffContext}\n\n`
      : "";

    if (ctx.governance_active && ctx.relevant_experiences.length > 0) {
      const experiences = ctx.relevant_experiences
        .map((e) => `  - "${e.intent.task_description}" (${e.experience.approach})`)
        .join("\n");

      console.log(JSON.stringify({
        user_message: `${handoffBlock}JuhBDI Memory Loaded: ${ctx.memory_summary}\nRelevant experiences:\n${experiences}${extraBlock}`
      }));
    } else if (ctx.governance_active) {
      console.log(JSON.stringify({
        user_message: `${handoffBlock}JuhBDI Active: ${ctx.memory_summary}${extraBlock}`
      }));
    } else if (handoffContext) {
      console.log(JSON.stringify({
        user_message: `${handoffBlock}Run /juhbdi:resume to restore full context.`
      }));
    } else {
      console.log(JSON.stringify({}));
    }
  } catch {
    console.log(JSON.stringify({}));
  }
}

main().catch(() => {
  console.log(JSON.stringify({}));
});

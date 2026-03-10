// .claude-plugin/hooks/juhbdi-session-primer.cjs
//
// SessionStart hook — primes context with relevant memory on every session.
// Uses execFileSync (not execSync) to avoid shell injection risks.
// Enhanced in M12: validates timestamps, fallback bun path, enriched restoration banner.

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function logError(message) {
  try {
    const ts = new Date().toISOString();
    fs.appendFileSync("/tmp/juhbdi-errors.log", `[${ts}] session-primer: ${message}\n`);
  } catch {
    // Non-fatal
  }
}

function resolveBunPath() {
  const homeBun = path.join(process.env.HOME || "", ".bun", "bin", "bun");
  if (fs.existsSync(homeBun)) return homeBun;

  // Fallback: try system bun
  try {
    execFileSync("which", ["bun"], { encoding: "utf-8", timeout: 2000, stdio: ["pipe", "pipe", "pipe"] });
    return "bun";
  } catch {
    return null;
  }
}

function isValidTimestamp(ts) {
  if (!ts || typeof ts !== "string") return false;
  const parsed = Date.parse(ts);
  return !isNaN(parsed) && parsed > 0;
}

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
  let handoffIntelligence = null;
  try {
    const latestPath = path.join(cwd, ".juhbdi", "handoffs", "latest.json");
    if (fs.existsSync(latestPath)) {
      const latest = JSON.parse(fs.readFileSync(latestPath, "utf-8"));

      // Validate timestamp before using
      if (isValidTimestamp(latest.timestamp)) {
        const handoffAge = Date.now() - new Date(latest.timestamp).getTime();
        if (handoffAge < 24 * 60 * 60 * 1000 && latest.prompt_file) {
          try {
            handoffContext = fs.readFileSync(latest.prompt_file, "utf-8");
            handoffIntelligence = latest.intelligence_state || null;
            // Clear the latest pointer so it doesn't reload next time
            fs.renameSync(latestPath, latestPath + ".consumed");
          } catch { /* ignore */ }
        }
      } else {
        logError(`Invalid timestamp in latest.json: ${latest.timestamp}`);
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

  // Build enriched restoration banner if handoff was loaded
  let restorationBanner = "";
  if (handoffContext) {
    const parts = ["[JUHBDI SESSION RESTORED] Previous session was compacted. State recovered:"];
    if (handoffIntelligence) {
      if (handoffIntelligence.reflexion_count > 0) {
        parts.push(`  - ${handoffIntelligence.reflexion_count} reflexions loaded`);
      }
      if (handoffIntelligence.trace_count > 0) {
        parts.push(`  - ${handoffIntelligence.trace_count} experiential traces`);
      }
      if (handoffIntelligence.principle_count > 0) {
        parts.push(`  - ${handoffIntelligence.principle_count} principles`);
      }
      if (handoffIntelligence.memory_triplets > 0) {
        parts.push(`  - ${handoffIntelligence.memory_triplets} memory triplets`);
      }
    }
    if (pendingCount > 0) {
      parts.push(`  - ${pendingCount} pending tasks in roadmap`);
    }
    restorationBanner = parts.join("\n") + "\n\n";
  }

  const bunPath = resolveBunPath();

  try {
    if (!bunPath) {
      throw new Error("bun not found at ~/.bun/bin/bun or on system PATH");
    }

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
      ? `${restorationBanner}Handoff details:\n${handoffContext}\n\n`
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
        user_message: `${restorationBanner}Handoff details:\n${handoffContext}\n\nRun /juhbdi:resume to restore full context.`
      }));
    } else {
      console.log(JSON.stringify({}));
    }
  } catch (err) {
    // Log script timeout or failure
    logError(`Bun script failed: ${err.message}`);

    // Bun script failed, but still output handoff context if available
    if (handoffContext) {
      console.log(JSON.stringify({
        user_message: `${restorationBanner}Handoff details:\n${handoffContext}\n\nRun /juhbdi:resume to restore full context.`
      }));
    } else {
      console.log(JSON.stringify({}));
    }
  }
}

main().catch(() => {
  console.log(JSON.stringify({}));
});

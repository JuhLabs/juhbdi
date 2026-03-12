// .claude-plugin/hooks/juhbdi-session-primer.cjs
//
// SessionStart hook — lazy context loader. Emits a compact 4-line summary
// instead of a full state dump, saving 700-1100 tokens per session start.
// D5: Lazy Context Loading (JuhBDI 10/10 upgrade).
//
// All reads are optional — missing files are silently skipped (graceful degradation).

const fs = require("fs");
const path = require("path");

function safeReadJSON(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function relativeTime(isoTs) {
  if (!isoTs) return null;
  const ms = Date.now() - new Date(isoTs).getTime();
  if (isNaN(ms) || ms < 0) return null;
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

async function main() {
  const input = JSON.parse(await new Promise((resolve) => {
    let data = "";
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
  }));

  const cwd = input.cwd || process.cwd();
  const juhbdiDir = path.join(cwd, ".juhbdi");
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, "..");

  // --- Line 1: version, trust, trail, ghost mode ---
  let version = "?";
  try {
    const pluginJson = safeReadJSON(path.join(pluginRoot, "plugin.json"));
    if (pluginJson && pluginJson.version) version = pluginJson.version;
  } catch { /* non-fatal */ }

  let trustTier = null;
  let trustScore = null;
  try {
    const trust = safeReadJSON(path.join(juhbdiDir, "trust-store.json"));
    if (trust) {
      trustTier = trust.tier || trust.level || null;
      trustScore = typeof trust.score === "number" ? trust.score.toFixed(2) : null;
    }
  } catch { /* non-fatal */ }

  let trailCount = null;
  try {
    const trailPath = path.join(juhbdiDir, "decision-trail.log");
    if (fs.existsSync(trailPath)) {
      const lines = fs.readFileSync(trailPath, "utf-8").split("\n").filter((l) => l.trim().length > 0);
      trailCount = lines.length;
    }
  } catch { /* non-fatal */ }

  // Build line 1
  const line1Parts = [`JuhBDI v${version}`];
  if (trustTier && trustScore !== null) {
    line1Parts.push(`trust: ${trustTier} (${trustScore})`);
  } else if (trustTier) {
    line1Parts.push(`trust: ${trustTier}`);
  }
  if (trailCount !== null) {
    line1Parts.push(`${trailCount} trail entries`);
  }
  line1Parts.push("ghost mode active");
  const line1 = line1Parts.join(" | ");

  // --- Line 2: last session ---
  let line2 = null;
  try {
    const latestPath = path.join(juhbdiDir, "handoffs", "latest.json");
    const latest = safeReadJSON(latestPath);
    if (latest && latest.timestamp) {
      const rel = relativeTime(latest.timestamp);
      // Map snake_case keys to readable labels
      const keyLabels = {
        trail_entries: "trail",
        reflexion_count: "reflexions",
        trace_count: "traces",
        principle_count: "principles",
        memory_triplets: "memories",
      };
      const activity = latest.intelligence_state
        ? Object.entries(latest.intelligence_state)
            .filter(([, v]) => typeof v === "number" && v > 0)
            .map(([k, v]) => `${v} ${keyLabels[k] || k.replace(/_/g, " ")}`)
            .join(", ")
        : null;
      const parts = [];
      if (rel) parts.push(rel);
      if (activity) parts.push(activity);
      if (parts.length > 0) {
        line2 = `Last session: ${parts.join(", ")}`;
      }
    }
  } catch { /* non-fatal */ }

  // --- Line 3: top reflexion insight ---
  let line3 = null;
  try {
    const reflexionPath = path.join(juhbdiDir, "reflexion-bank.json");
    const reflexion = safeReadJSON(reflexionPath);
    if (reflexion) {
      const entries = reflexion.entries || reflexion.reflexions || [];
      if (entries.length > 0) {
        // Sort by utility descending, take first
        const sorted = [...entries].sort((a, b) => {
          const ua = typeof a.utility === "number" ? a.utility : 0;
          const ub = typeof b.utility === "number" ? b.utility : 0;
          return ub - ua;
        });
        const top = sorted[0];
        const insight = top.insight || top.lesson || top.summary || top.text || null;
        if (insight && typeof insight === "string") {
          const truncated = insight.length > 100 ? insight.slice(0, 97) + "..." : insight;
          line3 = `Top insight: "${truncated}"`;
        }
      }
    }
  } catch { /* non-fatal */ }

  // --- Line 4: pending tasks ---
  let pendingCount = 0;
  try {
    const roadmapPath = path.join(juhbdiDir, "roadmap-intent.json");
    const roadmap = safeReadJSON(roadmapPath);
    if (roadmap) {
      pendingCount = (roadmap.waves || [])
        .flatMap((w) => w.tasks || [])
        .filter((t) => t.status !== "done" && t.status !== "completed" && t.status !== "skipped")
        .length;
    }
  } catch { /* non-fatal */ }

  let actionCount = 0;
  try {
    const actionsPath = path.join(juhbdiDir, "pending-actions.json");
    const actions = safeReadJSON(actionsPath);
    if (actions) {
      const list = actions.actions || actions.items || (Array.isArray(actions) ? actions : []);
      actionCount = list.length;
    }
  } catch { /* non-fatal */ }

  let line4 = null;
  if (pendingCount > 0 || actionCount > 0) {
    const parts = [];
    if (pendingCount > 0) {
      parts.push(`Pending: ${pendingCount} tasks — run /juhbdi:resume to continue`);
    }
    if (actionCount > 0) {
      parts.push(`Queued dashboard actions: ${actionCount} — run /juhbdi:resume to process`);
    }
    line4 = parts.join("\n");
  }

  // --- Assemble compact output ---
  const lines = [line1];
  if (line2) lines.push(line2);
  if (line3) lines.push(line3);
  if (line4) lines.push(line4);

  // Only inject context if we have meaningful content beyond line1
  if (lines.length === 1 && version === "?") {
    // Nothing useful to say
    console.log(JSON.stringify({}));
    return;
  }

  console.log(JSON.stringify({
    additionalContext: lines.join("\n"),
  }));
}

main().catch(() => {
  console.log(JSON.stringify({}));
});

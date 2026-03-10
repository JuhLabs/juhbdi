import fs from "fs";
import path from "path";

function safeReadJSON(filePath: string): any {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch { return null; }
}

export function getProjectState(juhbdiDir: string) {
  return {
    state: safeReadJSON(path.join(juhbdiDir, "state.json")),
    roadmap: safeReadJSON(path.join(juhbdiDir, "roadmap-intent.json")),
    intentSpec: safeReadJSON(path.join(juhbdiDir, "intent-spec.json")),
    preferences: safeReadJSON(path.join(juhbdiDir, "user-preferences.json")),
    timestamp: new Date().toISOString(),
  };
}

export function getTrailEntries(juhbdiDir: string, limit = 100) {
  const trailPath = path.join(juhbdiDir, "decision-trail.log");
  if (!fs.existsSync(trailPath)) return [];
  const lines = fs.readFileSync(trailPath, "utf-8").trim().split("\n").filter(Boolean);
  return lines.slice(-limit).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

export function getCostData(juhbdiDir: string) {
  const trail = getTrailEntries(juhbdiDir);
  const routingEntries = trail.filter((e: any) => e.event_type === "routing");
  let totalSpend = 0;
  let opusEquivalent = 0;
  const modelCounts: Record<string, number> = {};

  for (const entry of routingEntries) {
    const cost = entry.cost_estimate || 0;
    totalSpend += cost;
    opusEquivalent += (entry.opus_equivalent_cost || cost);
    const model = entry.routed_to || "unknown";
    modelCounts[model] = (modelCounts[model] || 0) + 1;
  }

  return {
    total_spend: totalSpend,
    opus_equivalent: opusEquivalent,
    savings: opusEquivalent - totalSpend,
    savings_pct: opusEquivalent > 0 ? Math.round(((opusEquivalent - totalSpend) / opusEquivalent) * 100) : 0,
    model_distribution: modelCounts,
  };
}

export function getMemoryStats(juhbdiDir: string) {
  const reflexions = safeReadJSON(path.join(juhbdiDir, "reflexion-bank.json"));
  const traces = safeReadJSON(path.join(juhbdiDir, "experiential-traces.json"));
  const principles = safeReadJSON(path.join(juhbdiDir, "principle-bank.json"));
  const trust = safeReadJSON(path.join(juhbdiDir, "trust-store.json"));

  return {
    reflexion_count: reflexions ? (reflexions.entries || []).length : 0,
    trace_count: traces ? (traces.traces || []).length : 0,
    principle_count: principles ? (principles.principles || []).length : 0,
    trust_score: trust?.overall_score ?? 0,
    trust_tier: trust?.tier ?? "unknown",
    recent_reflexions: reflexions ? (reflexions.entries || []).slice(-3).map((e: any) => ({
      task: e.task_description,
      lesson: e.lesson,
      outcome: e.outcome,
    })) : [],
  };
}

export function getContextHealth(sessionId?: string) {
  if (!sessionId) return { remaining_pct: 100, level: "NORMAL" };
  try {
    const bridgePath = `/tmp/juhbdi-ctx-${sessionId}.json`;
    if (!fs.existsSync(bridgePath)) return { remaining_pct: 100, level: "NORMAL" };
    const bridge = JSON.parse(fs.readFileSync(bridgePath, "utf-8"));
    const pct = bridge.remaining_pct || 100;
    let level = "NORMAL";
    if (pct <= 22) level = "EMERGENCY";
    else if (pct <= 28) level = "CRITICAL";
    else if (pct <= 35) level = "URGENT";
    else if (pct <= 45) level = "WARNING";
    return { remaining_pct: Math.round(pct), level };
  } catch { return { remaining_pct: 100, level: "NORMAL" }; }
}

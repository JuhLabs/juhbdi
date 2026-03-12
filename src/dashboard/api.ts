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
    preferences: null,
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

  // Build time-series: sort by timestamp, accumulate
  const sorted = [...routingEntries].sort((a: any, b: any) => {
    const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return ta - tb;
  });

  let cumulative = 0;
  const spendOverTime: Array<{ timestamp: string; cumulative: number }> = [];

  for (const entry of sorted) {
    const cost = entry.cost_estimate || 0;
    cumulative += cost;
    spendOverTime.push({
      timestamp: entry.timestamp || new Date().toISOString(),
      cumulative,
    });
  }

  for (const entry of routingEntries) {
    const cost = entry.cost_estimate || 0;
    totalSpend += cost;
    opusEquivalent += (entry.opus_equivalent_cost || cost);
    let model = entry.routed_to;
    if (!model && entry.description) {
      const match = entry.description.match(/\bto\s+(opus|sonnet|haiku|claude[^\s]*)/i);
      if (match) model = match[1].toLowerCase();
    }
    model = model || "unknown";
    modelCounts[model] = (modelCounts[model] || 0) + 1;
  }

  return {
    total_spend: totalSpend,
    opus_equivalent: opusEquivalent,
    savings: opusEquivalent - totalSpend,
    savings_pct: opusEquivalent > 0 ? Math.round(((opusEquivalent - totalSpend) / opusEquivalent) * 100) : 0,
    model_distribution: modelCounts,
    spend_over_time: spendOverTime,
  };
}

export function getMemoryStats(juhbdiDir: string) {
  const reflexions = safeReadJSON(path.join(juhbdiDir, "reflexion-bank.json"));
  const traces = safeReadJSON(path.join(juhbdiDir, "experiential-traces.json"));
  const principles = safeReadJSON(path.join(juhbdiDir, "principle-bank.json"));
  const trust = safeReadJSON(path.join(juhbdiDir, "trust-store.json"));

  const allReflexions = reflexions ? (reflexions.entries || []).map((e: any) => ({
    task: e.task_description,
    lesson: e.lesson,
    outcome: e.outcome,
  })) : [];

  const allTraces = traces ? (traces.traces || []).map((t: any) => ({
    summary: t.summary || t.description || "",
    success: t.success ?? t.outcome === "success",
  })) : [];

  const allPrinciples = principles ? (principles.principles || []).map((p: any) => ({
    text: p.text || p.principle || "",
    source: p.source || "unknown",
    confidence: p.confidence ?? 0,
  })) : [];

  return {
    reflexion_count: allReflexions.length,
    trace_count: allTraces.length,
    principle_count: allPrinciples.length,
    trust_score: trust?.overall_score ?? 0,
    trust_tier: trust?.tier ?? "unknown",
    recent_reflexions: allReflexions.slice(-3),
    all_reflexions: allReflexions,
    all_traces: allTraces,
    all_principles: allPrinciples,
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

function contextLevel(pct: number): string {
  if (pct <= 22) return "EMERGENCY";
  if (pct <= 28) return "CRITICAL";
  if (pct <= 35) return "URGENT";
  if (pct <= 45) return "WARNING";
  return "NORMAL";
}

export interface SessionInfo {
  session_id: string;
  project_dir: string;
  ide_platform: string;
  remaining_pct: number;
  usable_pct: number;
  level: string;
  timestamp: string;
  stale: boolean;
}

export interface ProjectGroup {
  project_dir: string;
  sessions: SessionInfo[];
}

const SESSION_STALE_MS = 120_000; // 2 minutes without update = stale
const SESSION_EXPIRE_MS = 4 * 60 * 60_000; // drop sessions >4h old

export function getActiveSessions(): ProjectGroup[] {
  const bridgeFiles: string[] = [];
  try {
    const tmpEntries = fs.readdirSync("/tmp");
    for (const entry of tmpEntries) {
      if (entry.startsWith("juhbdi-ctx-") && entry.endsWith(".json") && !entry.endsWith(".tmp")) {
        bridgeFiles.push(path.join("/tmp", entry));
      }
    }
  } catch { return []; }

  const sessions: SessionInfo[] = [];
  const now = Date.now();

  for (const filePath of bridgeFiles) {
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const bridge = JSON.parse(raw);
      if (!bridge.session_id) continue;

      const ts = bridge.timestamp ? new Date(bridge.timestamp).getTime() : 0;
      if ((now - ts) > SESSION_EXPIRE_MS) {
        // Auto-clean expired bridge files
        try { fs.unlinkSync(filePath); } catch { /* ignore */ }
        continue;
      }
      const stale = (now - ts) > SESSION_STALE_MS;
      const pct = typeof bridge.remaining_pct === "number" ? bridge.remaining_pct : 100;

      sessions.push({
        session_id: bridge.session_id,
        project_dir: bridge.project_dir || "unknown",
        ide_platform: bridge.ide_platform || "unknown",
        remaining_pct: Math.round(pct),
        usable_pct: Math.round(bridge.usable_pct ?? pct),
        level: contextLevel(pct),
        timestamp: bridge.timestamp || new Date().toISOString(),
        stale,
      });
    } catch { /* skip malformed bridge files */ }
  }

  // Group by project_dir
  const grouped = new Map<string, SessionInfo[]>();
  for (const s of sessions) {
    const key = s.project_dir;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(s);
  }

  // Sort: active before stale, then by remaining_pct ascending (most urgent first)
  const result: ProjectGroup[] = [];
  for (const [project_dir, projSessions] of grouped) {
    projSessions.sort((a, b) => {
      if (a.stale !== b.stale) return a.stale ? 1 : -1;
      return a.remaining_pct - b.remaining_pct;
    });
    result.push({ project_dir, sessions: projSessions });
  }

  // Sort projects: those with active sessions first
  result.sort((a, b) => {
    const aActive = a.sessions.some(s => !s.stale);
    const bActive = b.sessions.some(s => !s.stale);
    if (aActive !== bActive) return aActive ? -1 : 1;
    return a.project_dir.localeCompare(b.project_dir);
  });

  return result;
}

// --- Code Health (M16 deep analysis, cached) ---

import { analyzeFiles } from "../repomap/ast-analyzer";
import { buildCallGraph } from "../repomap/call-graph";
import { detectDeadCode } from "../repomap/dead-code";

interface CodeHealthResult {
  complexity: Array<{ file: string; function: string; complexity: number }>;
  deadCode: Array<{ file: string; export: string; confidence: string }>;
  callGraph: { entryPoints: string[]; hotPaths: string[]; edgeCount: number };
  summary: { clean: number; warning: number; hot: number };
  cached_at: string;
}

let codehealthCache: CodeHealthResult | null = null;

export function getCodeHealth(projectRoot: string, refresh = false): CodeHealthResult {
  if (codehealthCache && !refresh) return codehealthCache;

  try {
    const srcDir = path.join(projectRoot, "src");
    const files = findTsFiles(srcDir, projectRoot);
    const fileInputs = files.map(f => ({
      path: f,
      content: fs.readFileSync(path.join(projectRoot, f), "utf-8"),
    }));

    const analyses = analyzeFiles(fileInputs);
    const callGraph = buildCallGraph(analyses);
    const deadCode = detectDeadCode(analyses);

    const complexity = analyses
      .flatMap(a => a.symbols
        .filter(s => s.kind === "function" || s.kind === "method")
        .map(s => ({ file: a.filePath, function: s.name, complexity: s.complexity }))
      )
      .sort((a, b) => b.complexity - a.complexity)
      .slice(0, 20);

    const deadCodeList = deadCode.candidates
      .filter(c => c.confidence === "high" || c.confidence === "medium")
      .slice(0, 20)
      .map(c => ({ file: c.file, export: c.symbol, confidence: c.confidence }));

    let clean = 0, warning = 0, hot = 0;
    for (const a of analyses) {
      if (a.complexity > 15) hot++;
      else if (a.complexity > 5) warning++;
      else clean++;
    }

    codehealthCache = {
      complexity,
      deadCode: deadCodeList,
      callGraph: {
        entryPoints: callGraph.entry_points.slice(0, 10),
        hotPaths: callGraph.hot_paths.slice(0, 10),
        edgeCount: callGraph.edges.length,
      },
      summary: { clean, warning, hot },
      cached_at: new Date().toISOString(),
    };
    return codehealthCache;
  } catch {
    return {
      complexity: [], deadCode: [],
      callGraph: { entryPoints: [], hotPaths: [], edgeCount: 0 },
      summary: { clean: 0, warning: 0, hot: 0 },
      cached_at: new Date().toISOString(),
    };
  }
}

// --- Decision Intelligence (Phase 3) ---

/**
 * Query project + global memory for similar past work.
 * Returns matches with approach, tier, duration, and outcome.
 */
export function getSimilarWork(juhbdiDir: string, query: string, topK: number = 5): Array<{
  description: string;
  approach: string;
  tier: string;
  duration_min: number;
  outcome: "pass" | "fail" | "partial";
  similarity: number;
}> {
  const results: Array<{
    description: string;
    approach: string;
    tier: string;
    duration_min: number;
    outcome: "pass" | "fail" | "partial";
    similarity: number;
  }> = [];

  const queryWords = new Set(query.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  if (queryWords.size === 0) return results;

  // Source 1: Experiential traces (project-level)
  const traces = safeReadJSON(path.join(juhbdiDir, "experiential-traces.json"));
  const traceList: any[] = traces?.traces || [];

  for (const trace of traceList) {
    const desc = (trace.summary || trace.description || "").toLowerCase();
    const descWords = new Set(desc.split(/\s+/).filter((w: string) => w.length > 2));
    if (descWords.size === 0) continue;

    const intersection = [...queryWords].filter(w => descWords.has(w)).length;
    const union = new Set([...queryWords, ...descWords]).size;
    const similarity = union > 0 ? intersection / union : 0;

    if (similarity > 0.1) {
      results.push({
        description: trace.summary || trace.description || "",
        approach: trace.approach || trace.strategy || "unknown",
        tier: trace.tier || "unknown",
        duration_min: trace.duration_min || trace.duration || 0,
        outcome: trace.success ? "pass" : "fail",
        similarity: Math.round(similarity * 100) / 100,
      });
    }
  }

  // Source 2: Reflexion bank (project-level)
  const reflexions = safeReadJSON(path.join(juhbdiDir, "reflexion-bank.json"));
  const reflexionList: any[] = reflexions?.entries || [];

  for (const r of reflexionList) {
    const desc = (r.task_description || r.task || "").toLowerCase();
    const descWords = new Set(desc.split(/\s+/).filter((w: string) => w.length > 2));
    if (descWords.size === 0) continue;

    const intersection = [...queryWords].filter(w => descWords.has(w)).length;
    const union = new Set([...queryWords, ...descWords]).size;
    const similarity = union > 0 ? intersection / union : 0;

    if (similarity > 0.1) {
      results.push({
        description: r.task_description || r.task || "",
        approach: r.lesson || "no lesson recorded",
        tier: "unknown",
        duration_min: 0,
        outcome: r.outcome === "success" ? "pass" : r.outcome === "failure" ? "fail" : "partial",
        similarity: Math.round(similarity * 100) / 100,
      });
    }
  }

  // Source 3: Global memory bank (if exists)
  const globalMemPath = path.join(process.env.HOME || "~", ".juhbdi", "global", "memory-bank.json");
  const globalMem = safeReadJSON(globalMemPath);
  const globalList: any[] = globalMem?.triplets || [];

  for (const g of globalList) {
    const desc = (g.intent?.task_description || g.description || "").toLowerCase();
    const descWords = new Set(desc.split(/\s+/).filter((w: string) => w.length > 2));
    if (descWords.size === 0) continue;

    const intersection = [...queryWords].filter(w => descWords.has(w)).length;
    const union = new Set([...queryWords, ...descWords]).size;
    let similarity = union > 0 ? intersection / union : 0;
    similarity *= 0.7; // Global discount

    if (similarity > 0.07) {
      results.push({
        description: g.intent?.task_description || g.description || "",
        approach: g.experience?.approach || "global knowledge",
        tier: "unknown",
        duration_min: 0,
        outcome: g.experience?.test_result === "pass" ? "pass" : "fail",
        similarity: Math.round(similarity * 100) / 100,
      });
    }
  }

  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, topK);
}

/**
 * Build trend data from decision trail: cumulative cost, pass rate, router accuracy.
 * Aggregated per-day.
 */
export function getTrendData(juhbdiDir: string): {
  cost_trend: Array<{ date: string; cumulative_cost: number }>;
  pass_rate_trend: Array<{ date: string; pass_rate: number; total: number }>;
  router_accuracy_trend: Array<{ date: string; accuracy: number; total: number }>;
} {
  const trail = getTrailEntries(juhbdiDir, 10000);

  const costByDay = new Map<string, number>();
  const passFailByDay = new Map<string, { pass: number; fail: number }>();
  const routerByDay = new Map<string, { correct: number; total: number }>();

  for (const entry of trail) {
    const ts = entry.timestamp;
    if (!ts) continue;
    const day = ts.slice(0, 10);

    if (entry.event_type === "routing") {
      const cost = entry.cost_estimate || 0;
      costByDay.set(day, (costByDay.get(day) || 0) + cost);

      if (typeof entry.correct_routing === "boolean") {
        const r = routerByDay.get(day) || { correct: 0, total: 0 };
        r.total++;
        if (entry.correct_routing) r.correct++;
        routerByDay.set(day, r);
      }
    }

    if (entry.event_type === "execution" || entry.event_type === "verification") {
      const pf = passFailByDay.get(day) || { pass: 0, fail: 0 };
      if (entry.outcome === "approved" || entry.outcome === "pass" || entry.outcome === "success") {
        pf.pass++;
      } else if (entry.outcome === "rejected" || entry.outcome === "fail" || entry.outcome === "failure") {
        pf.fail++;
      }
      passFailByDay.set(day, pf);
    }
  }

  const allDays = [...new Set([...costByDay.keys(), ...passFailByDay.keys(), ...routerByDay.keys()])].sort();
  let cumCost = 0;
  const cost_trend = allDays.map(day => {
    cumCost += costByDay.get(day) || 0;
    return { date: day, cumulative_cost: Math.round(cumCost * 10000) / 10000 };
  });

  const pass_rate_trend = allDays.map((day, i) => {
    const windowDays = allDays.slice(Math.max(0, i - 6), i + 1);
    let pass = 0, total = 0;
    for (const d of windowDays) {
      const pf = passFailByDay.get(d);
      if (pf) { pass += pf.pass; total += pf.pass + pf.fail; }
    }
    return { date: day, pass_rate: total > 0 ? Math.round((pass / total) * 100) : 0, total };
  });

  const router_accuracy_trend = allDays
    .filter(day => routerByDay.has(day))
    .map(day => {
      const r = routerByDay.get(day)!;
      return {
        date: day,
        accuracy: r.total > 0 ? Math.round((r.correct / r.total) * 100) : 0,
        total: r.total,
      };
    });

  return { cost_trend, pass_rate_trend, router_accuracy_trend };
}

/**
 * Get top principles across project + global banks.
 */
export function getHotPrinciples(juhbdiDir: string): {
  top_applied: Array<{ text: string; confidence: number; times_applied: number; source: string }>;
  recently_promoted: Array<{ text: string; promoted_at: string; source_project: string }>;
  decay_warnings: Array<{ text: string; confidence: number; times_applied: number; times_validated: number }>;
} {
  const top_applied: Array<{ text: string; confidence: number; times_applied: number; source: string }> = [];
  const recently_promoted: Array<{ text: string; promoted_at: string; source_project: string }> = [];
  const decay_warnings: Array<{ text: string; confidence: number; times_applied: number; times_validated: number }> = [];

  // Project-level principles
  const projectPrinciples = safeReadJSON(path.join(juhbdiDir, "principle-bank.json"));
  const projectList: any[] = projectPrinciples?.principles || [];

  for (const p of projectList) {
    top_applied.push({
      text: p.text || p.principle || "",
      confidence: p.confidence ?? 0,
      times_applied: p.times_applied ?? 0,
      source: "project",
    });
  }

  // Global principles (if exists)
  const globalPrinciplesPath = path.join(process.env.HOME || "~", ".juhbdi", "global", "principles.json");
  const globalPrinciples = safeReadJSON(globalPrinciplesPath);
  const globalList: any[] = globalPrinciples?.principles || [];

  for (const p of globalList) {
    top_applied.push({
      text: p.text || p.principle || "",
      confidence: p.confidence ?? 0,
      times_applied: p.times_applied ?? 0,
      source: p.source_project || "global",
    });

    if (p.promoted_at) {
      const promotedMs = new Date(p.promoted_at).getTime();
      const sevenDaysAgo = Date.now() - 7 * 86400000;
      if (promotedMs > sevenDaysAgo) {
        recently_promoted.push({
          text: p.text || p.principle || "",
          promoted_at: p.promoted_at,
          source_project: p.source_project || "unknown",
        });
      }
    }

    const applied = p.times_applied ?? 0;
    const validated = p.times_validated ?? 0;
    if (applied >= 5 && (validated / applied) < 0.2) {
      decay_warnings.push({
        text: p.text || p.principle || "",
        confidence: p.confidence ?? 0,
        times_applied: applied,
        times_validated: validated,
      });
    }
  }

  top_applied.sort((a, b) => b.times_applied - a.times_applied);

  return {
    top_applied: top_applied.slice(0, 5),
    recently_promoted: recently_promoted.slice(0, 5),
    decay_warnings: decay_warnings.slice(0, 5),
  };
}

// --- Action Token + Direct Action Endpoints ---

export function validateActionToken(request: Request, validToken: string): boolean {
  const auth = request.headers.get("Authorization");
  if (!auth) return false;
  const token = auth.replace("Bearer ", "");
  return token === validToken;
}

// POST /api/action/health-fix
// Body: { file: string }
export async function handleHealthFix(body: { file: string }, projectDir: string): Promise<Response> {
  const filePath = body.file;
  if (!filePath) return Response.json({ ok: false, error: "file required" }, { status: 400 });

  try {
    const proc = Bun.spawn(["npx", "eslint", "--fix", filePath], { cwd: projectDir, stdout: "pipe", stderr: "pipe" });
    await proc.exited;
    return Response.json({ ok: true, message: `Applied lint fixes to ${filePath}` });
  } catch {
    try {
      const proc = Bun.spawn(["npx", "prettier", "--write", filePath], { cwd: projectDir, stdout: "pipe", stderr: "pipe" });
      await proc.exited;
      return Response.json({ ok: true, message: `Applied prettier to ${filePath}` });
    } catch (e) {
      return Response.json({ ok: false, error: `Fix failed: ${e}` }, { status: 500 });
    }
  }
}

// POST /api/action/export-trail
// Body: { format: 'json' | 'csv' }
export function handleExportTrail(body: { format: string }, projectDir: string): Response {
  const trailPath = path.join(projectDir, ".juhbdi", "decision-trail.log");
  let entries: any[] = [];
  try {
    const raw = fs.readFileSync(trailPath, "utf8");
    entries = raw.trim().split("\n").filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return Response.json({ ok: false, error: "Trail not found" }, { status: 404 }); }

  if (body.format === "csv") {
    const headers = "event_type,timestamp,description,risk_level,model_tier\n";
    const rows = entries.map(e => `${e.event_type},${e.timestamp},"${(e.description || "").replace(/"/g, '""')}",${e.risk_level},${e.model_tier}`).join("\n");
    return new Response(headers + rows, { headers: { "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=decision-trail.csv" } });
  }

  return Response.json({ ok: true, entries });
}

// POST /api/action/export-ambient
// Body: { date?: string }
export function handleExportAmbient(body: { date?: string }, projectDir: string): Response {
  const date = body.date || new Date().toISOString().slice(0, 10);
  const ambientPath = path.join(projectDir, ".juhbdi", `ambient-${date}.jsonl`);
  let events: any[] = [];
  try {
    const raw = fs.readFileSync(ambientPath, "utf8");
    events = raw.trim().split("\n").filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return Response.json({ ok: false, error: "Ambient data not found" }, { status: 404 }); }

  return Response.json({ ok: true, events, date });
}

// POST /api/action/queue-task
// Body: { description: string }
export function handleQueueTask(body: { description: string }, projectDir: string): Response {
  if (!body.description) return Response.json({ ok: false, error: 'description required' }, { status: 400 });
  const pendingPath = path.join(projectDir, '.juhbdi', 'pending-actions.json');
  let pending: any[] = [];
  try { pending = JSON.parse(fs.readFileSync(pendingPath, 'utf8')); } catch {}
  pending.push({ type: 'task', description: body.description, queued_at: new Date().toISOString() });
  fs.writeFileSync(pendingPath, JSON.stringify(pending, null, 2));
  return Response.json({ ok: true, deferred: true, message: 'Task queued — will execute in next Claude Code session' });
}

// POST /api/action/queue-rerun
// Body: { wave_id: string }
export function handleQueueRerun(body: { wave_id: string }, projectDir: string): Response {
  if (!body.wave_id) return Response.json({ ok: false, error: 'wave_id required' }, { status: 400 });
  const pendingPath = path.join(projectDir, '.juhbdi', 'pending-actions.json');
  let pending: any[] = [];
  try { pending = JSON.parse(fs.readFileSync(pendingPath, 'utf8')); } catch {}
  pending.push({ type: 'rerun', wave_id: body.wave_id, queued_at: new Date().toISOString() });
  fs.writeFileSync(pendingPath, JSON.stringify(pending, null, 2));
  return Response.json({ ok: true, deferred: true, message: `Wave ${body.wave_id} rerun queued — will execute in next Claude Code session` });
}

// POST /api/action/approve
// Body: { decision_id: string }
export function handleApprove(body: { decision_id: string }, projectDir: string): Response {
  if (!body.decision_id) return Response.json({ ok: false, error: 'decision_id required' }, { status: 400 });
  const decisionsPath = path.join(projectDir, '.juhbdi', 'governance-decisions.json');
  let decisions: any[] = [];
  try { decisions = JSON.parse(fs.readFileSync(decisionsPath, 'utf8')); } catch {}
  decisions.push({ decision_id: body.decision_id, action: 'approve', timestamp: new Date().toISOString() });
  fs.writeFileSync(decisionsPath, JSON.stringify(decisions, null, 2));
  return Response.json({ ok: true, deferred: true, message: `Decision ${body.decision_id} approved` });
}

// POST /api/action/reject
// Body: { decision_id: string, reason?: string }
export function handleReject(body: { decision_id: string; reason?: string }, projectDir: string): Response {
  if (!body.decision_id) return Response.json({ ok: false, error: 'decision_id required' }, { status: 400 });
  const decisionsPath = path.join(projectDir, '.juhbdi', 'governance-decisions.json');
  let decisions: any[] = [];
  try { decisions = JSON.parse(fs.readFileSync(decisionsPath, 'utf8')); } catch {}
  decisions.push({ decision_id: body.decision_id, action: 'reject', reason: body.reason || '', timestamp: new Date().toISOString() });
  fs.writeFileSync(decisionsPath, JSON.stringify(decisions, null, 2));
  return Response.json({ ok: true, deferred: true, message: `Decision ${body.decision_id} rejected` });
}

export function handleAmbientRequest(projectDir: string, params: URLSearchParams): Response {
  const date = params.get('date') || new Date().toISOString().slice(0, 10);
  const limit = parseInt(params.get('limit') || '200');
  const ambientPath = path.join(projectDir, '.juhbdi', `ambient-${date}.jsonl`);

  let events: any[] = [];
  try {
    const raw = fs.readFileSync(ambientPath, 'utf8');
    events = raw.trim().split('\n').filter(Boolean).map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
  } catch { /* file doesn't exist yet */ }

  if (limit > 0) events = events.slice(-limit);

  const edits = events.filter((e: any) => e.category === 'edit');
  const tests = events.filter((e: any) => e.category === 'test');
  const gitEvents = events.filter((e: any) => e.category === 'git');

  const fileEdits: Record<string, number> = {};
  for (const e of edits) {
    if (e.target) fileEdits[e.target] = (fileEdits[e.target] || 0) + 1;
  }

  const hotspots = Object.entries(fileEdits)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([file, count]) => ({ file, edits: count }));

  const testsPassed = tests.filter((t: any) => t.result === 'pass').length;
  const testPassRate = tests.length > 0 ? testsPassed / tests.length : 0;

  const filesTouched = [...new Set(edits.map((e: any) => e.target).filter(Boolean))];

  let sessionDuration = '';
  if (events.length >= 2) {
    const first = new Date(events[0].timestamp).getTime();
    const last = new Date(events[events.length - 1].timestamp).getTime();
    const mins = Math.round((last - first) / 60000);
    if (mins >= 60) sessionDuration = `${Math.floor(mins / 60)}h ${mins % 60}m`;
    else sessionDuration = `${mins}m`;
  }

  return Response.json({
    events,
    summary: {
      total_edits: edits.length,
      total_tests: tests.length,
      test_pass_rate: Math.round(testPassRate * 100) / 100,
      test_pass_rate_note: 'approximate, based on exit code and stdout pattern matching',
      files_touched: filesTouched,
      hotspots,
      git_commits: gitEvents.length,
      session_duration: sessionDuration || 'N/A',
    },
  });
}

function findTsFiles(dir: string, projectRoot: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== ".git") {
      results.push(...findTsFiles(fullPath, projectRoot));
    } else if (entry.isFile() && /\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts")) {
      results.push(path.relative(projectRoot, fullPath));
    }
  }
  return results;
}

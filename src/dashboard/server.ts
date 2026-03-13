import fs from "fs";
import path from "path";
import { randomBytes } from "crypto";
import { getProjectState, getTrailEntries, getCostData, getMemoryStats, getContextHealth, getActiveSessions, getCodeHealth, getSimilarWork, getTrendData, getHotPrinciples, validateActionToken, handleHealthFix, handleExportTrail, handleExportAmbient, handleAmbientRequest, handleQueueTask, handleQueueRerun, handleApprove, handleReject } from "./api";
import { appendEvent, replayEvents, compactEvents, type DashboardEvent } from "./event-log";

const PORT = parseInt(process.env.JUHBDI_DASHBOARD_PORT || "3141", 10);
const cwd = process.cwd();
const juhbdiDir = path.join(cwd, ".juhbdi");

// Generate action token on startup
const ACTION_TOKEN = randomBytes(24).toString("hex");
const tokenFilePath = `/tmp/juhbdi-dashboard-${process.pid}.token`;
try {
  fs.writeFileSync(tokenFilePath, ACTION_TOKEN, { mode: 0o600 });
} catch { /* non-fatal if /tmp write fails */ }

const clients = new Set<ReadableStreamDefaultController>();
const eventLogPath = path.join(juhbdiDir, "dashboard-events.jsonl");
const eventArchivePath = path.join(juhbdiDir, "dashboard-events.archive.jsonl");

function resolveProjectDir(url: URL): string {
  const pd = url.searchParams.get("project_dir");
  if (pd) {
    const resolved = path.join(pd, ".juhbdi");
    if (fs.existsSync(resolved)) return resolved;
  }
  return juhbdiDir;
}

function broadcastUpdate() {
  const sessions = getActiveSessions();
  const payload = {
    state: getProjectState(juhbdiDir),
    trail: getTrailEntries(juhbdiDir, 50),
    cost: getCostData(juhbdiDir),
    memory: getMemoryStats(juhbdiDir),
    context: getContextHealth(),
    sessions,
  };
  const data = JSON.stringify(payload);

  // Persist event to JSONL log (fire-and-forget, don't block broadcast)
  const event: DashboardEvent = {
    timestamp: new Date().toISOString(),
    type: "broadcast",
    data: payload,
  };
  appendEvent(eventLogPath, event).catch(() => {});

  for (const controller of clients) {
    try { controller.enqueue(`data: ${data}\n\n`); }
    catch { clients.delete(controller); }
  }
}

// Watch .juhbdi/ for project state changes
let watchTimeout: ReturnType<typeof setTimeout> | null = null;
if (fs.existsSync(juhbdiDir)) {
  fs.watch(juhbdiDir, { recursive: true }, () => {
    if (watchTimeout) return;
    watchTimeout = setTimeout(() => {
      watchTimeout = null;
      broadcastUpdate();
    }, 1000);
  });
}

// Poll /tmp/ for bridge file changes (session context updates)
setInterval(() => {
  broadcastUpdate();
}, 5000);

// Auto-compact on startup
compactEvents(eventLogPath, eventArchivePath).catch(() => {});

// Auto-compact daily (every 24h)
setInterval(() => {
  compactEvents(eventLogPath, eventArchivePath).catch(() => {});
}, 86400000);

const htmlPath = path.join(import.meta.dir, "index.html");
const html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, "utf-8") : "<h1>Dashboard HTML not found</h1>";

const appJsPath = path.join(import.meta.dir, "app.js");
const appJs = fs.existsSync(appJsPath) ? fs.readFileSync(appJsPath, "utf-8") : "// app.js not found";

Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  async fetch(req) {
    const url = new URL(req.url);
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    };

    switch (url.pathname) {
      case "/":
        return new Response(html, { headers: { "Content-Type": "text/html" } });

      case "/api/state": {
        const dir = resolveProjectDir(url);
        return new Response(JSON.stringify(getProjectState(dir)), { headers });
      }

      case "/api/trail": {
        const dir = resolveProjectDir(url);
        const limit = parseInt(url.searchParams.get("limit") || "100", 10);
        return new Response(JSON.stringify(getTrailEntries(dir, limit)), { headers });
      }

      case "/api/cost": {
        const dir = resolveProjectDir(url);
        return new Response(JSON.stringify(getCostData(dir)), { headers });
      }

      case "/api/memory": {
        const dir = resolveProjectDir(url);
        return new Response(JSON.stringify(getMemoryStats(dir)), { headers });
      }

      case "/api/context": {
        const sid = url.searchParams.get("session_id") || undefined;
        return new Response(JSON.stringify(getContextHealth(sid)), { headers });
      }

      case "/api/sessions":
        return new Response(JSON.stringify(getActiveSessions()), { headers });

      case "/api/events": {
        const stream = new ReadableStream({
          async start(controller) {
            clients.add(controller);
            controller.enqueue(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

            // Replay persisted events on connect (last 7 days)
            try {
              const cutoff = new Date(Date.now() - 7 * 86400000).toISOString();
              const history = await replayEvents(eventLogPath, cutoff);
              for (const event of history) {
                try {
                  controller.enqueue(`data: ${JSON.stringify(event.data)}\n\n`);
                } catch { break; }
              }
              controller.enqueue(`data: ${JSON.stringify({ type: "replay_complete", count: history.length })}\n\n`);
            } catch {
              // Replay failed — continue with live stream only
            }
          },
          cancel(controller) {
            clients.delete(controller);
          },
        });
        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }

      case "/app.js":
        return new Response(appJs, {
          headers: { "Content-Type": "application/javascript", "Cache-Control": "no-cache" },
        });

      case "/api/codehealth": {
        const refresh = url.searchParams.get("refresh") === "true";
        const result = getCodeHealth(cwd, refresh);
        return new Response(JSON.stringify(result), { headers });
      }

      case "/assets/dashboardicons.png":
      case "/assets/juhbdilogo.png": {
        const assetName = url.pathname.split("/").pop()!;
        const assetPath = path.join(import.meta.dir, "assets", assetName);
        if (fs.existsSync(assetPath)) {
          return new Response(Bun.file(assetPath), {
            headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=86400" },
          });
        }
        return new Response("Not found", { status: 404 });
      }

      case "/api/similar-work": {
        const dir = resolveProjectDir(url);
        const query = url.searchParams.get("q") || "";
        const topK = parseInt(url.searchParams.get("limit") || "5", 10);
        return new Response(JSON.stringify(getSimilarWork(dir, query, topK)), { headers });
      }

      case "/api/trends": {
        const dir = resolveProjectDir(url);
        return new Response(JSON.stringify(getTrendData(dir)), { headers });
      }

      case "/api/hot-principles": {
        const dir = resolveProjectDir(url);
        return new Response(JSON.stringify(getHotPrinciples(dir)), { headers });
      }

      case "/api/ambient": {
        return handleAmbientRequest(cwd, url.searchParams);
      }

      case "/api/action/health-fix": {
        if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
        if (!validateActionToken(req, ACTION_TOKEN)) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        const body = await req.json().catch(() => ({}));
        return handleHealthFix(body, cwd);
      }

      case "/api/action/export-trail": {
        if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
        if (!validateActionToken(req, ACTION_TOKEN)) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        const body = await req.json().catch(() => ({}));
        return handleExportTrail(body, cwd);
      }

      case "/api/action/export-ambient": {
        if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
        if (!validateActionToken(req, ACTION_TOKEN)) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        const body = await req.json().catch(() => ({}));
        return handleExportAmbient(body, cwd);
      }

      case "/api/action/queue-task": {
        if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
        if (!validateActionToken(req, ACTION_TOKEN)) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        const body = await req.json().catch(() => ({}));
        return handleQueueTask(body, cwd);
      }

      case "/api/action/queue-rerun": {
        if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
        if (!validateActionToken(req, ACTION_TOKEN)) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        const body = await req.json().catch(() => ({}));
        return handleQueueRerun(body, cwd);
      }

      case "/api/action/approve": {
        if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
        if (!validateActionToken(req, ACTION_TOKEN)) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        const body = await req.json().catch(() => ({}));
        return handleApprove(body, cwd);
      }

      case "/api/action/reject": {
        if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
        if (!validateActionToken(req, ACTION_TOKEN)) return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        const body = await req.json().catch(() => ({}));
        return handleReject(body, cwd);
      }

      default:
        return new Response("Not found", { status: 404 });
    }
  },
});

console.log(`JuhBDI Dashboard running at http://localhost:${PORT}`);
console.log(`[JuhBDI Dashboard] Action token: ${ACTION_TOKEN}`);

// Keep process alive — Bun.serve alone may not hold event loop in some environments
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

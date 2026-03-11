import { readFile } from "fs/promises";
import { join } from "path";
import { access } from "fs/promises";
import { StateSchema } from "../schemas/state";

export interface CheckResult {
  name: string;
  status: "pass" | "fail";
  detail: string;
}

export interface HealthReport {
  checks: CheckResult[];
  summary: { total: number; passed: number; failed: number };
  healthy: boolean;
}

export async function checkProjectDir(cwd: string): Promise<CheckResult> {
  const juhbdiDir = join(cwd, ".juhbdi");
  try {
    await access(juhbdiDir);
    return { name: "project_dir", status: "pass", detail: ".juhbdi/ found" };
  } catch {
    return { name: "project_dir", status: "fail", detail: ".juhbdi/ not found in cwd" };
  }
}

export async function checkStateSchema(cwd: string): Promise<CheckResult> {
  const statePath = join(cwd, ".juhbdi", "state.json");
  try {
    const raw = await readFile(statePath, "utf-8");
    const data = JSON.parse(raw);
    const result = StateSchema.safeParse(data);
    if (result.success) {
      return { name: "state_schema", status: "pass", detail: "state.json valid" };
    }
    const issues = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    return { name: "state_schema", status: "fail", detail: `state.json invalid: ${issues}` };
  } catch (err) {
    return { name: "state_schema", status: "fail", detail: `Could not read state.json: ${err}` };
  }
}

/**
 * Attempt to repair a broken state.json by filling in missing required fields.
 * Returns true if repair was attempted, false if file was already valid or missing.
 */
export async function repairStateSchema(cwd: string): Promise<{ repaired: boolean; detail: string }> {
  const statePath = join(cwd, ".juhbdi", "state.json");
  try {
    const raw = await readFile(statePath, "utf-8");
    const data = JSON.parse(raw);
    const result = StateSchema.safeParse(data);
    if (result.success) {
      return { repaired: false, detail: "state.json already valid" };
    }

    // Apply defaults for missing required fields
    const repaired = {
      version: data.version ?? "1.0.0",
      project_name: data.project_name ?? "unknown",
      conventions: Array.isArray(data.conventions) ? data.conventions : [],
      architecture: data.architecture ?? "unknown",
      compressed_history: data.compressed_history ?? "",
      last_updated: data.last_updated ?? new Date().toISOString(),
      ...(data.active_context ? { active_context: data.active_context } : {}),
    };

    const recheck = StateSchema.safeParse(repaired);
    if (recheck.success) {
      const { writeFile } = await import("fs/promises");
      await writeFile(statePath, JSON.stringify(repaired, null, 2) + "\n");
      return { repaired: true, detail: "state.json repaired with defaults" };
    }
    return { repaired: false, detail: "Could not auto-repair — manual fix needed" };
  } catch {
    return { repaired: false, detail: "state.json missing — run /juhbdi:init" };
  }
}

export async function checkDashboard(): Promise<CheckResult> {
  try {
    const res = await fetch("http://localhost:3141", {
      signal: AbortSignal.timeout(2000),
    });
    if (res.status === 200) {
      return { name: "dashboard", status: "pass", detail: "Dashboard reachable on port 3141" };
    }
    return { name: "dashboard", status: "fail", detail: `Unexpected status ${res.status} on port 3141` };
  } catch (err) {
    const message = String(err);
    if (message.includes("ECONNREFUSED") || message.includes("Connection refused")) {
      return { name: "dashboard", status: "fail", detail: "Connection refused on port 3141" };
    }
    if (message.includes("TimeoutError") || message.includes("AbortError") || message.includes("timed out")) {
      return { name: "dashboard", status: "fail", detail: "Request timed out on port 3141" };
    }
    return { name: "dashboard", status: "fail", detail: `Dashboard unreachable: ${message}` };
  }
}

export async function checkDecisionTrail(cwd: string): Promise<CheckResult> {
  const trailPath = join(cwd, ".juhbdi", "decision-trail.log");
  try {
    const content = await readFile(trailPath, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim().length > 0);
    return {
      name: "decision_trail",
      status: "pass",
      detail: `decision-trail.log found (${lines.length} entries)`,
    };
  } catch {
    return { name: "decision_trail", status: "fail", detail: "decision-trail.log not found" };
  }
}

export async function runHealthChecks(cwd: string): Promise<HealthReport> {
  const checks = await Promise.all([
    checkProjectDir(cwd),
    checkStateSchema(cwd),
    checkDashboard(),
    checkDecisionTrail(cwd),
  ]);

  const passed = checks.filter((c) => c.status === "pass").length;
  const failed = checks.filter((c) => c.status === "fail").length;

  return {
    checks,
    summary: { total: checks.length, passed, failed },
    healthy: failed === 0,
  };
}

async function main() {
  const cwd = process.cwd();
  const report = await runHealthChecks(cwd);
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(JSON.stringify({ error: String(err) }));
    process.exit(1);
  });
}

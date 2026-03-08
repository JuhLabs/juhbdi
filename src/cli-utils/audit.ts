import { readTrail, appendTrailEntry } from "../core/trail";
import type { AuditFilter } from "../audit/types";
import { filterTrail, summarizeTrail, generateComplianceReport } from "../audit/query";
import { formatTable, formatSummary, formatComplianceReport } from "../audit/format";
import { resolveContext } from "./helpers";

function parseArgs(argv: string[]): { filter: AuditFilter; compliance: boolean } {
  const filter: AuditFilter = {};
  let compliance = false;

  // Skip first two elements (bun, script path)
  const args = argv.slice(2);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case "--type":
        if (next) { filter.event_type = next; i++; }
        break;
      case "--task":
        if (next) { filter.task_id = next; i++; }
        break;
      case "--wave":
        if (next) { filter.wave_id = next; i++; }
        break;
      case "--from":
        if (next) { filter.from = next; i++; }
        break;
      case "--to":
        if (next) { filter.to = next; i++; }
        break;
      case "--compliance":
        compliance = true;
        break;
    }
  }

  return { filter, compliance };
}

async function main() {
  const { trailPath } = await resolveContext();
  const trail = await readTrail(trailPath);

  await appendTrailEntry(trailPath, {
    event_type: "command",
    description: "Audit command invoked",
    reasoning: "User queried decision trail",
    alternatives_considered: [],
    constraint_refs: [],
    outcome: "approved",
  });

  if (trail.length === 0) {
    console.log("No decision trail entries found.");
    return;
  }

  const { filter, compliance } = parseArgs(process.argv);

  // Compliance report mode
  if (compliance) {
    const filtered = filterTrail(trail, filter);
    const report = generateComplianceReport(filtered);
    console.log(formatComplianceReport(report));
    return;
  }

  const hasFilter =
    filter.event_type ||
    filter.task_id ||
    filter.wave_id ||
    filter.from ||
    filter.to;

  if (hasFilter) {
    // Filtered table view
    const filtered = filterTrail(trail, filter);
    console.log(formatTable(filtered));
  } else {
    // Default: summary + table
    const summary = summarizeTrail(trail);
    console.log(formatSummary(summary));
    console.log("");
    console.log(formatTable(trail));
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ error: String(err) }));
  process.exit(1);
});

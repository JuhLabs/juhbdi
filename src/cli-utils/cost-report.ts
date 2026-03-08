import { gatherCosts } from "../cost/gather";
import { formatCostReport } from "../cost/format";
import { resolveContext } from "./helpers";
import { readTrail } from "../core/trail";

async function main() {
  const { trailPath } = await resolveContext();
  const entries = await readTrail(trailPath);
  const report = gatherCosts(entries);
  console.log(formatCostReport(report));
}

main().catch((err) => {
  console.error(JSON.stringify({ error: String(err) }));
  process.exit(1);
});

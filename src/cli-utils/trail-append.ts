import { appendTrailEntry } from "../core/trail";
import { resolveContext } from "./helpers";

async function main() {
  const { trailPath } = await resolveContext();

  const raw = process.argv[2];
  if (!raw) {
    console.error(JSON.stringify({ error: "Missing trail entry JSON argument" }));
    process.exit(1);
  }

  const entry = JSON.parse(raw);
  await appendTrailEntry(trailPath, entry);

  console.log(JSON.stringify({ success: true }));
}

main().catch((err) => {
  console.error(JSON.stringify({ error: String(err) }));
  process.exit(1);
});

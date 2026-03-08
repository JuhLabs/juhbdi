import { gatherStatus } from "../status/gather";
import { formatProjectStatus } from "../status/format";
import { resolveContext } from "./helpers";

async function main() {
  const { juhbdiDir, trailPath } = await resolveContext();
  const status = await gatherStatus(juhbdiDir, trailPath);
  console.log(formatProjectStatus(status));
}

main().catch((err) => {
  console.error(JSON.stringify({ error: String(err) }));
  process.exit(1);
});

import { filterTrail } from "../trail/filter";
import { formatTrail } from "../trail/format";
import { resolveContext } from "./helpers";
import { readTrail } from "../core/trail";

function parseArgs(argv: string[]) {
  let type: string | undefined;
  let last: number | undefined;
  let task: string | undefined;
  let wave: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--type" && i + 1 < argv.length) {
      type = argv[++i];
    } else if (arg === "--last" && i + 1 < argv.length) {
      last = parseInt(argv[++i], 10);
    } else if (arg === "--task" && i + 1 < argv.length) {
      task = argv[++i];
    } else if (arg === "--wave" && i + 1 < argv.length) {
      wave = argv[++i];
    }
  }

  return { type, last, task, wave };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { trailPath } = await resolveContext();
  const entries = await readTrail(trailPath);
  const filtered = filterTrail(entries, {
    type: args.type,
    last: args.last,
    task_id: args.task,
    wave_id: args.wave,
  });
  console.log(formatTrail(filtered));
}

main().catch((err) => {
  console.error(JSON.stringify({ error: String(err) }));
  process.exit(1);
});

import { readFile } from "fs/promises";
import { join } from "path";
import { IntentSpecSchema } from "../schemas/intent-spec";
import { checkIntent } from "../executor/intent-check";
import { resolveContext } from "./helpers";

async function main() {
  const { juhbdiDir } = await resolveContext();

  const raw = process.argv[2];
  if (!raw) {
    console.error(JSON.stringify({ error: "Missing task JSON argument" }));
    process.exit(1);
  }

  const task = JSON.parse(raw);

  // Load intent-spec.json
  const specRaw = await readFile(join(juhbdiDir, "intent-spec.json"), "utf-8");
  const intentSpec = IntentSpecSchema.parse(JSON.parse(specRaw));

  const result = checkIntent(task, intentSpec);
  console.log(JSON.stringify({ passed: result.passed, violations: result.violations }));
}

main().catch((err) => {
  console.error(JSON.stringify({ error: String(err) }));
  process.exit(1);
});

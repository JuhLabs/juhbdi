import { readFile } from "fs/promises";
import { join } from "path";
import { IntentSpecSchema } from "../schemas/intent-spec";
import { RoadmapIntentSchema } from "../schemas/roadmap-intent";
import { appendTrailEntry } from "../core/trail";
import { resolveContext } from "./helpers";

interface ValidationResult {
  file: string;
  valid: boolean;
  errors?: string[];
}

async function validateFile(
  filePath: string,
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: { safeParse: (data: unknown) => any }
): Promise<ValidationResult> {
  try {
    const raw = await readFile(filePath, "utf-8");
    const data = JSON.parse(raw);
    const result = schema.safeParse(data);
    if (result.success) return { file: name, valid: true };
    return {
      file: name,
      valid: false,
      errors: result.error?.issues.map((i: { path: string[]; message: string }) => `${i.path.join(".")}: ${i.message}`),
    };
  } catch (err) {
    return { file: name, valid: false, errors: [`Could not read file: ${err}`] };
  }
}

async function main() {
  const { juhbdiDir, trailPath } = await resolveContext();
  const results: ValidationResult[] = [];

  results.push(await validateFile(join(juhbdiDir, "intent-spec.json"), "intent-spec.json", IntentSpecSchema));
  results.push(await validateFile(join(juhbdiDir, "roadmap-intent.json"), "roadmap-intent.json", RoadmapIntentSchema));

  const allValid = results.every((r) => r.valid);

  await appendTrailEntry(trailPath, {
    event_type: "command",
    description: `Validated project files: ${allValid ? "all passed" : "failures detected"}`,
    reasoning: "User ran juhbdi validate",
    alternatives_considered: [],
    constraint_refs: [],
    outcome: allValid ? "approved" : "rejected",
  });

  console.log(JSON.stringify({ results, allValid }));
}

main().catch((err) => {
  console.error(JSON.stringify({ error: String(err) }));
  process.exit(1);
});

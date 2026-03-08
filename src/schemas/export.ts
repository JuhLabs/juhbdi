import { z } from "zod";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import {
  IntentSpecSchema,
  RoadmapIntentSchema,
  DecisionTrailEntrySchema,
  StateSchema,
} from "./index";

const OUT_DIR = join(import.meta.dir, "../../schemas");

const schemas = [
  { name: "intent-spec", schema: IntentSpecSchema },
  { name: "roadmap-intent", schema: RoadmapIntentSchema },
  { name: "decision-trail-entry", schema: DecisionTrailEntrySchema },
  { name: "state", schema: StateSchema },
];

async function exportSchemas() {
  await mkdir(OUT_DIR, { recursive: true });

  for (const { name, schema } of schemas) {
    // Use Zod v4's built-in JSON Schema generation (zod-to-json-schema v3 doesn't support Zod v4)
    const jsonSchema = z.toJSONSchema(schema, { target: "draft-2020-12" });
    const path = join(OUT_DIR, `${name}.schema.json`);
    await writeFile(path, JSON.stringify(jsonSchema, null, 2) + "\n");
    console.log(`Exported: ${path}`);
  }
}

exportSchemas();

import { writeFile } from "fs/promises";
import { join } from "path";
import { RoadmapIntentSchema } from "../schemas/roadmap-intent";
import { resolveContext } from "./helpers";

async function main() {
  const { juhbdiDir } = await resolveContext();

  const raw = process.argv[2];
  if (!raw) {
    console.error(JSON.stringify({ error: "Missing roadmap JSON argument" }));
    process.exit(1);
  }

  const data = JSON.parse(raw);
  const result = RoadmapIntentSchema.safeParse(data);

  if (!result.success) {
    const errors = result.error?.issues.map(
      (i: { path: string[]; message: string }) => `${i.path.join(".")}: ${i.message}`
    );
    console.log(JSON.stringify({ valid: false, errors }));
    process.exit(1);
  }

  const roadmap = result.data;
  await writeFile(
    join(juhbdiDir, "roadmap-intent.json"),
    JSON.stringify(roadmap, null, 2) + "\n"
  );

  const taskCount = roadmap.waves.reduce((sum, w) => sum + w.tasks.length, 0);
  console.log(JSON.stringify({ valid: true, waves: roadmap.waves.length, tasks: taskCount }));
}

main().catch((err) => {
  console.error(JSON.stringify({ error: String(err) }));
  process.exit(1);
});

import { z } from "zod";
import { writeFile, readFile } from "fs/promises";

export const ExecProgressSchema = z.object({
  started_at: z.string().min(1),
  current_wave: z.number().int().min(0),
  total_waves: z.number().int().min(1),
  tasks_passed: z.number().int().min(0),
  tasks_failed: z.number().int().min(0),
  tasks_skipped: z.number().int().min(0),
  last_wave_result: z.enum(["passed", "failed", "skipped"]),
  status: z.enum(["running", "completed", "paused", "failed"]),
});

export type ExecProgress = z.infer<typeof ExecProgressSchema>;

export async function writeProgress(
  path: string,
  progress: ExecProgress
): Promise<void> {
  const validated = ExecProgressSchema.parse(progress);
  await writeFile(path, JSON.stringify(validated, null, 2) + "\n");
}

export async function readProgress(
  path: string
): Promise<ExecProgress | null> {
  try {
    const raw = await readFile(path, "utf-8");
    return ExecProgressSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

if (import.meta.main) {
  try {
    const action = process.argv[2];
    const dataRaw = process.argv[3];

    if (action === "write" && dataRaw) {
      const data = ExecProgressSchema.parse(JSON.parse(dataRaw));
      await writeProgress("/tmp/juhbdi-exec-progress.json", data);
      console.log(JSON.stringify({ success: true }));
    } else if (action === "read") {
      const progress = await readProgress("/tmp/juhbdi-exec-progress.json");
      console.log(JSON.stringify(progress ?? { status: "not_found" }));
    } else {
      console.error(JSON.stringify({ error: "Usage: exec-progress.ts <write|read> [json]" }));
      process.exit(1);
    }
  } catch (err) {
    console.error(JSON.stringify({ error: String(err) }));
    process.exit(1);
  }
}

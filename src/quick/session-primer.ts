import type { ExperienceTriplet } from "../schemas/memory";

export interface SessionOptions {
  pendingTaskCount?: number;
}

export interface SessionContext {
  memory_summary: string;
  relevant_experiences: ExperienceTriplet[];
  governance_active: boolean;
  pending_task_count?: number;
  top_insight?: string;
}

export function generateSessionContext(
  triplets: ExperienceTriplet[],
  workingDir: string,
  options?: SessionOptions
): SessionContext {
  const pendingCount = options?.pendingTaskCount;

  if (triplets.length === 0) {
    const parts = ["No past experiences recorded."];
    if (pendingCount && pendingCount > 0) {
      parts.push(`${pendingCount} pending tasks.`);
    }
    return {
      memory_summary: parts.join(" "),
      relevant_experiences: [],
      governance_active: true,
      ...(pendingCount && pendingCount > 0 ? { pending_task_count: pendingCount } : {}),
    };
  }

  const dirParts = workingDir.toLowerCase().split("/").filter((p) => p.length > 2);
  const relevant = triplets
    .filter((t) => t.experience.test_result === "pass")
    .map((t) => {
      const fileMatch = t.experience.files_modified.some((f) =>
        dirParts.some((d) => f.toLowerCase().includes(d))
      );
      const tagMatch = t.intent.domain_tags.some((tag) =>
        dirParts.some((d) => tag.toLowerCase().includes(d) || d.includes(tag.toLowerCase()))
      );
      const score = (fileMatch ? 2 : 0) + (tagMatch ? 1 : 0);
      return { triplet: t, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((s) => s.triplet);

  const passing = triplets.filter((t) => t.experience.test_result === "pass").length;
  const parts = [`${triplets.length} total experiences (${passing} successful)`];
  if (relevant.length > 0) {
    parts.unshift(`${relevant.length} past experience${relevant.length > 1 ? "s" : ""} relevant to current context`);
  }
  if (pendingCount && pendingCount > 0) {
    parts.push(`${pendingCount} pending tasks`);
  }

  // Compute top_insight when we have enough data (> 10 triplets)
  let topInsight: string | undefined;
  if (triplets.length > 10) {
    const passingTriplets = triplets.filter((t) => t.experience.test_result === "pass");
    if (passingTriplets.length > 0) {
      // Find most frequent domain tag across passing triplets
      const tagCounts = new Map<string, number>();
      for (const t of passingTriplets) {
        for (const tag of t.intent.domain_tags) {
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
        }
      }
      if (tagCounts.size > 0) {
        let topTag = "";
        let topCount = 0;
        for (const [tag, count] of tagCounts) {
          if (count > topCount) {
            topTag = tag;
            topCount = count;
          }
        }
        // Find most common approach for that tag
        const approachCounts = new Map<string, number>();
        for (const t of passingTriplets) {
          if (t.intent.domain_tags.includes(topTag)) {
            approachCounts.set(t.experience.approach, (approachCounts.get(t.experience.approach) || 0) + 1);
          }
        }
        let topApproach = "";
        let topApproachCount = 0;
        for (const [approach, count] of approachCounts) {
          if (count > topApproachCount) {
            topApproach = approach;
            topApproachCount = count;
          }
        }
        if (topApproach) {
          topInsight = `${topTag} tasks succeed most with: '${topApproach}'`;
        }
      }
    }
  }

  return {
    memory_summary: parts.join(". ") + ".",
    relevant_experiences: relevant,
    governance_active: true,
    ...(pendingCount && pendingCount > 0 ? { pending_task_count: pendingCount } : {}),
    ...(topInsight ? { top_insight: topInsight } : {}),
  };
}

if (import.meta.main) {
  const { readFile } = await import("fs/promises");
  const { join } = await import("path");
  const { findProjectRoot, JUHBDI_DIR } = await import("../core/config");
  const { MemoryBankSchema } = await import("../schemas/memory");

  const cwd = process.cwd();
  const projectRoot = await findProjectRoot(cwd);

  if (!projectRoot) {
    console.log(JSON.stringify({ memory_summary: "No JuhBDI project found.", relevant_experiences: [], governance_active: false }));
    process.exit(0);
  }

  const juhbdiDir = join(projectRoot, JUHBDI_DIR);
  let triplets: ExperienceTriplet[] = [];

  try {
    const raw = await readFile(join(juhbdiDir, "memory-bank.json"), "utf-8");
    const bank = MemoryBankSchema.parse(JSON.parse(raw));
    triplets = bank.triplets;
  } catch { /* empty */ }

  const pendingArg = process.argv[2] ? parseInt(process.argv[2], 10) : undefined;
  const options: SessionOptions = {};
  if (pendingArg && pendingArg > 0) {
    options.pendingTaskCount = pendingArg;
  }

  const ctx = generateSessionContext(triplets, cwd, options);
  console.log(JSON.stringify(ctx));
}

// src/cli-utils/trust.ts
import { resolveContext } from "./helpers";

if (import.meta.main) {
  const action = process.argv[2];
  const { readFile, writeFile } = await import("fs/promises");
  const { join } = await import("path");
  const { TrustStoreSchema, computeTrustScore, updateTrustRecord } = await import("../routing/trust");
  const { juhbdiDir } = await resolveContext();

  const storePath = join(juhbdiDir, "trust-store.json");

  async function loadStore() {
    try {
      const raw = await readFile(storePath, "utf-8");
      return TrustStoreSchema.parse(JSON.parse(raw));
    } catch {
      return { version: "1.0.0" as const, records: {} };
    }
  }

  async function saveStore(store: ReturnType<typeof TrustStoreSchema.parse>) {
    await writeFile(storePath, JSON.stringify(store, null, 2) + "\n");
  }

  if (action === "query") {
    const tier = process.argv[3];
    if (!tier) {
      console.error(JSON.stringify({ error: "Usage: trust.ts query <tier>" }));
      process.exit(1);
    }
    const store = await loadStore();
    const record = store.records[tier];
    if (!record) {
      console.log(JSON.stringify({ tier, score: 0.5, record: null, message: "No trust record — using default 0.5" }));
    } else {
      const score = computeTrustScore(record);
      console.log(JSON.stringify({ tier, score, record }));
    }

  } else if (action === "update") {
    const tier = process.argv[3];
    const feedbackRaw = process.argv[4];
    if (!tier || !feedbackRaw) {
      console.error(JSON.stringify({ error: "Usage: trust.ts update <tier> '<feedback_json>'" }));
      process.exit(1);
    }
    const feedback = JSON.parse(feedbackRaw);
    const store = await loadStore();
    const existing = store.records[tier] ?? {
      agent_tier: tier as "haiku" | "sonnet" | "opus",
      tasks_attempted: 0,
      tasks_passed: 0,
      avg_strikes: 0,
      violation_count: 0,
      last_10_outcomes: [],
    };
    const updated = updateTrustRecord(existing, feedback);
    store.records[tier] = updated;
    await saveStore(store);
    const newScore = computeTrustScore(updated);
    console.log(JSON.stringify({ success: true, tier, new_score: newScore, record: updated }));

  } else if (action === "list") {
    const store = await loadStore();
    const entries = Object.entries(store.records).map(([tier, record]) => ({
      tier,
      score: computeTrustScore(record),
      tasks_attempted: record.tasks_attempted,
      tasks_passed: record.tasks_passed,
    }));
    console.log(JSON.stringify({ entries, total_tiers: entries.length }));

  } else {
    console.error(JSON.stringify({ error: "Usage: trust.ts <query|update|list> ..." }));
    process.exit(1);
  }
}

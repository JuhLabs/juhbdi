import { describe, expect, test } from "bun:test";
import { scoreMessage } from "../auto-trigger/score";
import { DEFAULT_RULES } from "../auto-trigger/rules";
import { speculate } from "../memory/speculate";
import { extractPrinciples, type WaveResult } from "../memory/reflect";
import { computeTrustScore, updateTrustRecord, type TrustRecord } from "../routing/trust";
import { estimateDifficulty } from "../routing/difficulty";
import { extractKnowledge } from "../repomap/knowledge";
import type { ExperienceTripletV2 } from "../memory/types";
import type { PrincipleBank } from "../memory/principle-types";
import type { RepoMap } from "../repomap/types";

describe("M10 end-to-end flow", () => {
  test("auto-trigger → speculate → reflect → trust update → difficulty", () => {
    // Step 1: Auto-trigger
    const suggestions = scoreMessage("build a user authentication system", DEFAULT_RULES);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].rule.command).toBe("/juhbdi:plan");

    // Step 2: Speculate
    const triplets: ExperienceTripletV2[] = [{
      id: "t-past", timestamp: "2026-03-07T10:00:00Z",
      intent: { goal_refs: ["g-1"], task_description: "Implement user authentication with JWT", domain_tags: ["auth"] },
      experience: { approach: "Used bcrypt + JWT + Zod validation", files_modified: ["src/auth/login.ts"], test_result: "pass", strikes_used: 0, banned_approaches: [] },
      utility: 0.9, keywords: ["auth", "jwt", "user", "bcrypt"], related_memories: [],
    }];
    const spec = speculate("implement user authentication", triplets, []);
    expect(spec).not.toBeNull();
    expect(spec!.recommended_approach).toContain("bcrypt");

    // Step 3: Reflect
    const wave: WaveResult = { wave_id: "w1", outcomes: [{
      task_id: "t-new", planned_approach: "Use bcrypt + JWT",
      actual_approach: "Used argon2 + JWT with refresh tokens",
      description: "Implement auth", domain_tags: ["auth"], test_passed: true, files_modified: ["src/auth.ts"],
    }]};
    const emptyBank: PrincipleBank = { version: "1.0.0", principles: [] };
    const principles = extractPrinciples(wave, emptyBank);
    expect(principles.length).toBe(1);

    // Step 4: Trust update
    const record: TrustRecord = { agent_tier: "sonnet", tasks_attempted: 5, tasks_passed: 4, avg_strikes: 0.4, violation_count: 0, last_10_outcomes: ["pass","pass","fail","pass","pass"] };
    const updated = updateTrustRecord(record, { passed: true, strikes: 0, violation: false });
    expect(updated.tasks_passed).toBe(5);
    expect(computeTrustScore(updated)).toBeGreaterThan(computeTrustScore(record));

    // Step 5: Difficulty
    const diff = estimateDifficulty({ description: "Implement auth with JWT", affected_file_count: 3, verification_type: "test", historical_failure_rate: 0.1, technical_term_count: 4 });
    expect(diff).toBeGreaterThan(0.2);
    expect(diff).toBeLessThan(0.9);
  });

  test("GraphRAG knowledge extraction", () => {
    const map: RepoMap = {
      files: [
        { path: "src/a.ts", symbols: [{ name: "fn", kind: "function", exported: true, line: 1 }], imports: [{ specifier: "./b" }], hash: "a" },
        { path: "src/b.ts", symbols: [{ name: "helper", kind: "function", exported: true, line: 1 }], imports: [], hash: "b" },
        { path: "src/c.ts", symbols: [{ name: "main", kind: "function", exported: true, line: 1 }], imports: [{ specifier: "./a" }, { specifier: "./b" }], hash: "c" },
      ],
      edges: [
        { from_file: "src/a.ts", to_file: "src/b.ts", identifiers: ["helper"], weight: 1, edge_type: "import" },
        { from_file: "src/c.ts", to_file: "src/a.ts", identifiers: ["fn"], weight: 1, edge_type: "call" },
        { from_file: "src/c.ts", to_file: "src/b.ts", identifiers: ["helper"], weight: 1, edge_type: "import" },
      ],
      pagerank: { "src/b.ts": 0.5, "src/a.ts": 0.35, "src/c.ts": 0.15 },
      generated_at: "2026-03-08T10:00:00Z", token_count: 50,
    };
    const facts = extractKnowledge(map);
    expect(facts.length).toBeGreaterThan(0);
    const hotPath = facts.find((f) => f.type === "hot_path");
    expect(hotPath).toBeDefined();
  });
});

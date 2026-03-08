import { describe, expect, test } from "bun:test";
import { findRelated, linkMemory } from "./linker";
import type { ExperienceTripletV2 } from "./types";

const makeV2 = (id: string, desc: string, keywords: string[], files: string[] = [], tags: string[] = []): ExperienceTripletV2 => ({
  id, timestamp: "2026-03-08T00:00:00.000Z",
  intent: { goal_refs: [], task_description: desc, domain_tags: tags },
  experience: { approach: "direct", files_modified: files, test_result: "pass", strikes_used: 0, banned_approaches: [] },
  utility: 1.0, keywords, related_memories: [],
});

describe("findRelated", () => {
  test("finds memories with keyword overlap", () => {
    const links = findRelated(makeV2("new", "add auth", ["auth", "jwt", "middleware"]), [
      makeV2("t1", "auth setup", ["auth", "session", "jwt"]),
      makeV2("t2", "database pool", ["database", "pool", "postgres"]),
    ]);
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links[0].id).toBe("t1");
  });

  test("finds memories with shared files", () => {
    const links = findRelated(makeV2("new", "fix bug", ["bug"], ["src/auth.ts"]), [
      makeV2("t1", "auth work", ["auth"], ["src/auth.ts", "src/user.ts"]),
      makeV2("t2", "db work", ["database"], ["src/db.ts"]),
    ]);
    expect(links.some((l) => l.id === "t1")).toBe(true);
  });

  test("finds memories with shared domain tags", () => {
    const links = findRelated(makeV2("new", "add login", ["login"], [], ["auth"]), [
      makeV2("t1", "session mgmt", ["session"], [], ["auth", "session"]),
      makeV2("t2", "api route", ["api"], [], ["api"]),
    ]);
    expect(links.some((l) => l.id === "t1")).toBe(true);
  });

  test("returns empty for no matches", () => {
    expect(findRelated(makeV2("new", "build ui", ["react", "frontend"]), [makeV2("t1", "db migration", ["database", "migration"])])).toEqual([]);
  });

  test("limits to top 10 links", () => {
    const existing = Array.from({ length: 20 }, (_, i) => makeV2(`t${i}`, `task ${i}`, ["common"]));
    expect(findRelated(makeV2("new", "common", ["common"]), existing).length).toBeLessThanOrEqual(10);
  });

  test("does not link to itself", () => {
    const target = makeV2("t1", "auth", ["auth"]);
    expect(findRelated(target, [target])).toEqual([]);
  });
});

describe("linkMemory", () => {
  test("adds cross-links to new triplet and updates existing", () => {
    const { updated, linked } = linkMemory(makeV2("new", "add auth", ["auth", "jwt"]), [
      makeV2("t1", "auth setup", ["auth", "session"]),
      makeV2("t2", "database", ["database"]),
    ]);
    expect(updated.related_memories.length).toBeGreaterThan(0);
    expect(linked.find((t) => t.id === "t1")?.related_memories.some((l) => l.id === "new")).toBe(true);
  });

  test("preserves existing links on updated memories", () => {
    const existingWithLinks: ExperienceTripletV2 = { ...makeV2("t1", "auth", ["auth"]), related_memories: [{ id: "t0", relation: "similar_approach", strength: 0.9 }] };
    const { linked } = linkMemory(makeV2("new", "auth login", ["auth", "login"]), [existingWithLinks]);
    const t1 = linked.find((t) => t.id === "t1");
    expect(t1?.related_memories.some((l) => l.id === "t0")).toBe(true);
    expect(t1?.related_memories.some((l) => l.id === "new")).toBe(true);
  });

  test("assigns relation types", () => {
    const { updated } = linkMemory(makeV2("new", "fix auth", ["auth", "fix"], ["src/auth.ts"], ["auth"]), [makeV2("t1", "build auth", ["auth", "build"], ["src/auth.ts"], ["auth"])]);
    expect(updated.related_memories[0].relation).toBeTruthy();
    expect(updated.related_memories[0].strength).toBeGreaterThan(0);
  });
});

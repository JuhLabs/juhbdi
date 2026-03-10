import { describe, test, expect } from "bun:test";
import { verifyTask } from "./task-verifier";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("task-verifier", () => {
  test("returns structured result from verifier chain", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "juhbdi-verify-"));
    // Create minimal package.json so chain can detect project type
    writeFileSync(join(tmpDir, "package.json"), JSON.stringify({ scripts: {} }));

    try {
      const result = await verifyTask(tmpDir);
      expect(result).toHaveProperty("allPassed");
      expect(result).toHaveProperty("summary");
      expect(result.trailFields).toHaveProperty("all_passed");
      expect(result.trailFields).toHaveProperty("steps_run");
      expect(result.trailFields).toHaveProperty("duration_ms");
      expect(typeof result.trailFields.steps_run).toBe("number");
      expect(typeof result.trailFields.duration_ms).toBe("number");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test("includes chainResult for detailed inspection", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "juhbdi-verify2-"));
    writeFileSync(join(tmpDir, "package.json"), JSON.stringify({ scripts: {} }));

    try {
      const result = await verifyTask(tmpDir);
      expect(result.chainResult).toBeDefined();
      expect(result.chainResult).toHaveProperty("all_passed");
      expect(result.chainResult).toHaveProperty("results");
      expect(Array.isArray(result.chainResult.results)).toBe(true);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

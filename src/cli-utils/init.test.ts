// src/cli-utils/init.test.ts
import { describe, test, expect, afterEach } from "bun:test";
import { mkdtemp, rm, readFile, stat } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { quickInit } from "./init";

async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "juhbdi-init-test-"));
}

describe("quickInit", () => {
  let tempDir: string;
  afterEach(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  test("creates .juhbdi/ directory", async () => {
    tempDir = await makeTempDir();
    await quickInit(tempDir);
    const s = await stat(join(tempDir, ".juhbdi"));
    expect(s.isDirectory()).toBe(true);
  });

  test("creates state.json with valid structure", async () => {
    tempDir = await makeTempDir();
    await quickInit(tempDir);
    const raw = await readFile(join(tempDir, ".juhbdi", "state.json"), "utf-8");
    const state = JSON.parse(raw);
    expect(state.version).toBe("1.0.0");
    expect(state.project_name).toBeDefined();
    expect(Array.isArray(state.conventions)).toBe(true);
    expect(typeof state.architecture).toBe("string");
    expect(typeof state.compressed_history).toBe("string");
    expect(typeof state.last_updated).toBe("string");
  });

  test("creates config.json with sane defaults", async () => {
    tempDir = await makeTempDir();
    await quickInit(tempDir);
    const raw = await readFile(join(tempDir, ".juhbdi", "config.json"), "utf-8");
    const config = JSON.parse(raw);
    expect(config.model).toBe("claude-sonnet-4-6");
    expect(config.hitl_mode).toBe("prompt");
  });

  test("creates decision-trail.log", async () => {
    tempDir = await makeTempDir();
    await quickInit(tempDir);
    const s = await stat(join(tempDir, ".juhbdi", "decision-trail.log"));
    expect(s.isFile()).toBe(true);
  });

  test("does NOT create intent-spec.json", async () => {
    tempDir = await makeTempDir();
    await quickInit(tempDir);
    try {
      await stat(join(tempDir, ".juhbdi", "intent-spec.json"));
      expect(true).toBe(false);
    } catch { expect(true).toBe(true); }
  });

  test("does NOT create user-preferences.json", async () => {
    tempDir = await makeTempDir();
    await quickInit(tempDir);
    try {
      await stat(join(tempDir, ".juhbdi", "user-preferences.json"));
      expect(true).toBe(false);
    } catch { expect(true).toBe(true); }
  });

  test("is idempotent — does not throw if .juhbdi/ exists", async () => {
    tempDir = await makeTempDir();
    await quickInit(tempDir);
    await quickInit(tempDir);
    const raw = await readFile(join(tempDir, ".juhbdi", "state.json"), "utf-8");
    expect(JSON.parse(raw).version).toBe("1.0.0");
  });

  test("infers project name from directory name", async () => {
    tempDir = await makeTempDir();
    await quickInit(tempDir);
    const raw = await readFile(join(tempDir, ".juhbdi", "state.json"), "utf-8");
    const state = JSON.parse(raw);
    expect(state.project_name.length).toBeGreaterThan(0);
  });
});

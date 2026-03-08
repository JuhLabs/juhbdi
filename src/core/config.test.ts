import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { findProjectRoot, loadConfig, type ProjectConfig } from "./config";
import { mkdtemp, rm, mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

describe("Config", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "juhbdi-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true });
  });

  test("findProjectRoot locates .juhbdi directory", async () => {
    const juhbdiDir = join(tmpDir, ".juhbdi");
    await mkdir(juhbdiDir);

    const root = await findProjectRoot(tmpDir);
    expect(root).toBe(tmpDir);
  });

  test("findProjectRoot returns null if no .juhbdi exists", async () => {
    const root = await findProjectRoot(tmpDir);
    expect(root).toBeNull();
  });

  test("loadConfig reads config.json from .juhbdi", async () => {
    const juhbdiDir = join(tmpDir, ".juhbdi");
    await mkdir(juhbdiDir);

    const config: ProjectConfig = {
      model: "claude-sonnet-4-6",
      hitl_mode: "prompt",
    };
    await writeFile(
      join(juhbdiDir, "config.json"),
      JSON.stringify(config)
    );

    const loaded = await loadConfig(tmpDir);
    expect(loaded.model).toBe("claude-sonnet-4-6");
    expect(loaded.hitl_mode).toBe("prompt");
  });

  test("loadConfig returns defaults if config.json missing", async () => {
    const juhbdiDir = join(tmpDir, ".juhbdi");
    await mkdir(juhbdiDir);

    const loaded = await loadConfig(tmpDir);
    expect(loaded.model).toBe("claude-sonnet-4-6");
    expect(loaded.hitl_mode).toBe("prompt");
  });
});

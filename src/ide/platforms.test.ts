import { describe, test, expect } from "bun:test";
import { PLATFORMS, getPlatform, listPlatforms, detectInstalledIDEs } from "./platforms";
import { PlatformConfigSchema } from "./types";
import fs from "fs";
import path from "path";
import os from "os";

describe("Platform Registry", () => {
  test("has 17 platforms", () => {
    expect(Object.keys(PLATFORMS).length).toBe(17);
  });

  test("all platforms validate against schema", () => {
    for (const [code, config] of Object.entries(PLATFORMS)) {
      expect(() => PlatformConfigSchema.parse(config)).not.toThrow();
    }
  });

  test("getPlatform returns correct platform", () => {
    const cursor = getPlatform("cursor");
    expect(cursor?.name).toBe("Cursor");
    expect(cursor?.target_dir).toBe(".cursor/commands/");
  });

  test("getPlatform returns undefined for unknown", () => {
    expect(getPlatform("nonexistent")).toBeUndefined();
  });

  test("listPlatforms returns all platforms", () => {
    expect(listPlatforms().length).toBe(17);
  });

  test("all platforms have unique codes", () => {
    const codes = Object.keys(PLATFORMS);
    expect(new Set(codes).size).toBe(codes.length);
  });

  test("detectInstalledIDEs finds cursor directory", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "juhbdi-test-"));
    fs.mkdirSync(path.join(tmpDir, ".cursor"), { recursive: true });
    const detected = detectInstalledIDEs(tmpDir);
    expect(detected).toContain("cursor");
    fs.rmSync(tmpDir, { recursive: true });
  });
});

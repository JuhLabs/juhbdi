import { describe, test, expect } from "bun:test";
import { ContextBridgeSchema, type ContextBridge } from "../schemas/context-bridge";
import { readBridge, writeBridge } from "./context-bridge";
import { existsSync, unlinkSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("ContextBridgeSchema", () => {
  test("validates a valid bridge object", () => {
    const bridge = {
      session_id: "abc-123",
      remaining_pct: 42.5,
      usable_pct: 38.2,
      timestamp: new Date().toISOString(),
    };
    const result = ContextBridgeSchema.parse(bridge);
    expect(result.session_id).toBe("abc-123");
    expect(result.remaining_pct).toBe(42.5);
  });

  test("rejects negative remaining_pct", () => {
    expect(() =>
      ContextBridgeSchema.parse({
        session_id: "x",
        remaining_pct: -5,
        usable_pct: 0,
        timestamp: new Date().toISOString(),
      })
    ).toThrow();
  });

  test("rejects remaining_pct over 100", () => {
    expect(() =>
      ContextBridgeSchema.parse({
        session_id: "x",
        remaining_pct: 105,
        usable_pct: 100,
        timestamp: new Date().toISOString(),
      })
    ).toThrow();
  });
});

describe("readBridge / writeBridge", () => {
  const testDir = join(tmpdir(), "juhbdi-bridge-test");
  const testPath = join(testDir, "bridge.json");

  test("writeBridge creates valid JSON file", () => {
    mkdirSync(testDir, { recursive: true });
    const data: ContextBridge = {
      session_id: "test-session",
      remaining_pct: 55.0,
      usable_pct: 48.5,
      timestamp: new Date().toISOString(),
    };
    writeBridge(testPath, data);
    expect(existsSync(testPath)).toBe(true);
    unlinkSync(testPath);
  });

  test("readBridge returns null for missing file", () => {
    const result = readBridge("/tmp/nonexistent-juhbdi-bridge.json");
    expect(result).toBeNull();
  });

  test("readBridge round-trips with writeBridge", () => {
    mkdirSync(testDir, { recursive: true });
    const data: ContextBridge = {
      session_id: "roundtrip",
      remaining_pct: 72.3,
      usable_pct: 65.8,
      timestamp: "2026-03-03T18:00:00.000Z",
    };
    writeBridge(testPath, data);
    const result = readBridge(testPath);
    expect(result).not.toBeNull();
    expect(result!.session_id).toBe("roundtrip");
    expect(result!.remaining_pct).toBe(72.3);
    unlinkSync(testPath);
  });

  test("readBridge returns null for invalid JSON", () => {
    mkdirSync(testDir, { recursive: true });
    require("fs").writeFileSync(testPath, "not json");
    const result = readBridge(testPath);
    expect(result).toBeNull();
    unlinkSync(testPath);
  });
});

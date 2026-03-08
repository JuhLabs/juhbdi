import { readFileSync, writeFileSync } from "fs";
import { ContextBridgeSchema, type ContextBridge } from "../schemas/context-bridge";

export function readBridge(path: string): ContextBridge | null {
  try {
    const raw = readFileSync(path, "utf-8");
    return ContextBridgeSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeBridge(path: string, data: ContextBridge): void {
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

export function bridgePath(sessionId: string): string {
  return `/tmp/juhbdi-ctx-${sessionId}.json`;
}

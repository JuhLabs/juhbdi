import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { sendMessage, readMessages, clearMessages, getMailboxStats } from "./agent-messaging";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("agent-messaging", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "juhbdi-msg-test-"));
    fs.mkdirSync(path.join(tmpDir, ".juhbdi"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("sendMessage", () => {
    test("sends a message and returns it with id and timestamp", () => {
      const msg = sendMessage(tmpDir, {
        from_agent: "task-executor",
        to_agent: "librarian",
        type: "info",
        subject: "Task complete",
        body: "Finished implementing user model",
      });

      expect(msg.id).toStartWith("msg-");
      expect(msg.timestamp).toBeTruthy();
      expect(msg.read).toBe(false);
      expect(msg.from_agent).toBe("task-executor");
      expect(msg.to_agent).toBe("librarian");
    });

    test("persists message to mailbox file", () => {
      sendMessage(tmpDir, {
        from_agent: "a",
        to_agent: "b",
        type: "info",
        subject: "test",
        body: "body",
      });

      const mailboxPath = path.join(tmpDir, ".juhbdi", "agent-mailbox.json");
      expect(fs.existsSync(mailboxPath)).toBe(true);

      const data = JSON.parse(fs.readFileSync(mailboxPath, "utf-8"));
      expect(data.messages).toHaveLength(1);
    });

    test("supports metadata field", () => {
      const msg = sendMessage(tmpDir, {
        from_agent: "a",
        to_agent: "b",
        type: "request",
        subject: "need review",
        body: "please review",
        metadata: { task_id: "t1", wave_id: "w1" },
      });

      expect(msg.metadata).toEqual({ task_id: "t1", wave_id: "w1" });
    });
  });

  describe("readMessages", () => {
    test("reads messages for a specific agent", () => {
      sendMessage(tmpDir, {
        from_agent: "a",
        to_agent: "b",
        type: "info",
        subject: "for b",
        body: "hello b",
      });
      sendMessage(tmpDir, {
        from_agent: "a",
        to_agent: "c",
        type: "info",
        subject: "for c",
        body: "hello c",
      });

      const msgs = readMessages(tmpDir, "b");
      expect(msgs).toHaveLength(1);
      expect(msgs[0].subject).toBe("for b");
    });

    test("marks messages as read", () => {
      sendMessage(tmpDir, {
        from_agent: "a",
        to_agent: "b",
        type: "info",
        subject: "test",
        body: "body",
      });

      readMessages(tmpDir, "b");

      // Second read with unreadOnly should return empty
      const unread = readMessages(tmpDir, "b", { unreadOnly: true });
      expect(unread).toHaveLength(0);
    });

    test("filters by type", () => {
      sendMessage(tmpDir, {
        from_agent: "a",
        to_agent: "b",
        type: "info",
        subject: "info msg",
        body: "body",
      });
      sendMessage(tmpDir, {
        from_agent: "a",
        to_agent: "b",
        type: "warning",
        subject: "warning msg",
        body: "body",
      });

      const warnings = readMessages(tmpDir, "b", { type: "warning" });
      expect(warnings).toHaveLength(1);
      expect(warnings[0].subject).toBe("warning msg");
    });

    test("returns empty array when no messages exist", () => {
      const msgs = readMessages(tmpDir, "nonexistent");
      expect(msgs).toHaveLength(0);
    });
  });

  describe("clearMessages", () => {
    test("clears read messages for a specific agent", () => {
      sendMessage(tmpDir, {
        from_agent: "a",
        to_agent: "b",
        type: "info",
        subject: "test",
        body: "body",
      });

      // Read to mark as read
      readMessages(tmpDir, "b");

      const removed = clearMessages(tmpDir, "b");
      expect(removed).toBe(1);
    });

    test("does not clear unread messages", () => {
      sendMessage(tmpDir, {
        from_agent: "a",
        to_agent: "b",
        type: "info",
        subject: "test",
        body: "body",
      });

      const removed = clearMessages(tmpDir, "b");
      expect(removed).toBe(0);
    });

    test("clears all read messages when no agent specified", () => {
      sendMessage(tmpDir, {
        from_agent: "a",
        to_agent: "b",
        type: "info",
        subject: "for b",
        body: "body",
      });
      sendMessage(tmpDir, {
        from_agent: "a",
        to_agent: "c",
        type: "info",
        subject: "for c",
        body: "body",
      });

      readMessages(tmpDir, "b");
      readMessages(tmpDir, "c");

      const removed = clearMessages(tmpDir);
      expect(removed).toBe(2);
    });
  });

  describe("getMailboxStats", () => {
    test("returns correct stats", () => {
      sendMessage(tmpDir, {
        from_agent: "a",
        to_agent: "b",
        type: "info",
        subject: "1",
        body: "body",
      });
      sendMessage(tmpDir, {
        from_agent: "a",
        to_agent: "b",
        type: "info",
        subject: "2",
        body: "body",
      });
      sendMessage(tmpDir, {
        from_agent: "a",
        to_agent: "c",
        type: "info",
        subject: "3",
        body: "body",
      });

      readMessages(tmpDir, "b"); // marks 2 as read

      const stats = getMailboxStats(tmpDir);
      expect(stats.total).toBe(3);
      expect(stats.unread).toBe(1);
      expect(stats.byAgent).toEqual({ b: 2, c: 1 });
    });

    test("returns empty stats when no mailbox", () => {
      const stats = getMailboxStats(tmpDir);
      expect(stats.total).toBe(0);
      expect(stats.unread).toBe(0);
      expect(stats.byAgent).toEqual({});
    });
  });
});

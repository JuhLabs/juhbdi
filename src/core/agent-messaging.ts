/**
 * Inter-agent file-based messaging system.
 * Agents can send messages to each other through a shared mailbox file
 * stored at .juhbdi/agent-mailbox.json.
 */

import { existsSync, readFileSync, writeFileSync, renameSync } from "fs";
import { join } from "path";
import {
  AgentMailboxSchema,
  type AgentMessage,
  type AgentMailbox,
} from "../schemas/agent-message";

const MAILBOX_FILE = "agent-mailbox.json";

function mailboxPath(projectDir: string): string {
  return join(projectDir, ".juhbdi", MAILBOX_FILE);
}

function loadMailbox(projectDir: string): AgentMailbox {
  const p = mailboxPath(projectDir);
  if (!existsSync(p)) {
    return { version: "1.0.0", messages: [] };
  }
  const raw = JSON.parse(readFileSync(p, "utf-8"));
  return AgentMailboxSchema.parse(raw);
}

function saveMailbox(projectDir: string, mailbox: AgentMailbox): void {
  const p = mailboxPath(projectDir);
  const tmp = p + ".tmp";
  writeFileSync(tmp, JSON.stringify(mailbox, null, 2) + "\n");
  renameSync(tmp, p);
}

export function sendMessage(
  projectDir: string,
  message: Omit<AgentMessage, "id" | "timestamp" | "read">,
): AgentMessage {
  const mailbox = loadMailbox(projectDir);
  const full: AgentMessage = {
    ...message,
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    read: false,
  };
  mailbox.messages.push(full);
  saveMailbox(projectDir, mailbox);
  return full;
}

export function readMessages(
  projectDir: string,
  agentId: string,
  options?: { unreadOnly?: boolean; type?: AgentMessage["type"] },
): AgentMessage[] {
  const mailbox = loadMailbox(projectDir);
  let messages = mailbox.messages.filter((m) => m.to_agent === agentId);

  if (options?.unreadOnly) {
    messages = messages.filter((m) => !m.read);
  }
  if (options?.type) {
    messages = messages.filter((m) => m.type === options.type);
  }

  // Mark as read
  if (messages.length > 0) {
    const readIds = new Set(messages.map((m) => m.id));
    for (const msg of mailbox.messages) {
      if (readIds.has(msg.id)) {
        msg.read = true;
      }
    }
    saveMailbox(projectDir, mailbox);
  }

  return messages;
}

export function clearMessages(
  projectDir: string,
  agentId?: string,
): number {
  const mailbox = loadMailbox(projectDir);
  const before = mailbox.messages.length;

  if (agentId) {
    mailbox.messages = mailbox.messages.filter(
      (m) => m.to_agent !== agentId || !m.read,
    );
  } else {
    mailbox.messages = mailbox.messages.filter((m) => !m.read);
  }

  const removed = before - mailbox.messages.length;
  if (removed > 0) {
    saveMailbox(projectDir, mailbox);
  }
  return removed;
}

export function getMailboxStats(projectDir: string): {
  total: number;
  unread: number;
  byAgent: Record<string, number>;
} {
  const mailbox = loadMailbox(projectDir);
  const unread = mailbox.messages.filter((m) => !m.read).length;
  const byAgent: Record<string, number> = {};
  for (const msg of mailbox.messages) {
    byAgent[msg.to_agent] = (byAgent[msg.to_agent] || 0) + 1;
  }
  return { total: mailbox.messages.length, unread, byAgent };
}

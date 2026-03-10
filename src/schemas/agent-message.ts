import { z } from "zod";

export const AgentMessageSchema = z.object({
  id: z.string().min(1),
  from_agent: z.string().min(1),
  to_agent: z.string().min(1),
  type: z.enum(["info", "warning", "request", "response", "handoff"]),
  subject: z.string().min(1),
  body: z.string(),
  metadata: z.record(z.string(), z.string()).optional(),
  timestamp: z.iso.datetime(),
  read: z.boolean().default(false),
});

export type AgentMessage = z.infer<typeof AgentMessageSchema>;

export const AgentMailboxSchema = z.object({
  version: z.literal("1.0.0"),
  messages: z.array(AgentMessageSchema),
});

export type AgentMailbox = z.infer<typeof AgentMailboxSchema>;

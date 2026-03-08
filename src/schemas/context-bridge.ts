import { z } from "zod";

export const ContextBridgeSchema = z.object({
  session_id: z.string().min(1),
  remaining_pct: z.number().min(0).max(100),
  usable_pct: z.number().min(0).max(100),
  timestamp: z.string().datetime(),
});

export type ContextBridge = z.infer<typeof ContextBridgeSchema>;

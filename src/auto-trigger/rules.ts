import { z } from "zod/v4";

export const TriggerRuleSchema = z.object({
  id: z.string(),
  patterns: z.array(z.string()),
  command: z.string(),
  confidence: z.number().min(0).max(1),
  description: z.string(),
});

export type TriggerRule = z.infer<typeof TriggerRuleSchema>;

export const DEFAULT_RULES: TriggerRule[] = [
  {
    id: "plan-suggest",
    patterns: [
      "build\\s+(?:a|the)?\\s*[\\w\\s]+(?:system|feature|module|service|api|app)",
      "implement\\s+(?:a|the)?\\s*\\w+",
      "create\\s+(?:a|the)?\\s*(?:new\\s+)?\\w+\\s+(?:system|feature|module|service)",
      "add\\s+(?:a|the)?\\s*(?:new\\s+)?(?:feature|module|system)",
      "design\\s+(?:a|the)?\\s*\\w+",
      "refactor\\s+(?:the)?\\s*\\w+",
      "migrate\\s+(?:from|to)",
    ],
    command: "/juhbdi:plan",
    confidence: 0.8,
    description: "Multi-step task detected — plan first for best results",
  },
  {
    id: "quick-suggest",
    patterns: [
      "fix\\s+(?:the|this|a)?\\s*(?:bug|typo|error|issue|lint)",
      "rename\\s+\\w+",
      "update\\s+(?:the)?\\s*(?:version|import|dependency|readme)",
      "change\\s+\\w+\\s+to\\s+\\w+",
      "add\\s+(?:a)?\\s*(?:comment|log|type|test)\\b",
      "remove\\s+(?:the)?\\s*(?:unused|dead|old)",
    ],
    command: "/juhbdi:quick",
    confidence: 0.8,
    description: "Quick fix detected — fast-track with /juhbdi:quick",
  },
  {
    id: "status-suggest",
    patterns: [
      "(?:show|what(?:'s| is))\\s+(?:\\w+\\s+)*(?:the\\s+)?(?:status|progress|state)",
      "where\\s+(?:are|am)\\s+(?:we|i)",
      "how\\s+(?:far|much)\\s+(?:along|done|left)",
    ],
    command: "/juhbdi:status",
    confidence: 0.85,
    description: "Status query detected",
  },
  {
    id: "trail-suggest",
    patterns: [
      "(?:show|view|what)\\s+(?:the)?\\s*(?:audit|trail|log|history|decisions)",
      "what\\s+happened",
      "show\\s+(?:me)?\\s*(?:the)?\\s*(?:last|recent)\\s+(?:changes|decisions|actions)",
    ],
    command: "/juhbdi:trail",
    confidence: 0.85,
    description: "Audit trail query detected",
  },
  {
    id: "execute-suggest",
    patterns: [
      "continue\\s+(?:the)?\\s*(?:work|execution|tasks|plan)",
      "run\\s+(?:the)?\\s*(?:next|remaining|pending)",
      "execute\\s+(?:the)?\\s*(?:plan|roadmap|tasks)",
      "let(?:'s| us)\\s+(?:keep|continue|proceed)",
    ],
    command: "/juhbdi:execute",
    confidence: 0.8,
    description: "Pending tasks detected — continue execution",
  },
];

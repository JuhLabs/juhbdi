import { z } from "zod";

export const FailureCategorySchema = z.enum([
  "type_error",
  "import_error",
  "test_assertion",
  "runtime_error",
  "syntax_error",
  "timeout",
  "dependency_conflict",
  "logic_error",
  "unknown",
]);

export type FailureCategory = z.infer<typeof FailureCategorySchema>;

export const FailureClassificationSchema = z.object({
  category: FailureCategorySchema,
  confidence: z.number().min(0).max(1),
  error_signature: z.string(),
  suggested_recovery: z.string(),
});

export type FailureClassification = z.infer<typeof FailureClassificationSchema>;

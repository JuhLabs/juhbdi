import { z } from "zod";

export const TestSnapshotSchema = z.object({
  total: z.number().int().min(0),
  passed: z.number().int().min(0),
  failed: z.number().int().min(0),
  failure_names: z.array(z.string()),
});

export type TestSnapshot = z.infer<typeof TestSnapshotSchema>;

export const TNRCheckpointSchema = z.object({
  hash: z.string().min(1),
  timestamp: z.iso.datetime(),
  test_snapshot: TestSnapshotSchema,
});

export type TNRCheckpoint = z.infer<typeof TNRCheckpointSchema>;

export const TNRResultSchema = z.object({
  checkpoint: TNRCheckpointSchema,
  post_attempt: TestSnapshotSchema,
  verdict: z.enum(["improved", "stable", "regressed"]),
  new_failures: z.array(z.string()),
  fixed_failures: z.array(z.string()),
});

export type TNRResult = z.infer<typeof TNRResultSchema>;

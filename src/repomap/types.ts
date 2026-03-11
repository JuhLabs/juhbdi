import { z } from "zod";

export const SymbolKindSchema = z.enum([
  "function", "class", "interface", "type", "enum", "variable", "import",
  "call_ref", "re_export",
]);

export type SymbolKind = z.infer<typeof SymbolKindSchema>;

export const SymbolSchema = z.object({
  name: z.string().min(1),
  kind: SymbolKindSchema,
  exported: z.boolean(),
  line: z.number().int().min(1),
  complexity: z.number().int().min(0).optional(),
});

export type Symbol = z.infer<typeof SymbolSchema>;

export const ImportRefSchema = z.object({
  specifier: z.string().min(1),
  resolved: z.string().optional(),
});

export type ImportRef = z.infer<typeof ImportRefSchema>;

export const FileNodeSchema = z.object({
  path: z.string().min(1),
  symbols: z.array(SymbolSchema),
  imports: z.array(ImportRefSchema),
  hash: z.string().min(1),
});

export type FileNode = z.infer<typeof FileNodeSchema>;

export const EdgeTypeSchema = z.enum(["import", "call", "type_ref", "re_export"]);

export type EdgeType = z.infer<typeof EdgeTypeSchema>;

export const DependencyEdgeSchema = z.object({
  from_file: z.string().min(1),
  to_file: z.string().min(1),
  identifiers: z.array(z.string().min(1)).min(1),
  weight: z.number().min(0),
  edge_type: EdgeTypeSchema,
});

export type DependencyEdge = z.infer<typeof DependencyEdgeSchema>;

export const RepoMapSchema = z.object({
  files: z.array(FileNodeSchema),
  edges: z.array(DependencyEdgeSchema),
  pagerank: z.record(z.string(), z.number()),
  generated_at: z.iso.datetime(),
  token_count: z.number().int().min(0),
});

export type RepoMap = z.infer<typeof RepoMapSchema>;

export interface LanguageParser {
  extensions: string[];
  parse(filePath: string, content: string): FileNode;
}

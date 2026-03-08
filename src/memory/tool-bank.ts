import type { ToolBank, ToolBankEntry } from "./tool-types";

export function registerTool(entry: ToolBankEntry, bank: ToolBank): ToolBank {
  if (bank.tools.some((t) => t.id === entry.id))
    throw new Error(`Tool with id '${entry.id}' already exists`);
  return { ...bank, tools: [...bank.tools, entry] };
}

export function queryTools(
  description: string,
  bank: ToolBank,
  topK: number,
): ToolBankEntry[] {
  const active = bank.tools.filter((t) => t.status === "active");
  if (active.length === 0) return [];
  const queryWords = new Set(
    description
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
  const scored = active.map((tool) => {
    const kwOverlap = tool.keywords.filter((k) => queryWords.has(k)).length;
    const nameWords = tool.name.toLowerCase().split(/[-_\s]+/);
    const nameOverlap = nameWords.filter((w) => queryWords.has(w)).length;
    const score =
      queryWords.size > 0
        ? (kwOverlap * 2 + nameOverlap) / (queryWords.size * 3)
        : 0;
    return { tool, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => s.tool);
}

export function recordToolUsage(toolId: string, bank: ToolBank): ToolBank {
  const idx = bank.tools.findIndex((t) => t.id === toolId);
  if (idx === -1) throw new Error(`Tool '${toolId}' not found`);
  const tools = [...bank.tools];
  tools[idx] = {
    ...tools[idx],
    usage_count: tools[idx].usage_count + 1,
    last_used: new Date().toISOString(),
  };
  return { ...bank, tools };
}

export function deprecateTool(toolId: string, bank: ToolBank): ToolBank {
  const idx = bank.tools.findIndex((t) => t.id === toolId);
  if (idx === -1) throw new Error(`Tool '${toolId}' not found`);
  const tools = [...bank.tools];
  tools[idx] = { ...tools[idx], status: "deprecated" };
  return { ...bank, tools };
}

// src/cli-utils/tool-bank.ts
import { resolveContext } from "./helpers";

if (import.meta.main) {
  const action = process.argv[2];
  const { readFile, writeFile, mkdir } = await import("fs/promises");
  const { join } = await import("path");
  const { ToolBankSchema } = await import("../memory/tool-types");
  const { registerTool, queryTools, recordToolUsage, deprecateTool } = await import("../memory/tool-bank");
  const { juhbdiDir } = await resolveContext();

  const bankPath = join(juhbdiDir, "tool-bank.json");

  async function loadBank() {
    try {
      const raw = await readFile(bankPath, "utf-8");
      return ToolBankSchema.parse(JSON.parse(raw));
    } catch {
      return { version: "1.0.0", tools: [] };
    }
  }

  async function saveBank(bank: ReturnType<typeof ToolBankSchema.parse>) {
    await writeFile(bankPath, JSON.stringify(bank, null, 2) + "\n");
  }

  if (action === "register") {
    const entryRaw = process.argv[3];
    if (!entryRaw) {
      console.error(JSON.stringify({ error: "Usage: tool-bank.ts register <entry_json>" }));
      process.exit(1);
    }
    const bank = await loadBank();
    const entry = JSON.parse(entryRaw);
    await mkdir(join(juhbdiDir, "tool-bank"), { recursive: true });
    const updated = registerTool(entry, bank);
    await saveBank(updated);
    console.log(JSON.stringify({ success: true, tool_id: entry.id, total_tools: updated.tools.length }));

  } else if (action === "query") {
    const description = process.argv[3];
    const topK = parseInt(process.argv[4] ?? "3", 10);
    if (!description) {
      console.error(JSON.stringify({ error: "Usage: tool-bank.ts query <description> [top_k]" }));
      process.exit(1);
    }
    const bank = await loadBank();
    const results = queryTools(description, bank, topK);
    console.log(JSON.stringify({ matches: results, total_in_bank: bank.tools.length }));

  } else if (action === "use") {
    const toolId = process.argv[3];
    if (!toolId) {
      console.error(JSON.stringify({ error: "Usage: tool-bank.ts use <tool_id>" }));
      process.exit(1);
    }
    const bank = await loadBank();
    const updated = recordToolUsage(toolId, bank);
    await saveBank(updated);
    console.log(JSON.stringify({ success: true, tool_id: toolId }));

  } else if (action === "deprecate") {
    const toolId = process.argv[3];
    if (!toolId) {
      console.error(JSON.stringify({ error: "Usage: tool-bank.ts deprecate <tool_id>" }));
      process.exit(1);
    }
    const bank = await loadBank();
    const updated = deprecateTool(toolId, bank);
    await saveBank(updated);
    console.log(JSON.stringify({ success: true, tool_id: toolId, status: "deprecated" }));

  } else {
    console.error(JSON.stringify({ error: "Usage: tool-bank.ts <register|query|use|deprecate> ..." }));
    process.exit(1);
  }
}

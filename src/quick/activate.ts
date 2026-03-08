export function generateActivationBlock(projectName: string): string {
  return `## JuhBDI Governance

This project uses JuhBDI for governed autonomous development.

### Active Rules
- **Governance**: Before modifying code, check \`.juhbdi/intent-spec.json\` for constraints. Never commit credential patterns or run destructive commands without HITL approval.
- **Memory**: Query \`.juhbdi/memory-bank.json\` for relevant past experiences before starting similar tasks. Record outcomes after completion.
- **Audit**: All autonomous decisions are logged to \`.juhbdi/decision-trail.log\` with SHA-256 hash chain.
- **Cost**: Route tasks to the cheapest viable model tier. Use \`/juhbdi:cost\` to review spending.

### Quick Tasks
For ad-hoc tasks, use \`/juhbdi:quick "<description>"\` instead of the full init/plan/execute pipeline. Quick mode still applies governance, routing, memory, and audit.

### Full Pipeline
For complex work: \`/juhbdi:init\` -> \`/juhbdi:plan "<request>"\` -> \`/juhbdi:execute\`

### Project: ${projectName}`;
}

export function shouldAppend(existingContent: string): boolean {
  return !existingContent.includes("## JuhBDI Governance");
}

if (import.meta.main) {
  const { readFile, writeFile } = await import("fs/promises");
  const { join } = await import("path");
  const { findProjectRoot, JUHBDI_DIR } = await import("../core/config");

  const cwd = process.cwd();
  const projectRoot = await findProjectRoot(cwd) ?? cwd;
  const claudeMdPath = join(projectRoot, "CLAUDE.md");

  let projectName = "project";
  try {
    const specRaw = await readFile(join(projectRoot, JUHBDI_DIR, "intent-spec.json"), "utf-8");
    projectName = JSON.parse(specRaw).project?.name ?? "project";
  } catch { /* use default */ }

  let existing = "";
  try {
    existing = await readFile(claudeMdPath, "utf-8");
  } catch { /* doesn't exist yet */ }

  if (!shouldAppend(existing)) {
    console.log(JSON.stringify({ success: false, reason: "JuhBDI section already exists in CLAUDE.md" }));
    process.exit(0);
  }

  const block = generateActivationBlock(projectName);
  const newContent = existing ? `${existing}\n\n${block}\n` : `${block}\n`;
  await writeFile(claudeMdPath, newContent);
  console.log(JSON.stringify({ success: true, path: claudeMdPath }));
}

// .claude-plugin/hooks/juhbdi-auto-trigger.cjs
//
// UserPromptSubmit hook — analyzes user message and suggests JuhBDI commands.
// Uses execFileSync to avoid shell injection.

const { execFileSync } = require("child_process");
const path = require("path");
const fs = require("fs");

async function main() {
  const input = JSON.parse(await new Promise((resolve) => {
    let data = "";
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
  }));

  const cwd = input.cwd || process.cwd();
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || path.join(__dirname, "..");
  const userMessage = input.user_message || "";

  if (!userMessage || userMessage.startsWith("/")) {
    console.log(JSON.stringify({}));
    return;
  }

  try {
    const bunPath = path.join(process.env.HOME || "", ".bun", "bin", "bun");
    const scriptPath = path.join(pluginRoot, "src", "auto-trigger", "score-cli.ts");

    const output = execFileSync(bunPath, ["run", scriptPath, userMessage], {
      cwd,
      timeout: 3000,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    const result = JSON.parse(output.trim());

    if (result.suggestion) {
      let extra = "";
      const juhbdiDir = path.join(cwd, ".juhbdi");
      if (fs.existsSync(path.join(juhbdiDir, "roadmap-intent.json"))) {
        try {
          const roadmap = JSON.parse(fs.readFileSync(path.join(juhbdiDir, "roadmap-intent.json"), "utf-8"));
          const pending = (roadmap.waves || [])
            .flatMap((w) => w.tasks || [])
            .filter((t) => t.status === "pending").length;
          if (pending > 0) {
            extra = ` (${pending} pending task${pending > 1 ? "s" : ""} in roadmap)`;
          }
        } catch { /* ignore */ }
      }

      console.log(JSON.stringify({
        additionalContext: `JuhBDI suggests: \`${result.suggestion.command}\` — ${result.suggestion.description}${extra}\n(Confidence: ${Math.round(result.suggestion.score * 100)}%. Ignore if not relevant.)`,
      }));
    } else {
      console.log(JSON.stringify({}));
    }
  } catch {
    console.log(JSON.stringify({}));
  }
}

main().catch(() => {
  console.log(JSON.stringify({}));
});

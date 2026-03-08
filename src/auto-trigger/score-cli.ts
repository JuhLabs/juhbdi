// src/auto-trigger/score-cli.ts
import { scoreMessage } from "./score";
import { DEFAULT_RULES } from "./rules";

const message = process.argv[2] ?? "";
if (!message) {
  console.log(JSON.stringify({ suggestion: null }));
  process.exit(0);
}

const results = scoreMessage(message, DEFAULT_RULES, 0.7);

if (results.length > 0) {
  const top = results[0];
  console.log(JSON.stringify({
    suggestion: {
      command: top.rule.command,
      description: top.rule.description,
      score: top.score,
    },
  }));
} else {
  console.log(JSON.stringify({ suggestion: null }));
}

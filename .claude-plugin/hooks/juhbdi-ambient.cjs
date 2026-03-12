// JuhBDI Ambient Collector — PostToolUse
// Passively collects development activity for dashboard
'use strict';

const fs = require('fs');
const path = require('path');

function categorize(toolName, toolInput) {
  if (toolName === 'Write' || toolName === 'Edit') return 'edit';
  if (toolName === 'Read' || toolName === 'Grep' || toolName === 'Glob') return 'read';
  if (toolName === 'Bash') {
    const cmd = toolInput?.command || '';
    if (/\b(bun\s+test|jest|vitest|pytest|npm\s+test)\b/i.test(cmd)) return 'test';
    if (/\bgit\b/i.test(cmd)) return 'git';
    if (/\b(build|compile|tsc|esbuild|webpack|vite)\b/i.test(cmd)) return 'build';
    return 'other';
  }
  return 'other';
}

function detectTestResult(toolResponse) {
  if (!toolResponse) return 'unknown';
  const out = typeof toolResponse === 'string' ? toolResponse : JSON.stringify(toolResponse);
  if (/FAIL|Error|✗|failed|AssertionError/i.test(out)) return 'fail';
  if (/PASS|✓|passed|ok\b/i.test(out)) return 'pass';
  return 'unknown';
}

function getTarget(toolName, toolInput) {
  if (toolName === 'Write' || toolName === 'Edit' || toolName === 'Read') return toolInput?.file_path;
  if (toolName === 'Bash') return (toolInput?.command || '').slice(0, 120);
  if (toolName === 'Grep') return toolInput?.pattern;
  if (toolName === 'Glob') return toolInput?.pattern;
  return undefined;
}

module.exports = function(input) {
  try {
    const projectDir = input?.cwd || process.cwd();
    const juhbdiDir = path.join(projectDir, '.juhbdi');
    if (!fs.existsSync(juhbdiDir)) return {};

    const toolName = input?.tool_use?.name || input?.tool_name || '';
    const toolInput = input?.tool_use?.input || input?.tool_input || {};
    const toolResponse = input?.tool_response || '';
    const sessionId = input?.session_id || 'unknown';

    const category = categorize(toolName, toolInput);
    const event = {
      tool: toolName,
      target: getTarget(toolName, toolInput),
      timestamp: new Date().toISOString(),
      category,
      session_id: sessionId,
      project_dir: projectDir,
    };

    if (category === 'test') {
      event.result = detectTestResult(toolResponse);
    }

    if (category === 'edit' && toolInput?.new_string && toolInput?.old_string) {
      const newLines = (toolInput.new_string.match(/\n/g) || []).length;
      const oldLines = (toolInput.old_string.match(/\n/g) || []).length;
      event.delta = newLines - oldLines;
    }

    const date = new Date().toISOString().slice(0, 10);
    const ambientPath = path.join(juhbdiDir, `ambient-${date}.jsonl`);
    fs.appendFileSync(ambientPath, JSON.stringify(event) + '\n');

    if (!module.exports._rotated) {
      module.exports._rotated = true;
      try {
        const files = fs.readdirSync(juhbdiDir).filter(f => f.startsWith('ambient-') && f.endsWith('.jsonl'));
        const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
        for (const f of files) {
          const dateStr = f.replace('ambient-', '').replace('.jsonl', '');
          if (new Date(dateStr).getTime() < cutoff) {
            fs.unlinkSync(path.join(juhbdiDir, f));
          }
        }
      } catch {}
    }
  } catch {}

  return {};
};

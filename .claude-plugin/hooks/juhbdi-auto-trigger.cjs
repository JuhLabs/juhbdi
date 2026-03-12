// JuhBDI Auto-Trigger Hook — Ghost Mode + Suggest/Escalate
// Event: UserPromptSubmit
// Ghost mode: inline scoring + nano governance (<20ms)
// Suggest/Escalate: subprocess for full scoring (existing behavior)
'use strict';

const fs = require('fs');
const path = require('path');

// --- Inline complexity scoring (mirrors src/nano/complexity.ts) ---
const COMPLEX_KW = /\b(architect|refactor|migrate|redesign|overhaul|multi.?file|across|system|pipeline|distributed)\b/ig;
const SIMPLE_KW = /\b(fix|typo|rename|format|update|tweak|change|adjust|bug|error|broken|quick|simple)\b/i;
const FILE_REF_RX = /\b[\w/.-]+\.(ts|js|tsx|jsx|css|html|json|md)\b/g;

function scoreComplexity(msg) {
  if (!msg) return 0;
  let score = 0;
  const words = msg.split(/\s+/).length;
  const clauses = msg.split(/[.;,!?\n]/).filter(Boolean).length;
  score += Math.min(words / 50, 0.3);
  score += Math.min(clauses / 6, 0.2);
  const complexMatches = (msg.match(COMPLEX_KW) || []).length;
  if (complexMatches > 0) score += Math.min(complexMatches * 0.25, 0.6);
  if (SIMPLE_KW.test(msg)) score -= 0.15;
  const fileRefs = (msg.match(FILE_REF_RX) || []).length;
  score += Math.min(fileRefs / 5, 0.2);
  return Math.max(0, Math.min(1, score));
}

// --- Inline nano governance (mirrors src/nano/govern.ts) ---
const CREDENTIAL_RX = /\b(API_KEY|SECRET|PASSWORD|TOKEN|PRIVATE.?KEY|AWS_SECRET_ACCESS_KEY|OPENAI_API_KEY)\s*[=:]/i;
const DESTRUCTIVE_RX = /\b(rm\s+-rf\s+\/|git\s+push\s+--force|git\s+reset\s+--hard|DROP\s+(TABLE|DATABASE))/i;
const INTERN_RESTRICTED_RX = /\b(write|delete|remove|push|deploy|overwrite|create)\b/i;

function nanoGovern(message, trustTier) {
  const ts = new Date().toISOString();
  if (CREDENTIAL_RX.test(message)) return { allowed: false, risk: 'flagged', reason: 'credential pattern detected', event_type: 'ghost-flagged', ts };
  if (DESTRUCTIVE_RX.test(message)) return { allowed: false, risk: 'flagged', reason: 'destructive command pattern detected', event_type: 'ghost-flagged', ts };
  if (trustTier === 'intern' && INTERN_RESTRICTED_RX.test(message)) return { allowed: false, risk: 'flagged', reason: 'trust tier "intern" — restricted action', event_type: 'ghost-flagged', ts };
  return { allowed: true, risk: 'none', event_type: 'ghost', ts };
}

// --- Read trust tier from trust-store.json ---
function readTrustTier(projectDir) {
  try {
    const raw = fs.readFileSync(path.join(projectDir, '.juhbdi', 'trust-store.json'), 'utf8');
    const data = JSON.parse(raw);
    return data?.tier || 'unknown';
  } catch { return 'unknown'; }
}

// --- Append trail entry (safe) ---
function appendTrail(projectDir, entry) {
  try {
    const trailPath = path.join(projectDir, '.juhbdi', 'decision-trail.log');
    const dir = path.dirname(trailPath);
    if (!fs.existsSync(dir)) return;
    fs.appendFileSync(trailPath, JSON.stringify(entry) + '\n');
  } catch { /* swallow ENOENT/EACCES */ }
}

// --- Update bridge file for dashboard ---
function updateBridge(sessionId, data) {
  try {
    const bridgePath = `/tmp/juhbdi-ctx-${sessionId}.json`;
    let bridge = {};
    try { bridge = JSON.parse(fs.readFileSync(bridgePath, 'utf8')); } catch {}
    bridge.last_ghost = data;
    fs.writeFileSync(bridgePath, JSON.stringify(bridge));
  } catch {}
}

// --- Main hook ---
module.exports = async function(input) {
  const message = input?.message || '';
  if (!message || message.startsWith('/')) return {};

  const projectDir = input?.cwd || process.cwd();
  const juhbdiDir = path.join(projectDir, '.juhbdi');

  if (!fs.existsSync(juhbdiDir)) return {};

  const complexity = scoreComplexity(message);

  // GHOST MODE (< 0.4): silent nano governance
  if (complexity < 0.4) {
    const trustTier = readTrustTier(projectDir);
    const gov = nanoGovern(message, trustTier);

    const trailEntry = {
      event_type: gov.event_type,
      timestamp: gov.ts,
      description: gov.allowed
        ? `nano-gov: passed | complexity ${complexity.toFixed(2)} | ${message.slice(0, 80)}`
        : `nano-gov: flagged (${gov.reason}) | ${message.slice(0, 60)}`,
      risk_level: gov.risk,
      model_tier: null,
    };

    appendTrail(projectDir, trailEntry);
    updateBridge(input?.session_id, { complexity, risk: gov.risk, ts: gov.ts });

    if (!gov.allowed) {
      return {
        additionalContext: `JuhBDI flagged this message (${gov.reason}). Consider using /juhbdi:quick for governed execution.`,
      };
    }

    return {};
  }

  // SUGGEST MODE (0.4-0.7) or ESCALATE MODE (>= 0.7)
  const command = complexity >= 0.7 ? '/juhbdi:plan' : '/juhbdi:quick';
  const label = complexity >= 0.7 ? 'Multi-phase task detected' : 'Governed execution available';

  return {
    additionalContext: `${label} (complexity: ${complexity.toFixed(2)}). Consider: ${command}`,
  };
};

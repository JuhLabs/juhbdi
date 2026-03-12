export interface NanoGovInput {
  message: string;
  trust_tier: string;
}

export interface NanoGovResult {
  allowed: boolean;
  risk: 'none' | 'low' | 'flagged';
  reason?: string;
  trail_entry: {
    event_type: 'ghost' | 'ghost-flagged';
    timestamp: string;
    description: string;
    risk_level: string;
    model_tier: null;
  };
}

const CREDENTIAL_RX = /\b(API_KEY|SECRET|PASSWORD|TOKEN|PRIVATE.?KEY|AWS_SECRET_ACCESS_KEY|OPENAI_API_KEY)\s*[=:]/i;
const DESTRUCTIVE_RX = /\b(rm\s+-rf\s+\/|git\s+push\s+--force|git\s+reset\s+--hard|DROP\s+(TABLE|DATABASE))/i;
const INTERN_RESTRICTED_RX = /\b(write|delete|remove|push|deploy|overwrite|create)\b/i;

export function nanoGovern(input: NanoGovInput): NanoGovResult {
  const { message, trust_tier } = input;
  const ts = new Date().toISOString();

  if (CREDENTIAL_RX.test(message)) {
    return flagged(ts, message, 'credential pattern detected');
  }
  if (DESTRUCTIVE_RX.test(message)) {
    return flagged(ts, message, 'destructive command pattern detected');
  }
  if (trust_tier === 'intern' && INTERN_RESTRICTED_RX.test(message)) {
    return flagged(ts, message, 'trust tier "intern" — restricted action');
  }

  return {
    allowed: true,
    risk: 'none',
    trail_entry: {
      event_type: 'ghost',
      timestamp: ts,
      description: `nano-gov: passed | ${message.slice(0, 80)}`,
      risk_level: 'none',
      model_tier: null,
    },
  };
}

function flagged(ts: string, message: string, reason: string): NanoGovResult {
  return {
    allowed: false,
    risk: 'flagged',
    reason,
    trail_entry: {
      event_type: 'ghost-flagged',
      timestamp: ts,
      description: `nano-gov: flagged (${reason}) | ${message.slice(0, 60)}`,
      risk_level: 'flagged',
      model_tier: null,
    },
  };
}

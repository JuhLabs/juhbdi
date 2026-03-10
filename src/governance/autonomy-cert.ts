// Autonomy Certificates — signed JSON attestations
// Proves: agent tier, capabilities exercised, compliance status, audit hash

import { createHash } from "crypto";

export interface AutonomyCertificate {
  version: "1.0.0";
  certificate_id: string;
  issued_at: string;
  project_id: string;

  // Agent identity
  agent_tier: "intern" | "junior" | "senior" | "principal";
  trust_score: number;
  trust_confidence: number;

  // Capabilities exercised
  capabilities: string[];
  actions_taken: number;
  actions_approved: number;
  actions_prohibited: number;

  // Compliance
  eu_ai_act_score: number;
  trail_entries: number;
  hash_chain_valid: boolean;

  // Integrity
  trail_hash: string; // SHA-256 of decision trail
  certificate_hash: string; // SHA-256 of this certificate (minus this field)
}

export function generateCertificate(input: {
  projectId: string;
  agentTier: "intern" | "junior" | "senior" | "principal";
  trustScore: number;
  trustConfidence: number;
  capabilities: string[];
  actionsTaken: number;
  actionsApproved: number;
  actionsProhibited: number;
  euAiActScore: number;
  trailEntries: number;
  trailHash: string;
  hashChainValid: boolean;
}): AutonomyCertificate {
  const cert: AutonomyCertificate = {
    version: "1.0.0",
    certificate_id: `cert-${Date.now()}-${createHash("sha256").update(String(Math.random())).digest("hex").substring(0, 8)}`,
    issued_at: new Date().toISOString(),
    project_id: input.projectId,
    agent_tier: input.agentTier,
    trust_score: input.trustScore,
    trust_confidence: input.trustConfidence,
    capabilities: input.capabilities,
    actions_taken: input.actionsTaken,
    actions_approved: input.actionsApproved,
    actions_prohibited: input.actionsProhibited,
    eu_ai_act_score: input.euAiActScore,
    trail_entries: input.trailEntries,
    hash_chain_valid: input.hashChainValid,
    trail_hash: input.trailHash,
    certificate_hash: "", // computed below
  };

  // Self-sign: hash everything except certificate_hash
  const toHash = { ...cert, certificate_hash: undefined };
  cert.certificate_hash = createHash("sha256")
    .update(JSON.stringify(toHash, null, 0))
    .digest("hex");

  return cert;
}

export function verifyCertificate(cert: AutonomyCertificate): boolean {
  const toHash = { ...cert, certificate_hash: undefined };
  const computed = createHash("sha256")
    .update(JSON.stringify(toHash, null, 0))
    .digest("hex");
  return computed === cert.certificate_hash;
}

export function formatCertificate(cert: AutonomyCertificate): string {
  const lines: string[] = [];
  lines.push("=== JuhBDI Autonomy Certificate ===");
  lines.push(`ID: ${cert.certificate_id}`);
  lines.push(`Issued: ${cert.issued_at}`);
  lines.push(`Project: ${cert.project_id}`);
  lines.push("");
  lines.push(`Tier: ${cert.agent_tier.toUpperCase()}`);
  lines.push(
    `Trust: ${(cert.trust_score * 100).toFixed(1)}% (confidence: ${(cert.trust_confidence * 100).toFixed(1)}%)`,
  );
  lines.push(`Capabilities: ${cert.capabilities.join(", ")}`);
  lines.push(
    `Actions: ${cert.actions_taken} taken, ${cert.actions_approved} approved, ${cert.actions_prohibited} prohibited`,
  );
  lines.push("");
  lines.push(`EU AI Act Score: ${cert.eu_ai_act_score}%`);
  lines.push(`Trail Entries: ${cert.trail_entries}`);
  lines.push(`Hash Chain Valid: ${cert.hash_chain_valid}`);
  lines.push("");
  lines.push(`Trail Hash: ${cert.trail_hash}`);
  lines.push(`Certificate Hash: ${cert.certificate_hash}`);
  lines.push("=================================");
  return lines.join("\n");
}

import { describe, expect, test } from "bun:test";
import {
  generateCertificate,
  verifyCertificate,
  formatCertificate,
  type AutonomyCertificate,
} from "./autonomy-cert";

function makeCertInput() {
  return {
    projectId: "test-project",
    agentTier: "senior" as const,
    trustScore: 0.75,
    trustConfidence: 0.85,
    capabilities: ["read_files", "write_files", "run_tests"],
    actionsTaken: 42,
    actionsApproved: 40,
    actionsProhibited: 2,
    euAiActScore: 65,
    trailEntries: 100,
    trailHash: "abc123def456",
    hashChainValid: true,
  };
}

describe("autonomy-cert", () => {
  test("generates valid certificate with hash", () => {
    const cert = generateCertificate(makeCertInput());
    expect(cert.version).toBe("1.0.0");
    expect(cert.certificate_id).toMatch(/^cert-/);
    expect(cert.project_id).toBe("test-project");
    expect(cert.agent_tier).toBe("senior");
    expect(cert.trust_score).toBe(0.75);
    expect(cert.certificate_hash).toBeTruthy();
    expect(cert.certificate_hash.length).toBe(64); // SHA-256 hex = 64 chars
  });

  test("certificate verification passes for unmodified cert", () => {
    const cert = generateCertificate(makeCertInput());
    expect(verifyCertificate(cert)).toBe(true);
  });

  test("certificate verification fails for tampered cert", () => {
    const cert = generateCertificate(makeCertInput());
    // Tamper with the trust score
    const tampered: AutonomyCertificate = { ...cert, trust_score: 0.99 };
    expect(verifyCertificate(tampered)).toBe(false);
  });

  test("format includes all fields", () => {
    const cert = generateCertificate(makeCertInput());
    const formatted = formatCertificate(cert);
    expect(formatted).toContain("=== JuhBDI Autonomy Certificate ===");
    expect(formatted).toContain(cert.certificate_id);
    expect(formatted).toContain("SENIOR");
    expect(formatted).toContain("75.0%");
    expect(formatted).toContain("85.0%");
    expect(formatted).toContain("read_files, write_files, run_tests");
    expect(formatted).toContain("42 taken");
    expect(formatted).toContain("EU AI Act Score: 65%");
    expect(formatted).toContain(cert.trail_hash);
    expect(formatted).toContain(cert.certificate_hash);
    expect(formatted).toContain("=================================");
  });

  test("certificate_id is unique", () => {
    const cert1 = generateCertificate(makeCertInput());
    const cert2 = generateCertificate(makeCertInput());
    expect(cert1.certificate_id).not.toBe(cert2.certificate_id);
  });
});

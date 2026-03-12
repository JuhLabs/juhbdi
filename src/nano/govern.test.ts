import { describe, test, expect } from 'bun:test';
import { nanoGovern } from './govern';

describe('nanoGovern', () => {
  test('flags message containing API_KEY pattern', () => {
    const result = nanoGovern({ message: 'set API_KEY=sk-abc123', trust_tier: 'junior' });
    expect(result.allowed).toBe(false);
    expect(result.risk).toBe('flagged');
    expect(result.reason).toContain('credential');
  });

  test('flags message containing password pattern', () => {
    const result = nanoGovern({ message: 'export PASSWORD=hunter2', trust_tier: 'junior' });
    expect(result.allowed).toBe(false);
    expect(result.risk).toBe('flagged');
  });

  test('flags AWS secret key pattern', () => {
    const result = nanoGovern({ message: 'set AWS_SECRET_ACCESS_KEY=abc', trust_tier: 'senior' });
    expect(result.allowed).toBe(false);
    expect(result.risk).toBe('flagged');
  });

  test('flags rm -rf / pattern', () => {
    const result = nanoGovern({ message: 'run rm -rf /', trust_tier: 'senior' });
    expect(result.allowed).toBe(false);
    expect(result.risk).toBe('flagged');
    expect(result.reason).toContain('destructive');
  });

  test('flags git push --force', () => {
    const result = nanoGovern({ message: 'git push --force origin main', trust_tier: 'senior' });
    expect(result.allowed).toBe(false);
    expect(result.risk).toBe('flagged');
  });

  test('flags DROP TABLE', () => {
    const result = nanoGovern({ message: 'DROP TABLE users', trust_tier: 'senior' });
    expect(result.allowed).toBe(false);
    expect(result.risk).toBe('flagged');
  });

  test('flags intern tier write request', () => {
    const result = nanoGovern({ message: 'write the new component', trust_tier: 'intern' });
    expect(result.allowed).toBe(false);
    expect(result.risk).toBe('flagged');
    expect(result.reason).toContain('trust');
  });

  test('flags intern tier delete request', () => {
    const result = nanoGovern({ message: 'delete the old migration files', trust_tier: 'intern' });
    expect(result.allowed).toBe(false);
    expect(result.risk).toBe('flagged');
  });

  test('allows intern tier read request', () => {
    const result = nanoGovern({ message: 'show me the auth module', trust_tier: 'intern' });
    expect(result.allowed).toBe(true);
    expect(result.risk).toBe('none');
  });

  test('allows normal fix request', () => {
    const result = nanoGovern({ message: 'fix the bug in app.js', trust_tier: 'junior' });
    expect(result.allowed).toBe(true);
    expect(result.risk).toBe('none');
  });

  test('allows normal feature request', () => {
    const result = nanoGovern({ message: 'add error handling to the API', trust_tier: 'senior' });
    expect(result.allowed).toBe(true);
    expect(result.risk).toBe('none');
  });

  test('allows unknown trust tier normal message', () => {
    const result = nanoGovern({ message: 'fix the typo', trust_tier: 'unknown' });
    expect(result.allowed).toBe(true);
    expect(result.risk).toBe('none');
  });

  test('generates ghost trail entry on pass', () => {
    const result = nanoGovern({ message: 'fix bug', trust_tier: 'junior' });
    expect(result.trail_entry.event_type).toBe('ghost');
    expect(result.trail_entry.risk_level).toBe('none');
    expect(result.trail_entry.model_tier).toBeNull();
  });

  test('generates ghost-flagged trail entry on flag', () => {
    const result = nanoGovern({ message: 'set API_KEY=abc', trust_tier: 'junior' });
    expect(result.trail_entry.event_type).toBe('ghost-flagged');
    expect(result.trail_entry.risk_level).toBe('flagged');
  });

  test('handles empty message', () => {
    const result = nanoGovern({ message: '', trust_tier: 'junior' });
    expect(result.allowed).toBe(true);
    expect(result.risk).toBe('none');
  });
});

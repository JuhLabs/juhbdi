import { describe, test, expect } from 'bun:test';
import { scoreComplexity } from './complexity';

describe('scoreComplexity', () => {
  test('simple bug fix scores below 0.4 (ghost)', () => {
    expect(scoreComplexity('fix the bug in app.js')).toBeLessThan(0.4);
  });

  test('simple typo fix scores below 0.4 (ghost)', () => {
    expect(scoreComplexity('fix typo in README')).toBeLessThan(0.4);
  });

  test('add error handling scores below 0.4 (ghost)', () => {
    expect(scoreComplexity('add error handling to the API endpoints')).toBeLessThan(0.4);
  });

  test('refactor across services scores above 0.7 (escalate)', () => {
    expect(scoreComplexity('refactor the authentication system across all services')).toBeGreaterThanOrEqual(0.7);
  });

  test('architect a new system scores above 0.7 (escalate)', () => {
    expect(scoreComplexity('architect a new microservice pipeline with event sourcing')).toBeGreaterThanOrEqual(0.7);
  });

  test('medium task scores between 0.4 and 0.7 (suggest)', () => {
    const score = scoreComplexity('add a new API endpoint for user profiles with validation and database queries');
    expect(score).toBeGreaterThanOrEqual(0.4);
    expect(score).toBeLessThan(0.7);
  });

  test('empty message scores 0', () => {
    expect(scoreComplexity('')).toBe(0);
  });

  test('message with many file refs scores higher', () => {
    const withFiles = scoreComplexity('update src/auth.ts, src/db.ts, src/api.ts, src/middleware.ts, src/utils.ts');
    const withoutFiles = scoreComplexity('update the auth module');
    expect(withFiles).toBeGreaterThan(withoutFiles);
  });

  test('scores are clamped between 0 and 1', () => {
    const veryComplex = scoreComplexity('architect and migrate the entire distributed system across all microservices with redesigned event sourcing pipeline');
    expect(veryComplex).toBeLessThanOrEqual(1);
    expect(veryComplex).toBeGreaterThanOrEqual(0);
  });

  test('rename/format stays in ghost zone', () => {
    expect(scoreComplexity('rename the variable')).toBeLessThan(0.4);
  });
});

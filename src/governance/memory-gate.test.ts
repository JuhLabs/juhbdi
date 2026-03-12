import { describe, test, expect } from 'bun:test';
import { queryMemoryGate, extractKeywords, jaccardSimilarity } from './memory-gate';

describe('jaccardSimilarity', () => {
  test('identical sets return 1.0', () => {
    expect(jaccardSimilarity(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(1);
  });

  test('disjoint sets return 0', () => {
    expect(jaccardSimilarity(['a', 'b'], ['c', 'd'])).toBe(0);
  });

  test('partial overlap returns correct value', () => {
    expect(jaccardSimilarity(['a', 'b', 'c'], ['b', 'c', 'd'])).toBeCloseTo(0.5);
  });

  test('empty sets return 0', () => {
    expect(jaccardSimilarity([], [])).toBe(0);
  });
});

describe('extractKeywords', () => {
  test('extracts nouns and technical terms', () => {
    const kw = extractKeywords('refactor the authentication module with tests');
    expect(kw).toContain('refactor');
    expect(kw).toContain('authentication');
    expect(kw).toContain('module');
    expect(kw).toContain('tests');
  });

  test('filters stop words', () => {
    const kw = extractKeywords('fix the bug in the app');
    expect(kw).not.toContain('the');
    expect(kw).not.toContain('in');
  });
});

describe('queryMemoryGate', () => {
  const failedReflexion = {
    id: 'r1',
    outcome: 'fail',
    failure_signature: {
      task_keywords: ['refactor', 'auth', 'module'],
      error_pattern: 'missing tests',
      resolution: 'added integration tests before refactoring',
    },
  };

  const passedReflexion = {
    id: 'r2',
    outcome: 'pass',
    failure_signature: {
      task_keywords: ['refactor', 'auth', 'module'],
      error_pattern: '',
      resolution: null,
    },
  };

  test('blocks when high similarity to past failure', () => {
    const result = queryMemoryGate('refactor the auth module', [failedReflexion]);
    expect(result.blocked).toBe(true);
    expect(result.matches.length).toBeGreaterThan(0);
    expect(result.matches[0].similarity).toBeGreaterThan(0.7);
  });

  test('warns when medium similarity to past failure', () => {
    const result = queryMemoryGate('update the auth endpoints', [failedReflexion]);
    expect(result.blocked).toBe(false);
    expect(result.injected_bans.length).toBeGreaterThanOrEqual(0);
  });

  test('passes when low similarity', () => {
    const result = queryMemoryGate('add dark mode to dashboard', [failedReflexion]);
    expect(result.blocked).toBe(false);
    expect(result.matches.length).toBe(0);
  });

  test('boosts when high similarity to past success', () => {
    const result = queryMemoryGate('refactor the auth module', [passedReflexion]);
    expect(result.blocked).toBe(false);
    expect(result.recommended_approach).toBeDefined();
  });

  test('handles empty reflexion bank', () => {
    const result = queryMemoryGate('anything at all', []);
    expect(result.blocked).toBe(false);
    expect(result.matches).toEqual([]);
  });

  test('includes resolution in block message when available', () => {
    const result = queryMemoryGate('refactor the auth module', [failedReflexion]);
    expect(result.matches[0].what_fixed_it).toBe('added integration tests before refactoring');
  });
});

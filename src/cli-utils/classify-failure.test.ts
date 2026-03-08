import { describe, expect, test } from "bun:test";
import { classifyFailure } from "./classify-failure";

describe("classifyFailure", () => {
  test("classifies TypeError", () => {
    const output = `TypeError: Cannot read properties of undefined (reading 'map')
    at processData (src/utils.ts:42:15)`;
    const result = classifyFailure(output);
    expect(result.category).toBe("type_error");
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  test("classifies import error", () => {
    const output = `error: Cannot find module './auth-service' from 'src/api/routes.ts'`;
    const result = classifyFailure(output);
    expect(result.category).toBe("import_error");
  });

  test("classifies test assertion failure", () => {
    const output = `expect(received).toBe(expected)
    Expected: "admin"
    Received: "user"`;
    const result = classifyFailure(output);
    expect(result.category).toBe("test_assertion");
  });

  test("classifies syntax error", () => {
    const output = `SyntaxError: Unexpected token '}' at line 15`;
    const result = classifyFailure(output);
    expect(result.category).toBe("syntax_error");
  });

  test("classifies timeout", () => {
    const output = `error: test exceeded timeout of 5000ms`;
    const result = classifyFailure(output);
    expect(result.category).toBe("timeout");
  });

  test("classifies runtime error", () => {
    const output = `ReferenceError: authService is not defined`;
    const result = classifyFailure(output);
    expect(result.category).toBe("runtime_error");
  });

  test("classifies dependency conflict", () => {
    const output = `npm ERR! ERESOLVE unable to resolve dependency tree
    peer dep missing: react@^18.0.0`;
    const result = classifyFailure(output);
    expect(result.category).toBe("dependency_conflict");
  });

  test("returns unknown for unrecognized output", () => {
    const output = `Some completely novel error with no recognizable pattern`;
    const result = classifyFailure(output);
    expect(result.category).toBe("unknown");
    expect(result.confidence).toBe(0);
  });

  test("includes suggested recovery", () => {
    const output = `TypeError: string is not assignable to number`;
    const result = classifyFailure(output);
    expect(result.suggested_recovery.length).toBeGreaterThan(0);
  });
});

import type {
  FailureClassification,
  FailureCategory,
} from "../schemas/failure-taxonomy";

interface PatternRule {
  category: FailureCategory;
  patterns: RegExp[];
  confidence: number;
  recovery: string;
}

const RULES: PatternRule[] = [
  {
    category: "type_error",
    patterns: [
      /TypeError/i,
      /is not assignable to/i,
      /Expected .+ got/i,
      /cannot read properties of/i,
    ],
    confidence: 0.85,
    recovery:
      "Check type definitions and schema alignment. Verify default values match expected types. Add type assertions at boundaries.",
  },
  {
    category: "import_error",
    patterns: [
      /Cannot find module/i,
      /is not exported from/i,
      /ModuleNotFoundError/i,
      /Could not resolve/i,
    ],
    confidence: 0.9,
    recovery:
      "Verify module path exists. Check export names match imports. Ensure package is installed.",
  },
  {
    category: "test_assertion",
    patterns: [
      /expect\(.+\)\./i,
      /AssertionError/i,
      /expected .+ to (equal|be|match)/i,
      /Expected:/i,
      /Received:/i,
    ],
    confidence: 0.85,
    recovery:
      "Compare expected vs actual values. Check data transformation logic. Verify test fixtures match current schema.",
  },
  {
    category: "runtime_error",
    patterns: [
      /ReferenceError/i,
      /null is not/i,
      /undefined is not/i,
      /is not a function/i,
    ],
    confidence: 0.8,
    recovery:
      "Add null checks before access. Verify variable is defined in scope. Check function signatures.",
  },
  {
    category: "syntax_error",
    patterns: [
      /SyntaxError/i,
      /Unexpected token/i,
      /Parse error/i,
      /Unterminated/i,
    ],
    confidence: 0.95,
    recovery:
      "Check for missing brackets, quotes, or semicolons. Validate JSON/template literals. Ensure file is valid TypeScript.",
  },
  {
    category: "timeout",
    patterns: [
      /TIMEOUT/i,
      /exceeded .+ms/i,
      /timed out/i,
      /deadline exceeded/i,
    ],
    confidence: 0.9,
    recovery:
      "Break into smaller units. Add early returns for edge cases. Check for infinite loops or missing await.",
  },
  {
    category: "dependency_conflict",
    patterns: [
      /ERESOLVE/i,
      /peer dep/i,
      /version .+ incompatible/i,
      /could not resolve dependency/i,
    ],
    confidence: 0.9,
    recovery:
      "Check package.json for version conflicts. Run bun install. Verify peer dependency requirements.",
  },
];

export function classifyFailure(testOutput: string): FailureClassification {
  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      const match = testOutput.match(pattern);
      if (match) {
        return {
          category: rule.category,
          confidence: rule.confidence,
          error_signature: match[0],
          suggested_recovery: rule.recovery,
        };
      }
    }
  }

  return {
    category: "unknown",
    confidence: 0,
    error_signature: testOutput.slice(0, 100),
    suggested_recovery:
      "Review error output manually. Consider breaking the task into smaller steps.",
  };
}

// CLI entry point
if (import.meta.main) {
  const testOutput = process.argv[2];
  if (!testOutput) {
    console.error(
      JSON.stringify({ error: "Usage: classify-failure.ts <test_output>" })
    );
    process.exit(1);
  }
  console.log(JSON.stringify(classifyFailure(testOutput)));
}

/**
 * AST Analyzer — TypeScript Compiler API-based code analysis
 *
 * Provides deep structural analysis of TypeScript/JavaScript files:
 * - Function/class/interface extraction with signatures
 * - Import/export dependency mapping
 * - Complexity estimation (cyclomatic-like)
 * - Symbol cross-referencing
 */

import * as ts from "typescript";

export interface ASTSymbol {
  name: string;
  kind: "function" | "class" | "interface" | "type" | "enum" | "variable" | "method";
  exported: boolean;
  line: number;
  signature?: string;
  complexity: number;
  parameters?: string[];
  returnType?: string;
}

export interface ASTImport {
  module: string;
  names: string[];
  isTypeOnly: boolean;
  isDefault: boolean;
  isNamespace: boolean;
}

export interface ASTExport {
  name: string;
  kind: string;
  isReExport: boolean;
  fromModule?: string;
}

export interface ASTAnalysis {
  filePath: string;
  symbols: ASTSymbol[];
  imports: ASTImport[];
  exports: ASTExport[];
  totalLines: number;
  complexity: number;
}

export function analyzeFile(filePath: string, content: string): ASTAnalysis {
  const sourceFile = ts.createSourceFile(
    filePath,
    content,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") || filePath.endsWith(".jsx")
      ? ts.ScriptKind.TSX
      : ts.ScriptKind.TS,
  );

  const symbols: ASTSymbol[] = [];
  const imports: ASTImport[] = [];
  const exports: ASTExport[] = [];
  let totalComplexity = 0;

  function getLineNumber(node: ts.Node): number {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    return line + 1;
  }

  function isExported(node: ts.Node): boolean {
    if (!ts.canHaveModifiers(node)) return false;
    const modifiers = ts.getModifiers(node);
    return modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
  }

  function calculateComplexity(node: ts.Node): number {
    let complexity = 1; // base
    ts.forEachChild(node, function visit(child) {
      switch (child.kind) {
        case ts.SyntaxKind.IfStatement:
        case ts.SyntaxKind.ConditionalExpression:
        case ts.SyntaxKind.ForStatement:
        case ts.SyntaxKind.ForInStatement:
        case ts.SyntaxKind.ForOfStatement:
        case ts.SyntaxKind.WhileStatement:
        case ts.SyntaxKind.DoStatement:
        case ts.SyntaxKind.CatchClause:
        case ts.SyntaxKind.CaseClause:
          complexity++;
          break;
        case ts.SyntaxKind.BinaryExpression: {
          const op = (child as ts.BinaryExpression).operatorToken.kind;
          if (
            op === ts.SyntaxKind.AmpersandAmpersandToken ||
            op === ts.SyntaxKind.BarBarToken ||
            op === ts.SyntaxKind.QuestionQuestionToken
          ) {
            complexity++;
          }
          break;
        }
      }
      ts.forEachChild(child, visit);
    });
    return complexity;
  }

  function getParameterNames(
    params: ts.NodeArray<ts.ParameterDeclaration>,
  ): string[] {
    return params.map((p) => p.name.getText(sourceFile));
  }

  function getReturnTypeText(node: ts.FunctionLikeDeclaration): string | undefined {
    if (node.type) return node.type.getText(sourceFile);
    return undefined;
  }

  function visit(node: ts.Node): void {
    // Functions
    if (ts.isFunctionDeclaration(node) && node.name) {
      const complexity = calculateComplexity(node);
      totalComplexity += complexity;
      symbols.push({
        name: node.name.text,
        kind: "function",
        exported: isExported(node),
        line: getLineNumber(node),
        complexity,
        parameters: node.parameters ? getParameterNames(node.parameters) : [],
        returnType: getReturnTypeText(node),
      });
    }

    // Arrow/variable function declarations
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (
          ts.isIdentifier(decl.name) &&
          decl.initializer &&
          (ts.isArrowFunction(decl.initializer) ||
            ts.isFunctionExpression(decl.initializer))
        ) {
          const complexity = calculateComplexity(decl.initializer);
          totalComplexity += complexity;
          symbols.push({
            name: decl.name.text,
            kind: "function",
            exported: isExported(node),
            line: getLineNumber(node),
            complexity,
            parameters: decl.initializer.parameters
              ? getParameterNames(decl.initializer.parameters)
              : [],
            returnType: getReturnTypeText(decl.initializer),
          });
        } else if (ts.isIdentifier(decl.name)) {
          symbols.push({
            name: decl.name.text,
            kind: "variable",
            exported: isExported(node),
            line: getLineNumber(node),
            complexity: 0,
          });
        }
      }
    }

    // Classes
    if (ts.isClassDeclaration(node) && node.name) {
      const complexity = calculateComplexity(node);
      totalComplexity += complexity;
      symbols.push({
        name: node.name.text,
        kind: "class",
        exported: isExported(node),
        line: getLineNumber(node),
        complexity,
      });

      // Extract methods
      for (const member of node.members) {
        if (ts.isMethodDeclaration(member) && member.name) {
          const methodComplexity = calculateComplexity(member);
          symbols.push({
            name: `${node.name.text}.${member.name.getText(sourceFile)}`,
            kind: "method",
            exported: isExported(node),
            line: getLineNumber(member),
            complexity: methodComplexity,
            parameters: member.parameters ? getParameterNames(member.parameters) : [],
            returnType: getReturnTypeText(member),
          });
        }
      }
    }

    // Interfaces
    if (ts.isInterfaceDeclaration(node)) {
      symbols.push({
        name: node.name.text,
        kind: "interface",
        exported: isExported(node),
        line: getLineNumber(node),
        complexity: 0,
      });
    }

    // Type aliases
    if (ts.isTypeAliasDeclaration(node)) {
      symbols.push({
        name: node.name.text,
        kind: "type",
        exported: isExported(node),
        line: getLineNumber(node),
        complexity: 0,
      });
    }

    // Enums
    if (ts.isEnumDeclaration(node)) {
      symbols.push({
        name: node.name.text,
        kind: "enum",
        exported: isExported(node),
        line: getLineNumber(node),
        complexity: 0,
      });
    }

    // Imports
    if (ts.isImportDeclaration(node) && node.moduleSpecifier) {
      const moduleSpec = (node.moduleSpecifier as ts.StringLiteral).text;
      const names: string[] = [];
      let isDefault = false;
      let isNamespace = false;
      // Check if import is type-only by examining the source text
      const importText = node.getText(sourceFile);
      const isTypeOnly = /^import\s+type\b/.test(importText);

      if (node.importClause) {
        if (node.importClause.name) {
          names.push(node.importClause.name.text);
          isDefault = true;
        }
        if (node.importClause.namedBindings) {
          if (ts.isNamespaceImport(node.importClause.namedBindings)) {
            names.push(node.importClause.namedBindings.name.text);
            isNamespace = true;
          } else if (ts.isNamedImports(node.importClause.namedBindings)) {
            for (const element of node.importClause.namedBindings.elements) {
              names.push(element.name.text);
            }
          }
        }
      }

      imports.push({ module: moduleSpec, names, isTypeOnly, isDefault, isNamespace });
    }

    // Export declarations
    if (ts.isExportDeclaration(node)) {
      const fromModule = node.moduleSpecifier
        ? (node.moduleSpecifier as ts.StringLiteral).text
        : undefined;

      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) {
          exports.push({
            name: element.name.text,
            kind: "re-export",
            isReExport: !!fromModule,
            fromModule,
          });
        }
      } else if (!node.exportClause && fromModule) {
        // export * from "..."
        exports.push({
          name: "*",
          kind: "re-export-all",
          isReExport: true,
          fromModule,
        });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  // Collect exports from exported symbols
  for (const sym of symbols) {
    if (sym.exported) {
      exports.push({
        name: sym.name,
        kind: sym.kind,
        isReExport: false,
      });
    }
  }

  const totalLines = content.split("\n").length;

  return {
    filePath,
    symbols,
    imports,
    exports,
    totalLines,
    complexity: totalComplexity,
  };
}

export function analyzeFiles(
  files: Array<{ path: string; content: string }>,
): ASTAnalysis[] {
  return files.map((f) => analyzeFile(f.path, f.content));
}

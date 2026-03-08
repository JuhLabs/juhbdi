import ts from "typescript";
import type { FileNode, LanguageParser, Symbol, ImportRef } from "./types";

export class TypeScriptParser implements LanguageParser {
  readonly extensions = [".ts", ".tsx", ".js", ".jsx"];

  parse(filePath: string, content: string): FileNode {
    const symbols: Symbol[] = [];
    const imports: ImportRef[] = [];

    // Determine script kind from extension
    const ext = filePath.slice(filePath.lastIndexOf("."));
    const scriptKind =
      ext === ".tsx" ? ts.ScriptKind.TSX :
      ext === ".jsx" ? ts.ScriptKind.JSX :
      ts.ScriptKind.TS;

    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true,
      scriptKind,
    );

    const isExported = (node: ts.Node): boolean => {
      if (ts.canHaveModifiers(node)) {
        const modifiers = ts.getModifiers(node);
        if (modifiers) {
          return modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
        }
      }
      return false;
    };

    const getLine = (node: ts.Node): number => {
      return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    };

    // Pass 1: Collect imported names so we can detect call_ref in pass 2
    const importedNames = new Set<string>();

    const collectImports = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node)) {
        const specifier = node.moduleSpecifier;
        if (ts.isStringLiteral(specifier)) {
          imports.push({ specifier: specifier.text });
        }
        // Collect named import bindings
        if (node.importClause) {
          const clause = node.importClause;
          // Default import
          if (clause.name) {
            importedNames.add(clause.name.text);
          }
          // Named imports: import { a, b } from "..."
          if (clause.namedBindings) {
            if (ts.isNamedImports(clause.namedBindings)) {
              for (const element of clause.namedBindings.elements) {
                importedNames.add(element.name.text);
              }
            }
            // Namespace import: import * as ns from "..."
            if (ts.isNamespaceImport(clause.namedBindings)) {
              importedNames.add(clause.namedBindings.name.text);
            }
          }
        }
      }
      ts.forEachChild(node, collectImports);
    };

    ts.forEachChild(sourceFile, collectImports);

    // Pass 2: Walk the AST for symbols (declarations, re-exports, call refs)
    const visit = (node: ts.Node): void => {
      // Function declarations
      if (ts.isFunctionDeclaration(node) && node.name) {
        symbols.push({
          name: node.name.text,
          kind: "function",
          exported: isExported(node),
          line: getLine(node),
        });
      }

      // Class declarations
      if (ts.isClassDeclaration(node) && node.name) {
        symbols.push({
          name: node.name.text,
          kind: "class",
          exported: isExported(node),
          line: getLine(node),
        });
      }

      // Interface declarations
      if (ts.isInterfaceDeclaration(node)) {
        symbols.push({
          name: node.name.text,
          kind: "interface",
          exported: isExported(node),
          line: getLine(node),
        });
      }

      // Type alias declarations
      if (ts.isTypeAliasDeclaration(node)) {
        symbols.push({
          name: node.name.text,
          kind: "type",
          exported: isExported(node),
          line: getLine(node),
        });
      }

      // Enum declarations
      if (ts.isEnumDeclaration(node)) {
        symbols.push({
          name: node.name.text,
          kind: "enum",
          exported: isExported(node),
          line: getLine(node),
        });
      }

      // Variable statements — only capture exported ones
      if (ts.isVariableStatement(node) && isExported(node)) {
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) {
            symbols.push({
              name: decl.name.text,
              kind: "variable",
              exported: true,
              line: getLine(node),
            });
          }
        }
      }

      // Export declarations with module specifier (re-exports)
      // e.g., export { X } from "./y" or export type { X } from "./y"
      if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
        if (ts.isStringLiteral(node.moduleSpecifier)) {
          // Only add to imports if not already collected in pass 1
          // (pass 1 only collects ImportDeclaration, not ExportDeclaration)
          imports.push({ specifier: node.moduleSpecifier.text });

          // Track re-exported names as re_export symbols
          if (node.exportClause && ts.isNamedExports(node.exportClause)) {
            for (const element of node.exportClause.elements) {
              symbols.push({
                name: element.name.text,
                kind: "re_export",
                exported: true,
                line: getLine(node),
              });
            }
          }
        }
      }

      // Call expressions — track calls to imported names as call_ref symbols
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        if (ts.isIdentifier(callee)) {
          const calleeName = callee.text;
          if (importedNames.has(calleeName)) {
            symbols.push({
              name: calleeName,
              kind: "call_ref",
              exported: false,
              line: getLine(node),
            });
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    ts.forEachChild(sourceFile, visit);

    // Content-based hash using Bun.CryptoHasher
    const hasher = new Bun.CryptoHasher("md5");
    hasher.update(content);
    const hash = hasher.digest("hex");

    return {
      path: filePath,
      symbols,
      imports,
      hash,
    };
  }
}

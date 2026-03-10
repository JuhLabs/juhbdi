/**
 * Data Flow Tracer
 *
 * Traces data flow between modules by analyzing exports and imports.
 * Identifies data producers, consumers, and transformation chains.
 */

import type { ASTAnalysis } from "./ast-analyzer";

export interface DataFlowNode {
  file: string;
  symbol: string;
  role: "producer" | "consumer" | "transformer";
}

export interface DataFlowEdge {
  from: DataFlowNode;
  to: DataFlowNode;
  dataType: "function" | "type" | "value" | "re-export";
}

export interface DataFlowGraph {
  nodes: DataFlowNode[];
  edges: DataFlowEdge[];
  producers: DataFlowNode[];   // symbols only exported, never imported
  consumers: DataFlowNode[];   // symbols only imported, never exported
  transformers: DataFlowNode[]; // symbols both imported and exported
}

export function traceDataFlow(analyses: ASTAnalysis[]): DataFlowGraph {
  const nodes: DataFlowNode[] = [];
  const edges: DataFlowEdge[] = [];

  // Build export registry: which file exports which symbols
  const exportRegistry = new Map<string, Map<string, string>>(); // file -> name -> kind
  for (const analysis of analyses) {
    const fileExports = new Map<string, string>();
    for (const exp of analysis.exports) {
      fileExports.set(exp.name, exp.kind);
    }
    exportRegistry.set(analysis.filePath, fileExports);
  }

  // Build import registry: which file imports which symbols from where
  const importRegistry = new Map<string, Array<{ name: string; fromModule: string; fromFile: string | null }>>();
  for (const analysis of analyses) {
    const fileImports: Array<{ name: string; fromModule: string; fromFile: string | null }> = [];
    for (const imp of analysis.imports) {
      const resolvedFile = resolveToFile(imp.module, analysis.filePath, analyses);
      for (const name of imp.names) {
        fileImports.push({ name, fromModule: imp.module, fromFile: resolvedFile });
      }
    }
    importRegistry.set(analysis.filePath, fileImports);
  }

  // Determine roles and build edges
  const symbolRoles = new Map<string, Set<"produces" | "consumes">>();

  // Mark producers
  for (const [file, exports] of exportRegistry) {
    for (const [name] of exports) {
      const key = `${file}:${name}`;
      if (!symbolRoles.has(key)) symbolRoles.set(key, new Set());
      symbolRoles.get(key)!.add("produces");
    }
  }

  // Mark consumers and create edges
  for (const [file, imports] of importRegistry) {
    for (const imp of imports) {
      const consumerKey = `${file}:${imp.name}`;
      if (!symbolRoles.has(consumerKey)) symbolRoles.set(consumerKey, new Set());
      symbolRoles.get(consumerKey)!.add("consumes");

      if (imp.fromFile) {
        const producerKey = `${imp.fromFile}:${imp.name}`;
        if (!symbolRoles.has(producerKey)) symbolRoles.set(producerKey, new Set());
        symbolRoles.get(producerKey)!.add("produces");

        // Determine data type
        const exportKind = exportRegistry.get(imp.fromFile)?.get(imp.name);
        let dataType: DataFlowEdge["dataType"] = "value";
        if (exportKind === "function" || exportKind === "method") dataType = "function";
        else if (exportKind === "type" || exportKind === "interface") dataType = "type";
        else if (exportKind === "re-export" || exportKind === "re-export-all") dataType = "re-export";

        const fromNode: DataFlowNode = {
          file: imp.fromFile,
          symbol: imp.name,
          role: "producer",
        };
        const toNode: DataFlowNode = {
          file,
          symbol: imp.name,
          role: "consumer",
        };

        edges.push({ from: fromNode, to: toNode, dataType });
      }
    }
  }

  // Classify nodes
  const producers: DataFlowNode[] = [];
  const consumers: DataFlowNode[] = [];
  const transformers: DataFlowNode[] = [];

  for (const [key, roles] of symbolRoles) {
    const [file, ...nameParts] = key.split(":");
    const name = nameParts.join(":");
    const isProducer = roles.has("produces");
    const isConsumer = roles.has("consumes");

    let role: DataFlowNode["role"];
    if (isProducer && isConsumer) {
      role = "transformer";
      transformers.push({ file, symbol: name, role });
    } else if (isProducer) {
      role = "producer";
      producers.push({ file, symbol: name, role });
    } else {
      role = "consumer";
      consumers.push({ file, symbol: name, role });
    }

    nodes.push({ file, symbol: name, role });
  }

  return { nodes, edges, producers, consumers, transformers };
}

function resolveToFile(
  moduleSpec: string,
  fromFile: string,
  analyses: ASTAnalysis[],
): string | null {
  if (!moduleSpec.startsWith(".")) return null;

  const basePath = fromFile.replace(/\/[^/]+$/, "/");
  const candidates = [
    basePath + moduleSpec.replace(/^\.\//, ""),
    basePath + moduleSpec.replace(/^\.\//, "") + ".ts",
    basePath + moduleSpec.replace(/^\.\//, "") + ".tsx",
    basePath + moduleSpec.replace(/^\.\//, "") + "/index.ts",
  ];

  const analysisPaths = new Set(analyses.map((a) => normalizePath(a.filePath)));

  for (const candidate of candidates) {
    const normalized = normalizePath(candidate);
    if (analysisPaths.has(normalized)) return normalized;
  }

  return null;
}

function normalizePath(p: string): string {
  const parts: string[] = [];
  for (const part of p.split("/")) {
    if (part === "..") parts.pop();
    else if (part !== ".") parts.push(part);
  }
  return parts.join("/");
}

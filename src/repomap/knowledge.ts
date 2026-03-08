import type { RepoMap } from "./types";

export interface CodeFact {
  type: "hot_path" | "leaf_node" | "dependency" | "hub" | "isolated";
  subject: string;
  description: string;
  importance: number;
}

export function extractKnowledge(map: RepoMap, topK = 5): CodeFact[] {
  const facts: CodeFact[] = [];
  const inbound = new Map<string, number>();
  const outbound = new Map<string, number>();

  for (const edge of map.edges) {
    inbound.set(edge.to_file, (inbound.get(edge.to_file) ?? 0) + 1);
    outbound.set(edge.from_file, (outbound.get(edge.from_file) ?? 0) + 1);
  }

  for (const file of map.files) {
    const inCount = inbound.get(file.path) ?? 0;
    const outCount = outbound.get(file.path) ?? 0;
    const rank = map.pagerank[file.path] ?? 0;

    if (inCount >= 2 && rank > 0.1) {
      facts.push({
        type: "hot_path", subject: file.path,
        description: `${file.path} is a hot path — ${inCount} files depend on it (PageRank: ${rank.toFixed(2)})`,
        importance: rank + inCount * 0.1,
      });
    }

    if (inCount === 0 && outCount > 0) {
      facts.push({
        type: "leaf_node", subject: file.path,
        description: `${file.path} is a leaf node — imports ${outCount} file(s) but no file depends on it`,
        importance: 0.3,
      });
    }

    if (outCount >= 4) {
      facts.push({
        type: "hub", subject: file.path,
        description: `${file.path} is a hub — imports ${outCount} files directly`,
        importance: 0.5 + outCount * 0.05,
      });
    }

    if (inCount === 0 && outCount === 0) {
      facts.push({
        type: "isolated", subject: file.path,
        description: `${file.path} is isolated — no imports or dependents`,
        importance: 0.1,
      });
    }
  }

  const sortedEdges = [...map.edges].sort((a, b) => b.weight - a.weight);
  for (const edge of sortedEdges.slice(0, 3)) {
    facts.push({
      type: "dependency", subject: edge.from_file,
      description: `${edge.from_file} depends on ${edge.to_file} (via ${edge.identifiers.slice(0, 3).join(", ")})`,
      importance: 0.4 + edge.weight * 0.1,
    });
  }

  return facts.sort((a, b) => b.importance - a.importance).slice(0, topK);
}

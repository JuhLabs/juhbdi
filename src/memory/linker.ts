import type { CrossLink, ExperienceTripletV2 } from "./types";

const MAX_LINKS = 10;
const MIN_STRENGTH = 0.1;

interface LinkResult {
  updated: ExperienceTripletV2;
  linked: ExperienceTripletV2[];
}

export function findRelated(target: ExperienceTripletV2, existing: ExperienceTripletV2[]): CrossLink[] {
  const targetKeywords = new Set(target.keywords);
  const targetFiles = new Set(target.experience.files_modified);
  const targetTags = new Set(target.intent.domain_tags);
  const scored: Array<{ id: string; strength: number; relation: string }> = [];

  for (const mem of existing) {
    if (mem.id === target.id) continue;
    let score = 0;
    let relation = "related";

    const kwOverlap = mem.keywords.filter((k) => targetKeywords.has(k)).length;
    const kwTotal = Math.max(targetKeywords.size, 1);
    const kwScore = kwOverlap / kwTotal;
    if (kwScore > 0) { score += kwScore * 0.5; relation = "similar_keywords"; }

    const fileOverlap = mem.experience.files_modified.filter((f) => targetFiles.has(f)).length;
    if (fileOverlap > 0) { score += 0.3 * Math.min(fileOverlap / Math.max(targetFiles.size, 1), 1); relation = "shared_files"; }

    const tagOverlap = mem.intent.domain_tags.filter((t) => targetTags.has(t)).length;
    if (tagOverlap > 0) { score += 0.2 * Math.min(tagOverlap / Math.max(targetTags.size, 1), 1); relation = kwScore > 0 ? "similar_keywords" : "shared_domain"; }

    if (score >= MIN_STRENGTH) scored.push({ id: mem.id, strength: Math.round(score * 100) / 100, relation });
  }

  scored.sort((a, b) => b.strength - a.strength);
  return scored.slice(0, MAX_LINKS);
}

export function linkMemory(newTriplet: ExperienceTripletV2, existing: ExperienceTripletV2[]): LinkResult {
  const links = findRelated(newTriplet, existing);
  const updated: ExperienceTripletV2 = { ...newTriplet, related_memories: [...newTriplet.related_memories, ...links] };
  const linkedIds = new Set(links.map((l) => l.id));
  const linked = existing.map((mem) => {
    if (!linkedIds.has(mem.id)) return mem;
    const correspondingLink = links.find((l) => l.id === mem.id)!;
    const backLink: CrossLink = { id: newTriplet.id, relation: correspondingLink.relation, strength: correspondingLink.strength };
    return { ...mem, related_memories: [...mem.related_memories, backLink] };
  });
  return { updated, linked };
}

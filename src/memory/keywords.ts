import type { ExperienceTripletV2 } from "./types";

export const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "it", "as", "be", "was", "are",
  "this", "that", "has", "had", "not", "all", "can", "will", "its",
  "use", "used", "using", "into", "each", "also", "been", "have",
]);

export const MAX_KEYWORDS = 20;
export const MIN_WORD_LENGTH = 3;

/** Tokenize text using standard delimiters and filter stop words. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s/\\._\-:,;!?()[\]{}'"]+/)
    .filter((w) => w.length >= MIN_WORD_LENGTH && !STOP_WORDS.has(w));
}

export function extractKeywords(triplet: ExperienceTripletV2): string[] {
  const sources: string[] = [
    triplet.intent.task_description,
    triplet.experience.approach,
    ...triplet.intent.domain_tags,
    ...extractPathSegments(triplet.experience.files_modified),
  ];

  const words = sources
    .join(" ")
    .toLowerCase()
    .split(/[\s/\\._\-]+/)
    .filter((w) => w.length >= MIN_WORD_LENGTH && !STOP_WORDS.has(w));

  return [...new Set(words)].slice(0, MAX_KEYWORDS);
}

function extractPathSegments(paths: string[]): string[] {
  return paths.flatMap((p) => {
    const parts = p.split("/");
    return parts
      .map((seg) => seg.replace(/\.[^.]+$/, ""))
      .filter((seg) => seg.length >= MIN_WORD_LENGTH);
  });
}

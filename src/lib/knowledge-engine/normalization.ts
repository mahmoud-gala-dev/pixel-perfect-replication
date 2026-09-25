/**
 * Name normalization and slug utilities for the Knowledge Engine.
 *
 * Rules:
 * - Trim whitespace and collapse consecutive whitespace.
 * - Normalize case where applicable.
 * - Preserve display names while deriving normalized search representations.
 * - Do NOT destructively alter Arabic letter semantics; only strip non-semantic
 *   tashkeel/diacritics so that matching succeeds with or without harakat.
 */

// Arabic Tashkeel / Harakat range (Fathatan, Dammatan, Kasratan, Fatha, Damma, Kasra, Shadda, Sukun, Superscript Alef)
const ARABIC_DIACRITICS_REGEX = /[\u064B-\u0652\u0670]/g;

// Zero-width characters (ZWSP, ZWNJ, ZWJ, BOM)
const ZERO_WIDTH_REGEX = /[\u200B\u200C\u200D\uFEFF]/g;

/**
 * Normalizes a knowledge name or alias for search and comparison.
 */
export function normalizeKnowledgeName(name: string): string {
  if (!name) return "";

  return name
    .trim()
    .replace(ZERO_WIDTH_REGEX, "")
    .replace(/\s+/g, " ")
    .replace(ARABIC_DIACRITICS_REGEX, "")
    .toLowerCase();
}

/**
 * Generates a clean, URL-safe and collision-resistant slug supporting Latin and non-Latin scripts.
 */
export function generateCanonicalSlug(value: string): string {
  if (!value) return `node-${Date.now().toString(36)}`;

  const normalized = value
    .trim()
    .replace(ZERO_WIDTH_REGEX, "")
    .replace(ARABIC_DIACRITICS_REGEX, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");

  return normalized.length > 0 ? normalized.slice(0, 80) : `node-${Date.now().toString(36)}`;
}

/**
 * Calculates string similarity using dice coefficient on character bigrams.
 * Returns a value between 0.0 (completely distinct) and 1.0 (identical).
 */
export function calculateNameSimilarity(str1: string, str2: string): number {
  const s1 = normalizeKnowledgeName(str1);
  const s2 = normalizeKnowledgeName(str2);

  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;
  if (s1.length === 1 && s2.length === 1) return s1 === s2 ? 1.0 : 0.0;

  // Single word inclusion check (e.g. "Laravel Queue" vs "Laravel Queues")
  if (s1.includes(s2) || s2.includes(s1)) {
    const minLen = Math.min(s1.length, s2.length);
    const maxLen = Math.max(s1.length, s2.length);
    if (minLen / maxLen >= 0.75) {
      return 0.88 + 0.1 * (minLen / maxLen);
    }
  }

  const getBigrams = (str: string) => {
    const bigrams = new Map<string, number>();
    for (let i = 0; i < str.length - 1; i++) {
      const bg = str.slice(i, i + 2);
      bigrams.set(bg, (bigrams.get(bg) ?? 0) + 1);
    }
    return bigrams;
  };

  const bg1 = getBigrams(s1);
  const bg2 = getBigrams(s2);

  let intersection = 0;
  for (const [bg, count1] of bg1.entries()) {
    const count2 = bg2.get(bg) ?? 0;
    intersection += Math.min(count1, count2);
  }

  const total = (s1.length - 1) + (s2.length - 1);
  if (total <= 0) return 0.0;

  return Number(((2.0 * intersection) / total).toFixed(3));
}

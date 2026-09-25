// =====================================================================
// KNOWLEDGE BRAIN — PHASE 6: EMBEDDING PROVIDER ABSTRACTION
// =====================================================================

export interface EmbeddingProvider {
  providerId: string;
  model: string;
  version: string;
  dimensions: number;
  generateEmbedding(text: string): Promise<number[]>;
  generateBatchEmbeddings(texts: string[]): Promise<number[][]>;
}

export interface NodeEmbeddingMetadata {
  embedding_provider: string;
  embedding_model: string;
  embedding_version: string;
  dimensions: number;
  embedded_at: string;
}

/**
 * Builds the canonical representation text for embedding a knowledge node.
 * As required by Phase 6: Includes name, type, description, aliases, and context
 * to prevent shallow name-only vector confusion.
 */
export function buildCanonicalEmbeddingText(node: {
  name: string;
  node_type?: string | null | undefined;
  description?: string | null | undefined;
  summary?: string | null | undefined;
  aliases?: string[] | undefined;
  context?: string[] | undefined;
}): string {
  const parts: string[] = [];

  parts.push(`Name: ${node.name.trim()}`);
  if (node.node_type) {
    parts.push(`Type: ${node.node_type.trim()}`);
  }
  if (node.aliases && node.aliases.length > 0) {
    parts.push(`Aliases: ${node.aliases.filter(Boolean).join(", ")}`);
  }
  if (node.context && node.context.length > 0) {
    parts.push(`Context: ${node.context.filter(Boolean).join(" > ")}`);
  }
  const desc = node.description || node.summary;
  if (desc && desc.trim()) {
    parts.push(`Description: ${desc.trim()}`);
  }

  return parts.join("\n");
}

/**
 * Calculates cosine similarity between two unit-normalized vectors.
 * Returns a score between -1.0 and 1.0 (clamped to 0.0 - 1.0 for similarity).
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0 || vecA.length !== vecB.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    const a = vecA[i] ?? 0;
    const b = vecB[i] ?? 0;
    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  }

  if (normA === 0 || normB === 0) return 0;
  const sim = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  return Math.max(0, Math.min(1, Number(sim.toFixed(4))));
}

/**
 * Deterministic local embedding provider using 384-dimensional sparse hashed n-gram projections.
 * Provides consistent, repeatable vectors for offline execution, unit tests, and fallback
 * when remote AI embedding providers are unavailable or fail.
 */
export class DeterministicFallbackEmbeddingProvider implements EmbeddingProvider {
  public readonly providerId = "deterministic-fallback";
  public readonly model = "hash-ngram-384";
  public readonly version = "1.0.0";
  public readonly dimensions = 384;

  public async generateEmbedding(text: string): Promise<number[]> {
    return this.hashTextToVector(text);
  }

  public async generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.hashTextToVector(t));
  }

  private hashTextToVector(text: string): number[] {
    const vector = new Array(this.dimensions).fill(0);
    const normalized = text.toLowerCase().trim();

    if (!normalized) {
      return vector;
    }

    // Tokenize words and character n-grams (1-gram, 2-gram, 3-gram)
    const words = normalized.split(/[\s,.\-_/\\>:]+/).filter(Boolean);
    const tokens: string[] = [...words];

    for (const word of words) {
      for (let n = 2; n <= Math.min(4, word.length); n++) {
        for (let i = 0; i <= word.length - n; i++) {
          tokens.push(word.slice(i, i + n));
        }
      }
    }

    // Hash tokens into vector bins
    for (const token of tokens) {
      let hash = 0;
      for (let i = 0; i < token.length; i++) {
        hash = (hash << 5) - hash + token.charCodeAt(i);
        hash |= 0;
      }
      const index = Math.abs(hash) % this.dimensions;
      // Add TF-IDF-like weight: longer tokens give more specificity
      const weight = token.length > 3 ? 1.5 : 1.0;
      vector[index] += weight;
    }

    // L2 Normalize
    let norm = 0;
    for (let i = 0; i < this.dimensions; i++) {
      norm += vector[i] * vector[i];
    }
    norm = Math.sqrt(norm);

    if (norm > 0) {
      for (let i = 0; i < this.dimensions; i++) {
        vector[i] = Number((vector[i] / norm).toFixed(6));
      }
    }

    return vector;
  }
}

/**
 * Default singleton instance of fallback embedding provider.
 */
export const defaultEmbeddingProvider = new DeterministicFallbackEmbeddingProvider();

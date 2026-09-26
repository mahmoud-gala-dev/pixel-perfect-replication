// =====================================================================
// KNOWLEDGE BRAIN — PHASE 6: REUSABLE SEARCH SERVICE (HYBRID SEARCH)
// =====================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { KnowledgeNode, KnowledgeAlias } from "@/lib/knowledge-engine/types";
import type { NodeType } from "./types";
import {
  calculateNameSimilarity,
  generateCanonicalSlug,
  normalizeKnowledgeName,
} from "@/lib/knowledge-engine/normalization";
import {
  type EmbeddingProvider,
  defaultEmbeddingProvider,
  cosineSimilarity,
  buildCanonicalEmbeddingText,
} from "./embedding-provider";

export interface SearchResultItem {
  node_id: string;
  name: string;
  canonical_name: string | null;
  slug: string;
  node_type: NodeType;
  description: string | null;
  parent_id: string | null;
  aliases: string[];
  path?: string[];
  match_signals: {
    exact: boolean;
    normalized: boolean;
    slug: boolean;
    alias_matched: string | null;
    text_score: number;
    semantic_score: number;
    type_score: number;
    context_score: number;
  };
  combined_score: number;
}

export interface SearchOptions {
  limit?: number | undefined;
  nodeType?: NodeType | undefined;
  parentId?: string | null | undefined;
  context?: string[] | undefined;
  threshold?: number | undefined;
  skipSemantic?: boolean | undefined;
}

export interface InMemorySearchDataset {
  nodes: KnowledgeNode[];
  aliases?: KnowledgeAlias[] | undefined;
  nodeEmbeddings?: Map<string, number[]> | undefined;
}

export class KnowledgeSearchService {
  private supabase: SupabaseClient<Database> | null = null;
  private embeddingProvider: EmbeddingProvider;
  private embeddingCache = new Map<string, number[]>();

  constructor(
    supabase?: SupabaseClient<Database> | null,
    embeddingProvider: EmbeddingProvider = defaultEmbeddingProvider,
  ) {
    this.supabase = supabase ?? null;
    this.embeddingProvider = embeddingProvider;
  }

  /**
   * 1. Exact canonical name search
   */
  public async exactSearch(
    query: string,
    dataset?: InMemorySearchDataset,
  ): Promise<KnowledgeNode | null> {
    const all = await this.exactSearchAll(query, dataset);
    return all.length > 0 && all[0] ? all[0] : null;
  }

  /**
   * 1b. Exact canonical name search returning all matches (for ambiguity detection)
   */
  public async exactSearchAll(
    query: string,
    dataset?: InMemorySearchDataset,
  ): Promise<KnowledgeNode[]> {
    const raw = query.trim();
    if (!raw) return [];

    if (dataset) {
      return dataset.nodes.filter(
        (n) => !n.deleted_at && (n.name === raw || n.canonical_name === raw),
      );
    }

    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from("knowledge_nodes")
          .select("*")
          .is("deleted_at", null)
          .or(`name.eq."${raw}",canonical_name.eq."${raw}"`)
          .limit(10);

        if (!error && Array.isArray(data)) return data as unknown as KnowledgeNode[];
      } catch {
        // Fall back gracefully
      }
    }

    return [];
  }

  /**
   * 2. Alias search (supports Latin, Arabic, and multilingual aliases)
   */
  public async aliasSearch(
    query: string,
    dataset?: InMemorySearchDataset,
  ): Promise<{ node: KnowledgeNode; alias: string } | null> {
    const raw = query.trim();
    const normalized = normalizeKnowledgeName(raw);
    if (!normalized) return null;

    if (dataset && dataset.aliases) {
      const aliasMatch = dataset.aliases.find(
        (a) =>
          normalizeKnowledgeName(a.alias) === normalized ||
          (a.normalized_alias && a.normalized_alias === normalized),
      );
      if (aliasMatch) {
        const targetNode = dataset.nodes.find(
          (n) => n.id === aliasMatch.node_id && !n.deleted_at,
        );
        if (targetNode) {
          return { node: targetNode, alias: aliasMatch.alias };
        }
      }
    }

    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from("knowledge_aliases")
          .select("alias, node_id, knowledge_nodes!inner(*)")
          .or(`alias.ilike."${raw}",normalized_alias.eq."${normalized}"`)
          .limit(1)
          .maybeSingle();

        if (!error && data && data.knowledge_nodes) {
          return {
            node: data.knowledge_nodes as unknown as KnowledgeNode,
            alias: data.alias,
          };
        }
      } catch {
        // Fall back gracefully
      }
    }

    return null;
  }

  /**
   * 3. Text and trigram/dice coefficient search
   */
  public async textSearch(
    query: string,
    options: SearchOptions = {},
    dataset?: InMemorySearchDataset,
  ): Promise<Array<{ node: KnowledgeNode; score: number }>> {
    const raw = query.trim();
    const normalized = normalizeKnowledgeName(raw);
    const limit = options.limit ?? 10;
    if (!normalized) return [];

    if (dataset) {
      const results: Array<{ node: KnowledgeNode; score: number }> = [];
      for (const node of dataset.nodes) {
        if (node.deleted_at) continue;
        if (options.nodeType && node.node_type !== options.nodeType) continue;

        const nameSim = calculateNameSimilarity(raw, node.name);
        const canonSim = node.canonical_name
          ? calculateNameSimilarity(raw, node.canonical_name)
          : 0;
        let bestScore = Math.max(nameSim, canonSim);

        // Check node's aliases in dataset
        if (dataset.aliases) {
          const nodeAliases = dataset.aliases.filter((a) => a.node_id === node.id);
          for (const a of nodeAliases) {
            const aliasSim = calculateNameSimilarity(raw, a.alias);
            if (aliasSim > bestScore) bestScore = aliasSim;
          }
        }

        if (bestScore >= (options.threshold ?? 0.3)) {
          results.push({ node, score: bestScore });
        }
      }

      return results.sort((a, b) => b.score - a.score).slice(0, limit);
    }

    if (this.supabase) {
      try {
        const { data, error } = await this.supabase.rpc("search_knowledge_nodes_lexical", {
          p_query: raw,
          p_limit: limit,
        });

        if (!error && Array.isArray(data)) {
          return data.map((d) => ({
            node: d as unknown as KnowledgeNode,
            score: (d as any).similarity ?? d.text_similarity,
          }));
        }
      } catch {
        // Fall back gracefully
      }
    }

    return [];
  }

  /**
   * 4. Semantic / vector similarity search using embedding provider
   */
  public async semanticSearch(
    query: string,
    options: SearchOptions = {},
    dataset?: InMemorySearchDataset,
  ): Promise<Array<{ node: KnowledgeNode; similarity: number }>> {
    const raw = query.trim();
    const limit = options.limit ?? 10;
    if (!raw) return [];

    // Cached embedding for query to save cost & execution time
    let queryEmbedding = this.embeddingCache.get(raw);
    if (!queryEmbedding) {
      try {
        queryEmbedding = await this.embeddingProvider.generateEmbedding(raw);
        this.embeddingCache.set(raw, queryEmbedding);
      } catch (err) {
        // Section 57: Graceful degradation if embedding provider fails
        return [];
      }
    }

    if (dataset) {
      const results: Array<{ node: KnowledgeNode; similarity: number }> = [];

      for (const node of dataset.nodes) {
        if (node.deleted_at) continue;
        if (options.nodeType && node.node_type !== options.nodeType) continue;

        let nodeVec = dataset.nodeEmbeddings?.get(node.id);
        if (!nodeVec) {
          const canonicalText = buildCanonicalEmbeddingText({
            name: node.name,
            node_type: node.node_type,
            description: node.description,
            summary: node.summary,
            context: options.context,
          });
          nodeVec = await this.embeddingProvider.generateEmbedding(canonicalText);
          dataset.nodeEmbeddings?.set(node.id, nodeVec);
        }

        const sim = cosineSimilarity(queryEmbedding, nodeVec);
        if (sim >= (options.threshold ?? 0.35)) {
          results.push({ node, similarity: sim });
        }
      }

      return results.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
    }

    if (this.supabase) {
      try {
        const { data, error } = await this.supabase.rpc("match_knowledge_nodes", {
          query_embedding: JSON.stringify(queryEmbedding),
          match_threshold: options.threshold ?? 0.35,
          match_count: limit,
          p_node_type: options.nodeType as Database["public"]["Enums"]["node_type"],
        });

        if (!error && Array.isArray(data)) {
          return data.map((d) => ({
            node: d as unknown as KnowledgeNode,
            similarity: d.similarity,
          }));
        }
      } catch {
        // Fall back gracefully
      }
    }

    return [];
  }

  /**
   * 5. Hybrid Search: Merges Lexical + Alias + Vector + Hierarchy/Graph Context
   */
  public async hybridSearch(
    query: string,
    options: SearchOptions = {},
    dataset?: InMemorySearchDataset,
  ): Promise<SearchResultItem[]> {
    const raw = query.trim();
    if (!raw) return [];

    const normalized = normalizeKnowledgeName(raw);
    const slug = generateCanonicalSlug(raw);

    // Cheap deterministic searches first
    const exactNode = await this.exactSearch(raw, dataset);
    const aliasMatch = await this.aliasSearch(raw, dataset);

    // If exact name match, we already have a deterministic candidate with score 1.0
    // But we still fetch candidates if needed
    const textMatches = await this.textSearch(raw, { ...options, limit: 15 }, dataset);

    let semanticMatches: Array<{ node: KnowledgeNode; similarity: number }> = [];
    if (!options.skipSemantic) {
      try {
        semanticMatches = await this.semanticSearch(raw, { ...options, limit: 15 }, dataset);
      } catch {
        // Graceful degradation per Section 57
        semanticMatches = [];
      }
    }

    // Merge candidates by Node ID
    const candidateMap = new Map<string, SearchResultItem>();

    const getOrCreateCandidate = (n: KnowledgeNode): SearchResultItem => {
      let item = candidateMap.get(n.id);
      if (!item) {
        item = {
          node_id: n.id,
          name: n.name,
          canonical_name: n.canonical_name,
          slug: n.slug,
          node_type: n.node_type as NodeType,
          description: n.description,
          parent_id: n.parent_id,
          aliases: [],
          match_signals: {
            exact: false,
            normalized: false,
            slug: false,
            alias_matched: null,
            text_score: 0,
            semantic_score: 0,
            type_score: 0,
            context_score: 0,
          },
          combined_score: 0,
        };
        candidateMap.set(n.id, item);
      }
      return item;
    };

    // Apply exact
    if (exactNode) {
      const item = getOrCreateCandidate(exactNode);
      item.match_signals.exact = true;
      item.match_signals.normalized = true;
      item.match_signals.slug = true;
      item.match_signals.text_score = 1.0;
    }

    // Apply alias
    if (aliasMatch) {
      const item = getOrCreateCandidate(aliasMatch.node);
      item.match_signals.alias_matched = aliasMatch.alias;
    }

    // Apply text matches
    for (const tm of textMatches) {
      const item = getOrCreateCandidate(tm.node);
      item.match_signals.text_score = Math.max(item.match_signals.text_score, tm.score);
      if (normalizeKnowledgeName(item.name) === normalized) {
        item.match_signals.normalized = true;
      }
      if (item.slug === slug) {
        item.match_signals.slug = true;
      }
    }

    // Apply semantic matches
    for (const sm of semanticMatches) {
      const item = getOrCreateCandidate(sm.node);
      item.match_signals.semantic_score = Math.max(
        item.match_signals.semantic_score,
        sm.similarity,
      );
    }

    // Calculate Context & Type scores
    const contextTerms = (options.context ?? []).map((c) => normalizeKnowledgeName(c)).filter(Boolean);

    for (const item of candidateMap.values()) {
      // Type compatibility
      if (options.nodeType) {
        item.match_signals.type_score = item.node_type === options.nodeType ? 1.0 : 0.4;
      } else {
        item.match_signals.type_score = 0.8;
      }

      // Hierarchy & Context score
      if (contextTerms.length > 0) {
        let matchedContextCount = 0;
        const nodeDesc = normalizeKnowledgeName(item.description || "");
        for (const term of contextTerms) {
          if (nodeDesc.includes(term)) {
            matchedContextCount++;
          }
        }
        item.match_signals.context_score =
          contextTerms.length > 0 ? matchedContextCount / contextTerms.length : 0;
      }

      // Final Combined Score computation:
      // Exact match gives 1.0
      // Verified alias match gives 0.95
      // Otherwise weighted blend of text, semantic, type, and context
      if (item.match_signals.exact) {
        item.combined_score = 1.0;
      } else if (item.match_signals.alias_matched) {
        item.combined_score = 0.95;
      } else if (item.match_signals.normalized || item.match_signals.slug) {
        item.combined_score = 0.92;
      } else {
        const hasContext = contextTerms.length > 0;
        const maxSignal = Math.max(item.match_signals.text_score, item.match_signals.semantic_score);
        const minSignal = Math.min(item.match_signals.text_score, item.match_signals.semantic_score);

        // Primary signal boosted by corroborating secondary signal
        let baseScore = maxSignal;
        if (minSignal > 0.25) {
          baseScore = Math.min(1.0, baseScore + minSignal * 0.12);
        }

        if (hasContext && item.match_signals.context_score > 0) {
          baseScore = baseScore * 0.8 + item.match_signals.context_score * 0.2;
        }

        // Type penalty if incompatible
        if (options.nodeType && item.match_signals.type_score < 0.5) {
          baseScore *= 0.6;
        }

        item.combined_score = Number(Math.min(1.0, Math.max(0.0, baseScore)).toFixed(4));
      }
    }

    const sorted = Array.from(candidateMap.values())
      .sort((a, b) => b.combined_score - a.combined_score);

    return sorted.slice(0, options.limit ?? 10);
  }
}

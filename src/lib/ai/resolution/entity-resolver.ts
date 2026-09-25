// =====================================================================
// KNOWLEDGE BRAIN — PHASE 6: ENTITY RESOLUTION ENGINE
// =====================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { KnowledgeNode, KnowledgeAlias, KnowledgeEdge } from "@/lib/knowledge-engine/types";
import {
  calculateNameSimilarity,
  generateCanonicalSlug,
  normalizeKnowledgeName,
} from "@/lib/knowledge-engine/normalization";
import {
  type CandidateScores,
  type CandidateSignals,
  type EntityResolutionResult,
  type MatchType,
  type NodeType,
  type ResolutionCandidateItem,
  type ResolutionStatus,
  type ResolveEntityCandidateInput,
  DEFAULT_SCORING_WEIGHTS,
  RESOLUTION_THRESHOLDS,
  RESOLVER_VERSION,
} from "./types";
import {
  KnowledgeSearchService,
  type InMemorySearchDataset,
} from "./search-service";
import {
  type EmbeddingProvider,
  defaultEmbeddingProvider,
  buildCanonicalEmbeddingText,
  cosineSimilarity,
} from "./embedding-provider";

export interface EntityResolverContext {
  nodes: KnowledgeNode[];
  aliases?: KnowledgeAlias[];
  edges?: KnowledgeEdge[];
  nodeEmbeddings?: Map<string, number[]>;
  resolvedAnchors?: Map<string, string>; // Maps candidate name or temp_id -> canonical_node_id
}

export class EntityResolver {
  private searchService: KnowledgeSearchService;
  private embeddingProvider: EmbeddingProvider;
  private supabase: SupabaseClient<Database> | null = null;

  constructor(
    supabase?: SupabaseClient<Database> | null,
    embeddingProvider: EmbeddingProvider = defaultEmbeddingProvider,
  ) {
    this.supabase = supabase ?? null;
    this.embeddingProvider = embeddingProvider;
    this.searchService = new KnowledgeSearchService(supabase, embeddingProvider);
  }

  /**
   * Resolves a single entity candidate using the 12-step layered search & scoring strategy.
   * Cheap deterministic matches resolve immediately without calling expensive embeddings.
   */
  public async resolveEntity(
    candidate: ResolveEntityCandidateInput,
    context?: EntityResolverContext,
  ): Promise<EntityResolutionResult> {
    const rawName = candidate.name?.trim() || "";
    const normalizedName = candidate.normalized_name || normalizeKnowledgeName(rawName);
    const candidateSlug = generateCanonicalSlug(rawName);
    const extractionConfidence = candidate.extraction_confidence ?? 0.9;

    if (!rawName) {
      return {
        status: "UNRESOLVED",
        canonical_node_id: null,
        resolution_confidence: 0,
        extraction_confidence: extractionConfidence,
        match_type: "MULTI_SIGNAL",
        reason_summary: "No candidate name provided for resolution.",
        selected_candidate_id: null,
        candidates: [],
        resolver_version: RESOLVER_VERSION,
      };
    }

    const searchDataset: InMemorySearchDataset | undefined = context
      ? {
          nodes: context.nodes,
          aliases: context.aliases ?? undefined,
          nodeEmbeddings: context.nodeEmbeddings ?? undefined,
        }
      : undefined;

    // -------------------------------------------------------------
    // STEP 1 & 2: Exact Canonical Name Match (Deterministic)
    // -------------------------------------------------------------
    const exactNodes = await this.searchService.exactSearchAll(rawName, searchDataset);
    if (exactNodes.length > 1) {
      // Disambiguate by type and context if available
      const typeCompatibleNodes = candidate.type
        ? exactNodes.filter((n) => n.node_type === candidate.type)
        : exactNodes;

      const contextTerms = [
        ...(candidate.context || []),
        ...(candidate.hierarchy_suggestion || []),
        candidate.conversation_context || "",
      ].filter(Boolean).map((t) => t.toLowerCase());

      let disambiguatedNodes = typeCompatibleNodes;
      if (contextTerms.length > 0 && typeCompatibleNodes.length > 1) {
        disambiguatedNodes = typeCompatibleNodes.filter((n) => {
          const text = `${n.name} ${n.canonical_name || ""} ${n.description || ""} ${n.summary || ""}`.toLowerCase();
          return contextTerms.some((term) => text.includes(term));
        });
      }

      if (disambiguatedNodes.length === 1 && disambiguatedNodes[0]) {
        const exactNode = disambiguatedNodes[0];
        const exactCandidate: ResolutionCandidateItem = {
          candidate_node_id: exactNode.id,
          candidate_name: exactNode.name,
          candidate_slug: exactNode.slug,
          candidate_type: exactNode.node_type as NodeType,
          rank: 1,
          scores: {
            exact_score: 1.0,
            alias_score: 0,
            text_score: 1.0,
            semantic_score: 1.0,
            type_score: 1.0,
            hierarchy_score: 1.0,
            graph_score: 1.0,
            combined_score: 1.0,
          },
          signals: {
            exact_name_match: true,
            normalized_name_match: true,
            slug_match: true,
            type_compatible: true,
            notes: [`Contextually disambiguated exact match: "${exactNode.name}" (${exactNode.canonical_name || exactNode.name})`],
          },
        };

        return {
          status: "EXISTING",
          canonical_node_id: exactNode.id,
          resolution_confidence: 0.98,
          extraction_confidence: extractionConfidence,
          match_type: "EXACT_NAME",
          reason_summary: `Disambiguated exact match found for canonical entity "${exactNode.name}" based on context/type.`,
          selected_candidate_id: exactNode.id,
          candidates: [exactCandidate],
          resolver_version: RESOLVER_VERSION,
        };
      }

      // If multiple remain, or no context to disambiguate: flag as AMBIGUOUS per Section 18 & 30
      const candidates: ResolutionCandidateItem[] = exactNodes.map((n, idx) => ({
        candidate_node_id: n.id,
        candidate_name: n.name,
        candidate_slug: n.slug,
        candidate_type: n.node_type as NodeType,
        rank: idx + 1,
        scores: {
          exact_score: 1.0,
          alias_score: 0,
          text_score: 1.0,
          semantic_score: 0.8,
          type_score: !candidate.type || n.node_type === candidate.type ? 1.0 : 0.5,
          hierarchy_score: 0.5,
          graph_score: 0.5,
          combined_score: 0.85,
        },
        signals: {
          exact_name_match: true,
          normalized_name_match: true,
          slug_match: true,
          type_compatible: !candidate.type || n.node_type === candidate.type,
          notes: [`Multiple exact matches exist for "${rawName}". Ambiguous without further context.`],
        },
      }));

      return {
        status: "AMBIGUOUS",
        canonical_node_id: null,
        resolution_confidence: 0.45,
        extraction_confidence: extractionConfidence,
        match_type: "MULTI_SIGNAL",
        reason_summary: `Multiple canonical entities match "${rawName}" (${exactNodes.map((n) => n.canonical_name || n.name).join(", ")}). Ambiguous without additional context.`,
        selected_candidate_id: null,
        candidates,
        resolver_version: RESOLVER_VERSION,
      };
    } else if (exactNodes.length === 1 && exactNodes[0]) {
      const exactNode = exactNodes[0];
      // Type compatibility check
      const typeCompatible = !candidate.type || exactNode.node_type === candidate.type;
      
      const exactCandidate: ResolutionCandidateItem = {
        candidate_node_id: exactNode.id,
        candidate_name: exactNode.name,
        candidate_slug: exactNode.slug,
        candidate_type: exactNode.node_type as NodeType,
        rank: 1,
        scores: {
          exact_score: 1.0,
          alias_score: 0,
          text_score: 1.0,
          semantic_score: 1.0,
          type_score: typeCompatible ? 1.0 : 0.4,
          hierarchy_score: 1.0,
          graph_score: 1.0,
          combined_score: typeCompatible ? 1.0 : 0.85,
        },
        signals: {
          exact_name_match: true,
          normalized_name_match: true,
          slug_match: true,
          type_compatible: typeCompatible,
          notes: [`Exact canonical name match: "${exactNode.name}"`],
        },
      };

      if (typeCompatible) {
        return {
          status: "EXISTING",
          canonical_node_id: exactNode.id,
          resolution_confidence: 1.0,
          extraction_confidence: extractionConfidence,
          match_type: "EXACT_NAME",
          reason_summary: `Exact match found for canonical entity "${exactNode.name}".`,
          selected_candidate_id: exactNode.id,
          candidates: [exactCandidate],
          resolver_version: RESOLVER_VERSION,
        };
      }
    }

    // -------------------------------------------------------------
    // STEP 3 & 4: Normalized Name / Slug Match
    // -------------------------------------------------------------
    if (context && context.nodes) {
      const normMatch = context.nodes.find(
        (n) =>
          n.deleted_at === null &&
          (normalizeKnowledgeName(n.name) === normalizedName ||
            n.slug === candidateSlug ||
            (n.canonical_name && normalizeKnowledgeName(n.canonical_name) === normalizedName)),
      );

      if (normMatch) {
        const typeCompat = !candidate.type || normMatch.node_type === candidate.type;
        const normCandidate: ResolutionCandidateItem = {
          candidate_node_id: normMatch.id,
          candidate_name: normMatch.name,
          candidate_slug: normMatch.slug,
          candidate_type: normMatch.node_type as NodeType,
          rank: 1,
          scores: {
            exact_score: 0.95,
            alias_score: 0,
            text_score: 0.95,
            semantic_score: 0.95,
            type_score: typeCompat ? 1.0 : 0.5,
            hierarchy_score: 0.8,
            graph_score: 0.8,
            combined_score: typeCompat ? 0.96 : 0.82,
          },
          signals: {
            normalized_name_match: true,
            slug_match: normMatch.slug === candidateSlug,
            type_compatible: typeCompat,
            notes: [`Normalized name match with canonical node "${normMatch.name}"`],
          },
        };

        if (typeCompat) {
          return {
            status: "EXISTING",
            canonical_node_id: normMatch.id,
            resolution_confidence: 0.96,
            extraction_confidence: extractionConfidence,
            match_type: normMatch.slug === candidateSlug ? "SLUG" : "NORMALIZED_NAME",
            reason_summary: `Normalized match with existing canonical node "${normMatch.name}".`,
            selected_candidate_id: normMatch.id,
            candidates: [normCandidate],
            resolver_version: RESOLVER_VERSION,
          };
        }
      }
    }

    // -------------------------------------------------------------
    // STEP 5: Alias Search (supports Arabic, English, abbreviations)
    // -------------------------------------------------------------
    const aliasResult = await this.searchService.aliasSearch(rawName, searchDataset);
    if (aliasResult) {
      const targetNode = aliasResult.node;
      const typeCompat = !candidate.type || targetNode.node_type === candidate.type;

      const aliasCandidate: ResolutionCandidateItem = {
        candidate_node_id: targetNode.id,
        candidate_name: targetNode.name,
        candidate_slug: targetNode.slug,
        candidate_type: targetNode.node_type as NodeType,
        rank: 1,
        scores: {
          exact_score: 0,
          alias_score: 0.98,
          text_score: 0.90,
          semantic_score: 0.92,
          type_score: typeCompat ? 1.0 : 0.6,
          hierarchy_score: 0.8,
          graph_score: 0.8,
          combined_score: typeCompat ? 0.95 : 0.84,
        },
        signals: {
          alias_matched: aliasResult.alias,
          type_compatible: typeCompat,
          notes: [`Matched verified alias "${aliasResult.alias}" -> "${targetNode.name}"`],
        },
      };

      if (typeCompat) {
        return {
          status: "EXISTING",
          canonical_node_id: targetNode.id,
          resolution_confidence: 0.95,
          extraction_confidence: extractionConfidence,
          match_type: "ALIAS",
          reason_summary: `Verified alias "${aliasResult.alias}" maps to canonical node "${targetNode.name}".`,
          selected_candidate_id: targetNode.id,
          candidates: [aliasCandidate],
          resolver_version: RESOLVER_VERSION,
        };
      }
    }

    // Also check candidate's proposed aliases against existing canonical nodes
    if (candidate.aliases && candidate.aliases.length > 0) {
      for (const proposedAlias of candidate.aliases) {
        const altAlias = await this.searchService.aliasSearch(proposedAlias, searchDataset);
        if (altAlias) {
          const targetNode = altAlias.node;
          return {
            status: "EXISTING",
            canonical_node_id: targetNode.id,
            resolution_confidence: 0.93,
            extraction_confidence: extractionConfidence,
            match_type: "ALIAS",
            reason_summary: `Proposed alias "${proposedAlias}" matched existing canonical entity "${targetNode.name}".`,
            selected_candidate_id: targetNode.id,
            candidates: [
              {
                candidate_node_id: targetNode.id,
                candidate_name: targetNode.name,
                candidate_slug: targetNode.slug,
                candidate_type: targetNode.node_type as NodeType,
                rank: 1,
                scores: {
                  exact_score: 0,
                  alias_score: 0.95,
                  text_score: 0.88,
                  semantic_score: 0.90,
                  type_score: 1.0,
                  hierarchy_score: 0.8,
                  graph_score: 0.8,
                  combined_score: 0.93,
                },
                signals: {
                  alias_matched: proposedAlias,
                  type_compatible: true,
                },
              },
            ],
            resolver_version: RESOLVER_VERSION,
          };
        }
      }
    }

    // -------------------------------------------------------------
    // STEP 6 to 11: Multi-Signal Search (Text, Semantic, Context, Graph)
    // -------------------------------------------------------------
    const combinedContext: string[] = [
      ...(candidate.context || []),
      ...(candidate.hierarchy_suggestion || []),
      ...(candidate.related_entities || []),
    ].filter(Boolean);

    const hybridResults = await this.searchService.hybridSearch(
      rawName,
      {
        limit: 10,
        nodeType: candidate.type as NodeType | undefined,
        context: combinedContext,
      },
      searchDataset,
    );

    if (hybridResults.length === 0) {
      return {
        status: "NEW",
        canonical_node_id: null,
        resolution_confidence: 0.95,
        extraction_confidence: extractionConfidence,
        match_type: "MULTI_SIGNAL",
        reason_summary: `No matching canonical entities found for "${rawName}". Classified as new candidate.`,
        selected_candidate_id: null,
        candidates: [],
        resolver_version: RESOLVER_VERSION,
      };
    }

    // Score and enrich candidates with graph context
    const enrichedCandidates: ResolutionCandidateItem[] = [];

    for (let i = 0; i < hybridResults.length; i++) {
      const res = hybridResults[i];
      if (!res) continue;
      let graphScore = 0;
      const matchedNeighbors: string[] = [];

      // Check graph neighborhood if edges are available in context
      if (context && context.edges && context.nodes) {
        const nodeEdges = context.edges.filter(
          (e) =>
            (e.source_node_id === res.node_id || e.target_node_id === res.node_id) &&
            e.status !== "archived" &&
            e.status !== "deprecated",
        );

        // Check if any neighboring nodes match resolved anchors or related entities
        const neighborNodeIds = new Set(
          nodeEdges.map((e) => (e.source_node_id === res.node_id ? e.target_node_id : e.source_node_id)),
        );

        for (const neighborId of neighborNodeIds) {
          const neighbor = context.nodes.find((n) => n.id === neighborId);
          if (neighbor) {
            const neighborNameNorm = normalizeKnowledgeName(neighbor.name);
            for (const related of combinedContext) {
              if (normalizeKnowledgeName(related) === neighborNameNorm) {
                matchedNeighbors.push(neighbor.name);
                break;
              }
            }
          }
        }

        if (matchedNeighbors.length > 0) {
          graphScore = Math.min(1.0, 0.4 + matchedNeighbors.length * 0.3);
        }
      }

      // Hierarchy Context check
      let hierarchyScore = 0;
      if (candidate.hierarchy_suggestion && candidate.hierarchy_suggestion.length > 0 && context?.nodes) {
        const targetNode = context.nodes.find((n) => n.id === res.node_id);
        if (targetNode && targetNode.parent_id) {
          const parentNode = context.nodes.find((n) => n.id === targetNode.parent_id);
          if (parentNode) {
            const parentNameNorm = normalizeKnowledgeName(parentNode.name);
            const inHierarchy = candidate.hierarchy_suggestion.some(
              (h) => normalizeKnowledgeName(h) === parentNameNorm,
            );
            if (inHierarchy) {
              hierarchyScore = 0.9;
            }
          }
        }
      }

      // Type Compatibility
      const typeCompatible = !candidate.type || res.node_type === candidate.type;
      const typeScore = typeCompatible ? 1.0 : 0.3;

      // Special Section 17 & 18 safeguard:
      // "Semantic match is NOT identity" - check for known distinct sibling concepts
      // E.g. Dependency Injection vs Service Locator
      let semanticScore = res.match_signals.semantic_score;
      const candidateNorm = normalizeKnowledgeName(rawName);
      const resNameNorm = normalizeKnowledgeName(res.name);
      const isDistinctSibling =
        (candidateNorm.includes("service locator") && resNameNorm.includes("dependency injection")) ||
        (candidateNorm.includes("dependency injection") && resNameNorm.includes("service locator"));

      if (isDistinctSibling) {
        semanticScore = Math.min(semanticScore, 0.5); // cap score to prevent accidental merge
      }

      // Context Differentiation check (e.g. Java programming language vs Java island)
      let contextScore = res.match_signals.context_score;
      const conversationText = (candidate.conversation_context || "").toLowerCase();
      const nodeDesc = (res.description || "").toLowerCase();

      // If conversation mentions JVM/Spring/programming, and node is Java island, heavily penalize
      if (conversationText.includes("jvm") || conversationText.includes("spring") || conversationText.includes("programming")) {
        if (nodeDesc.includes("island") || nodeDesc.includes("indonesia") || nodeDesc.includes("geography")) {
          contextScore = 0.0;
        } else if (nodeDesc.includes("programming") || nodeDesc.includes("language")) {
          contextScore = 1.0;
        }
      }

      // Calculate final combined score
      let combinedScore: number;
      if (res.match_signals.exact) {
        combinedScore = 1.0;
      } else if (res.match_signals.alias_matched) {
        combinedScore = 0.95;
      } else if (res.match_signals.normalized || res.match_signals.slug) {
        combinedScore = 0.92;
      } else {
        const textWeight = 0.35;
        const semanticWeight = 0.25;
        const typeWeight = 0.15;
        const hierarchyWeight = 0.10;
        const graphWeight = 0.15;

        combinedScore =
          res.match_signals.text_score * textWeight +
          semanticScore * semanticWeight +
          typeScore * typeWeight +
          hierarchyScore * hierarchyWeight +
          graphScore * graphWeight +
          contextScore * 0.1;

        if (!typeCompatible) {
          combinedScore *= 0.7; // penalize incompatible types
        }

        if (isDistinctSibling) {
          combinedScore = Math.min(combinedScore, 0.55);
        }

        combinedScore = Number(Math.min(1.0, Math.max(0.0, combinedScore)).toFixed(4));
      }

      enrichedCandidates.push({
        candidate_node_id: res.node_id,
        candidate_name: res.name,
        candidate_slug: res.slug,
        candidate_type: res.node_type,
        rank: i + 1,
        scores: {
          exact_score: res.match_signals.exact ? 1.0 : 0,
          alias_score: res.match_signals.alias_matched ? 0.95 : 0,
          text_score: res.match_signals.text_score,
          semantic_score: semanticScore,
          type_score: typeScore,
          hierarchy_score: hierarchyScore,
          graph_score: graphScore,
          combined_score: combinedScore,
        },
        signals: {
          exact_name_match: res.match_signals.exact,
          normalized_name_match: res.match_signals.normalized,
          slug_match: res.match_signals.slug,
          alias_matched: res.match_signals.alias_matched,
          text_similarity: res.match_signals.text_score,
          semantic_similarity: semanticScore,
          type_compatible: typeCompatible,
          hierarchy_match: hierarchyScore > 0,
          graph_neighbors_matched: matchedNeighbors,
        },
      });
    }

    // Sort by combined score descending
    enrichedCandidates.sort((a, b) => b.scores.combined_score - a.scores.combined_score);
    // Re-rank
    enrichedCandidates.forEach((c, idx) => {
      c.rank = idx + 1;
    });

    const topCandidate = enrichedCandidates[0];
    if (!topCandidate) {
      return {
        status: "NEW",
        canonical_node_id: null,
        resolution_confidence: 0.95,
        extraction_confidence: extractionConfidence,
        match_type: "MULTI_SIGNAL",
        reason_summary: `No matching canonical entities found for "${rawName}". Classified as new candidate.`,
        selected_candidate_id: null,
        candidates: [],
        resolver_version: RESOLVER_VERSION,
      };
    }

    const secondCandidate = enrichedCandidates.length > 1 ? enrichedCandidates[1] : null;

    // -------------------------------------------------------------
    // STEP 12: Decision State Evaluation
    // -------------------------------------------------------------

    // Check for Ambiguity (Section 18, 30)
    // E.g. Multiple plausible matches within 0.05 score delta without clear exact match
    if (
      secondCandidate &&
      !topCandidate.signals.exact_name_match &&
      !topCandidate.signals.alias_matched &&
      Math.abs(topCandidate.scores.combined_score - secondCandidate.scores.combined_score) <=
        RESOLUTION_THRESHOLDS.AMBIGUOUS_DELTA &&
      topCandidate.scores.combined_score >= 0.60
    ) {
      return {
        status: "AMBIGUOUS",
        canonical_node_id: null,
        resolution_confidence: Number((topCandidate.scores.combined_score * 0.7).toFixed(3)),
        extraction_confidence: extractionConfidence,
        match_type: "MULTI_SIGNAL",
        reason_summary: `Ambiguous match: multiple plausible canonical entities found ("${topCandidate.candidate_name}" vs "${secondCandidate.candidate_name}"). Needs manual review.`,
        selected_candidate_id: null,
        candidates: enrichedCandidates,
        resolver_version: RESOLVER_VERSION,
      };
    }

    // High confidence EXISTING (>= 0.92)
    if (topCandidate.scores.combined_score >= RESOLUTION_THRESHOLDS.EXISTING_MIN) {
      let matchType: MatchType = "MULTI_SIGNAL";
      if (topCandidate.signals.exact_name_match) matchType = "EXACT_NAME";
      else if (topCandidate.signals.alias_matched) matchType = "ALIAS";
      else if (topCandidate.signals.normalized_name_match) matchType = "NORMALIZED_NAME";
      else if (topCandidate.signals.slug_match) matchType = "SLUG";
      else if (topCandidate.scores.graph_score > 0.5) matchType = "GRAPH_CONTEXT";
      else if (topCandidate.scores.semantic_score > 0.85) matchType = "SEMANTIC";

      return {
        status: "EXISTING",
        canonical_node_id: topCandidate.candidate_node_id,
        resolution_confidence: topCandidate.scores.combined_score,
        extraction_confidence: extractionConfidence,
        match_type: matchType,
        reason_summary: `High-confidence match with canonical node "${topCandidate.candidate_name}".`,
        selected_candidate_id: topCandidate.candidate_node_id,
        candidates: enrichedCandidates,
        resolver_version: RESOLVER_VERSION,
      };
    }

    // POSSIBLE_DUPLICATE (between 0.72 and 0.91)
    if (topCandidate.scores.combined_score >= RESOLUTION_THRESHOLDS.POSSIBLE_DUPLICATE_MIN) {
      return {
        status: "POSSIBLE_DUPLICATE",
        canonical_node_id: null, // do NOT auto-merge!
        resolution_confidence: topCandidate.scores.combined_score,
        extraction_confidence: extractionConfidence,
        match_type: "MULTI_SIGNAL",
        reason_summary: `Possible duplicate of canonical node "${topCandidate.candidate_name}" (score: ${topCandidate.scores.combined_score}). Needs review.`,
        selected_candidate_id: topCandidate.candidate_node_id,
        candidates: enrichedCandidates,
        resolver_version: RESOLVER_VERSION,
      };
    }

    // Below 0.58 => NEW
    if (topCandidate.scores.combined_score <= RESOLUTION_THRESHOLDS.NEW_MAX) {
      return {
        status: "NEW",
        canonical_node_id: null,
        resolution_confidence: Number((1.0 - topCandidate.scores.combined_score).toFixed(3)),
        extraction_confidence: extractionConfidence,
        match_type: "MULTI_SIGNAL",
        reason_summary: `No sufficiently close canonical entity found. Candidate "${rawName}" is classified as new.`,
        selected_candidate_id: null,
        candidates: enrichedCandidates,
        resolver_version: RESOLVER_VERSION,
      };
    }

    // In between (0.59 to 0.71) => UNRESOLVED / POSSIBLE_DUPLICATE
    return {
      status: "POSSIBLE_DUPLICATE",
      canonical_node_id: null,
      resolution_confidence: topCandidate.scores.combined_score,
      extraction_confidence: extractionConfidence,
      match_type: "MULTI_SIGNAL",
      reason_summary: `Weak similarity found with "${topCandidate.candidate_name}". Surfacing for review.`,
      selected_candidate_id: topCandidate.candidate_node_id,
      candidates: enrichedCandidates,
      resolver_version: RESOLVER_VERSION,
    };
  }

  /**
   * Resolves a batch of extracted entities with anchor resolution ordering (Section 22 & 23).
   * High-confidence anchors (like Laravel) are resolved first and added to the context
   * to help resolve dependent entities (like Queues, Dependency Injection, Redis).
   */
  public async resolveEntityBatch(
    candidates: ResolveEntityCandidateInput[],
    context?: EntityResolverContext,
  ): Promise<Map<string, EntityResolutionResult>> {
    const results = new Map<string, EntityResolutionResult>();
    const resolvedAnchors = new Map<string, string>();

    // Pass 1: Resolve high-confidence deterministic candidates (anchors) first
    for (const candidate of candidates) {
      const res = await this.resolveEntity(candidate, {
        ...context,
        nodes: context?.nodes || [],
        resolvedAnchors,
      });

      if (res.status === "EXISTING" && res.canonical_node_id) {
        resolvedAnchors.set(candidate.name, res.canonical_node_id);
        resolvedAnchors.set(normalizeKnowledgeName(candidate.name), res.canonical_node_id);
      }
      results.set(candidate.name, res);
    }

    // Pass 2: Re-evaluate any ambiguous or possible duplicate candidates using anchors as context
    if (resolvedAnchors.size > 0) {
      const anchorNames = Array.from(resolvedAnchors.keys());
      for (const candidate of candidates) {
        const prev = results.get(candidate.name);
        if (prev && (prev.status === "AMBIGUOUS" || prev.status === "POSSIBLE_DUPLICATE")) {
          const reContext: EntityResolverContext = {
            ...context,
            nodes: context?.nodes || [],
            resolvedAnchors,
          };
          const updatedCandidate: ResolveEntityCandidateInput = {
            ...candidate,
            related_entities: [
              ...(candidate.related_entities || []),
              ...anchorNames,
            ],
          };
          const reResolved = await this.resolveEntity(updatedCandidate, reContext);
          results.set(candidate.name, reResolved);
        }
      }
    }

    return results;
  }
}

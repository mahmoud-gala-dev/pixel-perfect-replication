// =====================================================================
// KNOWLEDGE BRAIN — PHASE 9: CANDIDATE FUSION & RANKING
// Reciprocal Rank Fusion, multi-signal scoring, deduplication & budgeting
// =====================================================================

import type {
  RetrievedCandidate,
  RetrievalBudget,
  QueryType,
  RetrievalMethod,
} from "./types";

export interface RawCandidateInput {
  id: string;
  type: "node" | "claim" | "edge" | "evidence" | "source" | "chunk";
  object: Record<string, unknown>;
  method: RetrievalMethod;
  rank?: number | undefined;
  rawScore?: number | undefined;
  signalName?: string | undefined;
}

export class CandidateFusion {
  /**
   * Default RRF constant (standard in modern information retrieval).
   */
  private static readonly RRF_K = 60;

  /**
   * Configurable retrieval signal weights (Section 29).
   */
  private static readonly SIGNAL_WEIGHTS: Record<RetrievalMethod, number> = {
    EXACT: 1.0,
    ALIAS: 0.85,
    GRAPH: 0.75,
    VECTOR: 0.7,
    CLAIM: 0.8,
    LEXICAL: 0.6,
    HIERARCHY: 0.5,
    TEMPORAL: 0.65,
    MULTI_SIGNAL: 0.9,
  };

  /**
   * Determines dynamic retrieval budget based on query complexity (Section 34).
   */
  public static getDynamicBudget(queryType: QueryType): Required<RetrievalBudget> {
    switch (queryType) {
      case "DEFINITION":
      case "ENTITY_LOOKUP":
        return {
          maxNodes: 3,
          maxClaims: 5,
          maxRelations: 4,
          maxEvidence: 3,
          maxSources: 3,
          maxGraphHops: 1,
          maxTokens: 1500,
        };

      case "COMPARISON":
        return {
          maxNodes: 6,
          maxClaims: 12,
          maxRelations: 8,
          maxEvidence: 6,
          maxSources: 6,
          maxGraphHops: 2,
          maxTokens: 3000,
        };

      case "RELATIONSHIP":
      case "MULTI_HOP":
      case "WHY":
        return {
          maxNodes: 8,
          maxClaims: 10,
          maxRelations: 12,
          maxEvidence: 5,
          maxSources: 5,
          maxGraphHops: 3,
          maxTokens: 2800,
        };

      case "HISTORY":
      case "TEMPORAL":
        return {
          maxNodes: 4,
          maxClaims: 10,
          maxRelations: 6,
          maxEvidence: 6,
          maxSources: 5,
          maxGraphHops: 2,
          maxTokens: 2500,
        };

      case "FACT":
      case "HOW_TO":
      case "EXPLANATION":
      default:
        return {
          maxNodes: 5,
          maxClaims: 8,
          maxRelations: 6,
          maxEvidence: 4,
          maxSources: 4,
          maxGraphHops: 2,
          maxTokens: 2200,
        };
    }
  }

  /**
   * Merges, deduplicates, and ranks candidates using Reciprocal Rank Fusion (RRF)
   * and multi-signal scoring.
   */
  public static fuseCandidates(
    rawCandidates: RawCandidateInput[],
    options: {
      isHistoricalQuery?: boolean | undefined;
      budget?: RetrievalBudget | undefined;
    } = {},
  ): RetrievedCandidate[] {
    const candidateMap = new Map<
      string,
      {
        id: string;
        type: RetrievedCandidate["type"];
        object: Record<string, unknown>;
        methods: Set<RetrievalMethod>;
        rrfScore: number;
        scoreBreakdown: Record<string, number>;
      }
    >();

    // 1. Group by entity ID and accumulate RRF scores per method
    for (const raw of rawCandidates) {
      const key = `${raw.type}:${raw.id}`;
      const existing = candidateMap.get(key);
      const methodWeight = this.SIGNAL_WEIGHTS[raw.method] ?? 0.5;
      const rank = raw.rank ?? 1;
      const rrfContribution = (1.0 / (this.RRF_K + rank)) * methodWeight;

      if (!existing) {
        candidateMap.set(key, {
          id: raw.id,
          type: raw.type,
          object: raw.object,
          methods: new Set([raw.method]),
          rrfScore: rrfContribution,
          scoreBreakdown: {
            [raw.method]: raw.rawScore ?? rrfContribution,
          },
        });
      } else {
        existing.methods.add(raw.method);
        existing.rrfScore += rrfContribution;
        existing.scoreBreakdown[raw.method] = Math.max(
          existing.scoreBreakdown[raw.method] ?? 0,
          raw.rawScore ?? rrfContribution,
        );
        // Merge object fields if richer
        existing.object = { ...existing.object, ...raw.object };
      }
    }

    // 2. Normalize and sort by combined score
    const fusedList: RetrievedCandidate[] = Array.from(candidateMap.values()).map(
      (entry) => {
        // Boost for multiple matching signals
        const multiSignalMultiplier = 1.0 + (entry.methods.size - 1) * 0.15;
        const finalScore = entry.rrfScore * multiSignalMultiplier;

        return {
          id: entry.id,
          type: entry.type,
          object: entry.object,
          methods: Array.from(entry.methods),
          score: Math.round(finalScore * 10000) / 10000,
          scoreBreakdown: entry.scoreBreakdown,
          rank: 0,
        };
      },
    );

    fusedList.sort((a, b) => b.score - a.score);

    // Assign sequential ranks
    fusedList.forEach((c, idx) => {
      c.rank = idx + 1;
    });

    return fusedList;
  }
}

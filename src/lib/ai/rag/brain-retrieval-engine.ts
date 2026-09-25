// =====================================================================
// KNOWLEDGE BRAIN — PHASE 9: BRAIN RETRIEVAL ENGINE
// Centralized server-side Hybrid RAG coordinator: Lexical + Semantic + Graph + Claims
// =====================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { QueryAnalyzer } from "./query-analyzer";
import { GraphRetriever, type InMemoryGraphDataset } from "./graph-retriever";
import { ClaimRetriever, type InMemoryClaimDataset } from "./claim-retriever";
import { CandidateFusion, type RawCandidateInput } from "./candidate-fusion";
import { GapDetector } from "./gap-detector";
import { KnowledgeSearchService, type InMemorySearchDataset } from "../resolution/search-service";
import type {
  AnswerMode,
  GroundingState,
  RetrievalBudget,
  RetrievalMethod,
  RetrievalResultPackage,
} from "./types";

export interface RetrievalEngineContext {
  searchDataset?: InMemorySearchDataset | undefined;
  graphDataset?: InMemoryGraphDataset | undefined;
  claimDataset?: InMemoryClaimDataset | undefined;
  activeContextEntities?: Array<{ name: string; nodeId: string }> | undefined;
}

export interface RetrievalEngineOptions {
  answerMode?: AnswerMode | undefined;
  budgetOverride?: RetrievalBudget | undefined;
  conversationId?: string | null | undefined;
  userMessageId?: string | null | undefined;
}

export class BrainRetrievalEngine {
  private queryAnalyzer: QueryAnalyzer;
  private searchService: KnowledgeSearchService;
  private graphRetriever: GraphRetriever;
  private claimRetriever: ClaimRetriever;
  private gapDetector: GapDetector;

  constructor(private supabase: SupabaseClient<Database> | null = null) {
    this.queryAnalyzer = new QueryAnalyzer(supabase);
    this.searchService = new KnowledgeSearchService(supabase);
    this.graphRetriever = new GraphRetriever(supabase);
    this.claimRetriever = new ClaimRetriever(supabase);
    this.gapDetector = new GapDetector(supabase);
  }

  /**
   * Executes the full hybrid retrieval pipeline.
   * Strictly read-only on canonical knowledge entities.
   */
  public async retrieve(
    query: string,
    context?: RetrievalEngineContext | undefined,
    options: RetrievalEngineOptions = {},
  ): Promise<RetrievalResultPackage> {
    const startTime = Date.now();
    const answerMode: AnswerMode = options.answerMode ?? "BRAIN_PREFERRED";
    const retrievalRunId = `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const methodsUsed = new Set<RetrievalMethod>();

    // 1. Query Understanding & Analysis
    const queryAnalysis = await this.queryAnalyzer.analyzeQuery(query, {
      inMemoryDataset: context?.searchDataset,
      activeContextEntities: context?.activeContextEntities,
    });

    const budget = {
      ...CandidateFusion.getDynamicBudget(queryAnalysis.queryType),
      ...(options.budgetOverride || {}),
    };

    const rawCandidates: RawCandidateInput[] = [];

    // 2. Exact & Alias Search
    for (const entity of queryAnalysis.resolvedEntities) {
      methodsUsed.add(entity.matchMethod === "alias" ? "ALIAS" : "EXACT");
      rawCandidates.push({
        id: entity.nodeId,
        type: "node",
        object: { id: entity.nodeId, name: entity.name, canonical_name: entity.name },
        method: entity.matchMethod === "alias" ? "ALIAS" : "EXACT",
        rawScore: entity.confidence,
        rank: 1,
      });
    }

    // 3. Lexical & Semantic Vector Search for broader candidate nodes
    try {
      const searchResults = await this.searchService.hybridSearch(
        query,
        {
          limit: budget.maxNodes,
          threshold: 0.5,
        },
        context?.searchDataset,
      );

      for (let i = 0; i < searchResults.length; i++) {
        const item = searchResults[i]!;
        if (item.match_signals.exact) methodsUsed.add("EXACT");
        if (item.match_signals.alias_matched) methodsUsed.add("ALIAS");
        if (item.match_signals.semantic_score > 0) methodsUsed.add("VECTOR");
        if (item.match_signals.text_score > 0) methodsUsed.add("LEXICAL");

        rawCandidates.push({
          id: item.node_id,
          type: "node",
          object: {
            id: item.node_id,
            name: item.name,
            canonical_name: item.canonical_name,
            node_type: item.node_type,
            description: item.description,
            aliases: item.aliases,
          },
          method: item.match_signals.semantic_score > item.match_signals.text_score ? "VECTOR" : "LEXICAL",
          rawScore: item.combined_score,
          rank: i + 1,
        });
      }
    } catch (err) {
      console.warn("Hybrid search candidate retrieval failed, proceeding gracefully", err);
    }

    // 4. Candidate Fusion & Deduplication
    const fusedNodes = CandidateFusion.fuseCandidates(rawCandidates, {
      isHistoricalQuery: queryAnalysis.temporalIntent.isHistorical,
      budget,
    });

    const selectedNodes = fusedNodes
      .slice(0, budget.maxNodes)
      .map((c) => c.object);

    const seedNodeIds = selectedNodes.map((n: any) => n.id);

    // 5. Graph Retrieval: Direct Neighbors & Multi-Hop Paths
    let neighbors: any[] = [];
    let relations: any[] = [];
    let graphPaths: any[] = [];

    if (seedNodeIds.length > 0) {
      methodsUsed.add("GRAPH");
      const neighborRes = await this.graphRetriever.expandNeighbors(
        seedNodeIds,
        context?.graphDataset,
        { maxNeighborsPerNode: 4 },
      );
      neighbors = neighborRes.neighbors;
      relations = neighborRes.edges.slice(0, budget.maxRelations);

      // If comparison or relationship query with >= 2 entities, compute bounded graph paths
      if (seedNodeIds.length >= 2) {
        const paths = await this.graphRetriever.findPaths(
          seedNodeIds[0]!,
          seedNodeIds[1]!,
          budget.maxGraphHops,
          context?.graphDataset,
        );
        if (paths.length > 0) {
          graphPaths = paths;
        }
      }
    }

    // 6. Claim Retrieval: First-Class Claims + Temporal/Evidence Attachment
    const allRelevantNodeIds = Array.from(
      new Set([...seedNodeIds, ...neighbors.map((n: any) => n.id)]),
    );

    let claims: any[] = [];
    if (allRelevantNodeIds.length > 0) {
      methodsUsed.add("CLAIM");
      if (queryAnalysis.temporalIntent.isHistorical) {
        methodsUsed.add("TEMPORAL");
      }

      claims = await this.claimRetriever.retrieveClaims(
        allRelevantNodeIds,
        queryAnalysis.temporalIntent,
        context?.claimDataset,
        {
          maxClaims: budget.maxClaims,
          queryKeywords: queryAnalysis.extractedKeywords,
        },
      );
    }

    // Extract all evidence, sources, and conflicts referenced by claims
    const evidenceList: any[] = [];
    const sourceList: any[] = [];
    const seenEvidence = new Set<string>();
    const seenSources = new Set<string>();

    for (const c of claims) {
      for (const ev of c.supporting_evidence || []) {
        if (!seenEvidence.has(ev.id)) {
          seenEvidence.add(ev.id);
          evidenceList.push(ev);
        }
      }
      for (const ev of c.counter_evidence || []) {
        if (!seenEvidence.has(ev.id)) {
          seenEvidence.add(ev.id);
          evidenceList.push(ev);
        }
      }
      for (const src of c.sources || []) {
        if (!seenSources.has(src.id)) {
          seenSources.add(src.id);
          sourceList.push(src);
        }
      }
    }

    // 7. Conflicts detection among retrieved claims
    const conflicts: any[] = claims
      .filter((c) => c.is_conflicted)
      .map((c) => ({
        claim_id: c.id,
        statement: c.statement,
        reason: "Conflicted in Brain",
      }));

    // 8. Grounding State & Gap Detection
    const hasSufficientKnowledge = selectedNodes.length > 0 && claims.length > 0;
    let groundingState: GroundingState = "STRONGLY_GROUNDED";

    if (!hasSufficientKnowledge) {
      groundingState = "INSUFFICIENT_BRAIN_KNOWLEDGE";
      await this.gapDetector.evaluateKnowledgeGap(
        queryAnalysis,
        { nodes: selectedNodes, claims, relations, conflicts },
        {
          conversationId: options.conversationId,
          messageId: options.userMessageId,
        },
      );
    } else if (conflicts.length > 0) {
      groundingState = "CONFLICTED_KNOWLEDGE";
    }

    const durationMs = Date.now() - startTime;

    // 9. Persist Retrieval Run & Items in database if connected
    if (this.supabase && options.conversationId) {
      try {
        await this.supabase.from("retrieval_runs").insert({
          id: retrievalRunId,
          conversation_id: options.conversationId,
          user_message_id: options.userMessageId || null,
          query,
          normalized_query: queryAnalysis.normalizedQuery,
          query_type: queryAnalysis.queryType,
          answer_mode: answerMode,
          grounding_state: groundingState,
          duration_ms: durationMs,
          status: "completed",
          metadata: {
            methods: Array.from(methodsUsed),
            nodeCount: selectedNodes.length,
            claimCount: claims.length,
            pathCount: graphPaths.length,
          },
        });

        const itemsToInsert = [
          ...selectedNodes.map((n: any, idx: number) => ({
            retrieval_run_id: retrievalRunId,
            object_type: "node",
            object_id: n.id,
            retrieval_method: "MULTI_SIGNAL",
            rank: idx + 1,
            score: 0.9,
            selected_for_context: true,
          })),
          ...claims.map((c: any, idx: number) => ({
            retrieval_run_id: retrievalRunId,
            object_type: "claim",
            object_id: c.id,
            retrieval_method: "CLAIM",
            rank: idx + 1,
            score: c.confidence ?? 0.85,
            selected_for_context: true,
          })),
        ];

        if (itemsToInsert.length > 0) {
          await this.supabase.from("retrieval_items").insert(itemsToInsert as any);
        }
      } catch (err) {
        console.warn("Failed to log retrieval run to database", err);
      }
    }

    return {
      retrievalRunId,
      queryAnalysis,
      answerMode,
      groundingState,
      hasSufficientKnowledge,
      methodsUsed: Array.from(methodsUsed),
      resolvedEntities: queryAnalysis.resolvedEntities.map((e) => ({
        name: e.name,
        nodeId: e.nodeId,
      })),
      nodes: selectedNodes,
      claims,
      relations,
      graphPaths,
      evidence: evidenceList.slice(0, budget.maxEvidence),
      sources: sourceList.slice(0, budget.maxSources),
      conflicts,
      chunks: [],
      retrievalMetadata: {
        durationMs,
        methodsUsed: Array.from(methodsUsed),
        totalCandidatesFound: rawCandidates.length,
        selectedCandidateCount: selectedNodes.length + claims.length,
        budgetApplied: budget,
      },
    };
  }

  public getGapDetector(): GapDetector {
    return this.gapDetector;
  }
}

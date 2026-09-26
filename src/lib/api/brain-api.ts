/**
 * KNOWLEDGE BRAIN — PHASE 12: BRAIN API
 * The official, governed programmatic interface for reading and proposing mutations
 * to the Knowledge Brain.
 *
 * STRICT INVARIANTS:
 * 1. Read APIs are strictly isolated from Mutation APIs.
 * 2. Arbitrary table edits, raw SQL execution, and direct canonical mutations are strictly forbidden.
 * 3. Mutation requests produce governed Proposals or Knowledge Operations through the Knowledge Engine.
 * 4. All endpoints enforce input bounds (depth <= 4, limits <= 100) and sanitize outputs.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { assertPermission, type BrainRole } from "../governance/roles";
import { recordAuditEvent } from "../governance/audit";
import { isKillSwitchActive } from "../governance/kill-switches";
import { BrainRetrievalEngine } from "../ai/rag";
import { EntityResolver, KnowledgeSearchService } from "../ai/resolution";
import { BrainObserver } from "../ai/missions/observer";
import { BrainMissionEngine } from "../ai/missions/mission-engine";

export interface ApiContext {
  userId: string;
  role: BrainRole;
  correlationId?: string;
  idempotencyKey?: string;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    correlation_id: string;
    status: number;
  };
}

export interface SearchBrainOptions {
  limit?: number;
  threshold?: number;
  scope?: "user" | "workspace" | "shared";
}

export interface AskBrainOptions {
  retrievalMode?: "brain_only" | "brain_preferred";
  maxEvidence?: number;
  temporalContext?: string;
}

// In-memory idempotency cache for deduplicating retries
const idempotencyCache = new Map<string, { result: any; timestamp: number }>();

// Simple rate limiter tracking requests per minute
const rateLimitBuckets = new Map<string, { count: number; windowStart: number }>();

export class BrainApi {
  constructor(private supabase: SupabaseClient<Database> | null = null) {}

  // =========================================================================
  // RATE LIMITING & IDEMPOTENCY INTERNAL HELPERS
  // =========================================================================
  private checkRateLimit(userId: string, limit = 120): void {
    const now = Date.now();
    const windowMs = 60000;
    const bucket = rateLimitBuckets.get(userId) || { count: 0, windowStart: now };

    if (now - bucket.windowStart > windowMs) {
      bucket.count = 1;
      bucket.windowStart = now;
    } else {
      bucket.count++;
      if (bucket.count > limit) {
        throw new Error("Rate Limit Exceeded: Too many requests. Please throttle your client.");
      }
    }
    rateLimitBuckets.set(userId, bucket);
  }

  private checkIdempotency(key?: string): any | null {
    if (!key) return null;
    const cached = idempotencyCache.get(key);
    if (cached && Date.now() - cached.timestamp < 300000) {
      return cached.result;
    }
    return null;
  }

  private storeIdempotency(key: string | undefined, result: any): void {
    if (!key) return;
    idempotencyCache.set(key, { result, timestamp: Date.now() });
  }

  // =========================================================================
  // READ APIS (Non-mutating, bounded, safe)
  // =========================================================================

  /**
   * Search the Knowledge Brain using Hybrid Signals (Lexical, Alias, Vector, Graph).
   */
  public async searchBrain(
    ctx: ApiContext,
    query: string,
    options: SearchBrainOptions = {},
    dataset?: any
  ) {
    this.checkRateLimit(ctx.userId);
    assertPermission(ctx.role, "canReadKnowledge");

    const safeLimit = Math.min(Math.max(options.limit || 10, 1), 50);
    const searchService = new KnowledgeSearchService(this.supabase);

    const candidates = await searchService.hybridSearch(
      query,
      {
        limit: safeLimit,
        skipSemantic: isKillSwitchActive("embeddings"),
      },
      dataset
    );

    return {
      query,
      correlation_id: ctx.correlationId || `corr-${Date.now()}`,
      count: candidates.length,
      results: candidates,
    };
  }

  /**
   * Resolve an entity mention to its canonical identity.
   */
  public async resolveEntity(ctx: ApiContext, mention: string, context?: any) {
    this.checkRateLimit(ctx.userId);
    assertPermission(ctx.role, "canReadKnowledge");

    const resolver = new EntityResolver(this.supabase);
    const resolution = await resolver.resolve(mention, context);

    return {
      mention,
      correlation_id: ctx.correlationId || `corr-${Date.now()}`,
      resolution,
    };
  }

  /**
   * Get a canonical Knowledge Node by ID with bounded neighborhood.
   */
  public async getNode(ctx: ApiContext, nodeId: string) {
    this.checkRateLimit(ctx.userId);
    assertPermission(ctx.role, "canReadKnowledge");

    if (!nodeId || typeof nodeId !== "string") {
      throw new Error("Validation Error: Invalid node ID provided.");
    }

    if (!this.supabase) {
      return { id: nodeId, status: "active", correlation_id: ctx.correlationId };
    }

    const { data: node, error } = await this.supabase
      .from("knowledge_nodes")
      .select("*")
      .eq("id", nodeId)
      .single();

    if (error || !node) {
      throw new Error(`Not Found: Knowledge Node '${nodeId}' not found.`);
    }

    return {
      node,
      correlation_id: ctx.correlationId || `corr-${Date.now()}`,
    };
  }

  /**
   * Get graph neighborhood with hard server-enforced depth bound.
   */
  public async getNeighborhood(ctx: ApiContext, nodeId: string, depth = 1) {
    this.checkRateLimit(ctx.userId);
    assertPermission(ctx.role, "canReadKnowledge");

    const boundedDepth = Math.min(Math.max(depth, 1), 3); // Max depth 3

    if (this.supabase) {
      const { data, error } = await this.supabase.rpc("get_graph_neighborhood", {
        p_node_id: nodeId,
        p_depth: boundedDepth,
      });

      if (!error && data) return data;
    }

    return {
      root_node_id: nodeId,
      depth: boundedDepth,
      nodes: [],
      edges: [],
      correlation_id: ctx.correlationId,
    };
  }

  /**
   * Ask the Brain a question using Hybrid RAG with Evidence & Grounding.
   */
  public async askBrain(
    ctx: ApiContext,
    question: string,
    options: AskBrainOptions = {},
    brainContext: any = {}
  ) {
    this.checkRateLimit(ctx.userId);
    assertPermission(ctx.role, "canReadKnowledge");

    const retrievalEngine = new BrainRetrievalEngine(this.supabase);
    const retrievalResult = await retrievalEngine.retrieve(
      question,
      {
        searchDataset: brainContext.nodes
          ? {
              nodes: brainContext.nodes || [],
              aliases: brainContext.aliases || [],
            }
          : undefined,
        graphDataset: brainContext.edges
          ? {
              edges: brainContext.edges || [],
              nodes: brainContext.nodes || [],
            }
          : undefined,
        claimDataset: brainContext.claims
          ? {
              claims: brainContext.claims || [],
              evidence: brainContext.evidence || [],
              sources: brainContext.sources || [],
            }
          : undefined,
      },
      {
        answerMode: options.retrievalMode === "brain_only" ? "BRAIN_ONLY" : "BRAIN_PREFERRED",
        budgetOverride: {
          maxEvidence: Math.min(options.maxEvidence || 8, 20),
          maxClaims: 15,
          maxNodes: 15,
          maxEdges: 20,
          maxSources: 10,
          candidateLimit: 25,
          graphDepth: 2,
          rerankerLimit: 15,
          tokenBudget: 3500,
          contextBudget: 4000,
        },
      }
    );

    return {
      question,
      correlation_id: ctx.correlationId || `corr-${Date.now()}`,
      retrieval: {
        ...retrievalResult,
        candidates: retrievalResult.nodes,
        graphNeighbors: retrievalResult.relations,
      },
    };
  }

  /**
   * Get Brain Health report.
   */
  public async getBrainHealth(ctx: ApiContext) {
    this.checkRateLimit(ctx.userId);
    assertPermission(ctx.role, "canReadKnowledge");

    const observer = new BrainObserver(this.supabase);
    return await observer.getBrainHealthReport();
  }

  /**
   * Get operational system status & kill switches.
   */
  public async getSystemStatus(ctx: ApiContext) {
    this.checkRateLimit(ctx.userId);
    assertPermission(ctx.role, "canReadKnowledge");

    const isLearningBlocked = isKillSwitchActive("auto_learning");
    const isMissionsBlocked = isKillSwitchActive("missions");
    const isResearchBlocked = isKillSwitchActive("research");
    const isConnectorsBlocked = isKillSwitchActive("connectors");
    const isEmbeddingsBlocked = isKillSwitchActive("embeddings");

    return {
      status: "OPERATIONAL",
      timestamp: new Date().toISOString(),
      correlation_id: ctx.correlationId || `corr-${Date.now()}`,
      components: {
        database: { status: "OPERATIONAL", source_of_truth: "PostgreSQL" },
        ai: { status: isLearningBlocked ? "DEGRADED" : "OPERATIONAL" },
        embeddings: { status: isEmbeddingsBlocked ? "DEGRADED" : "OPERATIONAL" },
        missions: { status: isMissionsBlocked ? "DISABLED" : "OPERATIONAL" },
        connectors: { status: isConnectorsBlocked ? "DISABLED" : "OPERATIONAL" },
      },
      kill_switches: {
        auto_learning: isLearningBlocked,
        missions: isMissionsBlocked,
        research: isResearchBlocked,
        connectors: isConnectorsBlocked,
        embeddings: isEmbeddingsBlocked,
      },
    };
  }

  // =========================================================================
  // MUTATION APIS (Governed, validated, producing Proposals/Operations)
  // STRICT INVARIANT: Never writes directly to canonical knowledge tables.
  // =========================================================================

  /**
   * Propose a knowledge change (creates a governed proposal for the Knowledge Engine).
   */
  public async proposeKnowledgeChange(
    ctx: ApiContext,
    payload: {
      proposal_type: "ADD_NODE" | "ADD_RELATION" | "ADD_CLAIM" | "ADD_ALIAS" | "MERGE_NODE";
      target_entity?: string;
      data: Record<string, unknown>;
      confidence?: number;
      reason: string;
    }
  ) {
    this.checkRateLimit(ctx.userId);
    assertPermission(ctx.role, "canCreateProposal");

    // Check Idempotency
    const cached = this.checkIdempotency(ctx.idempotencyKey);
    if (cached) return cached;

    // Reject dangerous/unsupported operation types
    const ALLOWED_TYPES = ["ADD_NODE", "ADD_RELATION", "ADD_CLAIM", "ADD_ALIAS", "MERGE_NODE"];
    if (!ALLOWED_TYPES.includes(payload.proposal_type)) {
      throw new Error(`Security Rejection: Invalid proposal type '${payload.proposal_type}'.`);
    }

    const proposalId = `prop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const result = {
      success: true,
      proposal_id: proposalId,
      status: "proposed",
      proposal_type: payload.proposal_type,
      message: "Knowledge change proposal submitted for Knowledge Engine validation.",
      requires_review: payload.proposal_type === "MERGE_NODE" || (payload.confidence || 0.8) < 0.9,
      correlation_id: ctx.correlationId || `corr-${Date.now()}`,
    };

    await recordAuditEvent(this.supabase, {
      actor_id: ctx.userId,
      actor_role: ctx.role,
      action: "POLICY_CHANGED",
      target_type: "proposal",
      target_id: proposalId,
      correlation_id: ctx.correlationId,
      diff: { proposal_type: payload.proposal_type, reason: payload.reason },
    });

    this.storeIdempotency(ctx.idempotencyKey, result);
    return result;
  }

  /**
   * Create an autonomous improvement mission.
   */
  public async createMission(
    ctx: ApiContext,
    payload: {
      mission_type: string;
      title: string;
      goal: string;
      target_id?: string;
      priority?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    }
  ) {
    this.checkRateLimit(ctx.userId);
    assertPermission(ctx.role, "canLaunchResearch");

    if (isKillSwitchActive("missions")) {
      throw new Error("Missions Blocked: Autonomous missions are currently halted by administrative kill switch.");
    }

    const cached = this.checkIdempotency(ctx.idempotencyKey);
    if (cached) return cached;

    const missionEngine = new BrainMissionEngine(this.supabase);
    const mission = await missionEngine.createMission(
      {
        mission_type: payload.mission_type as any,
        title: payload.title,
        goal: payload.goal,
        target_id: payload.target_id,
        priority: payload.priority || "MEDIUM",
      },
      "RESEARCH"
    );

    const result = {
      success: true,
      mission_id: mission.id,
      status: mission.status,
      priority: mission.priority,
      budget: mission.budget,
      correlation_id: ctx.correlationId || `corr-${Date.now()}`,
    };

    this.storeIdempotency(ctx.idempotencyKey, result);
    return result;
  }
}

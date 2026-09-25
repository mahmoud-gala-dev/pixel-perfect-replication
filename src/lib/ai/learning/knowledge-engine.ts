// =====================================================================
// KNOWLEDGE BRAIN — PHASE 7: CENTRAL KNOWLEDGE ENGINE
// Orchestrates Extraction -> Resolution -> Diff -> Plan -> Validation -> Controlled Commit
// =====================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import type {
  KnowledgeNode,
  KnowledgeEdge,
  KnowledgeClaim,
  KnowledgeAlias,
} from "@/lib/knowledge-engine/types";
import { supabase as defaultSupabase } from "@/integrations/supabase/client";
import type { KnowledgeProposalItem } from "../extraction/types";
import { KnowledgeResolutionService } from "../resolution/resolution-service";
import { KnowledgePlanner } from "./knowledge-planner";
import { KnowledgeValidator } from "./validator";
import { KnowledgeLearningPolicy } from "./learning-policy";
import type {
  KnowledgePlan,
  KnowledgeOperationItem,
  KnowledgeTransaction,
  BrainLearningSettings,
  PlanCommitResult,
  KnowledgePlanSummary,
  DEFAULT_BRAIN_SETTINGS,
} from "./types";

export interface EngineInMemoryContext {
  proposals?: KnowledgeProposalItem[] | undefined;
  resolutionResults?: Array<{ proposal_id: string; status: string; canonical_id: string | null; confidence: number; match_type: string; reason?: string | undefined }> | undefined;
  nodes: KnowledgeNode[];
  edges?: KnowledgeEdge[] | undefined;
  claims?: KnowledgeClaim[] | undefined;
  aliases?: KnowledgeAlias[] | undefined;
  settings?: BrainLearningSettings | undefined;
}

export class KnowledgeEngine {
  private supabase: SupabaseClient<Database> | null = null;
  private resolutionService: KnowledgeResolutionService;

  constructor(supabaseClient?: SupabaseClient<Database> | null) {
    this.supabase = supabaseClient !== undefined ? supabaseClient : defaultSupabase;
    this.resolutionService = new KnowledgeResolutionService(this.supabase);
  }

  /**
   * Plans knowledge operations from a completed extraction run.
   */
  public async planExtractionRun(
    runId: string,
    conversationId?: string | null,
    inMemoryContext?: EngineInMemoryContext,
  ): Promise<KnowledgePlan> {
    let proposals: KnowledgeProposalItem[] = [];
    const resolutionMap = new Map<string, { status: string; canonical_id: string | null; confidence: number; match_type: string; reason?: string | undefined }>();

    if (inMemoryContext?.proposals) {
      proposals = inMemoryContext.proposals;
      if (inMemoryContext.resolutionResults) {
        for (const rr of inMemoryContext.resolutionResults) {
          resolutionMap.set(rr.proposal_id, rr);
        }
      }
    } else if (this.supabase) {
      // Load proposals from database
      const { data: propData } = await this.supabase
        .from("knowledge_proposals")
        .select("*")
        .eq("extraction_run_id", runId);

      if (propData) {
        proposals = propData.map((p) => ({
          id: p.id,
          user_id: p.user_id,
          extraction_run_id: p.extraction_run_id,
          conversation_id: p.conversation_id,
          source_message_id: p.source_message_id,
          proposal_type: p.proposal_type as any,
          status: p.status as any,
          payload: (p.payload || {}) as Record<string, unknown>,
          extraction_confidence: (p.payload as any)?.confidence ? Number((p.payload as any).confidence) : 0.9,
          validation_status: (p.validation_status || "valid") as any,
          created_at: p.created_at,
          updated_at: p.updated_at,
        }));
      }

      // Load resolution results
      const { data: resData } = await this.supabase
        .from("knowledge_resolution_results")
        .select("*")
        .eq("extraction_run_id", runId);

      if (resData) {
        for (const rr of resData) {
          resolutionMap.set(rr.proposal_id, {
            status: rr.status,
            canonical_id: rr.canonical_node_id,
            confidence: Number(rr.resolution_confidence),
            match_type: rr.match_type,
            reason: rr.reason_summary ?? undefined,
          });
        }
      }
    }

    const nodes = inMemoryContext?.nodes || [];
    const edges = inMemoryContext?.edges || [];
    const claims = inMemoryContext?.claims || [];
    const aliases = inMemoryContext?.aliases || [];
    const settings = inMemoryContext?.settings || {
      learning_mode: "review",
      auto_create_nodes: false,
      auto_add_aliases: true,
      auto_add_relations: true,
      auto_add_claims: false,
      require_evidence_for_claims: true,
      min_node_confidence: 0.90,
      min_relation_confidence: 0.85,
      min_claim_confidence: 0.90,
    };

    const plan = KnowledgePlanner.createPlan({
      runId,
      conversationId: conversationId ?? null,
      proposals,
      resolutionMap,
      nodes,
      edges,
      claims,
      aliases,
      settings,
    });

    // Persist to Supabase if client active
    if (this.supabase) {
      try {
        const { data: insertedPlan } = await this.supabase
          .from("knowledge_plans")
          .insert({
            id: plan.id,
            extraction_run_id: runId,
            conversation_id: conversationId ?? null,
            status: plan.status,
            learning_mode: plan.learning_mode,
            risk_level: plan.risk_level,
            overall_confidence: plan.overall_confidence,
            plan_version: plan.plan_version,
            diff_summary: plan.diff_summary as unknown as Json,
            summary: plan.summary as unknown as Json,
            metadata: plan.metadata as unknown as Json,
          })
          .select("id")
          .single();

        if (insertedPlan && plan.operations.length > 0) {
          const opsToInsert = plan.operations.map((op) => ({
            plan_id: insertedPlan.id,
            proposal_id: op.proposal_id ?? null,
            operation_type: op.operation_type,
            target_type: op.target_type,
            target_id: op.target_id ?? null,
            status: op.status,
            payload: (op.payload || {}) as unknown as Json,
            previous_state: (op.previous_state ?? null) as unknown as Json,
            proposed_state: (op.proposed_state ?? null) as unknown as Json,
            diff: (op.diff ?? null) as unknown as Json,
            confidence: op.confidence ?? null,
            risk_level: op.risk_level,
            trust_tier: op.trust_tier,
            reason_summary: op.reason_summary ?? null,
          }));

          await this.supabase.from("knowledge_operations").insert(opsToInsert);
        }
      } catch (err) {
        console.warn("Failed to persist knowledge plan to database", err);
      }
    }

    return plan;
  }

  /**
   * Approves a knowledge plan for controlled commit.
   */
  public async approvePlan(planId: string): Promise<void> {
    if (this.supabase) {
      await this.supabase
        .from("knowledge_plans")
        .update({ status: "approved", approved_at: new Date().toISOString() })
        .eq("id", planId);
    }
  }

  /**
   * Rejects a knowledge plan and archives its operations.
   */
  public async rejectPlan(planId: string): Promise<void> {
    if (this.supabase) {
      await this.supabase
        .from("knowledge_plans")
        .update({ status: "rejected" })
        .eq("id", planId);
      await this.supabase
        .from("knowledge_operations")
        .update({ status: "rejected" })
        .eq("plan_id", planId);
    }
  }

  /**
   * Quarantines a knowledge plan and its operations for safety inspection.
   */
  public async quarantinePlan(planId: string): Promise<void> {
    if (this.supabase) {
      await this.supabase
        .from("knowledge_plans")
        .update({ status: "quarantined" })
        .eq("id", planId);
    }
  }

  /**
   * Commits a plan transactionally.
   * If supabase is connected, invokes the atomic commit_knowledge_plan RPC.
   * If running in memory (e.g. tests), executes deterministic canonical mutation.
   */
  public async commitPlan(
    planOrId: KnowledgePlan | string,
    approvedOperationIds?: string[] | null,
    inMemoryContext?: EngineInMemoryContext,
  ): Promise<PlanCommitResult> {
    const planId = typeof planOrId === "string" ? planOrId : planOrId.id;
    const plan: KnowledgePlan | null = typeof planOrId === "object" ? planOrId : null;

    const summary: KnowledgePlanSummary = {
      reused_nodes: 0,
      created_nodes: 0,
      updated_nodes: 0,
      created_relations: 0,
      added_claims: 0,
      no_ops: 0,
      review_required: plan?.summary.review_required || 0,
      quarantined: plan?.summary.quarantined || 0,
    };

    // Stale plan detection: validate current Brain state before execution
    if (inMemoryContext && plan) {
      const validation = KnowledgeValidator.validatePlan(plan.operations, {
        nodes: inMemoryContext.nodes,
        edges: inMemoryContext.edges,
        claims: inMemoryContext.claims,
        aliases: inMemoryContext.aliases,
      });

      if (!validation.valid) {
        return {
          success: false,
          plan_id: planId,
          summary,
          error: "Stale plan detected: Brain state has changed since plan generation. Please re-plan.",
          warnings: validation.issues.map((i) => i.message),
        };
      }
    }

    // Server-side RPC execution if Supabase client is present
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase.rpc("commit_knowledge_plan", {
          p_plan_id: planId,
          p_approved_operation_ids: approvedOperationIds || null,
        });

        if (!error && data && (data as any).success) {
          return {
            success: true,
            plan_id: planId,
            transaction_id: (data as any).transaction_id,
            summary: (data as any).summary || summary,
          };
        }
      } catch {
        // Fall back to in-memory execution if running in test environment
      }
    }

    // In-memory execution logic (strictly adhering to transactional ordering & temp resolution)
    if (inMemoryContext && plan) {
      const tempToCanonicalMap = new Map<string, string>();
      const operationsToExecute = approvedOperationIds
        ? plan.operations.filter((o) => approvedOperationIds.includes(o.id || o.proposal_id || ""))
        : plan.operations;

      for (const op of operationsToExecute) {
        if (op.operation_type === "NO_OP") {
          summary.no_ops++;
          if (op.target_type === "node") {
            summary.reused_nodes++;
          }
          op.status = "executed";
        } else if (op.operation_type === "CREATE_NODE") {
          const name = op.payload.name || "Concept";
          const existing = inMemoryContext.nodes.find(
            (n) => n.deleted_at === null && n.name.toLowerCase() === name.toLowerCase(),
          );

          if (!existing) {
            const newNodeId = `node-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
            const newNode: KnowledgeNode = {
              id: newNodeId,
              name,
              canonical_name: op.payload.canonical_name || name,
              slug: op.payload.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
              node_type: (op.payload.node_type || "concept") as any,
              status: "active",
              parent_id: op.payload.parent_id || null,
              description: op.payload.description || null,
              summary: op.payload.summary || null,
              created_by: "engine",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              deleted_at: null,
              metadata: {},
              embedding_status: "pending",
              embedded_at: null,
            };

            inMemoryContext.nodes.push(newNode);
            summary.created_nodes++;

            if (op.payload.temp_id) tempToCanonicalMap.set(op.payload.temp_id, newNodeId);
            tempToCanonicalMap.set(name, newNodeId);
            op.target_id = newNodeId;
          } else {
            summary.no_ops++;
            if (op.payload.temp_id) tempToCanonicalMap.set(op.payload.temp_id, existing.id);
            tempToCanonicalMap.set(name, existing.id);
            op.target_id = existing.id;
          }
          op.status = "executed";
        } else if (op.operation_type === "UPDATE_NODE") {
          const targetNode = inMemoryContext.nodes.find((n) => n.id === op.target_id);
          if (targetNode) {
            if (op.payload.description) targetNode.description = op.payload.description;
            if (op.payload.summary) targetNode.summary = op.payload.summary;
            targetNode.embedding_status = "stale";
            summary.updated_nodes++;
          }
          op.status = "executed";
        } else if (op.operation_type === "ADD_ALIAS") {
          const targetNode = inMemoryContext.nodes.find((n) => n.id === op.target_id);
          if (targetNode && op.payload.alias && inMemoryContext.aliases) {
            const alias = op.payload.alias;
            const exists = inMemoryContext.aliases.some((a) => a.node_id === targetNode.id && a.alias === alias);
            if (!exists) {
              inMemoryContext.aliases.push({
                id: `alias-${Date.now().toString(36)}`,
                node_id: targetNode.id,
                alias,
                alias_type: "alternate_name",
                canonical_alias: targetNode.canonical_name || targetNode.name,
                normalized_alias: alias.toLowerCase(),
                language: op.payload.language || "en",
                metadata: {},
                created_by: "engine",
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              });
            } else {
              summary.no_ops++;
            }
          }
          op.status = "executed";
        } else if (op.operation_type === "CREATE_RELATION") {
          let sId = op.payload.source_id;
          let tId = op.payload.target_id;
          if (sId && tempToCanonicalMap.has(sId)) sId = tempToCanonicalMap.get(sId);
          if (tId && tempToCanonicalMap.has(tId)) tId = tempToCanonicalMap.get(tId);

          if (sId && tId && inMemoryContext.edges) {
            const relType = op.payload.relation_type || "related_to";
            const exists = inMemoryContext.edges.some(
              (e) => e.status !== "archived" && e.source_node_id === sId && e.target_node_id === tId && e.relation_type === relType,
            );
            if (!exists) {
              inMemoryContext.edges.push({
                id: `edge-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
                source_node_id: sId,
                target_node_id: tId,
                relation_type: relType,
                status: "active",
                confidence: op.confidence,
                description: op.payload.description || null,
                created_by: "engine",
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                metadata: {},
              });
              summary.created_relations++;
            } else {
              summary.no_ops++;
            }
          }
          op.status = "executed";
        } else if (op.operation_type === "ADD_CLAIM") {
          let subId = op.payload.subject_node_id;
          if (subId && tempToCanonicalMap.has(subId)) subId = tempToCanonicalMap.get(subId);

          if (subId && op.payload.statement && inMemoryContext.claims) {
            const stmt = op.payload.statement;
            const normStmt = stmt.trim().toLowerCase();
            const exists = inMemoryContext.claims.some(
              (c) =>
                c.status !== "archived" &&
                (c.node_id === subId || (c as any).subject_node_id === subId) &&
                ((c.claim_text || (c as any).statement || "").trim().toLowerCase() === normStmt),
            );
            if (!exists) {
              inMemoryContext.claims.push({
                id: `claim-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
                node_id: subId,
                claim_text: stmt,
                claim_type: op.payload.claim_type || "fact",
                confidence: op.confidence,
                status: "active",
                verification: "verified",
                source_id: null,
                entry_id: null,
                normalized_statement: normStmt,
                created_by: "engine",
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                metadata: {},
              });
              summary.added_claims++;
            } else {
              summary.no_ops++;
            }
          }
          op.status = "executed";
        } else if (op.operation_type === "QUARANTINE_CLAIM" || op.operation_type === "QUARANTINE_NODE") {
          summary.quarantined++;
          op.status = "executed";
        }
      }

      plan.status = "committed";
      plan.committed_at = new Date().toISOString();
      plan.summary = summary;

      return {
        success: true,
        plan_id: plan.id,
        transaction_id: `tx-${Date.now().toString(36)}`,
        summary,
      };
    }

    return {
      success: false,
      plan_id: planId,
      summary,
      error: "No database connection or in-memory execution context provided.",
    };
  }

  /**
   * Executes the full automatic learning pipeline on a conversation episode:
   * Extraction Run -> Resolution -> Knowledge Plan -> Decision Engine -> Commit / Review Queue
   */
  public async executeAutoLearning(
    runId: string,
    conversationId?: string | null,
    inMemoryContext?: EngineInMemoryContext,
  ): Promise<{ plan: KnowledgePlan; commitResult: PlanCommitResult | null; requiresReview: boolean }> {
    // 1. Generate Knowledge Plan
    const plan = await this.planExtractionRun(runId, conversationId, inMemoryContext);

    // 2. Check if all operations qualify for auto-commit under configured policy
    const settings = inMemoryContext?.settings || {
      learning_mode: "review",
      auto_create_nodes: false,
      auto_add_aliases: true,
      auto_add_relations: true,
      auto_add_claims: false,
      require_evidence_for_claims: true,
      min_node_confidence: 0.90,
      min_relation_confidence: 0.85,
      min_claim_confidence: 0.90,
    };

    const allCanAutoCommit =
      settings.learning_mode === "auto" &&
      plan.operations.length > 0 &&
      plan.operations.every((op) => KnowledgeLearningPolicy.canAutoCommit(op, settings));

    if (allCanAutoCommit && plan.status === "ready") {
      const commitResult = await this.commitPlan(plan, null, inMemoryContext);
      return {
        plan,
        commitResult,
        requiresReview: false,
      };
    }

    // Held for review in Review Mode or if high-risk / low-confidence operations exist
    plan.status = "needs_review";
    return {
      plan,
      commitResult: null,
      requiresReview: true,
    };
  }
}

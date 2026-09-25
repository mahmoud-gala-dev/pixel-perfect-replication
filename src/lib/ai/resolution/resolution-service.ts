// =====================================================================
// KNOWLEDGE BRAIN — PHASE 6: RESOLUTION ORCHESTRATION SERVICE
// =====================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import type { KnowledgeNode, KnowledgeAlias, KnowledgeEdge, KnowledgeClaimRow } from "@/lib/knowledge-engine/types";
import { EntityResolver } from "./entity-resolver";
import { ClaimResolver } from "./claim-resolver";
import { RelationResolver } from "./relation-resolver";
import { HierarchyResolver } from "./hierarchy-resolver";
import {
  type EntityResolutionResult,
  type ClaimResolutionResult,
  type RelationResolutionResult,
  type HierarchyResolutionResult,
  RESOLVER_VERSION,
} from "./types";
import {
  type ExtractedEntityCandidate,
  type ExtractedClaimCandidate,
  type ExtractedRelationCandidate,
  type ExtractedHierarchySuggestion,
} from "../extraction/types";

export interface ProposalRow {
  id: string;
  extraction_run_id: string | null;
  proposal_type: string;
  status: string;
  payload: Json;
  extraction_confidence: number | null;
  conversation_id: string;
  source_message_id: string | null;
}

export interface ProposalResolutionSummary {
  run_id: string;
  total_proposals: number;
  resolved_existing: number;
  new_candidates: number;
  possible_duplicates: number;
  ambiguous: number;
  unresolved: number;
  claims_existing: number;
  claims_new: number;
  claims_conflicts: number;
  relations_existing_noop: number;
  relations_new: number;
  hierarchy_reused_segments: number;
  results: Array<{
    proposal_id: string;
    proposal_type: string;
    status: string;
    canonical_id: string | null;
    confidence: number;
    match_type: string;
    reason: string;
  }>;
}

export class KnowledgeResolutionService {
  private supabase: SupabaseClient<Database> | null = null;
  private entityResolver: EntityResolver;
  private claimResolver: ClaimResolver;
  private relationResolver: RelationResolver;
  private hierarchyResolver: HierarchyResolver;

  constructor(supabase?: SupabaseClient<Database> | null) {
    this.supabase = supabase ?? null;
    this.entityResolver = new EntityResolver(supabase);
    this.claimResolver = new ClaimResolver(supabase);
    this.relationResolver = new RelationResolver();
    this.hierarchyResolver = new HierarchyResolver();
  }

  /**
   * Resolves an entire batch of proposals for an extraction run.
   * Follows strict search-before-create discipline without mutating canonical tables.
   */
  public async resolveExtractionRun(
    runId: string,
    inMemoryContext?: {
      proposals: ProposalRow[];
      nodes: KnowledgeNode[];
      aliases?: KnowledgeAlias[];
      edges?: KnowledgeEdge[];
      claims?: KnowledgeClaimRow[];
    },
  ): Promise<ProposalResolutionSummary> {
    let proposals: ProposalRow[] = [];
    let nodes: KnowledgeNode[] = [];
    let aliases: KnowledgeAlias[] = [];
    let edges: KnowledgeEdge[] = [];
    let claims: KnowledgeClaimRow[] = [];

    if (inMemoryContext) {
      proposals = inMemoryContext.proposals;
      nodes = inMemoryContext.nodes;
      aliases = inMemoryContext.aliases || [];
      edges = inMemoryContext.edges || [];
      claims = inMemoryContext.claims || [];
    } else if (this.supabase) {
      // Fetch from Supabase
      const [pRes, nRes, aRes, eRes, cRes] = await Promise.all([
        this.supabase
          .from("knowledge_proposals")
          .select("*")
          .eq("extraction_run_id", runId),
        this.supabase
          .from("knowledge_nodes")
          .select("*")
          .is("deleted_at", null),
        this.supabase
          .from("knowledge_aliases")
          .select("*"),
        this.supabase
          .from("knowledge_edges")
          .select("*")
          .is("deleted_at", null),
        this.supabase
          .from("knowledge_claims")
          .select("*")
          .is("deleted_at", null),
      ]);

      proposals = (pRes.data || []) as unknown as ProposalRow[];
      nodes = (nRes.data || []) as unknown as KnowledgeNode[];
      aliases = (aRes.data || []) as unknown as KnowledgeAlias[];
      edges = (eRes.data || []) as unknown as KnowledgeEdge[];
      claims = (cRes.data || []) as unknown as KnowledgeClaimRow[];
    }

    const summary: ProposalResolutionSummary = {
      run_id: runId,
      total_proposals: proposals.length,
      resolved_existing: 0,
      new_candidates: 0,
      possible_duplicates: 0,
      ambiguous: 0,
      unresolved: 0,
      claims_existing: 0,
      claims_new: 0,
      claims_conflicts: 0,
      relations_existing_noop: 0,
      relations_new: 0,
      hierarchy_reused_segments: 0,
      results: [],
    };

    // Map to track resolved canonical entity IDs by temporary candidate reference
    // E.g. "entity_1" -> "node-uuid-123"
    const tempToCanonicalMap = new Map<string, string>();
    const resolveEndpoint = (ref: string | null | undefined): string | null => {
      if (!ref) return null;
      if (tempToCanonicalMap.has(ref)) return tempToCanonicalMap.get(ref)!;
      // Check if ref is already an existing canonical node UUID
      const matchedById = nodes.find((n) => n.id === ref);
      if (matchedById) return matchedById.id;
      // Check if ref matches an existing canonical node name
      const matchedByName = nodes.find((n) => n.name === ref || n.canonical_name === ref);
      if (matchedByName) return matchedByName.id;
      return null;
    };

    const entityProposals = proposals.filter((p) =>
      ["ENTITY", "TOPIC", "CONCEPT"].includes(p.proposal_type),
    );
    const claimProposals = proposals.filter((p) => p.proposal_type === "CLAIM");
    const relationProposals = proposals.filter((p) => p.proposal_type === "RELATION");
    const hierarchyProposals = proposals.filter((p) => p.proposal_type === "HIERARCHY");

    // -------------------------------------------------------------
    // PHASE 6 STEP A: Resolve Entities First (Anchor resolution order)
    // -------------------------------------------------------------
    const entityCandidates = entityProposals.map((p) => {
      const payload = p.payload as unknown as ExtractedEntityCandidate;
      return {
        proposal_id: p.id,
        temp_id: payload.temporary_id,
        input: {
          name: payload.name,
          type: payload.entity_type,
          aliases: payload.aliases || [],
          context: payload.context || [],
          extraction_confidence: p.extraction_confidence ?? payload.confidence ?? 0.9,
        },
      };
    });

    for (const ec of entityCandidates) {
      const res = await this.entityResolver.resolveEntity(ec.input, {
        nodes,
        aliases,
        edges,
      });

      if (res.status === "EXISTING" && res.canonical_node_id) {
        tempToCanonicalMap.set(ec.temp_id, res.canonical_node_id);
        tempToCanonicalMap.set(ec.input.name, res.canonical_node_id);
        summary.resolved_existing++;
      } else if (res.status === "NEW") {
        summary.new_candidates++;
      } else if (res.status === "POSSIBLE_DUPLICATE") {
        summary.possible_duplicates++;
      } else if (res.status === "AMBIGUOUS") {
        summary.ambiguous++;
      } else {
        summary.unresolved++;
      }

      summary.results.push({
        proposal_id: ec.proposal_id,
        proposal_type: "ENTITY",
        status: res.status,
        canonical_id: res.canonical_node_id,
        confidence: res.resolution_confidence,
        match_type: res.match_type,
        reason: res.reason_summary,
      });

      // Persist to Supabase if client is active
      if (this.supabase) {
        try {
          const { data: insertedResult } = await this.supabase
            .from("knowledge_resolution_results")
            .insert({
              proposal_id: ec.proposal_id,
              extraction_run_id: runId,
              status: res.status,
              canonical_node_id: res.canonical_node_id,
              resolution_confidence: res.resolution_confidence,
              extraction_confidence: ec.input.extraction_confidence,
              match_type: res.match_type,
              selected_candidate_id: res.selected_candidate_id,
              reason_summary: res.reason_summary,
              resolver_version: RESOLVER_VERSION,
            })
            .select("id")
            .single();

          if (insertedResult && res.candidates.length > 0) {
            const candidatesToInsert = res.candidates.slice(0, 5).map((c) => ({
              resolution_result_id: insertedResult.id,
              candidate_node_id: c.candidate_node_id,
              rank: c.rank,
              exact_score: c.scores.exact_score,
              alias_score: c.scores.alias_score,
              text_score: c.scores.text_score,
              semantic_score: c.scores.semantic_score,
              type_score: c.scores.type_score,
              hierarchy_score: c.scores.hierarchy_score,
              graph_score: c.scores.graph_score,
              combined_score: c.scores.combined_score,
              signals: c.signals as unknown as Json,
            }));

            await this.supabase
              .from("knowledge_resolution_candidates")
              .insert(candidatesToInsert);
          }

          // Update proposal status
          const proposalNextStatus =
            res.status === "EXISTING"
              ? "analyzed"
              : res.status === "NEW"
              ? "analyzed"
              : "needs_review";

          await this.supabase
            .from("knowledge_proposals")
            .update({ status: proposalNextStatus })
            .eq("id", ec.proposal_id);
        } catch {
          // Continue gracefully
        }
      }
    }

    // -------------------------------------------------------------
    // PHASE 6 STEP B: Resolve Hierarchy Suggestions
    // -------------------------------------------------------------
    for (const hp of hierarchyProposals) {
      const payload = hp.payload as unknown as ExtractedHierarchySuggestion;
      const path = payload.path || [payload.category, payload.subcategory, payload.topic, payload.concept].filter(Boolean) as string[];

      const hRes = this.hierarchyResolver.resolveHierarchyPath(path, nodes);
      summary.hierarchy_reused_segments += hRes.reused_prefix_count;

      summary.results.push({
        proposal_id: hp.id,
        proposal_type: "HIERARCHY",
        status: hRes.new_segments_count === 0 ? "EXISTING" : "NEW",
        canonical_id: hRes.resolved_path.find((p) => p.canonical_node_id)?.canonical_node_id || null,
        confidence: 0.95,
        match_type: "HIERARCHY_CONTEXT",
        reason: hRes.summary,
      });

      if (this.supabase) {
        try {
          await this.supabase
            .from("knowledge_resolution_results")
            .insert({
              proposal_id: hp.id,
              extraction_run_id: runId,
              status: hRes.new_segments_count === 0 ? "EXISTING" : "NEW",
              canonical_node_id: null,
              resolution_confidence: 0.95,
              extraction_confidence: hp.extraction_confidence ?? payload.confidence ?? 0.9,
              match_type: "HIERARCHY_CONTEXT",
              reason_summary: hRes.summary,
              metadata: { resolved_path: hRes.resolved_path } as unknown as Json,
              resolver_version: RESOLVER_VERSION,
            });

          await this.supabase
            .from("knowledge_proposals")
            .update({ status: "analyzed" })
            .eq("id", hp.id);
        } catch {
          // Graceful continue
        }
      }
    }

    // -------------------------------------------------------------
    // PHASE 6 STEP C: Resolve Claims
    // -------------------------------------------------------------
    for (const cp of claimProposals) {
      const payload = cp.payload as unknown as ExtractedClaimCandidate;
      const subjectCanonicalId = resolveEndpoint(payload.subject_entity_ref);

      const cRes = await this.claimResolver.resolveClaim(
        {
          statement: payload.statement,
          subject_canonical_node_id: subjectCanonicalId,
          claim_type: payload.claim_type,
        },
        claims,
      );

      if (cRes.status === "EXISTING_CLAIM") summary.claims_existing++;
      else if (cRes.status === "NEW_CLAIM") summary.claims_new++;
      else if (cRes.status === "POTENTIAL_CONFLICT") summary.claims_conflicts++;

      summary.results.push({
        proposal_id: cp.id,
        proposal_type: "CLAIM",
        status: cRes.status,
        canonical_id: cRes.canonical_claim_id,
        confidence: cRes.confidence,
        match_type: cRes.match_type,
        reason: cRes.reason_summary,
      });

      if (this.supabase) {
        try {
          await this.supabase
            .from("knowledge_resolution_results")
            .insert({
              proposal_id: cp.id,
              extraction_run_id: runId,
              status: cRes.status === "EXISTING_CLAIM" ? "EXISTING" : cRes.status === "NEW_CLAIM" ? "NEW" : "POSSIBLE_DUPLICATE",
              canonical_node_id: subjectCanonicalId,
              resolution_confidence: cRes.confidence,
              extraction_confidence: cp.extraction_confidence ?? payload.confidence ?? 0.9,
              match_type: cRes.match_type === "EXACT" ? "EXACT_NAME" : "SEMANTIC",
              reason_summary: cRes.reason_summary,
              metadata: { claim_status: cRes.status, canonical_claim_id: cRes.canonical_claim_id } as unknown as Json,
              resolver_version: RESOLVER_VERSION,
            });

          await this.supabase
            .from("knowledge_proposals")
            .update({ status: cRes.status === "POTENTIAL_CONFLICT" ? "needs_review" : "analyzed" })
            .eq("id", cp.id);
        } catch {
          // Graceful continue
        }
      }
    }

    // -------------------------------------------------------------
    // PHASE 6 STEP D: Resolve Relations (using endpoint canonical IDs)
    // -------------------------------------------------------------
    for (const rp of relationProposals) {
      const payload = rp.payload as unknown as ExtractedRelationCandidate;
      const sourceCanonicalId = resolveEndpoint(payload.source_entity_ref);
      const targetCanonicalId = resolveEndpoint(payload.target_entity_ref);

      const rRes = this.relationResolver.resolveRelation(
        {
          source_canonical_id: sourceCanonicalId,
          target_canonical_id: targetCanonicalId,
          relation_type: payload.relation_type,
        },
        edges,
      );

      if (rRes.is_noop_candidate) summary.relations_existing_noop++;
      else summary.relations_new++;

      summary.results.push({
        proposal_id: rp.id,
        proposal_type: "RELATION",
        status: rRes.status,
        canonical_id: rRes.canonical_edge_id,
        confidence: rRes.confidence,
        match_type: rRes.match_type,
        reason: rRes.reason_summary,
      });

      if (this.supabase) {
        try {
          await this.supabase
            .from("knowledge_resolution_results")
            .insert({
              proposal_id: rp.id,
              extraction_run_id: runId,
              status: rRes.status === "EXISTING_RELATION" ? "EXISTING" : "NEW",
              canonical_node_id: sourceCanonicalId,
              resolution_confidence: rRes.confidence,
              extraction_confidence: rp.extraction_confidence ?? payload.confidence ?? 0.9,
              match_type: "GRAPH_CONTEXT",
              reason_summary: rRes.reason_summary,
              metadata: {
                relation_status: rRes.status,
                canonical_edge_id: rRes.canonical_edge_id,
                is_noop_candidate: rRes.is_noop_candidate,
                source_canonical_id: sourceCanonicalId,
                target_canonical_id: targetCanonicalId,
              } as unknown as Json,
              resolver_version: RESOLVER_VERSION,
            });

          await this.supabase
            .from("knowledge_proposals")
            .update({ status: "analyzed" })
            .eq("id", rp.id);
        } catch {
          // Graceful continue
        }
      }
    }

    // Update extraction run metrics if in Supabase
    if (this.supabase) {
      try {
        await this.supabase
          .from("knowledge_extraction_runs")
          .update({
            metrics: {
              resolved_existing: summary.resolved_existing,
              new_candidates: summary.new_candidates,
              possible_duplicates: summary.possible_duplicates,
              ambiguous: summary.ambiguous,
              relations_existing_noop: summary.relations_existing_noop,
            } as unknown as Json,
          })
          .eq("id", runId);
      } catch {
        // Non-blocking
      }
    }

    return summary;
  }

  /**
   * Records a manual human resolution decision (Section 45 & 46).
   * Authorized user overrides ("Use Existing", "Treat as New", etc.).
   * Does NOT modify canonical knowledge tables in Phase 6!
   */
  public async recordManualResolution(params: {
    proposalId: string;
    action: "USE_EXISTING" | "TREAT_AS_NEW" | "SELECT_NODE" | "MARK_AMBIGUOUS" | "REJECT";
    canonicalNodeId?: string | null | undefined;
    userId?: string | undefined;
    notes?: string | undefined;
  }): Promise<{ success: boolean; message: string }> {
    const { proposalId, action, canonicalNodeId = null, userId = "current_user", notes } = params;

    let newStatus = "NEW";
    let reason = "Manual human override: Treat as new entity.";

    if (action === "USE_EXISTING" || action === "SELECT_NODE") {
      newStatus = "EXISTING";
      reason = `Manual human override: Selected existing canonical entity (${canonicalNodeId}).`;
    } else if (action === "MARK_AMBIGUOUS") {
      newStatus = "AMBIGUOUS";
      reason = "Manual human override: Flagged as ambiguous.";
    } else if (action === "REJECT") {
      newStatus = "UNRESOLVED";
      reason = "Manual human override: Proposal rejected.";
    }

    if (this.supabase) {
      try {
        await this.supabase
          .from("knowledge_resolution_results")
          .update({
            status: newStatus,
            canonical_node_id: canonicalNodeId,
            manual_override: true,
            manual_override_at: new Date().toISOString(),
            manual_override_by: userId,
            reason_summary: notes ? `${reason} Note: ${notes}` : reason,
          })
          .eq("proposal_id", proposalId);

        await this.supabase
          .from("knowledge_proposals")
          .update({
            status: action === "REJECT" ? "rejected" : "approved",
          })
          .eq("id", proposalId);
      } catch (err) {
        return { success: false, message: `Failed to record manual resolution: ${String(err)}` };
      }
    }

    return {
      success: true,
      message: `Manual decision recorded (${action}) without canonical mutation.`,
    };
  }
}

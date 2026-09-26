import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type HealthStatus = "Healthy" | "Needs Attention" | "Degraded" | "Unknown";

export interface HealthMetrics {
  total_nodes: number;
  total_edges: number;
  total_claims: number;
  verification_rate: number; // 0-100%
  evidence_coverage: number;  // 0-100%
  average_degree: number;
  open_conflicts: number;
  broken_sources: number;
  orphan_nodes: number;
  outdated_claims: number;
  pending_reviews: number;
  stale_embeddings: number;
}

export interface BrainHealthReport {
  status: HealthStatus;
  summary_reasons: string[];
  metrics: HealthMetrics;
}

export interface OrphanNodeInfo {
  id: string;
  name: string;
  canonical_name: string | null;
  slug: string;
  node_type: string;
  parent_id: string | null;
  created_at: string;
  orphan_reason: string;
}

export interface CleanupCandidate {
  category: "orphan_node" | "broken_source" | "open_conflict" | "outdated_claim" | "stale_embedding" | "pending_review";
  id: string;
  title: string;
  reason: string;
  severity: "low" | "medium" | "high";
  action_label: string;
  action_link: string;
}

/**
 * Service providing operational health metrics, dimension evaluations,
 * and safe cleanup previews without automatic deletions or mutations.
 */
export class BrainHealthService {
  constructor(private supabase: SupabaseClient<Database> | null = null) {}

  /**
   * Generates comprehensive Brain Health report.
   * Uses RPC if available, or computes from client-provided dataset.
   */
  public async getHealthReport(dataset?: {
    nodes?: any[];
    edges?: any[];
    claims?: any[];
    sources?: any[];
    evidence?: any[];
    conflicts?: any[];
    proposals?: any[];
  }): Promise<BrainHealthReport> {
    if (this.supabase && !dataset) {
      try {
        const { data, error } = await this.supabase.rpc("get_brain_health_report");
        if (!error && data) {
          const parsed = typeof data === "string" ? JSON.parse(data) : data;
          return parsed as BrainHealthReport;
        }
      } catch {
        // Fallback to calculation below
      }
    }

    // Client/In-memory calculation
    const nodes = dataset?.nodes || [];
    const edges = dataset?.edges || [];
    const claims = dataset?.claims || [];
    const sources = dataset?.sources || [];
    const evidence = dataset?.evidence || [];
    const conflicts = dataset?.conflicts || [];
    const proposals = dataset?.proposals || [];

    const totalNodes = nodes.filter((n) => !n.deleted_at).length;
    const totalEdges = edges.filter((e) => e.status !== "archived" && e.status !== "deprecated").length;
    const totalClaims = claims.length;

    const verifiedClaims = claims.filter((c) => c.verification_status === "verified").length;
    const claimsWithEvidenceIds = new Set(evidence.map((ev) => ev.claim_id));
    const claimsWithEvidence = claims.filter((c) => claimsWithEvidenceIds.has(c.id)).length;

    const openConflicts = conflicts.filter((cf) => cf.status === "open").length;
    const outdatedClaims = claims.filter((c) => c.is_outdated === true || c.status === "outdated").length;
    const brokenSources = sources.filter((s) => !s.deleted_at && (s.availability === "broken" || s.availability === "unavailable")).length;
    const pendingReviews = proposals.filter((p) => p.status === "pending_review").length;
    const staleEmbeddings = nodes.filter((n) => !n.deleted_at && (n.embedding_status === "failed" || n.embedding_status === "pending")).length;

    // Orphan detection (nodes with 0 edges and 0 claims, excluding root categories)
    const activeNodeIds = new Set(nodes.filter((n) => !n.deleted_at).map((n) => n.id));
    const connectedNodeIds = new Set<string>();
    edges.forEach((e) => {
      if (e.status !== "archived" && e.status !== "deprecated") {
        connectedNodeIds.add(e.source_node_id);
        connectedNodeIds.add(e.target_node_id);
      }
    });
    const nodesWithClaims = new Set<string>(claims.map((c) => c.node_id).filter(Boolean));

    const orphanNodes = nodes.filter((n) => {
      if (n.deleted_at) return false;
      if (n.node_type === "category" && !n.parent_id) return false; // root categories are valid without parents
      const hasEdge = connectedNodeIds.has(n.id);
      const hasClaim = nodesWithClaims.has(n.id);
      return !hasEdge && !hasClaim;
    }).length;

    const verificationRate = totalClaims > 0 ? Math.round((verifiedClaims / totalClaims) * 1000) / 10 : 0;
    const evidenceCoverage = totalClaims > 0 ? Math.round((claimsWithEvidence / totalClaims) * 1000) / 10 : 0;
    const averageDegree = totalNodes > 0 ? Math.round(((totalEdges * 2) / totalNodes) * 100) / 100 : 0;

    let status: HealthStatus = "Healthy";
    const summaryReasons: string[] = [];

    if (totalNodes === 0) {
      status = "Unknown";
      summaryReasons.push("Brain has no recorded knowledge nodes yet.");
    } else if (openConflicts > 5 || brokenSources > 3) {
      status = "Degraded";
      if (openConflicts > 5) summaryReasons.push(`High conflict load: ${openConflicts} open contradictions detected.`);
      if (brokenSources > 3) summaryReasons.push(`${brokenSources} broken sources impacting factual evidence.`);
    } else if (openConflicts > 0 || brokenSources > 0 || orphanNodes > 5 || pendingReviews > 5 || outdatedClaims > 5) {
      status = "Needs Attention";
      if (openConflicts > 0) summaryReasons.push(`${openConflicts} open conflict(s) requiring review.`);
      if (brokenSources > 0) summaryReasons.push(`${brokenSources} broken or unavailable source(s).`);
      if (orphanNodes > 0) summaryReasons.push(`${orphanNodes} isolated orphan node(s) without relations or claims.`);
      if (pendingReviews > 0) summaryReasons.push(`${pendingReviews} pending knowledge proposal(s) awaiting review.`);
      if (outdatedClaims > 0) summaryReasons.push(`${outdatedClaims} outdated claim(s) preserved in memory.`);
    } else {
      status = "Healthy";
      summaryReasons.push("All knowledge verification, evidence grounding, and relational structures are stable.");
    }

    return {
      status,
      summary_reasons: summaryReasons,
      metrics: {
        total_nodes: totalNodes,
        total_edges: totalEdges,
        total_claims: totalClaims,
        verification_rate: verificationRate,
        evidence_coverage: evidenceCoverage,
        average_degree: averageDegree,
        open_conflicts: openConflicts,
        broken_sources: brokenSources,
        orphan_nodes: orphanNodes,
        outdated_claims: outdatedClaims,
        pending_reviews: pendingReviews,
        stale_embeddings: staleEmbeddings,
      },
    };
  }

  /**
   * Generates a cleanup insights preview for maintenance review.
   * Note: This strictly inspects and surfaces issues; it NEVER deletes records.
   */
  public getCleanupPreview(dataset: {
    nodes?: any[];
    edges?: any[];
    claims?: any[];
    sources?: any[];
    conflicts?: any[];
    proposals?: any[];
  }): CleanupCandidate[] {
    const candidates: CleanupCandidate[] = [];
    const nodes = dataset.nodes || [];
    const edges = dataset.edges || [];
    const claims = dataset.claims || [];
    const sources = dataset.sources || [];
    const conflicts = dataset.conflicts || [];
    const proposals = dataset.proposals || [];

    // 1. Broken sources
    sources.forEach((s) => {
      if (!s.deleted_at && (s.availability === "broken" || s.availability === "unavailable")) {
        candidates.push({
          category: "broken_source",
          id: s.id,
          title: s.title || "Untitled Source",
          reason: `Source marked as ${s.availability || "unavailable"}. Evidence attached remains preserved.`,
          severity: "high",
          action_label: "Inspect Source",
          action_link: "/sources",
        });
      }
    });

    // 2. Open conflicts
    conflicts.forEach((cf) => {
      if (cf.status === "open") {
        candidates.push({
          category: "open_conflict",
          id: cf.id,
          title: `Conflict in ${cf.conflict_type || "knowledge claims"}`,
          reason: cf.reason_summary || "Unresolved contradiction between claims.",
          severity: "high",
          action_label: "Review Conflict",
          action_link: "/activity",
        });
      }
    });

    // 3. Orphan nodes
    const connectedNodes = new Set<string>();
    edges.forEach((e) => {
      connectedNodes.add(e.source_node_id);
      connectedNodes.add(e.target_node_id);
    });
    const nodesWithClaims = new Set<string>(claims.map((c) => c.node_id).filter(Boolean));

    nodes.forEach((n) => {
      if (!n.deleted_at && n.node_type !== "category") {
        const hasEdge = connectedNodes.has(n.id);
        const hasClaim = nodesWithClaims.has(n.id);
        if (!hasEdge && !hasClaim) {
          candidates.push({
            category: "orphan_node",
            id: n.id,
            title: n.name,
            reason: "Isolated concept with zero edges and zero attached claims.",
            severity: "medium",
            action_label: "Connect in Graph",
            action_link: `/graph?focus=${n.id}`,
          });
        }
      }
    });

    // 4. Outdated claims
    claims.forEach((c) => {
      if (c.is_outdated === true || c.status === "outdated") {
        candidates.push({
          category: "outdated_claim",
          id: c.id,
          title: c.claim_text?.slice(0, 60) + "..." || "Outdated claim",
          reason: "Marked as outdated/superseded. Preserved for historical provenance.",
          severity: "low",
          action_label: "View History",
          action_link: `/knowledge?nodeId=${c.node_id || ""}`,
        });
      }
    });

    return candidates;
  }
}

// =====================================================================
// KNOWLEDGE BRAIN — PHASE 8: IMPACT ANALYSIS SERVICE
// Analyzes graph and dependency blast radius before high-impact mutations or rollbacks
// =====================================================================

import type { ImpactAnalysisResult } from "./types";

export interface ImpactAnalysisContext {
  nodes?: Array<{ id: string; name: string; parent_id?: string | null | undefined; status?: string | undefined }> | undefined;
  edges?: Array<{ id: string; relation_type: string; source_node_id: string; target_node_id: string; status?: string | undefined }> | undefined;
  claims?: Array<{ id: string; node_id?: string | null | undefined; claim_text?: string | undefined; statement?: string | undefined; verification?: string | undefined }> | undefined;
  evidence?: Array<{ id: string; claim_id?: string | null | undefined; stance?: string | undefined }> | undefined;
}

export class ImpactAnalysisService {
  /**
   * Analyzes the potential ripple effect of a change, deprecation, or rollback on an entity.
   */
  public static analyzeImpact(
    subjectTable: string,
    subjectId: string,
    action: string,
    context: ImpactAnalysisContext = {},
  ): ImpactAnalysisResult {
    const affectedNodes: Array<{ id: string; name: string }> = [];
    const affectedRelations: Array<{ id: string; relation_type: string; source_id: string; target_id: string }> = [];
    const affectedClaims: Array<{ id: string; statement: string }> = [];
    const affectedEvidence: Array<{ id: string; stance: string }> = [];
    const warnings: string[] = [];

    const nodes = context.nodes || [];
    const edges = context.edges || [];
    const claims = context.claims || [];
    const evidence = context.evidence || [];

    if (subjectTable === "knowledge_nodes") {
      // 1. Check child nodes in hierarchy
      const children = nodes.filter((n) => n.parent_id === subjectId);
      for (const child of children) {
        affectedNodes.push({ id: child.id, name: child.name });
      }
      if (children.length > 0) {
        warnings.push(`${children.length} descendant hierarchy node(s) may have their parent path affected.`);
      }

      // 2. Check relations
      const connectedEdges = edges.filter(
        (e) => e.status !== "archived" && (e.source_node_id === subjectId || e.target_node_id === subjectId),
      );
      for (const edge of connectedEdges) {
        affectedRelations.push({
          id: edge.id,
          relation_type: edge.relation_type,
          source_id: edge.source_node_id,
          target_id: edge.target_node_id,
        });
      }
      if (connectedEdges.length > 0) {
        warnings.push(`${connectedEdges.length} graph relation(s) directly connect to this concept.`);
      }

      // 3. Check attached claims
      const nodeClaims = claims.filter((c) => c.node_id === subjectId);
      for (const c of nodeClaims) {
        affectedClaims.push({ id: c.id, statement: c.claim_text || c.statement || "" });
      }
      if (nodeClaims.length > 0) {
        warnings.push(`${nodeClaims.length} atomic claim(s) are anchored to this node.`);
      }
    } else if (subjectTable === "knowledge_claims") {
      const claim = claims.find((c) => c.id === subjectId);
      if (claim) {
        affectedClaims.push({ id: claim.id, statement: claim.claim_text || claim.statement || "" });
        if (claim.verification === "verified") {
          warnings.push("Modifying or rolling back a VERIFIED claim requires elevated review.");
        }
      }

      // Check evidence
      const claimEv = evidence.filter((e) => e.claim_id === subjectId);
      for (const ev of claimEv) {
        affectedEvidence.push({ id: ev.id, stance: ev.stance || "supported" });
      }
      if (claimEv.length > 0) {
        warnings.push(`${claimEv.length} supporting/counter-evidence item(s) are attached to this claim.`);
      }
    }

    // Determine impact level
    let impactLevel: "LOW" | "MEDIUM" | "HIGH" = "LOW";
    if (affectedNodes.length > 0 || affectedRelations.length >= 3 || warnings.some((w) => w.includes("VERIFIED"))) {
      impactLevel = "HIGH";
    } else if (affectedRelations.length > 0 || affectedClaims.length > 0 || affectedEvidence.length > 0) {
      impactLevel = "MEDIUM";
    }

    return {
      subject_table: subjectTable,
      subject_id: subjectId,
      impact_level: impactLevel,
      affected_nodes: affectedNodes,
      affected_relations: affectedRelations,
      affected_claims: affectedClaims,
      affected_evidence: affectedEvidence,
      warnings,
    };
  }
}

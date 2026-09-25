// =====================================================================
// KNOWLEDGE BRAIN — PHASE 7: KNOWLEDGE PLANNER
// Transforms Phase 6 resolved proposals into an ordered, inspectable Knowledge Plan
// =====================================================================

import type {
  KnowledgeNode,
  KnowledgeEdge,
  KnowledgeClaim,
  KnowledgeAlias,
} from "@/lib/knowledge-engine/types";
import { generateCanonicalSlug, normalizeKnowledgeName } from "@/lib/knowledge-engine/normalization";
import type { KnowledgeProposalItem } from "../extraction/types";
import type { EntityResolutionResult } from "../resolution/types";
import { KnowledgeDiffEngine } from "./diff-engine";
import { KnowledgeLearningPolicy } from "./learning-policy";
import { KnowledgeValidator } from "./validator";
import type {
  KnowledgePlan,
  KnowledgeOperationItem,
  KnowledgePlanSummary,
  BrainLearningSettings,
  RiskLevel,
  DEFAULT_BRAIN_SETTINGS,
} from "./types";

export interface PlannerInput {
  planId?: string | undefined;
  runId?: string | null | undefined;
  conversationId?: string | null | undefined;
  proposals: KnowledgeProposalItem[];
  resolutionMap: Map<string, { status: string; canonical_id: string | null; confidence: number; match_type: string; reason?: string | undefined }>;
  nodes: KnowledgeNode[];
  edges?: KnowledgeEdge[] | undefined;
  claims?: KnowledgeClaim[] | undefined;
  aliases?: KnowledgeAlias[] | undefined;
  settings?: BrainLearningSettings | undefined;
}

export class KnowledgePlanner {
  /**
   * Generates a structured KnowledgePlan from extraction proposals and resolution results.
   */
  public static createPlan(input: PlannerInput): KnowledgePlan {
    const {
      planId = `plan-${Date.now().toString(36)}`,
      runId = null,
      conversationId = null,
      proposals,
      resolutionMap,
      nodes,
      edges = [],
      claims = [],
      aliases = [],
      settings = {
        learning_mode: "review",
        auto_create_nodes: false,
        auto_add_aliases: true,
        auto_add_relations: true,
        auto_add_claims: false,
        require_evidence_for_claims: true,
        min_node_confidence: 0.90,
        min_relation_confidence: 0.85,
        min_claim_confidence: 0.90,
      },
    } = input;

    const operations: KnowledgeOperationItem[] = [];
    const tempToCanonicalMap = new Map<string, string>();
    let tempNodeCounter = 1;

    const summary: KnowledgePlanSummary = {
      reused_nodes: 0,
      created_nodes: 0,
      updated_nodes: 0,
      created_relations: 0,
      added_claims: 0,
      no_ops: 0,
      review_required: 0,
      quarantined: 0,
    };

    // Helper to resolve an endpoint reference to either canonical ID or planned temp ID
    const resolveEndpoint = (ref: string | null | undefined): string | null => {
      if (!ref) return null;
      if (tempToCanonicalMap.has(ref)) return tempToCanonicalMap.get(ref)!;
      const normRef = normalizeKnowledgeName(ref);
      const matchedNode = nodes.find(
        (n) =>
          n.deleted_at === null &&
          (n.id === ref ||
            normalizeKnowledgeName(n.name) === normRef ||
            (n.canonical_name && normalizeKnowledgeName(n.canonical_name) === normRef)),
      );
      if (matchedNode) return matchedNode.id;
      return null;
    };

    // Separate proposals by type
    const entityProposals = proposals.filter((p) => ["ENTITY", "TOPIC", "CONCEPT"].includes(p.proposal_type));
    const aliasProposals = proposals.filter((p) => p.proposal_type === "ALIAS");
    const relationProposals = proposals.filter((p) => p.proposal_type === "RELATION");
    const claimProposals = proposals.filter((p) => p.proposal_type === "CLAIM");

    // -----------------------------------------------------------------
    // STEP 1: Plan Entity Operations
    // -----------------------------------------------------------------
    for (const ep of entityProposals) {
      const payload = ep.payload as {
        temporary_id?: string;
        name: string;
        entity_type?: string;
        description?: string;
        summary?: string;
        confidence?: number;
      };

      const res = resolutionMap.get(ep.id) || {
        status: "NEW",
        canonical_id: null,
        confidence: ep.extraction_confidence ?? 0.9,
        match_type: "NONE",
      };

      const tempId = payload.temporary_id || `entity_${ep.id}`;

      if (res.status === "EXISTING" && res.canonical_id) {
        // Map temp reference to existing canonical UUID
        tempToCanonicalMap.set(tempId, res.canonical_id);
        tempToCanonicalMap.set(payload.name, res.canonical_id);

        const existingNode = nodes.find((n) => n.id === res.canonical_id) || null;
        const diff = KnowledgeDiffEngine.calculateNodeDiff(payload, existingNode);

        if (diff.is_noop) {
          summary.reused_nodes++;
          summary.no_ops++;
          operations.push({
            plan_id: planId,
            proposal_id: ep.id,
            operation_type: "NO_OP",
            target_type: "node",
            target_id: res.canonical_id,
            status: "proposed",
            payload: { name: payload.name, node_id: res.canonical_id },
            previous_state: existingNode as unknown as Record<string, unknown>,
            proposed_state: existingNode as unknown as Record<string, unknown>,
            diff,
            confidence: res.confidence,
            risk_level: "low",
            trust_tier: "tier_a",
            reason_summary: `Reusing existing canonical node "${existingNode?.name || payload.name}".`,
            execution_order: 1,
          });
        } else {
          summary.updated_nodes++;
          operations.push({
            plan_id: planId,
            proposal_id: ep.id,
            operation_type: "UPDATE_NODE",
            target_type: "node",
            target_id: res.canonical_id,
            status: "proposed",
            payload: { node_id: res.canonical_id, description: payload.description, summary: payload.summary },
            previous_state: existingNode as unknown as Record<string, unknown>,
            proposed_state: { ...existingNode, description: payload.description, summary: payload.summary },
            diff,
            confidence: res.confidence,
            risk_level: "medium",
            trust_tier: "tier_b",
            reason_summary: `Enriching fields on canonical node "${existingNode?.name}".`,
            execution_order: 3,
          });
        }
      } else if (res.status === "NEW") {
        const normName = normalizeKnowledgeName(payload.name);
        const existingNode = nodes.find(
          (n) =>
            n.deleted_at === null &&
            (normalizeKnowledgeName(n.name) === normName ||
              (n.canonical_name && normalizeKnowledgeName(n.canonical_name) === normName)),
        );

        if (existingNode) {
          // Concurrent duplicate protection: reuse canonical node instead of creating duplicate
          tempToCanonicalMap.set(tempId, existingNode.id);
          tempToCanonicalMap.set(payload.name, existingNode.id);
          summary.reused_nodes++;
          summary.no_ops++;
          operations.push({
            plan_id: planId,
            proposal_id: ep.id,
            operation_type: "NO_OP",
            target_type: "node",
            target_id: existingNode.id,
            status: "proposed",
            payload: { name: payload.name, node_id: existingNode.id },
            previous_state: existingNode as unknown as Record<string, unknown>,
            proposed_state: existingNode as unknown as Record<string, unknown>,
            diff: KnowledgeDiffEngine.calculateNodeDiff(payload, existingNode),
            confidence: res.confidence,
            risk_level: "low",
            trust_tier: "tier_a",
            reason_summary: `Reusing existing canonical node "${existingNode.name}".`,
            execution_order: 1,
          });
          continue;
        }

        const assignedTempRef = `temp_node_${tempNodeCounter++}`;
        tempToCanonicalMap.set(tempId, assignedTempRef);
        tempToCanonicalMap.set(payload.name, assignedTempRef);

        const diff = KnowledgeDiffEngine.calculateNodeDiff(payload, null);
        summary.created_nodes++;

        const risk = KnowledgeLearningPolicy.evaluateRisk("CREATE_NODE", res.confidence);
        const trustTier = KnowledgeLearningPolicy.evaluateTrustTier("CREATE_NODE", res.confidence);

        operations.push({
          plan_id: planId,
          proposal_id: ep.id,
          operation_type: "CREATE_NODE",
          target_type: "node",
          status: "proposed",
          payload: {
            temp_id: assignedTempRef,
            name: payload.name,
            canonical_name: payload.name,
            node_type: (payload.entity_type || "concept") as any,
            description: payload.description,
            summary: payload.summary,
            slug: generateCanonicalSlug(payload.name),
            confidence: res.confidence,
          },
          previous_state: null,
          proposed_state: { name: payload.name, node_type: payload.entity_type },
          diff,
          confidence: res.confidence,
          risk_level: risk,
          trust_tier: trustTier,
          reason_summary: `Create new canonical node "${payload.name}".`,
          execution_order: 2,
        });
      } else if (res.status === "POSSIBLE_DUPLICATE") {
        summary.review_required++;
        operations.push({
          plan_id: planId,
          proposal_id: ep.id,
          operation_type: "MERGE_NODE",
          target_type: "node",
          target_id: res.canonical_id,
          status: "proposed",
          payload: { name: payload.name, target_id: res.canonical_id || undefined, reason: res.reason },
          previous_state: null,
          proposed_state: null,
          diff: null,
          confidence: res.confidence,
          risk_level: "high",
          trust_tier: "tier_c",
          reason_summary: `Candidate "${payload.name}" is a possible duplicate of canonical node "${res.canonical_id}". Requires human review.`,
          execution_order: 8,
        });
      } else if (res.status === "AMBIGUOUS") {
        summary.review_required++;
        operations.push({
          plan_id: planId,
          proposal_id: ep.id,
          operation_type: "NO_OP",
          target_type: "node",
          status: "proposed",
          payload: { name: payload.name, reason: res.reason || "Ambiguous entity candidate" },
          previous_state: null,
          proposed_state: null,
          diff: null,
          confidence: res.confidence,
          risk_level: "high",
          trust_tier: "tier_c",
          reason_summary: `Entity "${payload.name}" is ambiguous (${res.reason || "multiple matches"}). Requires human review.`,
          execution_order: 8,
        });
      }
    }

    // -----------------------------------------------------------------
    // STEP 1.5: Plan Alias Operations
    // -----------------------------------------------------------------
    for (const ap of aliasProposals) {
      const payload = ap.payload as {
        entity_name?: string;
        alias: string;
        language?: string;
        node_id?: string;
      };

      const res = resolutionMap.get(ap.id) || {
        status: "NEW",
        canonical_id: payload.node_id || null,
        confidence: ap.extraction_confidence ?? 0.9,
        match_type: "NONE",
      };

      // Resolve target canonical node
      let targetNodeId = res.canonical_id || payload.node_id;
      if (!targetNodeId && payload.entity_name) {
        const normName = normalizeKnowledgeName(payload.entity_name);
        const matched = nodes.find(
          (n) =>
            n.deleted_at === null &&
            (normalizeKnowledgeName(n.name) === normName ||
              (n.canonical_name && normalizeKnowledgeName(n.canonical_name) === normName)),
        );
        if (matched) targetNodeId = matched.id;
      }

      if (!targetNodeId) {
        summary.review_required++;
        operations.push({
          plan_id: planId,
          proposal_id: ap.id,
          operation_type: "NO_OP",
          target_type: "alias",
          status: "proposed",
          payload: { alias: payload.alias, reason: "Target canonical node not found for alias" },
          previous_state: null,
          proposed_state: null,
          diff: null,
          confidence: res.confidence,
          risk_level: "high",
          trust_tier: "tier_c",
          reason_summary: `Cannot attach alias "${payload.alias}": canonical node not resolved. Requires review.`,
          execution_order: 8,
        });
        continue;
      }

      const targetNode = nodes.find((n) => n.id === targetNodeId);
      const nodeName = targetNode?.name || payload.entity_name || "Node";
      const alias = payload.alias;
      const normAlias = normalizeKnowledgeName(alias);

      // Check existing aliases
      const existingForThisNode = aliases.find(
        (a) => a.node_id === targetNodeId && normalizeKnowledgeName(a.alias) === normAlias,
      );
      const existingForOtherNode = aliases.find(
        (a) => a.node_id !== targetNodeId && normalizeKnowledgeName(a.alias) === normAlias,
      );

      if (existingForThisNode) {
        summary.no_ops++;
        const diff = KnowledgeDiffEngine.calculateAliasDiff(nodeName, alias, aliases);
        operations.push({
          plan_id: planId,
          proposal_id: ap.id,
          operation_type: "NO_OP",
          target_type: "alias",
          target_id: targetNodeId,
          status: "proposed",
          payload: { node_id: targetNodeId, alias, language: payload.language || "en" },
          previous_state: existingForThisNode as unknown as Record<string, unknown>,
          proposed_state: existingForThisNode as unknown as Record<string, unknown>,
          diff,
          confidence: res.confidence,
          risk_level: "low",
          trust_tier: "tier_a",
          reason_summary: `Alias "${alias}" already attached to canonical node "${nodeName}" (NO_OP).`,
          execution_order: 1,
        });
      } else if (existingForOtherNode) {
        summary.review_required++;
        operations.push({
          plan_id: planId,
          proposal_id: ap.id,
          operation_type: "NO_OP",
          target_type: "alias",
          target_id: targetNodeId,
          status: "proposed",
          payload: { node_id: targetNodeId, alias, conflicting_node_id: existingForOtherNode.node_id },
          previous_state: null,
          proposed_state: null,
          diff: null,
          confidence: res.confidence,
          risk_level: "high",
          trust_tier: "tier_c",
          reason_summary: `Alias "${alias}" already belongs to another node (${existingForOtherNode.node_id}). Requires review.`,
          execution_order: 8,
        });
      } else {
        const diff = KnowledgeDiffEngine.calculateAliasDiff(nodeName, alias, aliases);
        const risk = KnowledgeLearningPolicy.evaluateRisk("ADD_ALIAS", res.confidence);
        const trustTier = KnowledgeLearningPolicy.evaluateTrustTier("ADD_ALIAS", res.confidence);

        operations.push({
          plan_id: planId,
          proposal_id: ap.id,
          operation_type: "ADD_ALIAS",
          target_type: "alias",
          target_id: targetNodeId,
          status: "proposed",
          payload: {
            node_id: targetNodeId,
            alias,
            language: payload.language || "en",
          },
          previous_state: null,
          proposed_state: { node_id: targetNodeId, alias },
          diff,
          confidence: res.confidence,
          risk_level: risk,
          trust_tier: trustTier,
          reason_summary: `Add new verified alias "${alias}" to canonical node "${nodeName}".`,
          execution_order: 2,
        });
      }
    }

    // -----------------------------------------------------------------
    // STEP 2: Plan Relation Operations
    // -----------------------------------------------------------------
    for (const rp of relationProposals) {
      const payload = rp.payload as {
        source_entity_ref?: string;
        target_entity_ref?: string;
        relation_type: string;
        description?: string;
        confidence?: number;
      };

      const rawSource =
        payload.source_entity_ref ||
        (payload as any).source_entity ||
        (payload as any).source_node_id ||
        (payload as any).source;
      const rawTarget =
        payload.target_entity_ref ||
        (payload as any).target_entity ||
        (payload as any).target_node_id ||
        (payload as any).target;

      const sourceId = resolveEndpoint(rawSource);
      const targetId = resolveEndpoint(rawTarget);
      const relationType = payload.relation_type || "related_to";

      const sourceNode = nodes.find((n) => n.id === sourceId);
      const targetNode = nodes.find((n) => n.id === targetId);
      const sourceName = sourceNode?.name || rawSource || "Unknown Entity";
      const targetName = targetNode?.name || rawTarget || "Unknown Entity";

      const diff = KnowledgeDiffEngine.calculateRelationDiff(
        sourceName,
        targetName,
        relationType,
        sourceId,
        targetId,
        edges,
      );

      if (diff.is_noop) {
        summary.no_ops++;
        operations.push({
          plan_id: planId,
          proposal_id: rp.id,
          operation_type: "NO_OP",
          target_type: "relation",
          status: "proposed",
          payload: { source_id: sourceId || undefined, target_id: targetId || undefined, relation_type: relationType },
          diff,
          confidence: payload.confidence ?? 0.95,
          risk_level: "low",
          trust_tier: "tier_a",
          reason_summary: `Relation "${sourceName} -> ${relationType} -> ${targetName}" already exists in Brain (NO_OP).`,
          execution_order: 1,
        });
      } else {
        summary.created_relations++;
        const conf = payload.confidence ?? 0.9;
        const risk = KnowledgeLearningPolicy.evaluateRisk("CREATE_RELATION", conf);
        const trustTier = KnowledgeLearningPolicy.evaluateTrustTier("CREATE_RELATION", conf);

        operations.push({
          plan_id: planId,
          proposal_id: rp.id,
          operation_type: "CREATE_RELATION",
          target_type: "relation",
          status: "proposed",
          payload: {
            source_id: sourceId || rawSource,
            target_id: targetId || rawTarget,
            relation_type: relationType,
            description: payload.description,
            confidence: conf,
          },
          diff,
          confidence: conf,
          risk_level: risk,
          trust_tier: trustTier,
          reason_summary: `Add relation: "${sourceName} -> ${relationType} -> ${targetName}".`,
          execution_order: 5,
        });
      }
    }

    // -----------------------------------------------------------------
    // STEP 3: Plan Claim Operations
    // -----------------------------------------------------------------
    for (const cp of claimProposals) {
      const payload = cp.payload as {
        subject_entity_ref?: string;
        statement: string;
        claim_type?: string;
        confidence?: number;
        is_conflicting?: boolean;
      };

      const rawSubject =
        payload.subject_entity_ref ||
        (payload as any).subject_entity ||
        (payload as any).subject_node_id ||
        (payload as any).node_id ||
        (payload as any).entity_name;

      const subjectId = resolveEndpoint(rawSubject);
      const subjectNode = nodes.find((n) => n.id === subjectId);
      const subjectName = subjectNode?.name || rawSubject || "Unknown Entity";

      const conf = payload.confidence ?? cp.extraction_confidence ?? 0.9;
      const hasEvidence = !!(
        (payload as any).evidence ||
        (payload as any).source_url ||
        (payload as any).source_id ||
        (payload as any).citation
      );
      const isQuarantine =
        payload.is_conflicting ||
        (settings.require_evidence_for_claims && !hasEvidence && conf < 0.95) ||
        KnowledgeLearningPolicy.shouldQuarantine(payload.is_conflicting ?? false, conf, hasEvidence);

      const diff = KnowledgeDiffEngine.calculateClaimDiff(
        subjectName,
        payload.statement,
        subjectId,
        claims,
      );

      if (diff.is_noop) {
        summary.no_ops++;
        operations.push({
          plan_id: planId,
          proposal_id: cp.id,
          operation_type: "NO_OP",
          target_type: "claim",
          status: "proposed",
          payload: { statement: payload.statement, subject_node_id: subjectId || undefined },
          diff,
          confidence: conf,
          risk_level: "low",
          trust_tier: "tier_a",
          reason_summary: `Claim statement already exists for "${subjectName}" (NO_OP).`,
          execution_order: 1,
        });
      } else if (isQuarantine) {
        summary.quarantined++;
        summary.review_required++;
        operations.push({
          plan_id: planId,
          proposal_id: cp.id,
          operation_type: "QUARANTINE_CLAIM",
          target_type: "claim",
          status: "proposed",
          payload: {
            statement: payload.statement,
            subject_node_id: subjectId || rawSubject,
            is_conflicting: payload.is_conflicting ?? false,
          },
          diff,
          confidence: conf,
          risk_level: "high",
          trust_tier: "tier_c",
          reason_summary: payload.is_conflicting
            ? `Claim contradicts existing verified knowledge. Routed to Quarantine for review.`
            : `Claim lacks external supporting evidence. Held in Quarantine for verification.`,
          execution_order: 7,
        });
      } else {
        summary.added_claims++;
        const risk = KnowledgeLearningPolicy.evaluateRisk("ADD_CLAIM", conf);
        const trustTier = KnowledgeLearningPolicy.evaluateTrustTier("ADD_CLAIM", conf);

        operations.push({
          plan_id: planId,
          proposal_id: cp.id,
          operation_type: "ADD_CLAIM",
          target_type: "claim",
          status: "proposed",
          payload: {
            statement: payload.statement,
            subject_node_id: subjectId || rawSubject,
            claim_type: payload.claim_type || "fact",
            confidence: conf,
          },
          diff,
          confidence: conf,
          risk_level: risk,
          trust_tier: trustTier,
          reason_summary: `Add atomic claim to "${subjectName}": "${payload.statement}".`,
          execution_order: 6,
        });
      }
    }

    // Sort operations by execution_order
    operations.sort((a, b) => a.execution_order - b.execution_order);

    // Calculate overall plan risk & status
    const hasHighRisk = operations.some((o) => o.risk_level === "high");
    const hasMediumRisk = operations.some((o) => o.risk_level === "medium");
    const overallRisk: RiskLevel = hasHighRisk ? "high" : hasMediumRisk ? "medium" : "low";

    // Determine initial plan status based on learning mode and risk
    let planStatus: KnowledgePlan["status"] = "ready";
    if (settings.learning_mode === "review") {
      planStatus = summary.created_nodes > 0 || summary.created_relations > 0 || summary.added_claims > 0 || summary.review_required > 0
        ? "needs_review"
        : "ready";
    } else {
      // Auto mode
      if (hasHighRisk || summary.review_required > 0) {
        planStatus = "needs_review";
      } else {
        planStatus = "ready";
      }
    }

    const validation = KnowledgeValidator.validatePlan(operations, { nodes, edges, claims, aliases });
    if (!validation.valid) {
      planStatus = "needs_review";
    }

    return {
      id: planId,
      extraction_run_id: runId,
      conversation_id: conversationId,
      status: planStatus,
      learning_mode: settings.learning_mode,
      risk_level: overallRisk,
      overall_confidence: operations.length > 0
        ? Number((operations.reduce((acc, o) => acc + o.confidence, 0) / operations.length).toFixed(3))
        : 1.0,
      plan_version: 1,
      diff_summary: {
        total_operations: operations.length,
        no_ops: summary.no_ops,
        created_nodes: summary.created_nodes,
        created_relations: summary.created_relations,
        added_claims: summary.added_claims,
      },
      summary,
      metadata: {
        created_temp_mappings: Array.from(tempToCanonicalMap.entries()),
        validation_warnings: validation.issues.filter((i) => i.severity === "warning").map((i) => i.message),
      },
      created_by: "system",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      operations,
    };
  }
}

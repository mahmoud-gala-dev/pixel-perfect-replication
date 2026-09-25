// =====================================================================
// KNOWLEDGE BRAIN — PHASE 7: KNOWLEDGE DIFF ENGINE
// Calculates inspectable Before vs After state differences before any commit
// =====================================================================

import type { KnowledgeNode, KnowledgeEdge, KnowledgeClaim, KnowledgeAlias } from "@/lib/knowledge-engine/types";
import type { KnowledgeDiff, FieldDiff, PlannedOperationPayload } from "./types";

export class KnowledgeDiffEngine {
  /**
   * Calculates diff for a Node proposal against canonical node state.
   */
  public static calculateNodeDiff(
    proposed: PlannedOperationPayload,
    existingNode: KnowledgeNode | null,
  ): KnowledgeDiff {
    if (!existingNode) {
      return {
        target_type: "node",
        target_identifier: proposed.name || "Unnamed Node",
        field_diffs: [
          { field: "name", previous_value: null, proposed_value: proposed.name, action: "ADDED" },
          { field: "node_type", previous_value: null, proposed_value: proposed.node_type || "concept", action: "ADDED" },
          { field: "description", previous_value: null, proposed_value: proposed.description || null, action: "ADDED" },
          { field: "parent_id", previous_value: null, proposed_value: proposed.parent_id || null, action: "ADDED" },
        ],
        summary: `Create new canonical node "${proposed.name}" (${proposed.node_type || "concept"}).`,
        is_noop: false,
      };
    }

    const fieldDiffs: FieldDiff[] = [];
    let hasChanges = false;

    // Check description enrichment (non-destructive: do not overwrite an existing description with casual AI text)
    if (!existingNode.description && proposed.description && proposed.description.trim()) {
      fieldDiffs.push({
        field: "description",
        previous_value: null,
        proposed_value: proposed.description.trim(),
        action: "ADDED",
      });
      hasChanges = true;
    } else {
      fieldDiffs.push({
        field: "description",
        previous_value: existingNode.description,
        proposed_value: existingNode.description,
        action: "UNCHANGED",
      });
    }

    // Check summary enrichment (non-destructive)
    if (!existingNode.summary && proposed.summary && proposed.summary.trim()) {
      fieldDiffs.push({
        field: "summary",
        previous_value: null,
        proposed_value: proposed.summary.trim(),
        action: "ADDED",
      });
      hasChanges = true;
    } else {
      fieldDiffs.push({
        field: "summary",
        previous_value: existingNode.summary,
        proposed_value: existingNode.summary,
        action: "UNCHANGED",
      });
    }

    return {
      target_type: "node",
      target_identifier: existingNode.name,
      field_diffs: fieldDiffs,
      summary: hasChanges
        ? `Update fields on existing canonical node "${existingNode.name}".`
        : `Canonical node "${existingNode.name}" already contains this knowledge (NO_OP).`,
      is_noop: !hasChanges,
    };
  }

  /**
   * Calculates diff for an Alias addition.
   */
  public static calculateAliasDiff(
    nodeName: string,
    alias: string,
    existingAliases: KnowledgeAlias[],
  ): KnowledgeDiff {
    const norm = alias.trim().toLowerCase();
    const alreadyExists = existingAliases.some((a) => a.alias.trim().toLowerCase() === norm);

    if (alreadyExists) {
      return {
        target_type: "alias",
        target_identifier: `${nodeName} -> ${alias}`,
        field_diffs: [
          { field: "alias", previous_value: alias, proposed_value: alias, action: "UNCHANGED" },
        ],
        summary: `Alias "${alias}" already attached to node "${nodeName}" (NO_OP).`,
        is_noop: true,
      };
    }

    return {
      target_type: "alias",
      target_identifier: `${nodeName} -> ${alias}`,
      field_diffs: [
        { field: "alias", previous_value: null, proposed_value: alias, action: "ADDED" },
      ],
      summary: `Add alias "${alias}" to canonical node "${nodeName}".`,
      is_noop: false,
    };
  }

  /**
   * Calculates diff for a Relation.
   */
  public static calculateRelationDiff(
    sourceName: string,
    targetName: string,
    relationType: string,
    sourceId: string | null,
    targetId: string | null,
    existingEdges: KnowledgeEdge[],
  ): KnowledgeDiff {
    const existing = sourceId && targetId
      ? existingEdges.find(
          (e) =>
            e.status !== "archived" &&
            e.source_node_id === sourceId &&
            e.target_node_id === targetId &&
            e.relation_type === relationType,
        )
      : null;

    if (existing) {
      return {
        target_type: "relation",
        target_identifier: `${sourceName} -> ${relationType} -> ${targetName}`,
        field_diffs: [
          { field: "relation", previous_value: relationType, proposed_value: relationType, action: "UNCHANGED" },
        ],
        summary: `Relation "${sourceName} -> ${relationType} -> ${targetName}" already exists (NO_OP).`,
        is_noop: true,
      };
    }

    return {
      target_type: "relation",
      target_identifier: `${sourceName} -> ${relationType} -> ${targetName}`,
      field_diffs: [
        { field: "relation_type", previous_value: null, proposed_value: relationType, action: "ADDED" },
        { field: "source", previous_value: null, proposed_value: sourceName, action: "ADDED" },
        { field: "target", previous_value: null, proposed_value: targetName, action: "ADDED" },
      ],
      summary: `Create relation "${sourceName} -> ${relationType} -> ${targetName}".`,
      is_noop: false,
    };
  }

  /**
   * Calculates diff for a Claim.
   */
  public static calculateClaimDiff(
    subjectName: string,
    statement: string,
    subjectId: string | null,
    existingClaims: KnowledgeClaim[],
  ): KnowledgeDiff {
    const normStatement = statement.trim().toLowerCase();
    const existing = subjectId
      ? existingClaims.find(
          (c) =>
            c.status !== "archived" &&
            (c.node_id === subjectId || (c as any).subject_node_id === subjectId) &&
            ((c.claim_text || (c as any).statement || "").trim().toLowerCase() === normStatement),
        )
      : null;

    if (existing) {
      const prevStatement = existing.claim_text || (existing as any).statement || statement;
      return {
        target_type: "claim",
        target_identifier: `${subjectName}: "${statement}"`,
        field_diffs: [
          { field: "statement", previous_value: prevStatement, proposed_value: statement, action: "UNCHANGED" },
        ],
        summary: `Claim already verified on node "${subjectName}" (NO_OP).`,
        is_noop: true,
      };
    }

    return {
      target_type: "claim",
      target_identifier: `${subjectName}: "${statement}"`,
      field_diffs: [
        { field: "statement", previous_value: null, proposed_value: statement, action: "ADDED" },
      ],
      summary: `Add claim to "${subjectName}": "${statement}".`,
      is_noop: false,
    };
  }
}

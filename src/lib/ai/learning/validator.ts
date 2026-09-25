// =====================================================================
// KNOWLEDGE BRAIN — PHASE 7: OPERATION VALIDATOR
// Strict validation engine for canonical operations before transactional commit
// =====================================================================

import type { KnowledgeNode, KnowledgeEdge, KnowledgeClaim, KnowledgeAlias } from "@/lib/knowledge-engine/types";
import { normalizeKnowledgeName } from "@/lib/knowledge-engine/normalization";
import type {
  KnowledgeOperationItem,
  OperationValidationResult,
  ValidationIssue,
} from "./types";

export interface ValidationContext {
  nodes: KnowledgeNode[];
  edges?: KnowledgeEdge[] | undefined;
  claims?: KnowledgeClaim[] | undefined;
  aliases?: KnowledgeAlias[] | undefined;
}

export class KnowledgeValidator {
  /**
   * Validates a single operation against current Brain state.
   */
  public static validateOperation(
    op: KnowledgeOperationItem,
    context: ValidationContext,
    createdTempNodeIds: Set<string> = new Set(),
  ): OperationValidationResult {
    const issues: ValidationIssue[] = [];

    switch (op.operation_type) {
      case "NO_OP":
        // NO_OP is always safe
        break;

      case "CREATE_NODE": {
        const name = (op.payload.name || "").trim();
        if (!name) {
          issues.push({ severity: "error", code: "EMPTY_NAME", message: "Node name cannot be empty." });
        }
        const normName = normalizeKnowledgeName(name);
        const existingDuplicate = context.nodes.find(
          (n) =>
            n.deleted_at === null &&
            (normalizeKnowledgeName(n.name) === normName ||
              (n.canonical_name && normalizeKnowledgeName(n.canonical_name) === normName)),
        );
        if (existingDuplicate) {
          issues.push({
            severity: "error",
            code: "DUPLICATE_NODE",
            message: `Canonical node "${existingDuplicate.name}" already exists.`,
            target: existingDuplicate.id,
          });
        }
        break;
      }

      case "UPDATE_NODE": {
        const nodeId = op.payload.node_id || op.target_id;
        if (!nodeId) {
          issues.push({ severity: "error", code: "MISSING_NODE_ID", message: "Target node ID required for update." });
        } else {
          const targetNode = context.nodes.find((n) => n.id === nodeId && n.deleted_at === null);
          if (!targetNode) {
            issues.push({ severity: "error", code: "NODE_NOT_FOUND", message: `Target node ${nodeId} not found.` });
          }
        }
        break;
      }

      case "ADD_ALIAS": {
        const alias = (op.payload.alias || "").trim();
        const nodeId = op.payload.node_id || op.target_id;
        if (!alias) {
          issues.push({ severity: "error", code: "EMPTY_ALIAS", message: "Alias cannot be empty." });
        }
        if (context.aliases && alias) {
          const normAlias = normalizeKnowledgeName(alias);
          const conflicting = context.aliases.find(
            (a) => normalizeKnowledgeName(a.alias) === normAlias && a.node_id !== nodeId,
          );
          if (conflicting) {
            issues.push({
              severity: "error",
              code: "ALIAS_CONFLICT",
              message: `Alias "${alias}" is already associated with another canonical node (${conflicting.node_id}).`,
              target: conflicting.node_id,
            });
          }
        }
        break;
      }

      case "CREATE_RELATION": {
        const sourceId = op.payload.source_id;
        const targetId = op.payload.target_id;
        const relationType = (op.payload.relation_type || "").trim();

        if (!sourceId || !targetId) {
          issues.push({ severity: "error", code: "MISSING_ENDPOINTS", message: "Both source and target endpoints are required." });
        } else if (sourceId === targetId) {
          issues.push({ severity: "error", code: "SELF_RELATION", message: "Self-referential relations are not permitted." });
        } else {
          // Check if source and target exist or are created in this plan
          const sourceValid =
            context.nodes.some((n) => n.id === sourceId && n.deleted_at === null) ||
            createdTempNodeIds.has(sourceId);
          const targetValid =
            context.nodes.some((n) => n.id === targetId && n.deleted_at === null) ||
            createdTempNodeIds.has(targetId);

          if (!sourceValid) {
            issues.push({ severity: "error", code: "SOURCE_NOT_FOUND", message: `Source endpoint "${sourceId}" does not exist in Brain or prior plan operations.` });
          }
          if (!targetValid) {
            issues.push({ severity: "error", code: "TARGET_NOT_FOUND", message: `Target endpoint "${targetId}" does not exist in Brain or prior plan operations.` });
          }

          // Check duplicate edge
          if (context.edges) {
            const existingEdge = context.edges.find(
              (e) =>
                e.status !== "archived" &&
                e.source_node_id === sourceId &&
                e.target_node_id === targetId &&
                e.relation_type === relationType,
            );
            if (existingEdge) {
              issues.push({
                severity: "warning",
                code: "DUPLICATE_EDGE",
                message: `Identical relation "${sourceId} -> ${relationType} -> ${targetId}" already exists.`,
                target: existingEdge.id,
              });
            }
          }
        }
        break;
      }

      case "ADD_CLAIM": {
        const statement = (op.payload.statement || "").trim();
        const subjectId = op.payload.subject_node_id;

        if (!statement) {
          issues.push({ severity: "error", code: "EMPTY_STATEMENT", message: "Claim statement cannot be empty." });
        }

        if (subjectId) {
          const subjectValid =
            context.nodes.some((n) => n.id === subjectId && n.deleted_at === null) ||
            createdTempNodeIds.has(subjectId);
          if (!subjectValid) {
            issues.push({ severity: "error", code: "INVALID_SUBJECT", message: `Subject node "${subjectId}" does not exist in Brain or prior plan operations.` });
          }

          // Check duplicate claim
          if (context.claims) {
            const normStatement = normalizeKnowledgeName(statement);
            const existingClaim = context.claims.find(
              (c) =>
                c.status !== "archived" &&
                (c.node_id === subjectId || (c as any).subject_node_id === subjectId) &&
                normalizeKnowledgeName(c.claim_text || (c as any).statement || "") === normStatement,
            );
            if (existingClaim) {
              issues.push({
                severity: "warning",
                code: "DUPLICATE_CLAIM",
                message: `Identical claim already exists on subject ${subjectId}.`,
                target: existingClaim.id,
              });
            }
          }
        }
        break;
      }
    }

    const hasErrors = issues.some((i) => i.severity === "error");
    return {
      valid: !hasErrors,
      issues,
    };
  }

  /**
   * Validates an entire Knowledge Plan, verifying dependency ordering and consistency.
   */
  public static validatePlan(
    operations: KnowledgeOperationItem[],
    context: ValidationContext,
  ): OperationValidationResult {
    const allIssues: ValidationIssue[] = [];
    const createdTempNodeIds = new Set<string>();

    for (const op of operations) {
      // Validate operation
      const res = this.validateOperation(op, context, createdTempNodeIds);
      if (!res.valid) {
        allIssues.push(...res.issues);
      } else {
        // Collect warnings
        allIssues.push(...res.issues.filter((i) => i.severity === "warning"));
      }

      // Track newly created temporary node IDs for dependency resolution
      if (op.operation_type === "CREATE_NODE") {
        if (op.payload.temp_id) createdTempNodeIds.add(op.payload.temp_id);
        if (op.payload.name) createdTempNodeIds.add(op.payload.name);
      }
    }

    const hasErrors = allIssues.some((i) => i.severity === "error");
    return {
      valid: !hasErrors,
      issues: allIssues,
    };
  }
}

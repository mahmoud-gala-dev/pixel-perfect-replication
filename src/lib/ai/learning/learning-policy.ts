// =====================================================================
// KNOWLEDGE BRAIN — PHASE 7: KNOWLEDGE LEARNING POLICY
// Centralized policy layer governing risk, trust tiers, and auto-commit rules
// =====================================================================

import type {
  RiskLevel,
  TrustTier,
  OperationType,
  KnowledgeOperationItem,
  BrainLearningSettings,
  DEFAULT_BRAIN_SETTINGS,
} from "./types";

export class KnowledgeLearningPolicy {
  /**
   * Evaluates the inherent risk of an operation.
   */
  public static evaluateRisk(
    operationType: OperationType,
    confidence: number = 0.9,
    isConflicting: boolean = false,
  ): RiskLevel {
    if (isConflicting) return "high";

    switch (operationType) {
      case "NO_OP":
        return "low";

      case "ADD_ALIAS":
      case "CREATE_RELATION":
        return confidence >= 0.85 ? "low" : "medium";

      case "ADD_CLAIM":
      case "CREATE_NODE":
      case "UPDATE_NODE":
        return confidence >= 0.90 ? "medium" : "high";

      case "MERGE_NODE":
      case "MOVE_NODE":
      case "ARCHIVE_NODE":
      case "DEPRECATE_RELATION":
      case "DEPRECATE_CLAIM":
      case "UPDATE_CLAIM":
        // Destructive / restructuring operations are always HIGH risk
        return "high";

      case "QUARANTINE_CLAIM":
      case "QUARANTINE_NODE":
        return "medium";

      default:
        return "high";
    }
  }

  /**
   * Assigns trust tier based on operation type, confidence, and conflict state.
   */
  public static evaluateTrustTier(
    operationType: OperationType,
    confidence: number = 0.9,
    isConflicting: boolean = false,
  ): TrustTier {
    if (isConflicting) return "tier_c";

    if (operationType === "NO_OP") return "tier_a";

    if (operationType === "ADD_ALIAS" && confidence >= 0.95) {
      return "tier_a";
    }

    if (operationType === "CREATE_RELATION" && confidence >= 0.90) {
      return "tier_a";
    }

    if (operationType === "CREATE_NODE" && confidence >= 0.92) {
      return "tier_b";
    }

    if (operationType === "ADD_CLAIM" && confidence >= 0.90) {
      return "tier_b";
    }

    if (["MERGE_NODE", "MOVE_NODE", "ARCHIVE_NODE", "UPDATE_CLAIM"].includes(operationType)) {
      return "tier_c";
    }

    return "tier_c";
  }

  /**
   * Determines if a specific operation is eligible for automatic commit under the current settings.
   * Section 73: Even in Auto Mode, HIGH-risk operations ALWAYS require human review.
   */
  public static canAutoCommit(
    op: KnowledgeOperationItem,
    settings: BrainLearningSettings,
  ): boolean {
    // 1. If in Review Mode, NO canonical mutation may commit automatically
    if (settings.learning_mode === "review") {
      return op.operation_type === "NO_OP";
    }

    // 2. High risk operations NEVER auto-commit under any circumstances
    if (op.risk_level === "high") {
      return false;
    }

    // 3. Evaluate by operation type and user configuration
    switch (op.operation_type) {
      case "NO_OP":
        return true;

      case "ADD_ALIAS":
        return settings.auto_add_aliases && op.confidence >= 0.85;

      case "CREATE_RELATION":
        return settings.auto_add_relations && op.confidence >= settings.min_relation_confidence;

      case "CREATE_NODE":
        return settings.auto_create_nodes && op.confidence >= settings.min_node_confidence;

      case "ADD_CLAIM":
        if (op.payload.is_conflicting) return false;
        if (settings.require_evidence_for_claims && !op.payload.reason) return false;
        return settings.auto_add_claims && op.confidence >= settings.min_claim_confidence;

      case "UPDATE_NODE":
        return false; // Updates to existing nodes require confirmation

      case "MERGE_NODE":
      case "MOVE_NODE":
      case "QUARANTINE_CLAIM":
      case "QUARANTINE_NODE":
        return false;

      default:
        return false;
    }
  }

  /**
   * Determines if an operation requires human review under the current settings.
   */
  public static requiresReview(
    op: KnowledgeOperationItem,
    settings: BrainLearningSettings,
  ): boolean {
    return !this.canAutoCommit(op, settings);
  }

  /**
   * Determines if an operation is strictly prohibited for automatic AI learning.
   */
  public static isProhibited(operationType: OperationType): boolean {
    return ["ARCHIVE_NODE", "DEPRECATE_RELATION", "DEPRECATE_CLAIM"].includes(operationType);
  }

  /**
   * Determines if a claim should be routed to QUARANTINE.
   */
  public static shouldQuarantine(
    isConflicting: boolean,
    confidence: number,
    hasEvidence: boolean,
  ): boolean {
    if (isConflicting) return true;
    if (confidence < 0.60) return true;
    if (!hasEvidence && confidence < 0.80) return true;
    return false;
  }
}

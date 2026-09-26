/**
 * KNOWLEDGE BRAIN — PHASE 12: GOVERNANCE & ROLES
 * Server-Enforced Role-Based Access Control (RBAC) & Centralized Permission Matrix
 */

export type BrainRole =
  | "VIEWER"
  | "EDITOR"
  | "REVIEWER"
  | "KNOWLEDGE_ENGINEER"
  | "ADMIN"
  | "AI_AGENT";

export type GovernanceAction =
  | "canReadKnowledge"
  | "canEditKnowledge"
  | "canCreateProposal"
  | "canApproveOperation"
  | "canVerifyClaim"
  | "canResolveConflict"
  | "canRollback"
  | "canMergeNodes"
  | "canManageTaxonomy"
  | "canLaunchResearch"
  | "canManageAgents"
  | "canManagePolicies"
  | "canManageUsers"
  | "canUseKillSwitches";

/**
 * Explicit, centralized permission matrix for the Knowledge Brain.
 * Frontend checks this for UX visibility, while server-side endpoints re-verify authoritatively.
 */
export const ROLE_PERMISSION_MATRIX: Record<BrainRole, Record<GovernanceAction, boolean>> = {
  VIEWER: {
    canReadKnowledge: true,
    canEditKnowledge: false,
    canCreateProposal: false,
    canApproveOperation: false,
    canVerifyClaim: false,
    canResolveConflict: false,
    canRollback: false,
    canMergeNodes: false,
    canManageTaxonomy: false,
    canLaunchResearch: false,
    canManageAgents: false,
    canManagePolicies: false,
    canManageUsers: false,
    canUseKillSwitches: false,
  },
  EDITOR: {
    canReadKnowledge: true,
    canEditKnowledge: true,
    canCreateProposal: true,
    canApproveOperation: false,
    canVerifyClaim: false,
    canResolveConflict: false,
    canRollback: false,
    canMergeNodes: false,
    canManageTaxonomy: false,
    canLaunchResearch: false,
    canManageAgents: false,
    canManagePolicies: false,
    canManageUsers: false,
    canUseKillSwitches: false,
  },
  REVIEWER: {
    canReadKnowledge: true,
    canEditKnowledge: true,
    canCreateProposal: true,
    canApproveOperation: true,
    canVerifyClaim: true,
    canResolveConflict: true,
    canRollback: true,
    canMergeNodes: false,
    canManageTaxonomy: false,
    canLaunchResearch: true,
    canManageAgents: false,
    canManagePolicies: false,
    canManageUsers: false,
    canUseKillSwitches: false,
  },
  KNOWLEDGE_ENGINEER: {
    canReadKnowledge: true,
    canEditKnowledge: true,
    canCreateProposal: true,
    canApproveOperation: true,
    canVerifyClaim: true,
    canResolveConflict: true,
    canRollback: true,
    canMergeNodes: true,
    canManageTaxonomy: true,
    canLaunchResearch: true,
    canManageAgents: true,
    canManagePolicies: false,
    canManageUsers: false,
    canUseKillSwitches: false,
  },
  ADMIN: {
    canReadKnowledge: true,
    canEditKnowledge: true,
    canCreateProposal: true,
    canApproveOperation: true,
    canVerifyClaim: true,
    canResolveConflict: true,
    canRollback: true,
    canMergeNodes: true,
    canManageTaxonomy: true,
    canLaunchResearch: true,
    canManageAgents: true,
    canManagePolicies: true,
    canManageUsers: true,
    canUseKillSwitches: true,
  },
  AI_AGENT: {
    // Machine agent permissions: may read Brain context and create proposals
    // STRICT INVARIANT: AI agents CANNOT approve operations or directly mutate canonical tables
    canReadKnowledge: true,
    canEditKnowledge: false,
    canCreateProposal: true,
    canApproveOperation: false,
    canVerifyClaim: false,
    canResolveConflict: false,
    canRollback: false,
    canMergeNodes: false,
    canManageTaxonomy: false,
    canLaunchResearch: true,
    canManageAgents: false,
    canManagePolicies: false,
    canManageUsers: false,
    canUseKillSwitches: false,
  },
};

/**
 * Checks whether a role is permitted to perform a specific governance action.
 */
export function hasPermission(role: BrainRole, action: GovernanceAction): boolean {
  const permissions = ROLE_PERMISSION_MATRIX[role];
  if (!permissions) return false;
  return !!permissions[action];
}

/**
 * Asserts permission, throwing an actionable error if unauthorized.
 */
export function assertPermission(role: BrainRole, action: GovernanceAction): void {
  if (!hasPermission(role, action)) {
    throw new Error(
      `Governance Authorization Error: Role '${role}' lacks permission for '${action}'. Sensitive operations require appropriate privileges.`
    );
  }
}

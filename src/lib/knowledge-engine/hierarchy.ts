import type { KnowledgeNode, MoveValidationResult } from "./types";
import { normalizeKnowledgeName } from "./normalization";

export type TreeNode = KnowledgeNode & { children: TreeNode[] };

/**
 * Builds an unlimited-depth hierarchy tree from flat nodes.
 */
export function buildHierarchyTree(nodes: KnowledgeNode[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const node of nodes) {
    byId.set(node.id, { ...node, children: [] });
  }

  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    if (node.parent_id && byId.has(node.parent_id)) {
      byId.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortChildren = (list: TreeNode[]) => {
    list.sort((a, b) => a.name.localeCompare(b.name));
    list.forEach((child) => sortChildren(child.children));
  };
  sortChildren(roots);

  return roots;
}

/**
 * Returns the ordered ancestor chain from root down to the target node.
 */
export function getHierarchyPath(nodes: KnowledgeNode[], nodeId: string): KnowledgeNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const path: KnowledgeNode[] = [];
  let current = byId.get(nodeId);
  let guard = 0;

  while (current && guard < 200) {
    path.unshift(current);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
    guard += 1;
  }

  return path;
}

/**
 * Formats a node's full hierarchy path as a readable string: "Root > Sub > Node".
 */
export function formatHierarchyPath(nodes: KnowledgeNode[], nodeId: string): string {
  const path = getHierarchyPath(nodes, nodeId);
  return path.map((n) => n.name).join(" > ");
}

/**
 * Returns a Set of all descendant IDs for a given node (recursive, unlimited depth).
 */
export function getDescendantIds(nodes: KnowledgeNode[], nodeId: string): Set<string> {
  const descendants = new Set<string>();
  const childrenMap = new Map<string, string[]>();

  for (const node of nodes) {
    if (node.parent_id) {
      const list = childrenMap.get(node.parent_id) ?? [];
      list.push(node.id);
      childrenMap.set(node.parent_id, list);
    }
  }

  const stack = [nodeId];
  while (stack.length > 0) {
    const current = stack.pop()!;
    const children = childrenMap.get(current) ?? [];
    for (const childId of children) {
      if (!descendants.has(childId)) {
        descendants.add(childId);
        stack.push(childId);
      }
    }
  }

  return descendants;
}

/**
 * Validates whether moving a node to a proposed parent is safe.
 * Strictly prevents circular hierarchies (e.g. A -> B -> C -> A),
 * self-parenting, and sibling name collisions.
 */
export function validateNodeMove(
  nodes: KnowledgeNode[],
  nodeId: string,
  newParentId: string | null,
): MoveValidationResult {
  // Moving to root is always structurally valid (unless duplicate name at root)
  if (newParentId === null) {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return { valid: false, error: "Node not found." };

    const siblingCollision = nodes.some(
      (n) =>
        n.parent_id === null &&
        n.id !== nodeId &&
        n.deleted_at === null &&
        normalizeKnowledgeName(n.name) === normalizeKnowledgeName(node.name),
    );
    if (siblingCollision) {
      return { valid: false, error: "A root node with this name already exists." };
    }
    return { valid: true };
  }

  // 1. Cannot parent to self
  if (nodeId === newParentId) {
    return { valid: false, error: "A node cannot become its own parent." };
  }

  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return { valid: false, error: "Source node not found." };

  const targetParent = nodes.find((n) => n.id === newParentId);
  if (!targetParent || targetParent.deleted_at !== null) {
    return { valid: false, error: "Target parent node does not exist or has been deleted." };
  }

  // 2. Prevent circular hierarchy: new parent cannot be in the subtree/descendants of the node
  const descendants = getDescendantIds(nodes, nodeId);
  if (descendants.has(newParentId)) {
    return {
      valid: false,
      error: "Circular hierarchy prevented: target is a descendant of this node (cannot move inside own subtree).",
    };
  }

  // 3. Sibling collision check under new parent
  const siblingCollision = nodes.some(
    (n) =>
      n.parent_id === newParentId &&
      n.id !== nodeId &&
      n.deleted_at === null &&
      normalizeKnowledgeName(n.name) === normalizeKnowledgeName(node.name),
  );
  if (siblingCollision) {
    return {
      valid: false,
      error: "A node with this name already exists under the target parent.",
    };
  }

  return { valid: true };
}

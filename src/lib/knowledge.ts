import type { Tables } from "@/integrations/supabase/types";

export type KnowledgeNode = Tables<"knowledge_nodes">;
export type KnowledgeAlias = Tables<"knowledge_aliases">;
export type KnowledgeEdge = Tables<"knowledge_edges">;

export const NODE_TYPES = [
  "category",
  "topic",
  "concept",
  "technology",
  "person",
  "organization",
  "event",
  "method",
  "tool",
  "framework",
  "theory",
  "resource",
] as const;

export const NODE_STATUSES = [
  "draft",
  "active",
  "proposed",
  "review",
  "archived",
  "deprecated",
] as const;

export const RELATION_TYPES = [
  "related_to",
  "uses",
  "requires",
  "prerequisite_of",
  "part_of",
  "alternative_to",
  "implements",
  "created_by",
] as const;

export function slugify(value: string): string {
  const base = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return base.length > 0 ? base.slice(0, 80) : `node-${Date.now().toString(36)}`;
}

export type TreeNode = KnowledgeNode & { children: TreeNode[] };

export function buildTree(nodes: KnowledgeNode[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const node of nodes) byId.set(node.id, { ...node, children: [] });

  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const sort = (list: TreeNode[]) => {
    list.sort((a, b) => a.name.localeCompare(b.name));
    list.forEach((child) => sort(child.children));
  };
  sort(roots);
  return roots;
}

export function ancestorPath(nodes: KnowledgeNode[], nodeId: string): KnowledgeNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const path: KnowledgeNode[] = [];
  let current = byId.get(nodeId);
  let guard = 0;
  while (current && guard < 100) {
    path.unshift(current);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
    guard += 1;
  }
  return path;
}

export function descendantIds(nodes: KnowledgeNode[], nodeId: string): Set<string> {
  const result = new Set<string>([nodeId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) {
      if (node.parent_id && result.has(node.parent_id) && !result.has(node.id)) {
        result.add(node.id);
        changed = true;
      }
    }
  }
  return result;
}

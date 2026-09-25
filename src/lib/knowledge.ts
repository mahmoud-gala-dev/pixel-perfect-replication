import type { Tables } from "@/integrations/supabase/types";

export type KnowledgeNode = Tables<"knowledge_nodes">;
export type KnowledgeAlias = Tables<"knowledge_aliases">;
export type KnowledgeEdge = Tables<"knowledge_edges">;
export type KnowledgeEntry = Tables<"knowledge_entries">;
export type KnowledgeEntryNode = Tables<"knowledge_entry_nodes">;

export * from "./knowledge-engine";

// Backward compatibility aliases for Phase 1 code
import {
  buildHierarchyTree,
  getHierarchyPath,
  getDescendantIds,
  TreeNode as EngineTreeNode,
} from "./knowledge-engine/hierarchy";
import { generateCanonicalSlug } from "./knowledge-engine/normalization";

export type TreeNode = EngineTreeNode;
export const buildTree = buildHierarchyTree;
export const ancestorPath = getHierarchyPath;
export const descendantIds = getDescendantIds;
export const slugify = generateCanonicalSlug;

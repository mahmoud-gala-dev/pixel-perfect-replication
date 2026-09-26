import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type {
  KnowledgeEdge,
  KnowledgeNode,
  RelationTypeDef,
  RelationTypeRow,
  SafeCreateRelationInput,
  SafeCreateRelationResult,
} from "./types";

export const DEFAULT_RELATION_TYPES: RelationTypeDef[] = [
  {
    key: "related_to",
    name: "Related To",
    description: "General semantic relationship between concepts",
    inverse_key: "related_to",
    is_symmetric: true,
    allows_self_relation: false,
  },
  {
    key: "uses",
    name: "Uses",
    description: "Concept utilizes or depends on another technology/concept",
    inverse_key: "used_by",
    is_symmetric: false,
    allows_self_relation: false,
  },
  {
    key: "used_by",
    name: "Used By",
    description: "Inverse of uses",
    inverse_key: "uses",
    is_symmetric: false,
    allows_self_relation: false,
  },
  {
    key: "requires",
    name: "Requires",
    description: "Strict dependency or prerequisite",
    inverse_key: "prerequisite_of",
    is_symmetric: false,
    allows_self_relation: false,
  },
  {
    key: "prerequisite_of",
    name: "Prerequisite Of",
    description: "Must be learned or established before target",
    inverse_key: "requires",
    is_symmetric: false,
    allows_self_relation: false,
  },
  {
    key: "part_of",
    name: "Part Of",
    description: "Component or subsystem of a larger entity",
    inverse_key: "has_part",
    is_symmetric: false,
    allows_self_relation: false,
  },
  {
    key: "has_part",
    name: "Has Part",
    description: "Contains target concept as component",
    inverse_key: "part_of",
    is_symmetric: false,
    allows_self_relation: false,
  },
  {
    key: "depends_on",
    name: "Depends On",
    description: "Functional dependency",
    inverse_key: "depended_on_by",
    is_symmetric: false,
    allows_self_relation: false,
  },
  {
    key: "depended_on_by",
    name: "Depended On By",
    description: "Target concept depends on this",
    inverse_key: "depends_on",
    is_symmetric: false,
    allows_self_relation: false,
  },
  {
    key: "implements",
    name: "Implements",
    description: "Implements an interface, protocol, or design pattern",
    inverse_key: "implemented_by",
    is_symmetric: false,
    allows_self_relation: false,
  },
  {
    key: "implemented_by",
    name: "Implemented By",
    description: "Implemented by target concept",
    inverse_key: "implements",
    is_symmetric: false,
    allows_self_relation: false,
  },
  {
    key: "explains",
    name: "Explains",
    description: "Explains or elaborates upon target concept",
    inverse_key: "explained_by",
    is_symmetric: false,
    allows_self_relation: false,
  },
  {
    key: "explained_by",
    name: "Explained By",
    description: "Explained by target concept",
    inverse_key: "explains",
    is_symmetric: false,
    allows_self_relation: false,
  },
  {
    key: "example_of",
    name: "Example Of",
    description: "Concrete instance or example of target concept",
    inverse_key: "has_example",
    is_symmetric: false,
    allows_self_relation: false,
  },
  {
    key: "has_example",
    name: "Has Example",
    description: "Target concept is an example of this",
    inverse_key: "example_of",
    is_symmetric: false,
    allows_self_relation: false,
  },
  {
    key: "similar_to",
    name: "Similar To",
    description: "Shares fundamental characteristics",
    inverse_key: "similar_to",
    is_symmetric: true,
    allows_self_relation: false,
  },
  {
    key: "contrasts_with",
    name: "Contrasts With",
    description: "Has significant differences or opposing traits",
    inverse_key: "contrasts_with",
    is_symmetric: true,
    allows_self_relation: false,
  },
  {
    key: "contradicts",
    name: "Contradicts",
    description: "Mutually exclusive or contradictory",
    inverse_key: "contradicts",
    is_symmetric: true,
    allows_self_relation: false,
  },
  {
    key: "supports",
    name: "Supports",
    description: "Provides evidence or foundation for target",
    inverse_key: "supported_by",
    is_symmetric: false,
    allows_self_relation: false,
  },
  {
    key: "supported_by",
    name: "Supported By",
    description: "Supported by target concept",
    inverse_key: "supports",
    is_symmetric: false,
    allows_self_relation: false,
  },
  {
    key: "causes",
    name: "Causes",
    description: "Causal relationship",
    inverse_key: "caused_by",
    is_symmetric: false,
    allows_self_relation: false,
  },
  {
    key: "caused_by",
    name: "Caused By",
    description: "Result or effect of target concept",
    inverse_key: "causes",
    is_symmetric: false,
    allows_self_relation: false,
  },
  {
    key: "influences",
    name: "Influences",
    description: "Has notable impact on target concept",
    inverse_key: "influenced_by",
    is_symmetric: false,
    allows_self_relation: false,
  },
  {
    key: "derived_from",
    name: "Derived From",
    description: "Originated or evolved from target concept",
    inverse_key: "origin_of",
    is_symmetric: false,
    allows_self_relation: false,
  },
  {
    key: "associated_with",
    name: "Associated With",
    description: "General contextual association",
    inverse_key: "associated_with",
    is_symmetric: true,
    allows_self_relation: false,
  },
  {
    key: "can_use",
    name: "Can Use",
    description: "Optional or compatible integration",
    inverse_key: "can_be_used_by",
    is_symmetric: false,
    allows_self_relation: false,
  },
  {
    key: "can_be_used_by",
    name: "Can Be Used By",
    description: "Can be integrated into target",
    inverse_key: "can_use",
    is_symmetric: false,
    allows_self_relation: false,
  },
  {
    key: "alternative_to",
    name: "Alternative To",
    description: "Interchangeable alternative",
    inverse_key: "alternative_to",
    is_symmetric: true,
    allows_self_relation: false,
  },
];

/**
 * Find relation type metadata by key
 */
export function getRelationTypeDef(
  key: string,
  customTypes?: Array<RelationTypeDef | RelationTypeRow>,
): RelationTypeDef {
  if (customTypes) {
    const found = customTypes.find((t) => t.key === key);
    if (found) {
      return {
        key: found.key,
        name: found.name,
        description: found.description ?? "",
        inverse_key: found.inverse_key ?? null,
        is_symmetric: found.is_symmetric,
        allows_self_relation: found.allows_self_relation,
      };
    }
  }

  const def = DEFAULT_RELATION_TYPES.find((t) => t.key === key);
  if (def) return def;

  // Dynamic fallback for user-defined relation types
  return {
    key,
    name: key
      .split("_")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" "),
    description: "Custom user relation",
    inverse_key: null,
    is_symmetric: false,
    allows_self_relation: false,
  };
}

export interface RelationValidationParams {
  sourceId: string;
  targetId: string;
  relationTypeKey: string;
  existingEdges: KnowledgeEdge[];
  relationTypes?: Array<RelationTypeDef | RelationTypeRow> | undefined;
  nodes?: KnowledgeNode[] | undefined;
}

export interface RelationValidationOutput {
  valid: boolean;
  error?: string | undefined;
  isDuplicate?: boolean | undefined;
  existingEdge?: KnowledgeEdge | undefined;
  relationType: RelationTypeDef;
}

/**
 * Validates a relation before saving:
 * 1. Verifies source & target nodes
 * 2. Checks self-relations against allows_self_relation
 * 3. Checks direct duplicate
 * 4. Checks symmetric duplicates
 */
export function validateRelation(
  params: RelationValidationParams,
): RelationValidationOutput {
  const { sourceId, targetId, relationTypeKey, existingEdges, relationTypes, nodes } = params;
  const relType = getRelationTypeDef(relationTypeKey, relationTypes);

  // 1. Verify source and target nodes exist if list provided
  if (nodes) {
    const source = nodes.find((n) => n.id === sourceId && !n.deleted_at);
    if (!source) {
      return { valid: false, error: "Source knowledge node not found or deleted.", relationType: relType };
    }
    const target = nodes.find((n) => n.id === targetId && !n.deleted_at);
    if (!target) {
      return { valid: false, error: "Target knowledge node not found or deleted.", relationType: relType };
    }
  }

  // 2. Check self-relations
  if (sourceId === targetId && !relType.allows_self_relation) {
    return {
      valid: false,
      error: `Self-relations are not permitted for relation type "${relType.name}".`,
      relationType: relType,
    };
  }

  // 3. Check duplicate relations (direct or symmetric)
  const existing = existingEdges.find((edge) => {
    if (edge.status === "archived" || edge.status === "deprecated") return false;

    // Direct match: A -> type -> B
    if (
      edge.source_node_id === sourceId &&
      edge.target_node_id === targetId &&
      edge.relation_type === relationTypeKey
    ) {
      return true;
    }

    // Symmetric match: B -> type -> A (when type is symmetric)
    if (
      relType.is_symmetric &&
      edge.source_node_id === targetId &&
      edge.target_node_id === sourceId &&
      edge.relation_type === relationTypeKey
    ) {
      return true;
    }

    return false;
  });

  if (existing) {
    return {
      valid: false,
      isDuplicate: true,
      error: "Equivalent relation already exists in the knowledge graph.",
      existingEdge: existing,
      relationType: relType,
    };
  }

  return {
    valid: true,
    relationType: relType,
  };
}

/**
 * Safe write path for creating relations:
 * Validates, calls safe_create_relation RPC, or executes audited transaction fallback.
 */
export async function safeCreateRelation(
  supabase: SupabaseClient<Database>,
  input: SafeCreateRelationInput,
  existingEdges: KnowledgeEdge[] = [],
  nodes?: KnowledgeNode[] | undefined,
  relationTypes?: Array<RelationTypeDef | RelationTypeRow> | undefined,
): Promise<SafeCreateRelationResult> {
  // Client-side pre-validation
  const validation = validateRelation({
    sourceId: input.source_node_id,
    targetId: input.target_node_id,
    relationTypeKey: input.relation_type,
    existingEdges,
    nodes,
    relationTypes,
  });

  if (!validation.valid) {
    if (validation.isDuplicate) {
      return {
        created: false,
        status: "existing",
        edge: validation.existingEdge ?? null,
        message: validation.error,
      };
    }
    return {
      created: false,
      status: "rejected",
      message: validation.error,
    };
  }

  // Try RPC safe_create_relation
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc("safe_create_relation", {
      p_source_node_id: input.source_node_id,
      p_target_node_id: input.target_node_id,
      p_relation_type: input.relation_type,
      p_description: input.description ?? undefined,
      p_confidence: input.confidence ?? 1.0,
      p_status: input.status ?? "active",
      p_metadata: (input.metadata ?? {}) as any,
    });

    if (!rpcError && rpcData) {
      const parsed = typeof rpcData === "string" ? JSON.parse(rpcData) : rpcData;
      return {
        created: !!parsed.created,
        status: parsed.status ?? (parsed.created ? "created" : "existing"),
        edge: parsed.edge ?? null,
        message: parsed.message,
      };
    }
  } catch {
    // Fall back to direct insertion
  }

  // Client-side fallback insert
  const { data: newEdge, error: insertError } = await supabase
    .from("knowledge_edges")
    .insert({
      source_node_id: input.source_node_id,
      target_node_id: input.target_node_id,
      relation_type: input.relation_type,
      description: input.description?.trim() || null,
      confidence: input.confidence ?? 1.0,
      status: input.status ?? "active",
      metadata: (input.metadata ?? {}) as any,
    })
    .select("*")
    .single();

  if (insertError) {
    return {
      created: false,
      status: "rejected",
      message: insertError.message,
    };
  }

  // Record audit operation
  try {
    await supabase.from("knowledge_operations").insert({
      operation_type: "CREATE_RELATION",
      status: "executed",
      payload: {
        source_node_id: input.source_node_id,
        target_node_id: input.target_node_id,
        relation_type: input.relation_type,
      },
      result: (newEdge ?? {}) as any,
      confidence: input.confidence ?? 1.0,
      reason: "Safe relation creation",
    });
  } catch {
    // Non-blocking operation logging
  }

  return {
    created: true,
    status: "created",
    edge: newEdge as KnowledgeEdge,
  };
}

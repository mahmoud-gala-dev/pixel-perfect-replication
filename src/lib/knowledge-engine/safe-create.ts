import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import type {
  KnowledgeNode,
  NodeCandidate,
  SafeCreateNodeInput,
  SafeCreateNodeResult,
} from "./types";
import { generateCanonicalSlug } from "./normalization";
import { lookupKnowledgeNode } from "./lookup";

/**
 * Controlled, safe pathway to create a knowledge node.
 * Strictly enforces Search-Before-Create:
 * 1. Resolves input against existing nodes & aliases.
 * 2. If already existing in same hierarchy location, returns the canonical node without creating a duplicate.
 * 3. If potential duplicates or ambiguity found, returns warning unless explicitly forced.
 * 4. Inserts with slug uniqueness and audit metadata.
 */
export async function safeCreateKnowledgeNode(
  supabase: SupabaseClient<Database>,
  input: SafeCreateNodeInput,
  contextNodes?: KnowledgeNode[] | undefined,
): Promise<SafeCreateNodeResult> {
  const {
    name,
    parent_id = null,
    node_type = "topic",
    description = null,
    summary = null,
    status = "active",
    metadata = {},
    force = false,
  } = input;

  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("Node name cannot be empty.");
  }

  // 1. Try PostgreSQL RPC first
  try {
    const { data, error } = await supabase.rpc("safe_create_knowledge_node", {
      p_name: trimmedName,
      p_parent_id: parent_id ?? null,
      p_node_type: (node_type ?? "topic") as Database["public"]["Enums"]["node_type"],
      p_description: description ?? null,
      p_summary: summary ?? null,
      p_status: (status ?? "active") as Database["public"]["Enums"]["knowledge_status"],
      p_metadata: (metadata ?? {}) as Json,
      p_force: force ?? false,
    });

    if (!error && data && typeof data === "object") {
      const res = data as unknown as {
        created: boolean;
        status: "created" | "existing" | "possible_duplicate" | "ambiguous";
        node?: KnowledgeNode | undefined;
        reason?: string | undefined;
        candidates?: NodeCandidate[] | undefined;
      };
      if (res.status) {
        return {
          created: res.created,
          status: res.status,
          node: res.node,
          reason: res.reason,
          candidates: res.candidates,
        };
      }
    }
  } catch {
    // Fallback to client-side pipeline if RPC is not deployed yet
  }

  // 2. Client-side Search-Before-Create fallback
  const resolution = await lookupKnowledgeNode(supabase, {
    name: trimmedName,
    parentId: parent_id ?? null,
    nodeType: node_type,
    nodes: contextNodes,
  });

  // If node already exists under this parent
  if (resolution.status === "existing" && resolution.node_id) {
    const existing = contextNodes?.find((n) => n.id === resolution.node_id);
    return {
      created: false,
      status: "existing",
      node: existing ?? null,
      reason: resolution.reason,
      candidates: resolution.candidates,
      resolution,
    };
  }

  // If potential duplicates found and user has not explicitly forced creation
  if ((resolution.status === "possible_duplicate" || resolution.status === "ambiguous") && !force) {
    return {
      created: false,
      status: resolution.status,
      reason: resolution.reason,
      candidates: resolution.candidates,
      resolution,
    };
  }

  // Prepare audit metadata if overriding duplicate warning
  const enrichedMetadata: Record<string, unknown> = { ...(metadata ?? {}) };
  if (force && (resolution.status === "possible_duplicate" || resolution.status === "ambiguous")) {
    enrichedMetadata["duplicate_warning_overridden"] = true;
    enrichedMetadata["overridden_status"] = resolution.status;
    enrichedMetadata["overridden_reason"] = resolution.reason;
    enrichedMetadata["candidate_ids"] = resolution.candidates.map((c) => c.id);
    enrichedMetadata["overridden_at"] = new Date().toISOString();
  }

  // Compute safe slug
  let slug = generateCanonicalSlug(trimmedName);
  if (contextNodes) {
    const collision = contextNodes.some(
      (n) => (n.parent_id ?? null) === (parent_id ?? null) && n.slug === slug && n.deleted_at === null,
    );
    if (collision) {
      slug = `${slug}-${Math.random().toString(36).slice(2, 7)}`;
    }
  }

  // Insert canonical node
  const { data, error } = await supabase
    .from("knowledge_nodes")
    .insert({
      name: trimmedName,
      slug,
      node_type: (node_type ?? "topic") as Database["public"]["Enums"]["node_type"],
      description: description ? description.trim() : null,
      summary: summary ? summary.trim() : null,
      status: (status ?? "active") as Database["public"]["Enums"]["knowledge_status"],
      parent_id: parent_id ?? null,
      metadata: enrichedMetadata as Json,
    })
    .select()
    .single();

  if (error) throw error;

  return {
    created: true,
    status: "created",
    node: data as KnowledgeNode,
    resolution,
  };
}

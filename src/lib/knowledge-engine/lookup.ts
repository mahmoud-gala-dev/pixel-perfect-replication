import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type {
  KnowledgeAlias,
  KnowledgeNode,
  NodeCandidate,
  NodeResolutionResult,
  NodeType,
} from "./types";
import {
  calculateNameSimilarity,
  generateCanonicalSlug,
  normalizeKnowledgeName,
} from "./normalization";
import { formatHierarchyPath } from "./hierarchy";

export interface LookupOptions {
  name: string;
  parentId?: string | null | undefined;
  nodeType?: NodeType | undefined;
  nodes?: KnowledgeNode[] | undefined;
  aliases?: KnowledgeAlias[] | undefined;
}

/**
 * Searches and resolves a knowledge node using the 5-step lookup pipeline:
 * 1. Exact canonical name match under target parent
 * 2. Exact alias match under target parent
 * 3. Exact canonical/normalized name match globally
 * 4. Alias match globally
 * 5. Slug match & fuzzy similarity comparison
 *
 * Tries the database RPC first, falling back to client-side in-memory resolution.
 */
export async function lookupKnowledgeNode(
  supabase: SupabaseClient<Database>,
  options: LookupOptions,
): Promise<NodeResolutionResult> {
  const { name, parentId = null, nodeType = "topic", nodes, aliases } = options;

  if (!name || !name.trim()) {
    return {
      status: "new",
      node_id: null,
      confidence: 1.0,
      reason: "No name provided.",
      candidates: [],
    };
  }

  // 1. Try Supabase RPC if client is available
  try {
    const { data, error } = await supabase.rpc("resolve_knowledge_node", {
      p_name: name.trim(),
      p_parent_id: parentId ?? null,
      p_node_type: (nodeType ?? "topic") as Database["public"]["Enums"]["node_type"],
    });

    if (!error && data && typeof data === "object") {
      const res = data as unknown as NodeResolutionResult;
      if (res.status && Array.isArray(res.candidates)) {
        return res;
      }
    }
  } catch {
    // Fall back to client-side pipeline if RPC is not available or offline
  }

  // 2. Client-side fallback resolution pipeline
  return resolveClientSide(name, parentId, nodes ?? [], aliases ?? []);
}

/**
 * Client-side evaluation of the 5-step lookup pipeline.
 */
export function resolveClientSide(
  name: string,
  parentId: string | null = null,
  nodes: KnowledgeNode[],
  aliases: KnowledgeAlias[],
): NodeResolutionResult {
  const trimmed = name.trim();
  const normalized = normalizeKnowledgeName(trimmed);
  const slug = generateCanonicalSlug(trimmed);
  const activeNodes = nodes.filter((n) => n.deleted_at === null);

  // Step 1: Exact canonical or normalized match under SAME parent
  const exactParentNode = activeNodes.find(
    (n) =>
      (n.parent_id ?? null) === (parentId ?? null) &&
      (normalizeKnowledgeName(n.name) === normalized || n.slug === slug),
  );

  if (exactParentNode) {
    return {
      status: "existing",
      node_id: exactParentNode.id,
      confidence: 1.0,
      reason: "Exact match found in this hierarchy level.",
      candidates: [
        {
          id: exactParentNode.id,
          name: exactParentNode.name,
          canonical_name: exactParentNode.canonical_name ?? normalizeKnowledgeName(exactParentNode.name),
          slug: exactParentNode.slug,
          node_type: exactParentNode.node_type,
          parent_id: exactParentNode.parent_id,
          parent_path: formatHierarchyPath(activeNodes, exactParentNode.id),
          match_type: "exact_parent",
          confidence: 1.0,
        },
      ],
    };
  }

  // Step 2: Check for exact alias match under SAME parent
  const matchingAliases = aliases.filter(
    (a) =>
      normalizeKnowledgeName(a.alias) === normalized ||
      (a.canonical_alias !== null && a.canonical_alias.toLowerCase() === normalized),
  );

  for (const alias of matchingAliases) {
    const parentNode = activeNodes.find(
      (n) => n.id === alias.node_id && (n.parent_id ?? null) === (parentId ?? null),
    );
    if (parentNode) {
      return {
        status: "existing",
        node_id: parentNode.id,
        confidence: 0.98,
        reason: `Matches alias "${alias.alias}" of an existing node in this location.`,
        candidates: [
          {
            id: parentNode.id,
            name: parentNode.name,
            canonical_name: parentNode.canonical_name ?? normalizeKnowledgeName(parentNode.name),
            slug: parentNode.slug,
            node_type: parentNode.node_type,
            parent_id: parentNode.parent_id,
            parent_path: formatHierarchyPath(activeNodes, parentNode.id),
            match_type: "alias_parent",
            matched_alias: alias.alias,
            confidence: 0.98,
          },
        ],
      };
    }
  }

  // Step 3: Global candidates collection
  const candidates: NodeCandidate[] = [];
  const seenNodeIds = new Set<string>();

  // 3a. Exact match in another hierarchy branch
  for (const node of activeNodes) {
    if (normalizeKnowledgeName(node.name) === normalized) {
      seenNodeIds.add(node.id);
      candidates.push({
        id: node.id,
        name: node.name,
        canonical_name: node.canonical_name ?? normalizeKnowledgeName(node.name),
        slug: node.slug,
        node_type: node.node_type,
        parent_id: node.parent_id,
        parent_path: formatHierarchyPath(activeNodes, node.id),
        match_type: "exact_canonical",
        confidence: 0.9,
      });
    }
  }

  // 3b. Global alias match
  for (const alias of matchingAliases) {
    if (!seenNodeIds.has(alias.node_id)) {
      const node = activeNodes.find((n) => n.id === alias.node_id);
      if (node) {
        seenNodeIds.add(node.id);
        candidates.push({
          id: node.id,
          name: node.name,
          canonical_name: node.canonical_name ?? normalizeKnowledgeName(node.name),
          slug: node.slug,
          node_type: node.node_type,
          parent_id: node.parent_id,
          parent_path: formatHierarchyPath(activeNodes, node.id),
          match_type: "alias",
          matched_alias: alias.alias,
          confidence: 0.85,
        });
      }
    }
  }

  // 3c. Slug match
  for (const node of activeNodes) {
    if (!seenNodeIds.has(node.id) && node.slug === slug) {
      seenNodeIds.add(node.id);
      candidates.push({
        id: node.id,
        name: node.name,
        canonical_name: node.canonical_name ?? normalizeKnowledgeName(node.name),
        slug: node.slug,
        node_type: node.node_type,
        parent_id: node.parent_id,
        parent_path: formatHierarchyPath(activeNodes, node.id),
        match_type: "slug",
        confidence: 0.78,
      });
    }
  }

  // 3d. Fuzzy similarity match
  if (normalized.length >= 3) {
    for (const node of activeNodes) {
      if (!seenNodeIds.has(node.id)) {
        const sim = calculateNameSimilarity(trimmed, node.name);
        if (sim >= 0.55) {
          seenNodeIds.add(node.id);
          candidates.push({
            id: node.id,
            name: node.name,
            canonical_name: node.canonical_name ?? normalizeKnowledgeName(node.name),
            slug: node.slug,
            node_type: node.node_type,
            parent_id: node.parent_id,
            parent_path: formatHierarchyPath(activeNodes, node.id),
            match_type: "fuzzy",
            confidence: Number(sim.toFixed(2)),
          });
        }
      }
    }
  }

  // Sort candidates by highest confidence
  candidates.sort((a, b) => b.confidence - a.confidence);

  // Decide final status
  if (candidates.length === 0) {
    return {
      status: "new",
      node_id: null,
      confidence: 1.0,
      reason: "No matching or similar knowledge nodes found.",
      candidates: [],
    };
  }

  const top = candidates[0];
  if (candidates.length === 1 && top) {
    return {
      status: "possible_duplicate",
      node_id: top.id,
      confidence: top.confidence,
      reason: `Possible duplicate found: "${top.name}" in ${top.parent_path ?? "Root"}.`,
      candidates,
    };
  }

  const topConfidence = top ? top.confidence : 0.8;
  return {
    status: "ambiguous",
    node_id: null,
    confidence: topConfidence,
    reason: `Found ${candidates.length} similar existing knowledge nodes across the brain.`,
    candidates,
  };
}

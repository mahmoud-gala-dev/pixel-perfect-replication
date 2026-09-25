import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type {
  GraphEdge,
  GraphNeighborhood,
  GraphNode,
  KnowledgeEdge,
  KnowledgeNode,
  NodeRelationItem,
  NodeRelationsResult,
  RelationTypeDef,
  RelationTypeRow,
} from "./types";
import { getRelationTypeDef } from "./relations";

/**
 * Retrieves outgoing, incoming, and symmetric relations for a node,
 * deriving inverse relation display names intelligently without storing duplicate inverse rows.
 */
export async function getNodeRelations(
  supabase: SupabaseClient<Database>,
  nodeId: string,
  allEdges: KnowledgeEdge[],
  allNodes: KnowledgeNode[],
  relationTypes?: Array<RelationTypeDef | RelationTypeRow> | undefined,
): Promise<NodeRelationsResult> {
  // Try RPC get_node_relations
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc("get_node_relations", {
      p_node_id: nodeId,
    });

    if (!rpcError && rpcData) {
      const parsed = typeof rpcData === "string" ? JSON.parse(rpcData) : rpcData;
      return parsed as NodeRelationsResult;
    }
  } catch {
    // Fall back to client calculation
  }

  const outgoing: NodeRelationItem[] = [];
  const incoming: NodeRelationItem[] = [];

  const nodesMap = new Map<string, KnowledgeNode>();
  for (const node of allNodes) {
    nodesMap.set(node.id, node);
  }

  for (const edge of allEdges) {
    if (edge.status === "archived" || edge.status === "deprecated") continue;

    const relDef = getRelationTypeDef(edge.relation_type, relationTypes);

    // Outgoing relation: Node -> target
    if (edge.source_node_id === nodeId) {
      const targetNode = nodesMap.get(edge.target_node_id);
      outgoing.push({
        id: edge.id,
        direction: "outgoing",
        relation_type: edge.relation_type,
        relation_name: relDef.name,
        display_relation: edge.relation_type,
        inverse_key: relDef.inverse_key,
        is_symmetric: relDef.is_symmetric,
        description: edge.description,
        confidence: edge.confidence,
        status: edge.status,
        other_node: {
          id: edge.target_node_id,
          name: targetNode?.name ?? "Unknown Node",
          node_type: targetNode?.node_type ?? "concept",
          slug: targetNode?.slug ?? "",
        },
      });
    }

    // Incoming relation: source -> Node
    if (edge.target_node_id === nodeId) {
      const sourceNode = nodesMap.get(edge.source_node_id);
      const displayRel = relDef.is_symmetric
        ? edge.relation_type
        : (relDef.inverse_key ?? `inverse_of_${edge.relation_type}`);

      incoming.push({
        id: edge.id,
        direction: "incoming",
        relation_type: edge.relation_type,
        relation_name: relDef.name,
        display_relation: displayRel,
        inverse_key: relDef.inverse_key,
        is_symmetric: relDef.is_symmetric,
        description: edge.description,
        confidence: edge.confidence,
        status: edge.status,
        other_node: {
          id: edge.source_node_id,
          name: sourceNode?.name ?? "Unknown Node",
          node_type: sourceNode?.node_type ?? "concept",
          slug: sourceNode?.slug ?? "",
        },
      });
    }
  }

  return {
    node_id: nodeId,
    outgoing,
    incoming,
    total: outgoing.length + incoming.length,
  };
}

/**
 * Extracts a lightweight graph neighborhood around a center node up to specified depth (1 or 2 hops).
 * Ideal for performant visual graph rendering without downloading entire database.
 */
export async function getGraphNeighborhood(
  supabase: SupabaseClient<Database>,
  centerNodeId: string,
  depth: number = 1,
  allNodes: KnowledgeNode[],
  allEdges: KnowledgeEdge[],
): Promise<GraphNeighborhood> {
  const boundedDepth = Math.min(Math.max(depth, 1), 3);

  // Try RPC get_graph_neighborhood
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc("get_graph_neighborhood", {
      p_node_id: centerNodeId,
      p_depth: boundedDepth,
    });

    if (!rpcError && rpcData) {
      const parsed = typeof rpcData === "string" ? JSON.parse(rpcData) : rpcData;
      return parsed as GraphNeighborhood;
    }
  } catch {
    // Fall back to client calculation
  }

  const nodesMap = new Map<string, KnowledgeNode>();
  for (const n of allNodes) {
    if (!n.deleted_at) {
      nodesMap.set(n.id, n);
    }
  }

  // Multi-hop neighborhood BFS
  const visitedNodeIds = new Set<string>([centerNodeId]);
  let frontier = new Set<string>([centerNodeId]);

  for (let currentDepth = 0; currentDepth < boundedDepth; currentDepth++) {
    const nextFrontier = new Set<string>();

    for (const edge of allEdges) {
      if (edge.status === "archived" || edge.status === "deprecated") continue;

      if (frontier.has(edge.source_node_id) && !visitedNodeIds.has(edge.target_node_id)) {
        visitedNodeIds.add(edge.target_node_id);
        nextFrontier.add(edge.target_node_id);
      }
      if (frontier.has(edge.target_node_id) && !visitedNodeIds.has(edge.source_node_id)) {
        visitedNodeIds.add(edge.source_node_id);
        nextFrontier.add(edge.source_node_id);
      }
    }

    frontier = nextFrontier;
    if (frontier.size === 0) break;
  }

  const graphNodes: GraphNode[] = [];
  for (const id of visitedNodeIds) {
    const node = nodesMap.get(id);
    if (node) {
      graphNodes.push({
        id: node.id,
        name: node.name,
        canonical_name: node.canonical_name,
        slug: node.slug,
        node_type: node.node_type,
        status: node.status,
        parent_id: node.parent_id,
        is_center: node.id === centerNodeId,
      });
    }
  }

  const graphEdges: GraphEdge[] = [];
  for (const edge of allEdges) {
    if (edge.status === "archived" || edge.status === "deprecated") continue;

    if (visitedNodeIds.has(edge.source_node_id) && visitedNodeIds.has(edge.target_node_id)) {
      graphEdges.push({
        id: edge.id,
        source: edge.source_node_id,
        target: edge.target_node_id,
        relation_type: edge.relation_type,
        description: edge.description,
        confidence: edge.confidence,
        status: edge.status,
      });
    }
  }

  return {
    center_node_id: centerNodeId,
    depth: boundedDepth,
    nodes: graphNodes,
    edges: graphEdges,
  };
}

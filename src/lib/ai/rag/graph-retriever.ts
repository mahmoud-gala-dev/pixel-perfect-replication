// =====================================================================
// KNOWLEDGE BRAIN — PHASE 9: GRAPH RETRIEVER
// Knowledge graph traversal, bounded multi-hop paths & relation filtering
// =====================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { GraphPath } from "./types";

export interface GraphEdgeItem {
  id: string;
  source_node_id: string;
  target_node_id: string;
  relation_type: string;
  confidence?: number | null | undefined;
  description?: string | null | undefined;
  status?: string | undefined;
}

export interface GraphNodeItem {
  id: string;
  name: string;
  canonical_name?: string | null | undefined;
  node_type: string;
  description?: string | null | undefined;
}

export interface InMemoryGraphDataset {
  nodes: GraphNodeItem[];
  edges: GraphEdgeItem[];
}

export class GraphRetriever {
  constructor(private supabase: SupabaseClient<Database> | null = null) {}

  /**
   * Expands direct 1-hop neighbors of seed nodes.
   */
  public async expandNeighbors(
    nodeIds: string[],
    dataset?: InMemoryGraphDataset | undefined,
    options: {
      maxNeighborsPerNode?: number | undefined;
      allowedRelationTypes?: string[] | undefined;
    } = {},
  ): Promise<{
    neighbors: GraphNodeItem[];
    edges: GraphEdgeItem[];
  }> {
    if (nodeIds.length === 0) {
      return { neighbors: [], edges: [] };
    }

    const maxPerNode = options.maxNeighborsPerNode ?? 6;
    const allowedTypes = options.allowedRelationTypes
      ? new Set(options.allowedRelationTypes.map((t) => t.toLowerCase()))
      : null;

    // 1. In-memory resolution
    if (dataset) {
      const nodeMap = new Map(dataset.nodes.map((n) => [n.id, n]));
      const seenNeighbors = new Set<string>();
      const neighborNodes: GraphNodeItem[] = [];
      const relevantEdges: GraphEdgeItem[] = [];

      for (const nid of nodeIds) {
        let count = 0;
        const matchingEdges = dataset.edges.filter((e) => {
          if (e.status === "archived") return false;
          if (allowedTypes && !allowedTypes.has(e.relation_type.toLowerCase())) return false;
          return e.source_node_id === nid || e.target_node_id === nid;
        });

        for (const edge of matchingEdges) {
          if (count >= maxPerNode) break;
          const otherId = edge.source_node_id === nid ? edge.target_node_id : edge.source_node_id;
          relevantEdges.push(edge);

          if (!seenNeighbors.has(otherId) && !nodeIds.includes(otherId)) {
            seenNeighbors.add(otherId);
            const neighborNode = nodeMap.get(otherId);
            if (neighborNode) {
              neighborNodes.push(neighborNode);
              count++;
            }
          }
        }
      }

      return { neighbors: neighborNodes, edges: relevantEdges };
    }

    // 2. Database query
    if (this.supabase) {
      try {
        const { data: edgesData } = await this.supabase
          .from("knowledge_edges")
          .select("id, source_node_id, target_node_id, relation_type, confidence, description, status")
          .or(`source_node_id.in.(${nodeIds.join(",")}),target_node_id.in.(${nodeIds.join(",")})`)
          .neq("status", "archived")
          .limit(30);

        if (edgesData && edgesData.length > 0) {
          const neighborIds = new Set<string>();
          for (const e of edgesData) {
            if (!nodeIds.includes(e.source_node_id)) neighborIds.add(e.source_node_id);
            if (!nodeIds.includes(e.target_node_id)) neighborIds.add(e.target_node_id);
          }

          let neighborNodes: GraphNodeItem[] = [];
          if (neighborIds.size > 0) {
            const { data: nodesData } = await this.supabase
              .from("knowledge_nodes")
              .select("id, name, canonical_name, node_type, description")
              .in("id", Array.from(neighborIds))
              .is("deleted_at", null);

            neighborNodes = (nodesData || []).map((n) => ({
              id: n.id,
              name: n.name,
              canonical_name: n.canonical_name,
              node_type: n.node_type,
              description: n.description,
            }));
          }

          return {
            neighbors: neighborNodes,
            edges: edgesData.map((e) => ({
              id: e.id,
              source_node_id: e.source_node_id,
              target_node_id: e.target_node_id,
              relation_type: e.relation_type,
              confidence: e.confidence,
              description: e.description,
              status: e.status,
            })),
          };
        }
      } catch (err) {
        console.warn("Database neighbor expansion failed, returning empty", err);
      }
    }

    return { neighbors: [], edges: [] };
  }

  /**
   * Finds bounded connection paths between source and target entities.
   * Conceptually: findPaths(source, target, maxDepth).
   */
  public async findPaths(
    sourceNodeId: string,
    targetNodeId: string,
    maxDepth: number = 3,
    dataset?: InMemoryGraphDataset | undefined,
  ): Promise<GraphPath[]> {
    if (sourceNodeId === targetNodeId) {
      return [];
    }

    // 1. In-memory BFS path search
    if (dataset) {
      const nodeMap = new Map(dataset.nodes.map((n) => [n.id, n]));
      const paths: GraphPath[] = [];

      // Queue items: current node, visited node IDs, edges, relation types
      type QueueItem = {
        currentNode: string;
        nodes: string[];
        edges: string[];
        relations: string[];
        depth: number;
      };

      const queue: QueueItem[] = [
        {
          currentNode: sourceNodeId,
          nodes: [sourceNodeId],
          edges: [],
          relations: [],
          depth: 0,
        },
      ];

      const activeEdges = dataset.edges.filter((e) => e.status !== "archived");

      while (queue.length > 0 && paths.length < 5) {
        const item = queue.shift()!;
        if (item.depth >= maxDepth) continue;

        // Find outward edges from current node
        const outgoing = activeEdges.filter((e) => e.source_node_id === item.currentNode);
        for (const edge of outgoing) {
          const nextNode = edge.target_node_id;
          if (item.nodes.includes(nextNode)) continue; // Prevent cycles

          const newNodes = [...item.nodes, nextNode];
          const newEdges = [...item.edges, edge.id];
          const newRelations = [...item.relations, edge.relation_type];

          if (nextNode === targetNodeId) {
            // Target found!
            const pathNodeObjects = newNodes.map((id) => {
              const node = nodeMap.get(id);
              return {
                id,
                name: node ? (node.canonical_name || node.name) : "Unknown",
                node_type: node?.node_type || "concept",
              };
            });

            paths.push({
              nodes: pathNodeObjects,
              edges: newEdges.map((eId, idx) => ({
                id: eId,
                relation_type: newRelations[idx] || "related_to",
              })),
              relations: newRelations,
              length: newEdges.length,
              depth: newEdges.length,
            });
          } else if (item.depth + 1 < maxDepth) {
            queue.push({
              currentNode: nextNode,
              nodes: newNodes,
              edges: newEdges,
              relations: newRelations,
              depth: item.depth + 1,
            });
          }
        }
      }

      return paths;
    }

    // 2. Server-side RPC if connected
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase.rpc("find_graph_paths" as any, {
          p_source_node_id: sourceNodeId,
          p_target_node_id: targetNodeId,
          p_max_depth: maxDepth,
        });

        if (!error && data && Array.isArray(data)) {
          // Fetch node names
          const allNodeIds = new Set<string>();
          for (const row of data as any[]) {
            for (const nid of (row.path_nodes || [])) {
              allNodeIds.add(nid);
            }
          }

          const { data: nodesData } = await this.supabase
            .from("knowledge_nodes")
            .select("id, name, canonical_name, node_type")
            .in("id", Array.from(allNodeIds));

          const nodeMap = new Map((nodesData || []).map((n) => [n.id, n]));

          return (data as any[]).map((row) => ({
            nodes: (row.path_nodes || []).map((nid: string) => {
              const node = nodeMap.get(nid);
              return {
                id: nid,
                name: node ? (node.canonical_name || node.name) : "Unknown",
                node_type: node?.node_type || "concept",
              };
            }),
            edges: (row.path_edges || []).map((eId: string, idx: number) => ({
              id: eId,
              relation_type: row.path_relations?.[idx] || "related_to",
            })),
            relations: row.path_relations || [],
            length: row.path_length || 1,
            depth: row.path_length || 1,
          }));
        }
      } catch (err) {
        console.warn("find_graph_paths RPC call failed", err);
      }
    }

    return [];
  }
}

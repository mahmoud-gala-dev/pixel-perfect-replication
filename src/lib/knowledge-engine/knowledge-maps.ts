import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { KnowledgeEdge, KnowledgeNode } from "./types";

export interface MapNode {
  id: string;
  name: string;
  canonical_name: string | null;
  slug: string;
  node_type: string;
  status: string;
  parent_id: string | null;
  summary: string | null;
  in_degree: number;
  out_degree: number;
  total_degree: number;
  is_hotspot: boolean;
  cluster_id: string;
  cluster_label: string;
}

export interface MapEdge {
  id: string;
  source: string;
  target: string;
  relation_type: string;
  description: string | null;
  confidence: number | null;
  status: string;
}

export interface MapCluster {
  id: string;
  label: string;
  node_count: number;
  node_ids: string[];
}

export interface KnowledgeMapResult {
  root_node: MapNode;
  nodes: MapNode[];
  edges: MapEdge[];
  hotspots: MapNode[];
  clusters: MapCluster[];
  stats: {
    total_nodes: number;
    total_edges: number;
    hotspot_count: number;
    cluster_count: number;
  };
}

export class KnowledgeMapService {
  constructor(private supabase: SupabaseClient<Database> | null = null) {}

  /**
   * Builds an analytical Knowledge Map around a root concept.
   * Filters out minor leaf clutter while highlighting major hubs, key relations, and clusters.
   */
  public buildKnowledgeMap(
    rootNodeId: string,
    allNodes: KnowledgeNode[],
    allEdges: KnowledgeEdge[],
    options: {
      maxDepth?: number;
      maxNodes?: number;
      hotspotThreshold?: number;
    } = {},
  ): KnowledgeMapResult | null {
    const maxDepth = options.maxDepth ?? 2;
    const maxNodes = options.maxNodes ?? 30;
    const hotspotThreshold = options.hotspotThreshold ?? 3;

    const nodeMap = new Map<string, KnowledgeNode>();
    allNodes.forEach((n) => {
      if (!n.deleted_at) nodeMap.set(n.id, n);
    });

    const rootNode = nodeMap.get(rootNodeId);
    if (!rootNode) return null;

    // Collect related nodes via hierarchy and graph edges up to maxDepth
    const includedNodeIds = new Set<string>([rootNodeId]);
    let frontier = new Set<string>([rootNodeId]);

    for (let d = 0; d < maxDepth; d++) {
      const nextFrontier = new Set<string>();

      // 1. Children in hierarchy
      allNodes.forEach((n) => {
        if (!n.deleted_at && n.parent_id && frontier.has(n.parent_id) && !includedNodeIds.has(n.id)) {
          if (includedNodeIds.size < maxNodes) {
            includedNodeIds.add(n.id);
            nextFrontier.add(n.id);
          }
        }
      });

      // 2. Direct Graph Relations
      allEdges.forEach((e) => {
        if (e.status === "archived" || e.status === "deprecated") return;

        if (frontier.has(e.source_node_id) && !includedNodeIds.has(e.target_node_id)) {
          if (includedNodeIds.size < maxNodes) {
            includedNodeIds.add(e.target_node_id);
            nextFrontier.add(e.target_node_id);
          }
        }
        if (frontier.has(e.target_node_id) && !includedNodeIds.has(e.source_node_id)) {
          if (includedNodeIds.size < maxNodes) {
            includedNodeIds.add(e.source_node_id);
            nextFrontier.add(e.source_node_id);
          }
        }
      });

      frontier = nextFrontier;
      if (frontier.size === 0 || includedNodeIds.size >= maxNodes) break;
    }

    // Compute degrees within this subgraph
    const inDegrees = new Map<string, number>();
    const outDegrees = new Map<string, number>();

    const mapEdges: MapEdge[] = [];
    allEdges.forEach((e) => {
      if (e.status === "archived" || e.status === "deprecated") return;

      if (includedNodeIds.has(e.source_node_id) && includedNodeIds.has(e.target_node_id)) {
        mapEdges.push({
          id: e.id,
          source: e.source_node_id,
          target: e.target_node_id,
          relation_type: e.relation_type,
          description: e.description,
          confidence: e.confidence,
          status: e.status,
        });

        outDegrees.set(e.source_node_id, (outDegrees.get(e.source_node_id) || 0) + 1);
        inDegrees.set(e.target_node_id, (inDegrees.get(e.target_node_id) || 0) + 1);
      }
    });

    // Form Clusters based on primary node_type or parent category
    const clusterBuckets = new Map<string, string[]>();

    const mapNodes: MapNode[] = [];
    includedNodeIds.forEach((id) => {
      const node = nodeMap.get(id);
      if (!node) return;

      const inDeg = inDegrees.get(id) || 0;
      const outDeg = outDegrees.get(id) || 0;
      const totalDeg = inDeg + outDeg;
      const isHotspot = totalDeg >= hotspotThreshold || id === rootNodeId;

      const clusterId = node.node_type || "general";
      const clusterLabel = clusterId.charAt(0).toUpperCase() + clusterId.slice(1);

      if (!clusterBuckets.has(clusterId)) {
        clusterBuckets.set(clusterId, []);
      }
      clusterBuckets.get(clusterId)!.push(id);

      mapNodes.push({
        id: node.id,
        name: node.name,
        canonical_name: node.canonical_name,
        slug: node.slug,
        node_type: node.node_type,
        status: node.status,
        parent_id: node.parent_id,
        summary: node.summary,
        in_degree: inDeg,
        out_degree: outDeg,
        total_degree: totalDeg,
        is_hotspot: isHotspot,
        cluster_id: clusterId,
        cluster_label: clusterLabel,
      });
    });

    const rootMapNode = mapNodes.find((n) => n.id === rootNodeId) || mapNodes[0]!;

    const hotspots = mapNodes
      .filter((n) => n.is_hotspot)
      .sort((a, b) => b.total_degree - a.total_degree);

    const clusters: MapCluster[] = Array.from(clusterBuckets.entries()).map(([cid, nids]) => ({
      id: cid,
      label: cid.charAt(0).toUpperCase() + cid.slice(1),
      node_count: nids.length,
      node_ids: nids,
    }));

    return {
      root_node: rootMapNode,
      nodes: mapNodes,
      edges: mapEdges,
      hotspots,
      clusters,
      stats: {
        total_nodes: mapNodes.length,
        total_edges: mapEdges.length,
        hotspot_count: hotspots.length,
        cluster_count: clusters.length,
      },
    };
  }
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Network,
  Search,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ExternalLink,
  ChevronRight,
  GitBranch,
  Layers,
  Filter,
  Sparkles,
} from "lucide-react";
import { useMemo, useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, EmptyState } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DEFAULT_RELATION_TYPES,
  getRelationTypeDef,
  getGraphNeighborhood,
  NODE_TYPES,
  type GraphNeighborhood,
  type GraphNode,
  type GraphEdge,
  type KnowledgeNode,
  type KnowledgeEdge,
  type RelationTypeRow,
} from "@/lib/knowledge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/graph")({
  head: () => ({
    meta: [
      { title: "Knowledge Graph — Knowledge Brain" },
      {
        name: "description",
        content:
          "Explore semantic relationships, typed connections, and concept neighborhoods in your Knowledge Brain.",
      },
      { property: "og:title", content: "Knowledge Graph — Knowledge Brain" },
      {
        property: "og:description",
        content:
          "Explore semantic relationships, typed connections, and concept neighborhoods in your Knowledge Brain.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GraphPage,
});

// Colors for node types
const NODE_TYPE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  framework: { bg: "fill-indigo-500/20", border: "stroke-indigo-500", text: "fill-indigo-400" },
  technology: { bg: "fill-cyan-500/20", border: "stroke-cyan-500", text: "fill-cyan-400" },
  concept: { bg: "fill-emerald-500/20", border: "stroke-emerald-500", text: "fill-emerald-400" },
  topic: { bg: "fill-blue-500/20", border: "stroke-blue-500", text: "fill-blue-400" },
  tool: { bg: "fill-amber-500/20", border: "stroke-amber-500", text: "fill-amber-400" },
  method: { bg: "fill-purple-500/20", border: "stroke-purple-500", text: "fill-purple-400" },
  category: { bg: "fill-rose-500/20", border: "stroke-rose-500", text: "fill-rose-400" },
  default: { bg: "fill-primary/20", border: "stroke-primary", text: "fill-foreground" },
};

function getNodeColor(nodeType: string): { bg: string; border: string; text: string } {
  const c = NODE_TYPE_COLORS[nodeType];
  if (c) return c;
  const def = NODE_TYPE_COLORS["default"];
  if (def) return def;
  return { bg: "fill-primary/20", border: "stroke-primary", text: "fill-foreground" };
}

function GraphPage() {
  const { session } = useAuth();
  const navigate = useNavigate();

  // Navigation & filter state
  const [centerNodeId, setCenterNodeId] = useState<string | null>(null);
  const [inspectNodeId, setInspectNodeId] = useState<string | null>(null);
  const [depth, setDepth] = useState<number>(1);
  const [selectedNodeType, setSelectedNodeType] = useState<string>("all");
  const [selectedRelationType, setSelectedRelationType] = useState<string>("all");
  const [nodeSearch, setNodeSearch] = useState("");

  // Canvas pan & zoom state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // 1. Fetch all nodes for picker and graph building
  const { data: allNodes } = useQuery({
    queryKey: ["nodes-all-graph"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_nodes")
        .select("*")
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return (data ?? []) as KnowledgeNode[];
    },
  });

  // 2. Fetch all edges
  const { data: allEdges } = useQuery({
    queryKey: ["edges-all-graph"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_edges")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as KnowledgeEdge[];
    },
  });

  // 3. Fetch relation types
  const { data: relationTypes } = useQuery({
    queryKey: ["relation-types"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("relation_types")
        .select("*")
        .order("name");
      if (error || !data || data.length === 0) return DEFAULT_RELATION_TYPES;
      return data as RelationTypeRow[];
    },
  });

  // Automatically pick a default center node if none selected (e.g. node with most edges or first node)
  useEffect(() => {
    if (!centerNodeId && allNodes && allNodes.length > 0 && allEdges) {
      if (allEdges.length > 0) {
        // pick node appearing in edges
        const firstEdge = allEdges[0];
        if (firstEdge) {
          setCenterNodeId(firstEdge.source_node_id);
          setInspectNodeId(firstEdge.source_node_id);
          return;
        }
      }
      const first = allNodes[0];
      if (first) {
        setCenterNodeId(first.id);
        setInspectNodeId(first.id);
      }
    }
  }, [allNodes, allEdges, centerNodeId]);

  // Compute graph neighborhood around centerNodeId
  const neighborhood = useMemo(() => {
    if (!centerNodeId || !allNodes || !allEdges) {
      return { center_node_id: "", depth: 1, nodes: [], edges: [] };
    }

    const nodesMap = new Map(allNodes.map((n) => [n.id, n]));
    const visited = new Set<string>([centerNodeId]);
    let currentFrontier = new Set<string>([centerNodeId]);

    for (let d = 0; d < depth; d++) {
      const nextFrontier = new Set<string>();
      for (const e of allEdges) {
        if (e.status === "archived" || e.status === "deprecated") continue;

        if (currentFrontier.has(e.source_node_id) && !visited.has(e.target_node_id)) {
          visited.add(e.target_node_id);
          nextFrontier.add(e.target_node_id);
        }
        if (currentFrontier.has(e.target_node_id) && !visited.has(e.source_node_id)) {
          visited.add(e.source_node_id);
          nextFrontier.add(e.source_node_id);
        }
      }
      currentFrontier = nextFrontier;
      if (currentFrontier.size === 0) break;
    }

    // Filter by node type & relation type
    let nNodes: GraphNode[] = [];
    for (const id of visited) {
      const n = nodesMap.get(id);
      if (n && !n.deleted_at) {
        if (selectedNodeType === "all" || n.node_type === selectedNodeType || n.id === centerNodeId) {
          nNodes.push({
            id: n.id,
            name: n.name,
            canonical_name: n.canonical_name,
            slug: n.slug,
            node_type: n.node_type,
            status: n.status,
            parent_id: n.parent_id,
            is_center: n.id === centerNodeId,
          });
        }
      }
    }

    const nNodeIds = new Set(nNodes.map((n) => n.id));
    let nEdges: GraphEdge[] = [];
    for (const e of allEdges) {
      if (e.status === "archived" || e.status === "deprecated") continue;
      if (selectedRelationType !== "all" && e.relation_type !== selectedRelationType) continue;

      if (nNodeIds.has(e.source_node_id) && nNodeIds.has(e.target_node_id)) {
        nEdges.push({
          id: e.id,
          source: e.source_node_id,
          target: e.target_node_id,
          relation_type: e.relation_type,
          description: e.description,
          confidence: e.confidence,
          status: e.status,
        });
      }
    }

    return {
      center_node_id: centerNodeId,
      depth,
      nodes: nNodes,
      edges: nEdges,
    };
  }, [centerNodeId, allNodes, allEdges, depth, selectedNodeType, selectedRelationType]);

  // Compute Layout Positions (Concentric Circles around Center Node)
  const layout = useMemo(() => {
    const positions = new Map<string, { x: number; y: number }>();
    const centerX = 400;
    const centerY = 300;

    const center = neighborhood.nodes.find((n) => n.is_center);
    if (!center) return positions;

    // Center node at (400, 300)
    positions.set(center.id, { x: centerX, y: centerY });

    // Other nodes arranged radially around center
    const otherNodes = neighborhood.nodes.filter((n) => !n.is_center);
    const count = otherNodes.length;

    if (count > 0) {
      const radius = count > 8 ? 220 : 180;
      const angleStep = (2 * Math.PI) / count;

      otherNodes.forEach((node, i) => {
        const angle = i * angleStep;
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);
        positions.set(node.id, { x, y });
      });
    }

    return positions;
  }, [neighborhood]);

  // Handle pan & dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Inspect selected node
  const inspectedNode = useMemo(() => {
    if (!inspectNodeId || !allNodes) return null;
    return allNodes.find((n) => n.id === inspectNodeId) ?? null;
  }, [inspectNodeId, allNodes]);

  const inspectedEdges = useMemo(() => {
    if (!inspectNodeId || !neighborhood.edges) return { outgoing: [], incoming: [] };
    const outgoing = neighborhood.edges.filter((e) => e.source === inspectNodeId);
    const incoming = neighborhood.edges.filter((e) => e.target === inspectNodeId);
    return { outgoing, incoming };
  }, [inspectNodeId, neighborhood.edges]);

  const nodeName = (id: string) => allNodes?.find((n) => n.id === id)?.name ?? "Unknown";

  return (
    <AppShell
      title="Knowledge Graph"
      description="Visual semantic relationships and concept neighborhoods connecting canonical nodes."
      actions={
        <div className="flex items-center gap-2">
          {inspectNodeId && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void navigate({ to: "/knowledge" });
              }}
            >
              <ExternalLink className="size-4 mr-1" /> Open Explorer
            </Button>
          )}
        </div>
      }
    >
      {/* Graph Filter & Navigation Bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 panel p-3">
        {/* Center Node Search / Picker */}
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[16rem]">
          <Label className="text-xs font-semibold whitespace-nowrap">Center Concept:</Label>
          <Select
            value={centerNodeId ?? ""}
            onValueChange={(val) => {
              setCenterNodeId(val);
              setInspectNodeId(val);
              setPan({ x: 0, y: 0 });
              setZoom(1);
            }}
          >
            <SelectTrigger className="w-56 text-xs h-8">
              <SelectValue placeholder="Pick a focus node" />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {(allNodes ?? []).map((n) => (
                <SelectItem key={n.id} value={n.id}>
                  {n.name} ({n.node_type})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Depth Selector */}
          <div className="flex items-center gap-1 ml-2 text-xs">
            <span className="text-muted-foreground text-[11px]">Hops:</span>
            <Button
              size="sm"
              variant={depth === 1 ? "secondary" : "ghost"}
              className="h-7 px-2 text-xs"
              onClick={() => setDepth(1)}
            >
              1 Hop
            </Button>
            <Button
              size="sm"
              variant={depth === 2 ? "secondary" : "ghost"}
              className="h-7 px-2 text-xs"
              onClick={() => setDepth(2)}
            >
              2 Hops
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={selectedNodeType} onValueChange={setSelectedNodeType}>
            <SelectTrigger className="w-36 text-xs h-8">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Node Types</SelectItem>
              {NODE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedRelationType} onValueChange={setSelectedRelationType}>
            <SelectTrigger className="w-40 text-xs h-8">
              <SelectValue placeholder="All relations" />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              <SelectItem value="all">All Relations</SelectItem>
              {(relationTypes ?? DEFAULT_RELATION_TYPES).map((r) => (
                <SelectItem key={r.key} value={r.key}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Canvas Controls */}
          <div className="flex items-center gap-1 border-l border-border pl-2">
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              onClick={() => setZoom((z) => Math.min(2.5, z + 0.2))}
              title="Zoom In"
            >
              <ZoomIn className="size-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              onClick={() => setZoom((z) => Math.max(0.4, z - 0.2))}
              title="Zoom Out"
            >
              <ZoomOut className="size-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="size-7"
              onClick={() => {
                setZoom(1);
                setPan({ x: 0, y: 0 });
              }}
              title="Reset View"
            >
              <RotateCcw className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {!allNodes || allNodes.length === 0 ? (
        <EmptyState
          icon={Network}
          title="No knowledge nodes yet"
          description="Create nodes in the Knowledge Explorer to visualize semantic relations on the graph."
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
          {/* Main SVG Graph Canvas */}
          <div
            className="relative h-[620px] rounded-lg border border-border bg-card/60 overflow-hidden cursor-grab active:cursor-grabbing select-none"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {/* Legend Overlay */}
            <div className="absolute left-3 top-3 z-10 rounded-md border border-border/60 bg-background/80 p-2 backdrop-blur-sm text-[10px] space-y-1">
              <div className="font-semibold text-foreground">Neighborhood View</div>
              <div className="text-muted-foreground">
                {neighborhood.nodes.length} nodes • {neighborhood.edges.length} relations
              </div>
            </div>

            <svg
              className="w-full h-full"
              viewBox="0 0 800 600"
              style={{
                cursor: isDragging ? "grabbing" : "grab",
              }}
            >
              <defs>
                {/* Directed edge arrow marker */}
                <marker
                  id="graph-arrow"
                  viewBox="0 0 10 10"
                  refX="28"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground/80" />
                </marker>
                <marker
                  id="graph-arrow-active"
                  viewBox="0 0 10 10"
                  refX="28"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" className="fill-primary" />
                </marker>
              </defs>

              {/* Transform Group for Pan & Zoom */}
              <g
                transform={`translate(${pan.x + 400 * (1 - zoom)}, ${pan.y + 300 * (1 - zoom)}) scale(${zoom})`}
              >
                {/* 1. Render Edges */}
                {neighborhood.edges.map((edge) => {
                  const sourcePos = layout.get(edge.source);
                  const targetPos = layout.get(edge.target);
                  if (!sourcePos || !targetPos) return null;

                  const isConnectedToInspect =
                    edge.source === inspectNodeId || edge.target === inspectNodeId;

                  // Midpoint for label
                  const midX = (sourcePos.x + targetPos.x) / 2;
                  const midY = (sourcePos.y + targetPos.y) / 2;

                  return (
                    <g key={edge.id} className="transition-opacity">
                      {/* Edge Line */}
                      <line
                        x1={sourcePos.x}
                        y1={sourcePos.y}
                        x2={targetPos.x}
                        y2={targetPos.y}
                        className={cn(
                          "transition-all",
                          isConnectedToInspect
                            ? "stroke-primary stroke-[2.5]"
                            : "stroke-border stroke-[1.5]",
                        )}
                        markerEnd={isConnectedToInspect ? "url(#graph-arrow-active)" : "url(#graph-arrow)"}
                      />

                      {/* Edge Relation Label Badge */}
                      <g transform={`translate(${midX}, ${midY})`}>
                        <rect
                          x={-28}
                          y={-9}
                          width={56}
                          height={18}
                          rx={9}
                          className="fill-background stroke-border stroke-[1]"
                        />
                        <text
                          textAnchor="middle"
                          dy="3.5"
                          className="font-mono text-[9px] font-semibold fill-muted-foreground pointer-events-none"
                        >
                          {edge.relation_type}
                        </text>
                      </g>
                    </g>
                  );
                })}

                {/* 2. Render Nodes */}
                {neighborhood.nodes.map((node) => {
                  const pos = layout.get(node.id);
                  if (!pos) return null;

                  const isCenter = node.is_center;
                  const isInspected = node.id === inspectNodeId;
                  const colors = getNodeColor(node.node_type);

                  return (
                    <g
                      key={node.id}
                      transform={`translate(${pos.x}, ${pos.y})`}
                      className="cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        setInspectNodeId(node.id);
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setCenterNodeId(node.id);
                        setInspectNodeId(node.id);
                      }}
                    >
                      {/* Center Glowing Ring */}
                      {isCenter && (
                        <circle
                          r={28}
                          className="animate-pulse fill-none stroke-primary/30 stroke-[3]"
                        />
                      )}

                      {/* Selection Ring */}
                      {isInspected && !isCenter && (
                        <circle
                          r={24}
                          className="fill-none stroke-primary stroke-[2]"
                        />
                      )}

                      {/* Node Circle */}
                      <circle
                        r={isCenter ? 22 : 18}
                        className={cn(
                          colors.bg,
                          colors.border,
                          "stroke-[2] transition-transform hover:scale-110",
                          isCenter && "stroke-[3]",
                        )}
                      />

                      {/* Node Label Text */}
                      <text
                        textAnchor="middle"
                        dy={isCenter ? 36 : 30}
                        className={cn(
                          "text-xs font-semibold pointer-events-none select-none",
                          isCenter ? "fill-foreground font-bold" : "fill-foreground/90",
                        )}
                      >
                        {node.name}
                      </text>

                      {/* Node Type Pill Subtext */}
                      <text
                        textAnchor="middle"
                        dy={isCenter ? 48 : 42}
                        className="font-mono text-[9px] fill-muted-foreground pointer-events-none select-none"
                      >
                        {node.node_type}
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>

          {/* Node Inspector Panel */}
          <aside className="panel h-fit p-4 space-y-4">
            {!inspectedNode ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                <Network className="mx-auto size-8 text-muted-foreground/40 mb-2" />
                <p className="font-medium text-foreground">Select a Node</p>
                <p className="mt-1 text-[11px]">
                  Click any node on the graph to inspect its relations, or double-click to center the neighborhood around it.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Node Title & Badges */}
                <div className="border-b border-border/50 pb-3">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-[10px] text-primary">
                      {inspectedNode.node_type}
                    </span>
                    <span className="rounded bg-secondary px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {inspectedNode.status}
                    </span>
                  </div>
                  <h3 className="mt-1.5 text-base font-bold text-foreground">
                    {inspectedNode.name}
                  </h3>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    /{inspectedNode.slug}
                  </p>
                </div>

                {/* Description */}
                {inspectedNode.description && (
                  <p className="text-xs text-muted-foreground line-clamp-3">
                    {inspectedNode.description}
                  </p>
                )}

                {/* Relations in Neighborhood */}
                <div className="space-y-3 text-xs">
                  {/* Outgoing */}
                  <div>
                    <span className="font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">
                      Outgoing ({inspectedEdges.outgoing.length})
                    </span>
                    {inspectedEdges.outgoing.length === 0 ? (
                      <p className="text-muted-foreground text-[11px] mt-0.5">No outgoing relations</p>
                    ) : (
                      <ul className="mt-1 space-y-1">
                        {inspectedEdges.outgoing.map((e) => (
                          <li
                            key={e.id}
                            className="flex items-center justify-between rounded bg-secondary/30 px-2 py-1"
                          >
                            <span className="font-mono text-primary text-[10px]">
                              → {e.relation_type}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setInspectNodeId(e.target);
                              }}
                              className="font-medium hover:underline truncate ml-2"
                            >
                              {nodeName(e.target)}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Incoming */}
                  <div>
                    <span className="font-semibold text-muted-foreground text-[11px] uppercase tracking-wider">
                      Incoming ({inspectedEdges.incoming.length})
                    </span>
                    {inspectedEdges.incoming.length === 0 ? (
                      <p className="text-muted-foreground text-[11px] mt-0.5">No incoming relations</p>
                    ) : (
                      <ul className="mt-1 space-y-1">
                        {inspectedEdges.incoming.map((e) => (
                          <li
                            key={e.id}
                            className="flex items-center justify-between rounded bg-secondary/30 px-2 py-1"
                          >
                            <span className="font-mono text-foreground text-[10px]">
                              ← {e.relation_type}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setInspectNodeId(e.source);
                              }}
                              className="font-medium hover:underline truncate ml-2"
                            >
                              {nodeName(e.source)}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="space-y-2 border-t border-border/50 pt-3">
                  {inspectedNode.id !== centerNodeId && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="w-full text-xs"
                      onClick={() => {
                        setCenterNodeId(inspectedNode.id);
                        setPan({ x: 0, y: 0 });
                        setZoom(1);
                      }}
                    >
                      <Sparkles className="size-3.5 mr-1" /> Center Neighborhood Here
                    </Button>
                  )}

                  <Button
                    size="sm"
                    className="w-full text-xs"
                    onClick={() => {
                      void navigate({ to: "/knowledge" });
                    }}
                  >
                    <ExternalLink className="size-3.5 mr-1" /> Open in Knowledge Explorer
                  </Button>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}
    </AppShell>
  );
}

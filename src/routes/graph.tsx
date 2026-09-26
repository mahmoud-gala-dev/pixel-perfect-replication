import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  ArrowRight,
  Compass,
  Route as RouteIcon,
  Flame,
  Plus,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  History,
  Info,
  Maximize2,
  ArrowLeft,
  X,
  BookOpen,
} from "lucide-react";
import { useMemo, useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, EmptyState } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DEFAULT_RELATION_TYPES,
  getRelationTypeDef,
  getGraphNeighborhood,
  NODE_TYPES,
  safeCreateRelation,
  type GraphNeighborhood,
  type GraphNode,
  type GraphEdge,
  type KnowledgeNode,
  type KnowledgeEdge,
  type RelationTypeRow,
} from "@/lib/knowledge";
import { KnowledgeMapService, type KnowledgeMapResult } from "@/lib/knowledge-engine/knowledge-maps";
import { KnowledgePathService, type KnowledgePathResult } from "@/lib/knowledge-engine/knowledge-paths";
import { GraphRetriever } from "@/lib/ai/rag/graph-retriever";
import type { GraphPath } from "@/lib/ai/rag/types";
import { cn } from "@/lib/utils";
import { DeduplicationService } from "@/lib/ai/resolution/deduplication-service";
import { DuplicateCandidatesBanner } from "@/components/knowledge/DuplicateCandidatesBanner";

export const Route = createFileRoute("/graph")({
  head: () => ({
    meta: [
      { title: "Advanced Knowledge Graph — Knowledge Brain" },
      {
        name: "description",
        content:
          "Visual semantic relationships, path finding, domain maps, and prerequisite sequences connecting canonical nodes.",
      },
      { property: "og:title", content: "Advanced Knowledge Graph — Knowledge Brain" },
      {
        property: "og:description",
        content:
          "Visual semantic relationships, path finding, domain maps, and prerequisite sequences connecting canonical nodes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GraphPage,
});

type GraphViewMode = "neighborhood" | "path_finder" | "knowledge_map" | "learning_paths";

// Colors and visual tokens for node types
const NODE_TYPE_STYLES: Record<string, { bg: string; border: string; text: string; ring: string }> = {
  framework: { bg: "fill-indigo-500/20", border: "stroke-indigo-500", text: "fill-indigo-400", ring: "border-indigo-500/40" },
  technology: { bg: "fill-cyan-500/20", border: "stroke-cyan-500", text: "fill-cyan-400", ring: "border-cyan-500/40" },
  concept: { bg: "fill-emerald-500/20", border: "stroke-emerald-500", text: "fill-emerald-400", ring: "border-emerald-500/40" },
  topic: { bg: "fill-blue-500/20", border: "stroke-blue-500", text: "fill-blue-400", ring: "border-blue-500/40" },
  tool: { bg: "fill-amber-500/20", border: "stroke-amber-500", text: "fill-amber-400", ring: "border-amber-500/40" },
  method: { bg: "fill-purple-500/20", border: "stroke-purple-500", text: "fill-purple-400", ring: "border-purple-500/40" },
  category: { bg: "fill-rose-500/20", border: "stroke-rose-500", text: "fill-rose-400", ring: "border-rose-500/40" },
  default: { bg: "fill-primary/20", border: "stroke-primary", text: "fill-foreground", ring: "border-primary/40" },
};

function getNodeStyle(nodeType: string) {
  return NODE_TYPE_STYLES[nodeType] || NODE_TYPE_STYLES.default;
}

function GraphPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // URL search params parsing for deep-linking
  const initialParams = useMemo(() => {
    if (typeof window === "undefined") return { focus: null, target: null, tab: "neighborhood" as GraphViewMode };
    const p = new URLSearchParams(window.location.search);
    return {
      focus: p.get("focus"),
      target: p.get("target"),
      tab: (p.get("tab") as GraphViewMode) || "neighborhood",
    };
  }, []);

  // Main View Mode
  const [viewMode, setViewMode] = useState<GraphViewMode>(initialParams.tab);
  const [editMode, setEditMode] = useState(false);

  // Navigation & selection state
  const [centerNodeId, setCenterNodeId] = useState<string | null>(initialParams.focus);
  const [inspectNodeId, setInspectNodeId] = useState<string | null>(initialParams.focus);
  const [inspectEdgeId, setInspectEdgeId] = useState<string | null>(null);
  const [depth, setDepth] = useState<number>(1);
  const [selectedNodeType, setSelectedNodeType] = useState<string>("all");
  const [selectedRelationType, setSelectedRelationType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);

  // Path Finder State
  const [pathSourceId, setPathSourceId] = useState<string | null>(initialParams.focus);
  const [pathTargetId, setPathTargetId] = useState<string | null>(initialParams.target);
  const [pathMaxDepth, setPathMaxDepth] = useState<number>(3);
  const [pathResult, setPathResult] = useState<GraphPath[] | null>(null);
  const [isSearchingPath, setIsSearchingPath] = useState(false);

  // Learning Path Target
  const [learningTargetId, setLearningTargetId] = useState<string | null>(initialParams.focus);

  // Exploration History Trail
  const [historyTrail, setHistoryTrail] = useState<string[]>([]);

  // Canvas pan & zoom state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Add Relation Dialog (Edit Mode)
  const [addRelationOpen, setAddRelationOpen] = useState(false);
  const [newRelSourceId, setNewRelSourceId] = useState<string>("");
  const [newRelTargetId, setNewRelTargetId] = useState<string>("");
  const [newRelType, setNewRelType] = useState<string>("uses");
  const [newRelDescription, setNewRelDescription] = useState<string>("");

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

  // 4. Fetch claims for inspected node
  const { data: nodeClaims } = useQuery({
    queryKey: ["node-claims-inspect", inspectNodeId],
    enabled: !!inspectNodeId && !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_claims")
        .select("*")
        .eq("node_id", inspectNodeId!);
      if (error) return [];
      return data || [];
    },
  });

  // Auto-pick default center node if none selected
  useEffect(() => {
    if (!centerNodeId && allNodes && allNodes.length > 0 && allEdges) {
      if (allEdges.length > 0) {
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

  // Intelligent Graph Deduplication: Detect candidates exceeding 0.82 similarity
  const duplicateCandidates = useMemo(() => {
    if (!allNodes || allNodes.length < 2) return [];
    return DeduplicationService.findDuplicateCandidates(allNodes as any, [], 0.82);
  }, [allNodes]);

  // Track Exploration History
  const selectAndCenterNode = (nodeId: string) => {
    if (centerNodeId && centerNodeId !== nodeId) {
      setHistoryTrail((prev) => [centerNodeId, ...prev.filter((id) => id !== centerNodeId)].slice(0, 10));
    }
    setCenterNodeId(nodeId);
    setInspectNodeId(nodeId);
    setInspectEdgeId(null);
    setPan({ x: 0, y: 0 });
    setZoom(1);
  };

  // Compute graph neighborhood around centerNodeId
  const neighborhood = useMemo(() => {
    if (!centerNodeId || !allNodes || !allEdges) {
      return { center_node_id: "", depth: 1, nodes: [], edges: [] };
    }

    const nodesMap = new Map(allNodes.map((n) => [n.id, n]));
    const visited = new Set<string>([centerNodeId]);
    let currentFrontier = new Set<string>([centerNodeId]);

    // Bounded BFS neighborhood expansion
    const maxBoundedDepth = Math.min(Math.max(depth, 1), 3);
    for (let d = 0; d < maxBoundedDepth; d++) {
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

    // Filter by node type
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
      depth: maxBoundedDepth,
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

    positions.set(center.id, { x: centerX, y: centerY });

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

  // Knowledge Map Computation (when in knowledge_map tab)
  const knowledgeMapData = useMemo<KnowledgeMapResult | null>(() => {
    if (viewMode !== "knowledge_map" || !centerNodeId || !allNodes || !allEdges) return null;
    const mapService = new KnowledgeMapService();
    return mapService.buildKnowledgeMap(centerNodeId, allNodes, allEdges, { maxDepth: 2, maxNodes: 30 });
  }, [viewMode, centerNodeId, allNodes, allEdges]);

  // Knowledge Path Computation (when in learning_paths tab)
  const knowledgePathData = useMemo<KnowledgePathResult | null>(() => {
    const targetId = learningTargetId || centerNodeId;
    if (viewMode !== "learning_paths" || !targetId || !allNodes || !allEdges) return null;
    const pathService = new KnowledgePathService();
    return pathService.buildPathToTarget(targetId, allNodes, allEdges, { maxSteps: 10 });
  }, [viewMode, learningTargetId, centerNodeId, allNodes, allEdges]);

  // Execute Graph Path Finder (when in path_finder tab)
  const handleFindPath = async () => {
    if (!pathSourceId || !pathTargetId) {
      toast.error("Please select both a Source and a Target concept.");
      return;
    }
    if (pathSourceId === pathTargetId) {
      toast.error("Source and Target concepts must be different.");
      return;
    }

    setIsSearchingPath(true);
    setPathResult(null);

    try {
      const retriever = new GraphRetriever(supabase);
      const paths = await retriever.findPaths(pathSourceId, pathTargetId, pathMaxDepth, {
        nodes: allNodes || [],
        edges: allEdges || [],
      });
      setPathResult(paths);
      if (paths.length === 0) {
        toast.info("No stored path found between these concepts within the depth limit.");
      }
    } catch {
      toast.error("Path search failed.");
    } finally {
      setIsSearchingPath(false);
    }
  };

  // Controlled Relation Creation Mutation (Knowledge Engine safeCreateRelation)
  const createRelationMutation = useMutation({
    mutationFn: async () => {
      if (!newRelSourceId || !newRelTargetId || !newRelType) {
        throw new Error("Source, Target, and Relation Type are required.");
      }
      return safeCreateRelation(supabase, {
        source_node_id: newRelSourceId,
        target_node_id: newRelTargetId,
        relation_type: newRelType,
        description: newRelDescription.trim() || undefined,
      });
    },
    onSuccess: (res) => {
      if (res.status === "rejected") {
        toast.error(res.message ?? "Relation rejected");
        return;
      }
      toast.success("Relation created and committed to Knowledge Graph.");
      setAddRelationOpen(false);
      setNewRelDescription("");
      void queryClient.invalidateQueries({ queryKey: ["edges-all-graph"] });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Failed to create relation.");
    },
  });

  // Pan & Drag handlers
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

  // Inspect elements
  const inspectedNode = useMemo(() => {
    if (!inspectNodeId || !allNodes) return null;
    return allNodes.find((n) => n.id === inspectNodeId) ?? null;
  }, [inspectNodeId, allNodes]);

  const inspectedEdge = useMemo(() => {
    if (!inspectEdgeId || !allEdges) return null;
    return allEdges.find((e) => e.id === inspectEdgeId) ?? null;
  }, [inspectEdgeId, allEdges]);

  const inspectedEdges = useMemo(() => {
    if (!inspectNodeId || !neighborhood.edges) return { outgoing: [], incoming: [] };
    const outgoing = neighborhood.edges.filter((e) => e.source === inspectNodeId);
    const incoming = neighborhood.edges.filter((e) => e.target === inspectNodeId);
    return { outgoing, incoming };
  }, [inspectNodeId, neighborhood.edges]);

  // Search filtered autocomplete options
  const searchResults = useMemo(() => {
    if (!searchQuery.trim() || !allNodes) return [];
    const q = searchQuery.toLowerCase().trim();
    return allNodes
      .filter((n) => n.name.toLowerCase().includes(q) || n.slug.toLowerCase().includes(q))
      .slice(0, 6);
  }, [searchQuery, allNodes]);

  const nodeName = (id: string) => allNodes?.find((n) => n.id === id)?.name ?? "Unknown";

  return (
    <AppShell
      title="Advanced Knowledge Graph"
      description="Visual semantic relationships, bounded path finding, domain maps, and ordered prerequisite sequences."
      actions={
        <div className="flex items-center gap-2">
          {/* Mode Switcher */}
          <div className="flex items-center rounded-md border border-border p-0.5 bg-card/40">
            <Button
              size="sm"
              variant={!editMode ? "secondary" : "ghost"}
              className="h-7 text-xs px-2.5"
              onClick={() => setEditMode(false)}
            >
              Explore
            </Button>
            <Button
              size="sm"
              variant={editMode ? "secondary" : "ghost"}
              className="h-7 text-xs px-2.5"
              onClick={() => setEditMode(true)}
            >
              Edit Mode
            </Button>
          </div>

          {editMode && (
            <Button
              size="sm"
              variant="default"
              className="h-8 text-xs"
              onClick={() => {
                setNewRelSourceId(centerNodeId || "");
                setAddRelationOpen(true);
              }}
            >
              <Plus className="size-3.5 mr-1" /> Connect Nodes
            </Button>
          )}

          {inspectNodeId && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={() => {
                void navigate({ to: "/knowledge", search: { nodeId: inspectNodeId } as any });
              }}
            >
              <ExternalLink className="size-3.5 mr-1" /> Explorer
            </Button>
          )}
        </div>
      }
    >
      {/* 1. View Mode Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-border pb-2 mb-4 overflow-x-auto">
        <Button
          size="sm"
          variant={viewMode === "neighborhood" ? "secondary" : "ghost"}
          className="h-8 text-xs font-medium"
          onClick={() => setViewMode("neighborhood")}
        >
          <Network className="size-3.5 mr-1.5" /> Neighborhood Graph
        </Button>
        <Button
          size="sm"
          variant={viewMode === "path_finder" ? "secondary" : "ghost"}
          className="h-8 text-xs font-medium"
          onClick={() => setViewMode("path_finder")}
        >
          <RouteIcon className="size-3.5 mr-1.5" /> Path Finder
        </Button>
        <Button
          size="sm"
          variant={viewMode === "knowledge_map" ? "secondary" : "ghost"}
          className="h-8 text-xs font-medium"
          onClick={() => setViewMode("knowledge_map")}
        >
          <Compass className="size-3.5 mr-1.5" /> Knowledge Map
        </Button>
        <Button
          size="sm"
          variant={viewMode === "learning_paths" ? "secondary" : "ghost"}
          className="h-8 text-xs font-medium"
          onClick={() => setViewMode("learning_paths")}
        >
          <BookOpen className="size-3.5 mr-1.5" /> Prerequisite Progression
        </Button>
      </div>

      {/* Duplicate Candidates Alert & Safe Merge Banner */}
      {duplicateCandidates.length > 0 && (
        <DuplicateCandidatesBanner
          candidates={duplicateCandidates}
          onMerged={() => {
            void queryClient.invalidateQueries({ queryKey: ["nodes-all-graph"] });
            void queryClient.invalidateQueries({ queryKey: ["edges-all-graph"] });
          }}
        />
      )}

      {/* VIEW 1: NEIGHBORHOOD GRAPH */}
      {viewMode === "neighborhood" && (
        <div className="space-y-4">
          {/* Filter & Control Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 panel p-3">
            {/* Center Node Search & Picker */}
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[16rem]">
              <Label className="text-xs font-semibold whitespace-nowrap">Center Concept:</Label>
              <Select
                value={centerNodeId ?? ""}
                onValueChange={(val) => selectAndCenterNode(val)}
              >
                <SelectTrigger className="w-52 text-xs h-8">
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

              {/* Instant Autocomplete Input */}
              <div className="relative">
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  placeholder="Quick find..."
                  className="w-36 h-8 text-xs pl-7"
                />
                <Search className="absolute left-2.5 top-2.5 size-3 text-muted-foreground" />

                {searchFocused && searchResults.length > 0 && (
                  <div className="absolute left-0 top-9 z-50 w-56 rounded-md border border-border bg-popover p-1 shadow-lg text-xs">
                    {searchResults.map((res) => (
                      <div
                        key={res.id}
                        className="px-2 py-1.5 rounded hover:bg-accent cursor-pointer flex items-center justify-between"
                        onMouseDown={() => {
                          selectAndCenterNode(res.id);
                          setSearchQuery("");
                          setSearchFocused(false);
                        }}
                      >
                        <span className="font-medium text-foreground truncate">{res.name}</span>
                        <Badge variant="outline" className="text-[10px] px-1 py-0">{res.node_type}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Depth Hops Selector */}
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

            {/* Type & Relation Filters */}
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

              {/* Pan & Zoom Controls */}
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

          {/* Breadcrumb Trail */}
          {historyTrail.length > 0 && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground px-1 overflow-x-auto">
              <span className="font-semibold text-[11px]">Explored:</span>
              {historyTrail.map((hId, i) => (
                <button
                  key={hId}
                  onClick={() => selectAndCenterNode(hId)}
                  className="px-1.5 py-0.5 rounded bg-card/60 hover:bg-card border border-border text-[11px] truncate max-w-[8rem]"
                >
                  {nodeName(hId)}
                </button>
              ))}
            </div>
          )}

          {/* Canvas & Side Panel Container */}
          <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
            {/* Main Interactive SVG Canvas */}
            <div
              className="relative h-[620px] rounded-lg border border-border bg-card/50 overflow-hidden cursor-grab active:cursor-grabbing select-none"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {/* Badge Legend Overlay */}
              <div className="absolute left-3 top-3 z-10 rounded-md border border-border/60 bg-background/85 p-2 backdrop-blur-sm text-[10px] space-y-1">
                <div className="font-semibold text-foreground flex items-center gap-1.5">
                  <Network className="size-3 text-primary" /> Bounded Neighborhood
                </div>
                <div className="text-muted-foreground">
                  {neighborhood.nodes.length} nodes • {neighborhood.edges.length} relations
                </div>
                {editMode && (
                  <Badge variant="outline" className="text-[9px] border-amber-500/50 text-amber-400">
                    Edit Mode Active
                  </Badge>
                )}
              </div>

              <svg
                className="w-full h-full"
                viewBox="0 0 800 600"
                style={{ cursor: isDragging ? "grabbing" : "grab" }}
              >
                <defs>
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

                <g transform={`translate(${pan.x + 400 * (1 - zoom)}, ${pan.y + 300 * (1 - zoom)}) scale(${zoom})`}>
                  {/* 1. Render Edges */}
                  {neighborhood.edges.map((edge) => {
                    const sourcePos = layout.get(edge.source);
                    const targetPos = layout.get(edge.target);
                    if (!sourcePos || !targetPos) return null;

                    const isConnectedToInspect =
                      edge.source === inspectNodeId || edge.target === inspectNodeId;
                    const isDirectlySelected = edge.id === inspectEdgeId;

                    const midX = (sourcePos.x + targetPos.x) / 2;
                    const midY = (sourcePos.y + targetPos.y) / 2;

                    return (
                      <g
                        key={edge.id}
                        className="cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          setInspectEdgeId(edge.id);
                        }}
                      >
                        <line
                          x1={sourcePos.x}
                          y1={sourcePos.y}
                          x2={targetPos.x}
                          y2={targetPos.y}
                          className={cn(
                            "transition-all",
                            isDirectlySelected
                              ? "stroke-amber-400 stroke-[3]"
                              : isConnectedToInspect
                              ? "stroke-primary stroke-[2.5]"
                              : "stroke-border stroke-[1.5]",
                          )}
                          markerEnd={isConnectedToInspect ? "url(#graph-arrow-active)" : "url(#graph-arrow)"}
                        />

                        {/* Edge Label Badge */}
                        <g transform={`translate(${midX}, ${midY})`}>
                          <rect
                            x={-30}
                            y={-9}
                            width={60}
                            height={18}
                            rx={9}
                            className={cn(
                              "stroke-[1]",
                              isDirectlySelected
                                ? "fill-amber-500/20 stroke-amber-400"
                                : "fill-background stroke-border",
                            )}
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
                    const style = getNodeStyle(node.node_type);

                    return (
                      <g
                        key={node.id}
                        transform={`translate(${pos.x}, ${pos.y})`}
                        className="cursor-pointer transition-transform hover:scale-110"
                        onClick={(e) => {
                          e.stopPropagation();
                          setInspectNodeId(node.id);
                          setInspectEdgeId(null);
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          selectAndCenterNode(node.id);
                        }}
                      >
                        {/* Glow indicator for center node */}
                        {isCenter && (
                          <circle r={36} className="fill-primary/10 stroke-primary/30 stroke-[1.5] animate-pulse" />
                        )}

                        {/* Node circle */}
                        <circle
                          r={isCenter ? 26 : 20}
                          className={cn(
                            style.bg,
                            style.border,
                            isInspected ? "stroke-[3] stroke-primary filter drop-shadow" : "stroke-[1.5]",
                          )}
                        />

                        {/* Node label */}
                        <text
                          textAnchor="middle"
                          dy={isCenter ? 42 : 34}
                          className={cn(
                            "font-sans text-[11px] font-medium pointer-events-none",
                            isInspected ? "font-bold fill-primary" : "fill-foreground",
                          )}
                        >
                          {node.name.length > 16 ? node.name.slice(0, 15) + "…" : node.name}
                        </text>
                        <text
                          textAnchor="middle"
                          dy={isCenter ? 54 : 44}
                          className="font-mono text-[9px] fill-muted-foreground pointer-events-none"
                        >
                          {node.node_type}
                        </text>
                      </g>
                    );
                  })}
                </g>
              </svg>
            </div>

            {/* Inspect Side Panel */}
            <div className="panel p-4 flex flex-col h-[620px] overflow-y-auto">
              {inspectEdgeId && inspectedEdge ? (
                /* Edge Inspection */
                <div className="space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-border">
                    <div className="flex items-center gap-1.5">
                      <GitBranch className="size-4 text-cyan-400" />
                      <span className="font-semibold text-xs">Inspected Relation</span>
                    </div>
                    <Button size="icon" variant="ghost" className="size-6" onClick={() => setInspectEdgeId(null)}>
                      <X className="size-3.5" />
                    </Button>
                  </div>

                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-mono">Relation Type</span>
                    <p className="font-semibold text-sm text-foreground mt-0.5">{inspectedEdge.relation_type}</p>
                  </div>

                  <div className="grid gap-2 text-xs">
                    <div className="p-2 rounded bg-card/60 border border-border">
                      <span className="text-[10px] text-muted-foreground">Source Node:</span>
                      <p className="font-medium text-foreground">{nodeName(inspectedEdge.source_node_id)}</p>
                    </div>
                    <div className="p-2 rounded bg-card/60 border border-border">
                      <span className="text-[10px] text-muted-foreground">Target Node:</span>
                      <p className="font-medium text-foreground">{nodeName(inspectedEdge.target_node_id)}</p>
                    </div>
                  </div>

                  {inspectedEdge.description && (
                    <div>
                      <span className="text-[10px] text-muted-foreground">Description</span>
                      <p className="text-xs text-muted-foreground mt-0.5">{inspectedEdge.description}</p>
                    </div>
                  )}

                  <div className="pt-2 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                    <span>Status: {inspectedEdge.status}</span>
                    <span>Confidence: {inspectedEdge.confidence ?? 1.0}</span>
                  </div>
                </div>
              ) : inspectedNode ? (
                /* Node Inspection */
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-[10px] px-1.5 uppercase font-mono">
                        {inspectedNode.node_type}
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => selectAndCenterNode(inspectedNode.id)}
                      >
                        Center in Graph
                      </Button>
                    </div>
                    <h3 className="font-bold text-base text-foreground mt-1">{inspectedNode.name}</h3>
                    {inspectedNode.canonical_name && inspectedNode.canonical_name !== inspectedNode.name && (
                      <p className="text-xs text-muted-foreground">Canonical: {inspectedNode.canonical_name}</p>
                    )}
                    {inspectedNode.summary && (
                      <p className="text-xs text-muted-foreground mt-1.5">{inspectedNode.summary}</p>
                    )}
                  </div>

                  {/* Actions Bar */}
                  <div className="flex flex-wrap gap-1.5 pt-2 border-t border-border">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 text-xs flex-1"
                      onClick={() => {
                        void navigate({
                          to: "/chat",
                          search: { q: `Explain ${inspectedNode.name} and its connections in the Brain.` } as any,
                        });
                      }}
                    >
                      <Sparkles className="size-3 mr-1 text-primary" /> Ask Brain
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => {
                        setPathSourceId(inspectedNode.id);
                        setViewMode("path_finder");
                      }}
                    >
                      Find Path From Here
                    </Button>
                  </div>

                  {/* Claims List */}
                  <div className="space-y-2 pt-2 border-t border-border">
                    <span className="text-[11px] font-semibold flex items-center justify-between">
                      <span>Atomic Claims ({nodeClaims?.length || 0})</span>
                      <Link to="/knowledge" className="text-[10px] text-primary hover:underline">
                        Manage
                      </Link>
                    </span>

                    {(!nodeClaims || nodeClaims.length === 0) ? (
                      <p className="text-[11px] text-muted-foreground">No claims attached to this concept.</p>
                    ) : (
                      <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                        {nodeClaims.map((c: any) => (
                          <div key={c.id} className="p-2 rounded bg-card/60 border border-border text-xs">
                            <p className="text-[11px] text-foreground font-medium">{c.claim_text}</p>
                            <div className="flex items-center gap-1.5 mt-1">
                              <Badge
                                variant="outline"
                                className={`text-[9px] px-1 py-0 ${
                                  c.verification_status === "verified"
                                    ? "border-emerald-500/40 text-emerald-400"
                                    : "border-border text-muted-foreground"
                                }`}
                              >
                                {c.verification_status}
                              </Badge>
                              {c.is_outdated && (
                                <Badge variant="outline" className="text-[9px] px-1 py-0 border-amber-500/40 text-amber-400">
                                  Outdated
                                </Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Relations Summary */}
                  <div className="space-y-2 pt-2 border-t border-border">
                    <span className="text-[11px] font-semibold">
                      Connected Relations ({inspectedEdges.outgoing.length + inspectedEdges.incoming.length})
                    </span>

                    <div className="space-y-1 text-xs max-h-40 overflow-y-auto pr-1">
                      {inspectedEdges.outgoing.map((e) => (
                        <div
                          key={e.id}
                          className="flex items-center justify-between p-1.5 rounded hover:bg-card cursor-pointer"
                          onClick={() => selectAndCenterNode(e.target)}
                        >
                          <span className="font-mono text-[10px] text-primary">→ {e.relation_type}</span>
                          <span className="text-[11px] font-medium truncate max-w-[10rem]">{nodeName(e.target)}</span>
                        </div>
                      ))}
                      {inspectedEdges.incoming.map((e) => (
                        <div
                          key={e.id}
                          className="flex items-center justify-between p-1.5 rounded hover:bg-card cursor-pointer"
                          onClick={() => selectAndCenterNode(e.source)}
                        >
                          <span className="font-mono text-[10px] text-cyan-400">← {e.relation_type}</span>
                          <span className="text-[11px] font-medium truncate max-w-[10rem]">{nodeName(e.source)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground text-xs">
                  <Info className="size-6 mb-2 opacity-40" />
                  <p>Click on any node or edge to inspect verified details, claims, and relations.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: GRAPH PATH FINDER */}
      {viewMode === "path_finder" && (
        <div className="space-y-6">
          <div className="panel p-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
              <RouteIcon className="size-4 text-cyan-400" /> Bounded Graph Path Finder
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              Search for real, stored relationship chains between any two concepts up to max depth. No edges are fabricated.
            </p>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label className="text-xs">Source Concept</Label>
                <Select value={pathSourceId ?? ""} onValueChange={(val) => setPathSourceId(val)}>
                  <SelectTrigger className="text-xs h-8 mt-1">
                    <SelectValue placeholder="Pick source concept" />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {(allNodes ?? []).map((n) => (
                      <SelectItem key={n.id} value={n.id}>
                        {n.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Target Concept</Label>
                <Select value={pathTargetId ?? ""} onValueChange={(val) => setPathTargetId(val)}>
                  <SelectTrigger className="text-xs h-8 mt-1">
                    <SelectValue placeholder="Pick target concept" />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {(allNodes ?? []).map((n) => (
                      <SelectItem key={n.id} value={n.id}>
                        {n.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Max Hops: {pathMaxDepth}</Label>
                <div className="flex items-center gap-2 mt-1">
                  {[2, 3, 4, 5].map((d) => (
                    <Button
                      key={d}
                      size="sm"
                      variant={pathMaxDepth === d ? "secondary" : "outline"}
                      className="h-8 flex-1 text-xs"
                      onClick={() => setPathMaxDepth(d)}
                    >
                      {d}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <Button
                size="sm"
                variant="default"
                className="h-8 text-xs"
                onClick={handleFindPath}
                disabled={isSearchingPath}
              >
                {isSearchingPath ? "Searching Graph..." : "Find Connection"}
              </Button>
            </div>
          </div>

          {/* Path Results */}
          {pathResult !== null && (
            <div className="panel p-5">
              <h4 className="text-sm font-semibold mb-3">Path Search Results</h4>

              {pathResult.length === 0 ? (
                <div className="text-center py-8">
                  <HelpCircle className="size-8 mx-auto text-muted-foreground mb-2 opacity-50" />
                  <p className="text-sm font-medium text-foreground">No path found.</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    There are no stored relations connecting these concepts within {pathMaxDepth} hops.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {pathResult.map((path, idx) => (
                    <div key={idx} className="p-4 rounded-lg border border-border bg-card/40 text-xs">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-foreground">Path #{idx + 1} ({path.length} hops)</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[11px]"
                          onClick={() => {
                            if (path.nodes[0]) selectAndCenterNode(path.nodes[0].id);
                            setViewMode("neighborhood");
                          }}
                        >
                          Focus in Graph <ArrowRight className="size-3 ml-1" />
                        </Button>
                      </div>

                      {/* Path Sequence */}
                      <div className="flex flex-wrap items-center gap-2 p-2.5 rounded bg-background/50 border border-border/60">
                        {path.nodes.map((node, nIdx) => (
                          <div key={node.id} className="flex items-center gap-2">
                            <span className="px-2 py-1 rounded bg-card border border-border font-medium text-foreground">
                              {node.name}
                            </span>
                            {nIdx < path.relations.length && (
                              <Badge variant="outline" className="text-[10px] text-primary">
                                {path.relations[nIdx]} →
                              </Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* VIEW 3: KNOWLEDGE MAP */}
      {viewMode === "knowledge_map" && (
        <div className="space-y-6">
          <div className="panel p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold">Domain Root:</span>
              <Select
                value={centerNodeId ?? ""}
                onValueChange={(val) => selectAndCenterNode(val)}
              >
                <SelectTrigger className="w-56 text-xs h-8">
                  <SelectValue placeholder="Select Domain Root" />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {(allNodes ?? []).map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.name} ({n.node_type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {knowledgeMapData && (
              <div className="text-xs text-muted-foreground">
                Domain Hub: <span className="font-semibold text-foreground">{knowledgeMapData.root_node.name}</span>
              </div>
            )}
          </div>

          {knowledgeMapData && (
            <div className="space-y-6">
              {/* Map Stats */}
              <div className="grid gap-4 sm:grid-cols-4">
                <div className="panel p-4">
                  <span className="text-xs text-muted-foreground">Domain Concepts</span>
                  <p className="font-mono text-2xl font-bold mt-1">{knowledgeMapData.stats.total_nodes}</p>
                </div>
                <div className="panel p-4">
                  <span className="text-xs text-muted-foreground">Domain Edges</span>
                  <p className="font-mono text-2xl font-bold mt-1 text-cyan-400">{knowledgeMapData.stats.total_edges}</p>
                </div>
                <div className="panel p-4">
                  <span className="text-xs text-muted-foreground">Hotspot Hubs</span>
                  <p className="font-mono text-2xl font-bold mt-1 text-amber-400">{knowledgeMapData.stats.hotspot_count}</p>
                </div>
                <div className="panel p-4">
                  <span className="text-xs text-muted-foreground">Semantic Clusters</span>
                  <p className="font-mono text-2xl font-bold mt-1 text-purple-400">{knowledgeMapData.stats.cluster_count}</p>
                </div>
              </div>

              {/* Hotspots Section */}
              <div className="panel p-5">
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                  <Flame className="size-4 text-amber-400" /> Domain Hotspots & Central Hubs
                </h4>
                <div className="grid gap-2 sm:grid-cols-3">
                  {knowledgeMapData.hotspots.map((h) => (
                    <div
                      key={h.id}
                      className="p-3 rounded border border-border bg-card/40 flex items-center justify-between text-xs"
                    >
                      <div>
                        <p className="font-medium text-foreground">{h.name}</p>
                        <span className="text-[11px] text-muted-foreground">{h.total_degree} connections</span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="size-7 p-0"
                        onClick={() => {
                          selectAndCenterNode(h.id);
                          setViewMode("neighborhood");
                        }}
                      >
                        <ExternalLink className="size-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Semantic Clusters */}
              <div className="panel p-5">
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
                  <Layers className="size-4 text-purple-400" /> Analytical Clusters
                </h4>
                <div className="grid gap-4 sm:grid-cols-2">
                  {knowledgeMapData.clusters.map((cl) => (
                    <div key={cl.id} className="p-3.5 rounded-lg border border-border bg-card/40 text-xs">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-semibold text-foreground">{cl.label}</span>
                        <Badge variant="outline" className="text-[10px]">{cl.node_count} nodes</Badge>
                      </div>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {cl.node_ids.map((nId) => (
                          <button
                            key={nId}
                            onClick={() => {
                              selectAndCenterNode(nId);
                              setViewMode("neighborhood");
                            }}
                            className="px-2 py-0.5 rounded bg-background border border-border text-[11px] hover:border-primary"
                          >
                            {nodeName(nId)}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW 4: PREREQUISITE PROGRESSION */}
      {viewMode === "learning_paths" && (
        <div className="space-y-6">
          <div className="panel p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold">Target Goal Concept:</span>
              <Select
                value={learningTargetId || centerNodeId || ""}
                onValueChange={(val) => setLearningTargetId(val)}
              >
                <SelectTrigger className="w-64 text-xs h-8">
                  <SelectValue placeholder="Select target concept" />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {(allNodes ?? []).map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.name} ({n.node_type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {knowledgePathData && (
            <div className="panel p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-1.5">
                    <BookOpen className="size-4 text-emerald-400" /> {knowledgePathData.title}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {knowledgePathData.description}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={
                    knowledgePathData.source_type === "canonical_prerequisite"
                      ? "border-emerald-500/40 text-emerald-400"
                      : "border-blue-500/40 text-blue-400"
                  }
                >
                  {knowledgePathData.source_type === "canonical_prerequisite"
                    ? "Verified Prerequisite Path"
                    : "AI Progression"}
                </Badge>
              </div>

              {/* Steps timeline */}
              <div className="space-y-3 relative before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-border">
                {knowledgePathData.steps.map((step) => (
                  <div key={step.node_id} className="relative flex items-start gap-3 pl-8 text-xs">
                    <div className="absolute left-2 top-1 size-3 rounded-full bg-primary border-2 border-background" />

                    <div className="p-3 rounded-lg border border-border bg-card/50 flex-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-muted-foreground text-[10px]">
                            Step {step.step_index}
                          </span>
                          <span className="font-semibold text-foreground text-sm">{step.name}</span>
                          <Badge variant="outline" className="text-[10px] px-1 py-0">{step.node_type}</Badge>
                        </div>

                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 text-xs px-2"
                          onClick={() => {
                            selectAndCenterNode(step.node_id);
                            setViewMode("neighborhood");
                          }}
                        >
                          Focus in Graph <ArrowRight className="size-3 ml-1" />
                        </Button>
                      </div>

                      {step.summary && (
                        <p className="text-muted-foreground text-xs mt-1">{step.summary}</p>
                      )}

                      {step.prerequisites.length > 0 && (
                        <div className="flex items-center gap-1.5 mt-2">
                          <span className="text-[10px] text-muted-foreground">Prerequisites:</span>
                          {step.prerequisites.map((p) => (
                            <Badge key={p.id} variant="secondary" className="text-[9px] px-1 py-0">
                              {p.name}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Relation Dialog (Edit Mode) */}
      <Dialog open={addRelationOpen} onOpenChange={setAddRelationOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Connect Concepts in Knowledge Graph</DialogTitle>
            <DialogDescription>
              Create a typed semantic relation verified and audited through the Knowledge Engine.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 text-xs py-2">
            <div>
              <Label className="text-xs">Source Node</Label>
              <Select value={newRelSourceId} onValueChange={setNewRelSourceId}>
                <SelectTrigger className="text-xs h-8 mt-1">
                  <SelectValue placeholder="Pick source node" />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  {(allNodes ?? []).map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Relation Type</Label>
              <Select value={newRelType} onValueChange={setNewRelType}>
                <SelectTrigger className="text-xs h-8 mt-1">
                  <SelectValue placeholder="Pick relation type" />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  {(relationTypes ?? DEFAULT_RELATION_TYPES).map((r) => (
                    <SelectItem key={r.key} value={r.key}>
                      {r.name} ({r.key})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Target Node</Label>
              <Select value={newRelTargetId} onValueChange={setNewRelTargetId}>
                <SelectTrigger className="text-xs h-8 mt-1">
                  <SelectValue placeholder="Pick target node" />
                </SelectTrigger>
                <SelectContent className="max-h-56">
                  {(allNodes ?? []).map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Description (Optional)</Label>
              <Input
                value={newRelDescription}
                onChange={(e) => setNewRelDescription(e.target.value)}
                placeholder="Why are these concepts related?"
                className="h-8 text-xs mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={() => setAddRelationOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="default"
              onClick={() => createRelationMutation.mutate()}
              disabled={createRelationMutation.isPending}
            >
              {createRelationMutation.isPending ? "Connecting..." : "Commit Relation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

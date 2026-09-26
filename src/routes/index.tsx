import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BookMarked,
  Brain,
  CheckCircle2,
  ChevronRight,
  Clock,
  Compass,
  ExternalLink,
  Filter,
  Flame,
  GitBranch,
  HelpCircle,
  History,
  Layers,
  LayoutDashboard,
  Library,
  MessagesSquare,
  Network,
  Quote,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Tags,
  Trash2,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, EmptyState } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BrainHealthService, type BrainHealthReport, type CleanupCandidate } from "@/lib/knowledge-engine/brain-health";
import { KnowledgeMapService } from "@/lib/knowledge-engine/knowledge-maps";
import type { KnowledgeNode, KnowledgeEdge } from "@/lib/knowledge";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Brain Dashboard — Knowledge Brain" },
      {
        name: "description",
        content: "Operational health, knowledge coverage, real-time metrics, gaps, conflicts, and domain insights.",
      },
      { property: "og:title", content: "Brain Dashboard — Knowledge Brain" },
      {
        property: "og:description",
        content: "Operational health, knowledge coverage, real-time metrics, gaps, conflicts, and domain insights.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DashboardPage,
});

type DashboardTab = "overview" | "health" | "gaps" | "conflicts" | "domain" | "activity";

function DashboardPage() {
  const { session } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const [globalSearch, setGlobalSearch] = useState("");
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);

  // 1. Fetch live operational stats
  const { data: stats, isLoading: statsLoading, refetch: refetchStats } = useQuery({
    queryKey: ["brain-dashboard-stats"],
    enabled: !!session,
    queryFn: async () => {
      try {
        const { data, error } = await supabase.rpc("get_brain_dashboard_stats");
        if (!error && data) {
          return (typeof data === "string" ? JSON.parse(data) : data) as Record<string, number>;
        }
      } catch {
        // Fallback
      }

      // Fallback manual count
      const [nodes, edges, claims, sources, gaps, conflicts, proposals] = await Promise.all([
        supabase.from("knowledge_nodes").select("id", { count: "exact", head: true }).is("deleted_at", null),
        supabase.from("knowledge_edges").select("id", { count: "exact", head: true }),
        supabase.from("knowledge_claims").select("id, verification_status, is_outdated, status"),
        supabase.from("sources").select("id, availability").is("deleted_at", null),
        supabase.from("knowledge_gaps").select("id", { count: "exact", head: true }).eq("status", "open"),
        supabase.from("knowledge_conflicts").select("id", { count: "exact", head: true }).eq("status", "open"),
        supabase.from("knowledge_proposals").select("id, status"),
      ]);

      const claimRows = claims.data || [];
      const sourceRows = sources.data || [];
      const proposalRows = proposals.data || [];

      return {
        nodes: nodes.count || 0,
        edges: edges.count || 0,
        claims: claimRows.length,
        verified_claims: claimRows.filter((c) => c.verification_status === "verified").length,
        unverified_claims: claimRows.filter((c) => c.verification_status === "unverified").length,
        conflicted_claims: claimRows.filter((c) => c.status === "conflicted").length,
        outdated_claims: claimRows.filter((c) => c.is_outdated || c.status === "outdated").length,
        sources: sourceRows.length,
        broken_sources: sourceRows.filter((s) => s.availability === "broken" || s.availability === "unavailable").length,
        evidence: 0,
        knowledge_gaps: gaps.count || 0,
        open_conflicts: conflicts.count || 0,
        pending_reviews: proposalRows.filter((p) => p.status === "pending_review").length,
        quarantined_knowledge: proposalRows.filter((p) => p.status === "quarantined").length,
        recent_transactions: 0,
        orphan_nodes: 0,
        stale_embeddings: 0,
      };
    },
  });

  // 2. Fetch Brain Health Report
  const { data: healthReport, isLoading: healthLoading } = useQuery<BrainHealthReport>({
    queryKey: ["brain-health-report"],
    enabled: !!session,
    queryFn: async () => {
      const healthService = new BrainHealthService(supabase);
      return healthService.getHealthReport();
    },
  });

  // 3. Fetch nodes for search, hotspots, and domain view
  const { data: allNodes } = useQuery({
    queryKey: ["nodes-dashboard"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_nodes")
        .select("*")
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return (data || []) as KnowledgeNode[];
    },
  });

  // 4. Fetch edges for hotspots & maps
  const { data: allEdges } = useQuery({
    queryKey: ["edges-dashboard"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_edges")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as KnowledgeEdge[];
    },
  });

  // 5. Fetch Open Knowledge Gaps
  const { data: knowledgeGaps } = useQuery({
    queryKey: ["gaps-dashboard"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_gaps")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) return [];
      return data || [];
    },
  });

  // 6. Fetch Open Conflicts
  const { data: openConflicts } = useQuery({
    queryKey: ["conflicts-dashboard"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_conflicts")
        .select("*, ca:knowledge_claims!claim_a_id(claim_text), cb:knowledge_claims!claim_b_id(claim_text)")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) return [];
      return data || [];
    },
  });

  // 7. Fetch Recent Knowledge Transactions
  const { data: recentTransactions } = useQuery({
    queryKey: ["recent-tx-dashboard"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_transactions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) return [];
      return data || [];
    },
  });

  // Compute hotspots client-side
  const hotspots = useMemo(() => {
    if (!allNodes || !allEdges) return [];
    const degreeMap = new Map<string, { in: number; out: number; total: number }>();
    allEdges.forEach((e) => {
      if (e.status === "archived" || e.status === "deprecated") return;
      const src = degreeMap.get(e.source_node_id) || { in: 0, out: 0, total: 0 };
      src.out += 1;
      src.total += 1;
      degreeMap.set(e.source_node_id, src);

      const tgt = degreeMap.get(e.target_node_id) || { in: 0, out: 0, total: 0 };
      tgt.in += 1;
      tgt.total += 1;
      degreeMap.set(e.target_node_id, tgt);
    });

    return allNodes
      .map((n) => {
        const deg = degreeMap.get(n.id) || { in: 0, out: 0, total: 0 };
        return {
          ...n,
          in_degree: deg.in,
          out_degree: deg.out,
          total_degree: deg.total,
        };
      })
      .filter((n) => n.total_degree > 0)
      .sort((a, b) => b.total_degree - a.total_degree)
      .slice(0, 8);
  }, [allNodes, allEdges]);

  // Compute domain view if a domain node is selected
  const domainData = useMemo(() => {
    if (!selectedDomainId || !allNodes || !allEdges) return null;
    const mapService = new KnowledgeMapService();
    return mapService.buildKnowledgeMap(selectedDomainId, allNodes, allEdges, { maxDepth: 2, maxNodes: 25 });
  }, [selectedDomainId, allNodes, allEdges]);

  // Cleanup candidates preview
  const cleanupCandidates = useMemo<CleanupCandidate[]>(() => {
    const healthService = new BrainHealthService();
    return healthService.getCleanupPreview({
      nodes: allNodes || [],
      edges: allEdges || [],
      conflicts: openConflicts || [],
    });
  }, [allNodes, allEdges, openConflicts]);

  // Global search navigation
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!globalSearch.trim()) return;
    const match = allNodes?.find(
      (n) => n.name.toLowerCase() === globalSearch.trim().toLowerCase() || n.slug === globalSearch.trim().toLowerCase(),
    );
    if (match) {
      void navigate({ to: "/graph", search: { focus: match.id } as any });
    } else {
      void navigate({ to: "/chat", search: { q: globalSearch.trim() } as any });
    }
  };

  const healthStatusColor = {
    Healthy: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    "Needs Attention": "bg-amber-500/10 text-amber-400 border-amber-500/30",
    Degraded: "bg-rose-500/10 text-rose-400 border-rose-500/30",
    Unknown: "bg-muted text-muted-foreground border-border",
  }[healthReport?.status || "Unknown"];

  return (
    <AppShell
      title="Brain Dashboard"
      description="Operational command center: live verification states, graph density, conflicts, and knowledge gaps."
      actions={
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void refetchStats();
            }}
          >
            <RefreshCw className="size-4 mr-1" /> Refresh
          </Button>
          <Button
            size="sm"
            variant="default"
            onClick={() => {
              void navigate({ to: "/chat" });
            }}
          >
            <MessagesSquare className="size-4 mr-1" /> Ask Brain
          </Button>
        </div>
      }
    >
      {/* 1. Global Search & Ask Brain Header */}
      <form onSubmit={handleSearchSubmit} className="mb-6 flex flex-wrap gap-2 panel p-3 items-center">
        <div className="relative flex-1 min-w-[16rem]">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <Input
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            placeholder="Search concepts, verified claims, or ask a question across the Brain..."
            className="pl-9 h-9 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button type="submit" size="sm" variant="secondary" className="h-9">
            Navigate
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9"
            onClick={() => {
              if (globalSearch.trim()) {
                void navigate({ to: "/chat", search: { q: globalSearch.trim() } as any });
              } else {
                void navigate({ to: "/chat" });
              }
            }}
          >
            <Sparkles className="size-4 mr-1 text-primary" /> Ask with RAG
          </Button>
        </div>
      </form>

      {/* 2. Operational Health Banner */}
      <div className={`mb-6 panel p-4 border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${healthStatusColor}`}>
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-lg flex items-center justify-center bg-background/50 border border-current/20">
            {healthReport?.status === "Healthy" ? (
              <ShieldCheck className="size-6 text-emerald-400" />
            ) : healthReport?.status === "Needs Attention" ? (
              <AlertTriangle className="size-6 text-amber-400" />
            ) : healthReport?.status === "Degraded" ? (
              <ShieldAlert className="size-6 text-rose-400" />
            ) : (
              <HelpCircle className="size-6 text-muted-foreground" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">Brain Health: {healthReport?.status || "Analyzing..."}</span>
              <Badge variant="outline" className="text-[10px] uppercase font-mono tracking-wider">
                Operational Status
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">
              {healthReport?.summary_reasons?.[0] || "Knowledge verification and relational structures assessed."}
            </p>
          </div>
        </div>

        {/* Quick action buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {(stats?.open_conflicts ?? 0) > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
              onClick={() => setActiveTab("conflicts")}
            >
              <AlertTriangle className="size-3.5 mr-1" /> Review {stats?.open_conflicts} Conflict(s)
            </Button>
          )}
          {(stats?.knowledge_gaps ?? 0) > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs border-blue-500/40 text-blue-300 hover:bg-blue-500/10"
              onClick={() => setActiveTab("gaps")}
            >
              <HelpCircle className="size-3.5 mr-1" /> Inspect {stats?.knowledge_gaps} Gap(s)
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs"
            onClick={() => setActiveTab("health")}
          >
            View Health Details <ChevronRight className="size-3.5 ml-1" />
          </Button>
        </div>
      </div>

      {/* 3. Metric Cards Grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 mb-6">
        <Link to="/knowledge" className="panel p-3.5 transition-colors hover:border-primary/50 group">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Canonical Nodes</span>
            <Library className="size-4 text-primary/70" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums">
            {statsLoading ? "—" : (stats?.nodes ?? 0)}
          </p>
          <span className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1 group-hover:text-primary">
            Explore hierarchy <ArrowRight className="size-3" />
          </span>
        </Link>

        <Link to="/graph" className="panel p-3.5 transition-colors hover:border-primary/50 group">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Active Relations</span>
            <GitBranch className="size-4 text-cyan-400" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums">
            {statsLoading ? "—" : (stats?.edges ?? 0)}
          </p>
          <span className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1 group-hover:text-primary">
            Open graph <ArrowRight className="size-3" />
          </span>
        </Link>

        <Link to="/knowledge" className="panel p-3.5 transition-colors hover:border-primary/50 group">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Verified Claims</span>
            <CheckCircle2 className="size-4 text-emerald-400" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-emerald-400">
            {statsLoading ? "—" : (stats?.verified_claims ?? 0)}
          </p>
          <span className="text-[11px] text-muted-foreground mt-1 block">
            out of {stats?.claims ?? 0} total claims
          </span>
        </Link>

        <div
          onClick={() => setActiveTab("conflicts")}
          className="panel p-3.5 transition-colors hover:border-amber-500/50 group cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Open Conflicts</span>
            <AlertTriangle className="size-4 text-amber-400" />
          </div>
          <p className={`mt-2 font-mono text-2xl font-bold tabular-nums ${(stats?.open_conflicts ?? 0) > 0 ? "text-amber-400" : ""}`}>
            {statsLoading ? "—" : (stats?.open_conflicts ?? 0)}
          </p>
          <span className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1 group-hover:text-amber-400">
            {(stats?.open_conflicts ?? 0) > 0 ? "Requires review" : "No open conflicts"}
          </span>
        </div>

        <div
          onClick={() => setActiveTab("gaps")}
          className="panel p-3.5 transition-colors hover:border-blue-500/50 group cursor-pointer"
        >
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Knowledge Gaps</span>
            <HelpCircle className="size-4 text-blue-400" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-blue-400">
            {statsLoading ? "—" : (stats?.knowledge_gaps ?? 0)}
          </p>
          <span className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1 group-hover:text-blue-400">
            Detected from queries <ArrowRight className="size-3" />
          </span>
        </div>

        <Link to="/sources" className="panel p-3.5 transition-colors hover:border-primary/50 group">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Sources & Evidence</span>
            <BookMarked className="size-4 text-purple-400" />
          </div>
          <p className="mt-2 font-mono text-2xl font-bold tabular-nums">
            {statsLoading ? "—" : (stats?.sources ?? 0)}
          </p>
          <span className="text-[11px] text-muted-foreground flex items-center gap-1 mt-1">
            {(stats?.broken_sources ?? 0) > 0 ? (
              <span className="text-rose-400">{stats?.broken_sources} broken source(s)</span>
            ) : (
              "All sources accessible"
            )}
          </span>
        </Link>
      </div>

      {/* 4. Dashboard Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-border pb-2 mb-6 overflow-x-auto">
        <Button
          size="sm"
          variant={activeTab === "overview" ? "secondary" : "ghost"}
          className="h-8 text-xs font-medium"
          onClick={() => setActiveTab("overview")}
        >
          <LayoutDashboard className="size-3.5 mr-1.5" /> Overview & Hotspots
        </Button>
        <Button
          size="sm"
          variant={activeTab === "health" ? "secondary" : "ghost"}
          className="h-8 text-xs font-medium"
          onClick={() => setActiveTab("health")}
        >
          <ShieldCheck className="size-3.5 mr-1.5" /> Brain Health Dimensions
        </Button>
        <Button
          size="sm"
          variant={activeTab === "gaps" ? "secondary" : "ghost"}
          className="h-8 text-xs font-medium"
          onClick={() => setActiveTab("gaps")}
        >
          <HelpCircle className="size-3.5 mr-1.5" /> Knowledge Gaps ({stats?.knowledge_gaps ?? 0})
        </Button>
        <Button
          size="sm"
          variant={activeTab === "conflicts" ? "secondary" : "ghost"}
          className="h-8 text-xs font-medium"
          onClick={() => setActiveTab("conflicts")}
        >
          <AlertTriangle className="size-3.5 mr-1.5" /> Open Conflicts ({stats?.open_conflicts ?? 0})
        </Button>
        <Button
          size="sm"
          variant={activeTab === "domain" ? "secondary" : "ghost"}
          className="h-8 text-xs font-medium"
          onClick={() => setActiveTab("domain")}
        >
          <Compass className="size-3.5 mr-1.5" /> Domain Dashboard
        </Button>
        <Button
          size="sm"
          variant={activeTab === "activity" ? "secondary" : "ghost"}
          className="h-8 text-xs font-medium"
          onClick={() => setActiveTab("activity")}
        >
          <Activity className="size-3.5 mr-1.5" /> Recent Activity
        </Button>
      </div>

      {/* 5. Tab Content Panes */}

      {/* TAB 1: OVERVIEW */}
      {activeTab === "overview" && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Column 1 & 2: Hotspots & Connectivity */}
          <div className="lg:col-span-2 space-y-6">
            <div className="panel p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold flex items-center gap-1.5">
                    <Flame className="size-4 text-amber-400" /> Knowledge Hotspots & Hubs
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Top connected concepts in the Brain based on combined incoming, outgoing, and claim relations.
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => void navigate({ to: "/graph" })}
                >
                  <Network className="size-3.5 mr-1" /> View in Graph
                </Button>
              </div>

              {hotspots.length === 0 ? (
                <p className="text-xs text-muted-foreground py-6 text-center">
                  No knowledge relations established yet. Connect nodes in Knowledge or Graph.
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {hotspots.map((h) => (
                    <div
                      key={h.id}
                      className="p-3 rounded-lg border border-border bg-card/50 hover:border-primary/40 transition-colors flex items-center justify-between"
                    >
                      <div className="min-w-0 pr-2">
                        <p className="text-xs font-semibold truncate text-foreground">{h.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {h.node_type}
                          </Badge>
                          <span className="text-[11px] text-muted-foreground">
                            {h.total_degree} connections
                          </span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="size-7 p-0 shrink-0"
                        onClick={() => {
                          void navigate({ to: "/graph", search: { focus: h.id } as any });
                        }}
                        title="Focus on Graph"
                      >
                        <ExternalLink className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Quick Actions Panel */}
            <div className="panel p-5">
              <h3 className="text-sm font-semibold mb-3">Quick Navigation & Operations</h3>
              <div className="grid gap-3 sm:grid-cols-3">
                <Link
                  to="/knowledge"
                  className="p-3 rounded-lg border border-border bg-card/30 hover:bg-card/70 transition-colors block"
                >
                  <Library className="size-4 text-primary mb-1.5" />
                  <p className="text-xs font-semibold">Knowledge Explorer</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Browse unlimited taxonomy, add atomic claims and evidence.
                  </p>
                </Link>

                <Link
                  to="/graph"
                  className="p-3 rounded-lg border border-border bg-card/30 hover:bg-card/70 transition-colors block"
                >
                  <Network className="size-4 text-cyan-400 mb-1.5" />
                  <p className="text-xs font-semibold">Graph & Path Finder</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Explore neighborhoods and find bounded paths between concepts.
                  </p>
                </Link>

                <Link
                  to="/chat"
                  className="p-3 rounded-lg border border-border bg-card/30 hover:bg-card/70 transition-colors block"
                >
                  <Sparkles className="size-4 text-amber-400 mb-1.5" />
                  <p className="text-xs font-semibold">Evidence-Aware Chat</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Ask questions grounded strictly in Brain claims and ledger.
                  </p>
                </Link>
              </div>
            </div>
          </div>

          {/* Column 3: Recent Transactions Audit */}
          <div className="panel p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <History className="size-4 text-primary" /> Recent Transactions
              </h3>
              <Link to="/activity" className="text-xs text-primary hover:underline">
                View all
              </Link>
            </div>

            {(!recentTransactions || recentTransactions.length === 0) ? (
              <p className="text-xs text-muted-foreground py-6 text-center">
                No recent knowledge transactions recorded.
              </p>
            ) : (
              <div className="space-y-2.5">
                {recentTransactions.map((tx: any) => (
                  <div key={tx.id} className="p-2.5 rounded border border-border text-xs bg-card/40">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] text-muted-foreground">
                        tx-{tx.id.slice(0, 8)}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1 py-0 ${
                          tx.status === "committed"
                            ? "border-emerald-500/40 text-emerald-400"
                            : "border-amber-500/40 text-amber-400"
                        }`}
                      >
                        {tx.status}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground mt-1 text-[11px]">
                      {tx.operation_count || 1} operation(s) executed
                    </p>
                    <span className="text-[10px] text-muted-foreground/70 mt-1 block">
                      {new Date(tx.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: BRAIN HEALTH */}
      {activeTab === "health" && (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="panel p-4">
              <span className="text-xs text-muted-foreground">Verification Rate</span>
              <p className="font-mono text-2xl font-bold text-emerald-400 mt-1">
                {healthReport?.metrics.verification_rate ?? 0}%
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Percentage of atomic claims backed by verified status
              </p>
            </div>

            <div className="panel p-4">
              <span className="text-xs text-muted-foreground">Evidence Coverage</span>
              <p className="font-mono text-2xl font-bold text-cyan-400 mt-1">
                {healthReport?.metrics.evidence_coverage ?? 0}%
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Claims linked to supporting or qualifying evidence
              </p>
            </div>

            <div className="panel p-4">
              <span className="text-xs text-muted-foreground">Average Node Degree</span>
              <p className="font-mono text-2xl font-bold text-primary mt-1">
                {healthReport?.metrics.average_degree ?? 0}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Average relational edges per knowledge concept
              </p>
            </div>

            <div className="panel p-4">
              <span className="text-xs text-muted-foreground">Orphan Knowledge</span>
              <p className={`font-mono text-2xl font-bold mt-1 ${(healthReport?.metrics.orphan_nodes ?? 0) > 0 ? "text-amber-400" : ""}`}>
                {healthReport?.metrics.orphan_nodes ?? 0}
              </p>
              <p className="text-[11px] text-muted-foreground mt-1">
                Isolated nodes with zero edges and zero attached claims
              </p>
            </div>
          </div>

          {/* Cleanup Preview Section */}
          <div className="panel p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold flex items-center gap-1.5">
                  <ShieldCheck className="size-4 text-emerald-400" /> Maintenance & Cleanup Insights
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Surfaced maintenance items. The system NEVER automatically deletes or alters knowledge without explicit user transactions.
                </p>
              </div>
            </div>

            {cleanupCandidates.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">
                Brain knowledge structures are completely clean and stable. No maintenance candidates detected.
              </p>
            ) : (
              <div className="space-y-2.5">
                {cleanupCandidates.map((c, i) => (
                  <div
                    key={`${c.id}-${i}`}
                    className="p-3 rounded-lg border border-border bg-card/40 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 ${
                            c.severity === "high"
                              ? "border-rose-500/40 text-rose-400"
                              : c.severity === "medium"
                              ? "border-amber-500/40 text-amber-400"
                              : "border-blue-500/40 text-blue-400"
                          }`}
                        >
                          {c.category.replace("_", " ")}
                        </Badge>
                        <span className="font-semibold text-foreground">{c.title}</span>
                      </div>
                      <p className="text-muted-foreground mt-1 text-[11px]">{c.reason}</p>
                    </div>

                    <Link
                      to={c.action_link as any}
                      className="px-2.5 py-1 rounded bg-secondary text-secondary-foreground text-xs hover:bg-secondary/80 shrink-0 ml-3"
                    >
                      {c.action_label}
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: KNOWLEDGE GAPS */}
      {activeTab === "gaps" && (
        <div className="panel p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <HelpCircle className="size-4 text-blue-400" /> Detected Knowledge Gaps
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Gaps recorded when questions could not be answered with grounded confidence. Ready for human curation or controlled research.
              </p>
            </div>
          </div>

          {(!knowledgeGaps || knowledgeGaps.length === 0) ? (
            <p className="text-xs text-muted-foreground py-8 text-center">
              No knowledge gaps recorded yet. Gaps are automatically detected when queries find insufficient grounded claims.
            </p>
          ) : (
            <div className="space-y-3">
              {knowledgeGaps.map((gap: any) => (
                <div key={gap.id} className="p-3.5 rounded-lg border border-border bg-card/40 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] border-blue-500/40 text-blue-400">
                        {gap.gap_type}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        Priority: {gap.priority}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(gap.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="font-medium text-foreground mt-1.5 text-sm">
                      "{gap.query}"
                    </p>
                    {gap.suggested_action && (
                      <p className="text-muted-foreground text-xs mt-1">
                        Recommendation: {gap.suggested_action}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => {
                        void navigate({ to: "/chat", search: { q: gap.query } as any });
                      }}
                    >
                      <Sparkles className="size-3.5 mr-1" /> Re-query Chat
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-8 text-xs"
                      onClick={() => {
                        void navigate({ to: "/knowledge" });
                      }}
                    >
                      Add Knowledge
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: CONFLICTS */}
      {activeTab === "conflicts" && (
        <div className="panel p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <AlertTriangle className="size-4 text-amber-400" /> Active Knowledge Conflicts
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Direct factual contradictions detected between claims. Both perspectives are preserved until reviewed.
              </p>
            </div>
          </div>

          {(!openConflicts || openConflicts.length === 0) ? (
            <p className="text-xs text-muted-foreground py-8 text-center">
              No active knowledge conflicts detected in the Brain.
            </p>
          ) : (
            <div className="space-y-4">
              {openConflicts.map((cf: any) => (
                <div key={cf.id} className="p-4 rounded-lg border border-amber-500/30 bg-card/40 text-xs">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="border-amber-500/50 text-amber-400">
                        {cf.conflict_type}
                      </Badge>
                      <span className="font-semibold text-foreground">
                        {cf.reason_summary || "Unresolved contradiction"}
                      </span>
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      Severity: {cf.severity || "medium"}
                    </Badge>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2 mt-3 pt-2 border-t border-border/50">
                    <div className="p-2.5 rounded bg-background/50 border border-border/70">
                      <span className="text-[10px] text-muted-foreground font-semibold">Claim A:</span>
                      <p className="text-xs text-foreground mt-0.5">{cf.ca?.claim_text || "Claim A reference"}</p>
                    </div>
                    <div className="p-2.5 rounded bg-background/50 border border-border/70">
                      <span className="text-[10px] text-muted-foreground font-semibold">Claim B:</span>
                      <p className="text-xs text-foreground mt-0.5">{cf.cb?.claim_text || "Claim B reference"}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => void navigate({ to: "/knowledge" })}
                    >
                      Inspect in Knowledge Explorer <ArrowRight className="size-3 ml-1" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: DOMAIN DASHBOARD */}
      {activeTab === "domain" && (
        <div className="space-y-6">
          <div className="panel p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold">Select Root Domain:</span>
              <Select
                value={selectedDomainId ?? ""}
                onValueChange={(val) => setSelectedDomainId(val)}
              >
                <SelectTrigger className="w-64 text-xs h-8">
                  <SelectValue placeholder="Pick a concept or framework (e.g. Laravel)" />
                </SelectTrigger>
                <SelectContent>
                  {(allNodes ?? []).map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.name} ({n.node_type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedDomainId && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                onClick={() => {
                  void navigate({ to: "/graph", search: { focus: selectedDomainId } as any });
                }}
              >
                <Network className="size-3.5 mr-1" /> Open Domain Map in Graph
              </Button>
            )}
          </div>

          {!selectedDomainId ? (
            <div className="panel p-12 text-center">
              <Compass className="size-8 mx-auto text-primary mb-2 opacity-50" />
              <h4 className="text-sm font-semibold">No Domain Selected</h4>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
                Choose any framework, technology, or category above to view its scoped metrics, key claims, relations, and connected concepts.
              </p>
            </div>
          ) : !domainData ? (
            <p className="text-xs text-muted-foreground py-6 text-center">Building domain map...</p>
          ) : (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-4">
                <div className="panel p-4">
                  <span className="text-xs text-muted-foreground">Domain Nodes</span>
                  <p className="font-mono text-2xl font-bold mt-1 text-foreground">
                    {domainData.stats.total_nodes}
                  </p>
                </div>
                <div className="panel p-4">
                  <span className="text-xs text-muted-foreground">Internal Relations</span>
                  <p className="font-mono text-2xl font-bold mt-1 text-cyan-400">
                    {domainData.stats.total_edges}
                  </p>
                </div>
                <div className="panel p-4">
                  <span className="text-xs text-muted-foreground">Hotspot Concepts</span>
                  <p className="font-mono text-2xl font-bold mt-1 text-amber-400">
                    {domainData.stats.hotspot_count}
                  </p>
                </div>
                <div className="panel p-4">
                  <span className="text-xs text-muted-foreground">Semantic Clusters</span>
                  <p className="font-mono text-2xl font-bold mt-1 text-purple-400">
                    {domainData.stats.cluster_count}
                  </p>
                </div>
              </div>

              {/* Connected concepts table */}
              <div className="panel p-5">
                <h4 className="text-sm font-semibold mb-3">Domain Hubs & Concepts</h4>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {domainData.nodes.map((node) => (
                    <div
                      key={node.id}
                      className="p-3 rounded border border-border bg-card/40 flex items-center justify-between text-xs"
                    >
                      <div className="min-w-0 pr-2">
                        <p className="font-medium truncate text-foreground">{node.name}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <Badge variant="outline" className="text-[10px] px-1 py-0">
                            {node.node_type}
                          </Badge>
                          {node.is_hotspot && (
                            <Badge variant="secondary" className="text-[10px] px-1 py-0 text-amber-400">
                              Hotspot
                            </Badge>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="size-7 p-0 shrink-0"
                        onClick={() => {
                          void navigate({ to: "/graph", search: { focus: node.id } as any });
                        }}
                      >
                        <ExternalLink className="size-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 6: ACTIVITY FEED */}
      {activeTab === "activity" && (
        <div className="panel p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-1.5">
                <Activity className="size-4 text-primary" /> Live Operational Audit Feed
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Audited timeline of knowledge extraction, resolution, commits, and verifications.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              onClick={() => void navigate({ to: "/activity" })}
            >
              Full Activity Explorer <ArrowRight className="size-3 ml-1" />
            </Button>
          </div>

          <p className="text-xs text-muted-foreground py-6 text-center">
            View the dedicated <Link to="/activity" className="text-primary underline">Brain Activity</Link> feed for full pagination, transaction diffs, and rollback tools.
          </p>
        </div>
      )}
    </AppShell>
  );
}

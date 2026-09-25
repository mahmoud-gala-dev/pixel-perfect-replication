// =====================================================================
// KNOWLEDGE BRAIN — PHASE 5: KNOWLEDGE PROPOSALS REVIEW PAGE
// Review, edit, approve, or reject candidate knowledge entities extracted
// from conversations. STRICT SAFETY: Proposals await Phase 6 resolution.
// =====================================================================

import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  Sparkles,
  Search,
  CheckCircle2,
  XCircle,
  Edit3,
  Clock,
  ExternalLink,
  Brain,
  Quote,
  Network,
  FolderTree,
  AlertTriangle,
  HelpCircle,
  BookOpen,
  Filter,
  Check,
  RotateCcw,
  GitCompare,
  Layers,
  ShieldCheck,
  CheckCheck,
  Compass,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, EmptyState } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  KnowledgeExtractionService,
  KnowledgeResolutionService,
  type KnowledgeProposalItem,
  type ProposalStatus,
  type ProposalType,
} from "@/lib/ai";
import { KnowledgeEngine, type KnowledgePlan } from "@/lib/ai/learning";
import { KnowledgeDiffViewer } from "@/components/knowledge/KnowledgeDiffViewer";
import { BrainUpdateSummaryModal } from "@/components/knowledge/BrainUpdateSummaryModal";

export const Route = createFileRoute("/proposals")({
  head: () => ({
    meta: [
      { title: "Knowledge Proposals — Knowledge Brain" },
      { name: "description", content: "Review extracted concepts, claims, and relations awaiting canonical resolution." },
      { property: "og:title", content: "Knowledge Proposals — Knowledge Brain" },
      { property: "og:description", content: "Review extracted concepts, claims, and relations awaiting canonical resolution." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: KnowledgeProposalsPage,
});

export function KnowledgeProposalsPage() {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  // Filters
  const [statusFilter, setStatusFilter] = useState<ProposalStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState<ProposalType | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Rejection Dialog State
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectProposalId, setRejectProposalId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  // Edit Dialog State
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingProposal, setEditingProposal] = useState<KnowledgeProposalItem | null>(null);
  const [editedTitleOrStatement, setEditedTitleOrStatement] = useState("");
  const [editedDescription, setEditedDescription] = useState("");

  // Fetch Proposals
  const { data: proposals = [], isLoading } = useQuery({
    queryKey: ["knowledge-proposals", statusFilter, typeFilter, searchQuery],
    enabled: !!session,
    queryFn: async () => {
      return await KnowledgeExtractionService.getProposals({
        status: statusFilter,
        type: typeFilter,
        search: searchQuery,
      });
    },
  });

  // Fetch Resolution Results
  const { data: resolutionResults = {} } = useQuery({
    queryKey: ["knowledge-resolution-results"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_resolution_results")
        .select("*, knowledge_resolution_candidates(*)");
      if (error || !data) return {};
      const map: Record<string, any> = {};
      for (const item of data) {
        map[item.proposal_id] = item;
      }
      return map;
    },
  });

  // Fetch Canonical Nodes for Label Resolution
  const { data: canonicalNodes = [] } = useQuery({
    queryKey: ["canonical-nodes-lookup"],
    enabled: !!session,
    queryFn: async () => {
      const { data } = await supabase
        .from("knowledge_nodes")
        .select("id, name, slug, node_type")
        .is("deleted_at", null);
      return data || [];
    },
  });

  // Batch Resolve Mutation
  const batchResolveMutation = useMutation({
    mutationFn: async () => {
      const resolutionService = new KnowledgeResolutionService(supabase);
      const runIds = Array.from(
        new Set(proposals.map((p) => p.extraction_run_id).filter(Boolean)),
      ) as string[];

      let count = 0;
      for (const rId of runIds) {
        const summary = await resolutionService.resolveExtractionRun(rId);
        count += summary.resolved_existing + summary.new_candidates + summary.possible_duplicates;
      }
      return count;
    },
    onSuccess: (count) => {
      void queryClient.invalidateQueries({ queryKey: ["knowledge-proposals"] });
      void queryClient.invalidateQueries({ queryKey: ["knowledge-resolution-results"] });
      toast.success(`Entity resolution complete for ${count} candidates.`, {
        description: "Search before create enforced: canonical brain unmodified.",
      });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Manual Resolution Override Mutation
  const manualResolutionMutation = useMutation({
    mutationFn: async (params: {
      proposalId: string;
      action: "USE_EXISTING" | "TREAT_AS_NEW" | "MARK_AMBIGUOUS" | "REJECT";
      canonicalNodeId?: string | null | undefined;
    }) => {
      const resolutionService = new KnowledgeResolutionService(supabase);
      await resolutionService.recordManualResolution(params);
    },
    onSuccess: (_, vars) => {
      void queryClient.invalidateQueries({ queryKey: ["knowledge-proposals"] });
      void queryClient.invalidateQueries({ queryKey: ["knowledge-resolution-results"] });
      toast.success(`Resolution override recorded (${vars.action}). Canonical brain untouched.`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Approve Mutation (Approved for Resolution; NOT canonical commit)
  const approveMutation = useMutation({
    mutationFn: async (proposalId: string) => {
      await KnowledgeExtractionService.updateProposalStatus(proposalId, "approved");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["knowledge-proposals"] });
      toast.success("Proposal approved for Phase 6 resolution.", {
        description: "Candidate will be processed through entity resolution and duplicate search.",
      });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Reject Mutation
  const rejectMutation = useMutation({
    mutationFn: async () => {
      if (!rejectProposalId) return;
      await KnowledgeExtractionService.updateProposalStatus(rejectProposalId, "rejected", rejectionReason);
    },
    onSuccess: () => {
      setRejectDialogOpen(false);
      setRejectProposalId(null);
      setRejectionReason("");
      void queryClient.invalidateQueries({ queryKey: ["knowledge-proposals"] });
      toast.success("Proposal rejected and archived in audit history.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Edit Mutation
  const editMutation = useMutation({
    mutationFn: async () => {
      if (!editingProposal) return;
      const currentPayload = { ...editingProposal.payload };

      if (editingProposal.proposal_type === "CLAIM") {
        currentPayload["statement"] = editedTitleOrStatement;
      } else if (editingProposal.proposal_type === "ENTITY") {
        currentPayload["name"] = editedTitleOrStatement;
        currentPayload["description"] = editedDescription;
      } else if (editingProposal.proposal_type === "RELATION") {
        currentPayload["description"] = editedDescription;
      }

      await KnowledgeExtractionService.editProposalPayload(editingProposal.id, currentPayload);
    },
    onSuccess: () => {
      setEditDialogOpen(false);
      setEditingProposal(null);
      void queryClient.invalidateQueries({ queryKey: ["knowledge-proposals"] });
      toast.success("Proposal updated. Original AI payload preserved for auditing.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Phase 7: Top-level Navigation Mode
  const [mainView, setMainView] = useState<"candidates" | "plans" | "quarantine">("candidates");
  const [committedSummary, setCommittedSummary] = useState<any>(null);
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  // Fetch Knowledge Plans (Phase 7)
  const { data: plans = [], isLoading: loadingPlans } = useQuery({
    queryKey: ["knowledge-plans"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_plans")
        .select("*, knowledge_operations(*)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Generate Plan Mutation
  const generatePlanMutation = useMutation({
    mutationFn: async () => {
      const engine = new KnowledgeEngine(supabase);
      const runIds = Array.from(
        new Set(proposals.map((p) => p.extraction_run_id).filter(Boolean)),
      ) as string[];
      if (runIds.length === 0) {
        throw new Error("No extraction runs found to generate a plan from.");
      }
      const results = [];
      for (const rId of runIds) {
        const plan = await engine.planExtractionRun(rId);
        results.push(plan);
      }
      return results;
    },
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ["knowledge-plans"] });
      setMainView("plans");
      toast.success(`Generated ${created.length} Knowledge Plan(s)!`, {
        description: "Inspect the Knowledge Diff and approve for controlled commit.",
      });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Approve & Commit Plan Mutation
  const approveAndCommitPlanMutation = useMutation({
    mutationFn: async (planId: string) => {
      const engine = new KnowledgeEngine(supabase);
      await engine.approvePlan(planId);
      return await engine.commitPlan(planId);
    },
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ["knowledge-plans"] });
      void queryClient.invalidateQueries({ queryKey: ["knowledge-transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["operations"] });
      void queryClient.invalidateQueries({ queryKey: ["canonical-nodes-lookup"] });
      void queryClient.invalidateQueries({ queryKey: ["knowledge-proposals"] });
      setCommittedSummary(res.summary);
      setSummaryModalOpen(true);
      toast.success("Knowledge Plan committed to Canonical Brain!");
    },
    onError: (err: Error) => toast.error(`Commit error: ${err.message}`),
  });

  // Reject Plan Mutation
  const rejectPlanMutation = useMutation({
    mutationFn: async (planId: string) => {
      const engine = new KnowledgeEngine(supabase);
      await engine.rejectPlan(planId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["knowledge-plans"] });
      toast.info("Knowledge Plan rejected.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Quarantine Plan Mutation
  const quarantinePlanMutation = useMutation({
    mutationFn: async (planId: string) => {
      const engine = new KnowledgeEngine(supabase);
      await engine.quarantinePlan(planId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["knowledge-plans"] });
      toast.warning("Knowledge Plan quarantined for safety.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Resolution Metric Counts
  const resolutionList = Object.values(resolutionResults) as any[];
  const existingCount = resolutionList.filter((r) => r.status === "EXISTING").length;
  const newCount = resolutionList.filter((r) => r.status === "NEW").length;
  const reviewNeededCount = resolutionList.filter(
    (r) => r.status === "POSSIBLE_DUPLICATE" || r.status === "AMBIGUOUS",
  ).length;

  return (
    <AppShell
      title="Knowledge Proposals & Controlled Learning"
      description="Review candidates, inspect Before vs After diffs, and execute controlled commits."
    >
      <div className="space-y-6">
        {/* Top-level Phase 5 / 6 / 7 Mode Selector */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div className="flex items-center gap-1.5">
            <Button
              variant={mainView === "candidates" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setMainView("candidates")}
              className="gap-2 text-xs font-semibold"
            >
              <Sparkles className="size-3.5 text-primary" />
              <span>Candidates & Resolution</span>
              <Badge variant="outline" className="text-[10px] font-mono">
                {proposals.length}
              </Badge>
            </Button>

            <Button
              variant={mainView === "plans" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setMainView("plans")}
              className="gap-2 text-xs font-semibold"
            >
              <GitCompare className="size-3.5 text-purple-400" />
              <span>Knowledge Plans & Diff (Phase 7)</span>
              <Badge variant="outline" className="text-[10px] font-mono">
                {plans.length}
              </Badge>
              {plans.some((p: any) => p.status === "needs_review") && (
                <span className="size-2 rounded-full bg-amber-500 animate-pulse" />
              )}
            </Button>

            <Button
              variant={mainView === "quarantine" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setMainView("quarantine")}
              className="gap-2 text-xs font-semibold"
            >
              <AlertTriangle className="size-3.5 text-rose-400" />
              <span>Quarantine</span>
              <Badge variant="outline" className="text-[10px] font-mono">
                {proposals.filter((p) => p.status === "quarantined").length}
              </Badge>
            </Button>
          </div>

          {mainView === "plans" && (
            <Button
              size="sm"
              onClick={() => generatePlanMutation.mutate()}
              disabled={generatePlanMutation.isPending || proposals.length === 0}
              className="gap-1.5 text-xs"
            >
              <Sparkles className="size-3.5" />
              {generatePlanMutation.isPending ? "Generating Plan…" : "Generate Plan from Resolved Candidates"}
            </Button>
          )}
        </div>

        {/* VIEW 1: CANDIDATES & RESOLUTION (PHASES 5-6) */}
        {mainView === "candidates" && (
          <div className="space-y-6">
            {/* Metric Cards Banner */}
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-border bg-card p-4">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Total Proposals
                </span>
                <div className="mt-1 flex items-baseline justify-between">
                  <span className="text-2xl font-bold font-mono">{proposals.length}</span>
                  <Sparkles className="size-4 text-primary" />
                </div>
              </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Resolved Existing (Reused)
            </span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-2xl font-bold font-mono text-emerald-500">{existingCount}</span>
              <CheckCheck className="size-4 text-emerald-500" />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              New Candidates
            </span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-2xl font-bold font-mono text-blue-500">{newCount}</span>
              <Layers className="size-4 text-blue-500" />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Duplicates / Review
            </span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-2xl font-bold font-mono text-amber-500">{reviewNeededCount}</span>
              <AlertTriangle className="size-4 text-amber-500" />
            </div>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card/60 p-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Status Tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: "all", label: "All" },
              { id: "pending", label: "Pending" },
              { id: "approved", label: "Approved" },
              { id: "rejected", label: "Rejected" },
            ].map((tab) => (
              <Button
                key={tab.id}
                variant={statusFilter === tab.id ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setStatusFilter(tab.id as ProposalStatus | "all")}
                className="h-8 text-xs font-medium"
              >
                {tab.label}
              </Button>
            ))}
          </div>

          {/* Action & Search */}
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="default"
              onClick={() => batchResolveMutation.mutate()}
              disabled={batchResolveMutation.isPending || proposals.length === 0}
              className="h-8 text-xs gap-1.5 font-medium"
            >
              <GitCompare className="size-3.5" />
              {batchResolveMutation.isPending ? "Resolving…" : "Run Resolution Engine"}
            </Button>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as ProposalType | "all")}
              className="h-8 rounded-lg border border-border bg-background px-2.5 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="all">All Proposal Types</option>
              <option value="ENTITY">Entities & Concepts</option>
              <option value="CLAIM">Atomic Claims</option>
              <option value="RELATION">Graph Relations</option>
              <option value="HIERARCHY">Hierarchy Suggestions</option>
              <option value="SOURCE">Sources & Citations</option>
              <option value="CONFLICT">Contradictions</option>
              <option value="OPEN_QUESTION">Open Questions</option>
            </select>

            <div className="relative w-48 sm:w-60">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search candidates…"
                className="h-8 pl-8 text-xs bg-background"
              />
            </div>
          </div>
        </div>

        {/* Proposals List */}
        {isLoading ? (
          <div className="flex h-48 items-center justify-center">
            <Sparkles className="size-6 animate-pulse text-primary" />
          </div>
        ) : proposals.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="No knowledge proposals found"
            description="Proposals are created when you analyze conversation episodes in the AI Chat. They represent candidates awaiting Phase 6 resolution."
          />
        ) : (
          <div className="grid gap-4">
            {proposals.map((proposal) => (
              <ProposalCard
                key={proposal.id}
                proposal={proposal}
                resolution={resolutionResults[proposal.id]}
                canonicalNodes={canonicalNodes}
                onManualResolve={(action, cId) =>
                  manualResolutionMutation.mutate({
                    proposalId: proposal.id,
                    action,
                    canonicalNodeId: cId ?? null,
                  })
                }
                onApprove={() => approveMutation.mutate(proposal.id)}
                onReject={() => {
                  setRejectProposalId(proposal.id);
                  setRejectionReason("");
                  setRejectDialogOpen(true);
                }}
                onEdit={() => {
                  setEditingProposal(proposal);
                  const payload = proposal.payload;
                  if (proposal.proposal_type === "CLAIM") {
                    setEditedTitleOrStatement(String(payload["statement"] ?? ""));
                    setEditedDescription("");
                  } else if (proposal.proposal_type === "ENTITY") {
                    setEditedTitleOrStatement(String(payload["name"] ?? ""));
                    setEditedDescription(String(payload["description"] ?? ""));
                  } else {
                    setEditedTitleOrStatement("");
                    setEditedDescription(String(payload["description"] ?? ""));
                  }
                  setEditDialogOpen(true);
                }}
              />
            ))}
          </div>
        )}
      </div>
    )}

    {/* VIEW 2: KNOWLEDGE PLANS & DIFF (PHASE 7 REVIEW QUEUE) */}
    {mainView === "plans" && (
      <div className="space-y-4">
        {plans.length === 0 ? (
          <EmptyState
            icon={GitCompare}
            title="No Knowledge Plans Yet"
            description="Click 'Generate Plan from Resolved Candidates' to create an inspectable Knowledge Plan with Before vs After diffs and controlled commit."
          />
        ) : (
          <div className="space-y-4">
            {plans.map((plan: any) => {
              const summary = plan.summary as any;
              const isCommitted = plan.status === "committed";
              const isNeedsReview = plan.status === "needs_review";
              const isExpanded = selectedPlanId === plan.id;
              const operations = (plan.knowledge_operations || []) as any[];

              return (
                <div key={plan.id} className="rounded-xl border border-border bg-card p-4 space-y-4">
                  {/* Plan Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-foreground">
                          Plan #{plan.id.slice(0, 10)}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-mono",
                            plan.status === "committed" && "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
                            plan.status === "needs_review" && "border-amber-500/40 bg-amber-500/10 text-amber-400",
                            plan.status === "ready" && "border-blue-500/40 bg-blue-500/10 text-blue-400",
                            plan.status === "quarantined" && "border-rose-500/40 bg-rose-500/10 text-rose-400",
                          )}
                        >
                          {plan.status.toUpperCase()}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] font-mono text-muted-foreground">
                          MODE: {plan.learning_mode.toUpperCase()}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-mono",
                            plan.risk_level === "LOW" && "border-emerald-500/30 text-emerald-400",
                            plan.risk_level === "MEDIUM" && "border-amber-500/30 text-amber-400",
                            plan.risk_level === "HIGH" && "border-rose-500/30 text-rose-400",
                          )}
                        >
                          {plan.risk_level} RISK
                        </Badge>
                      </div>
                      <span className="text-[11px] text-muted-foreground font-mono">
                        Confidence: {Math.round(plan.overall_confidence * 100)}% • Version {plan.plan_version} • {operations.length} operations
                      </span>
                    </div>

                    {/* Plan Actions */}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedPlanId(isExpanded ? null : plan.id)}
                        className="h-8 text-xs text-muted-foreground"
                      >
                        {isExpanded ? "Hide Diff" : "Inspect Diff"}
                      </Button>

                      {!isCommitted && plan.status !== "quarantined" && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => quarantinePlanMutation.mutate(plan.id)}
                            disabled={quarantinePlanMutation.isPending}
                            className="h-8 text-xs text-amber-500 border-amber-500/30 hover:bg-amber-500/10"
                          >
                            Quarantine
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => rejectPlanMutation.mutate(plan.id)}
                            disabled={rejectPlanMutation.isPending}
                            className="h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                          >
                            Reject
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => approveAndCommitPlanMutation.mutate(plan.id)}
                            disabled={approveAndCommitPlanMutation.isPending}
                            className="h-8 text-xs gap-1.5"
                          >
                            <CheckCircle2 className="size-3.5" />
                            {approveAndCommitPlanMutation.isPending ? "Committing…" : "Approve & Commit"}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Summary Chips */}
                  {summary && (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {summary.reused_nodes > 0 && (
                        <span className="inline-flex items-center gap-1 rounded bg-blue-500/10 px-2 py-0.5 text-[11px] text-blue-400 border border-blue-500/20">
                          <Brain className="size-3" /> Reused {summary.reused_nodes}
                        </span>
                      )}
                      {summary.created_nodes > 0 && (
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-400 border border-emerald-500/20">
                          <Layers className="size-3" /> +{summary.created_nodes} nodes
                        </span>
                      )}
                      {summary.created_relations > 0 && (
                        <span className="inline-flex items-center gap-1 rounded bg-purple-500/10 px-2 py-0.5 text-[11px] text-purple-400 border border-purple-500/20">
                          <GitCompare className="size-3" /> +{summary.created_relations} relations
                        </span>
                      )}
                      {summary.added_claims > 0 && (
                        <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-400 border border-amber-500/20">
                          <Sparkles className="size-3" /> +{summary.added_claims} claims
                        </span>
                      )}
                      {summary.no_ops > 0 && (
                        <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          <ShieldCheck className="size-3" /> {summary.no_ops} skipped (no-op)
                        </span>
                      )}
                    </div>
                  )}

                  {/* Knowledge Diff Viewer */}
                  {(isExpanded || isNeedsReview) && (
                    <KnowledgeDiffViewer
                      diff={plan.diff_summary}
                      operations={operations}
                      riskLevel={plan.risk_level}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    )}

    {/* VIEW 3: QUARANTINED KNOWLEDGE */}
    {mainView === "quarantine" && (
      <div className="space-y-4">
        {proposals.filter((p) => p.status === "quarantined").length === 0 ? (
          <EmptyState
            icon={AlertTriangle}
            title="Quarantine Clean"
            description="No unverified claims, conflicting knowledge, or weak-provenance items currently quarantined."
          />
        ) : (
          <div className="grid gap-4">
            {proposals
              .filter((p) => p.status === "quarantined")
              .map((p) => (
                <div key={p.id} className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="border-rose-500/40 text-rose-400 text-xs font-mono">
                      QUARANTINED {p.proposal_type}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      ID: {p.id.slice(0, 8)}…
                    </span>
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    {String(p.payload["statement"] || p.payload["name"] || "Unspecified candidate")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Quarantined to protect canonical Brain integrity: pending external evidence or conflict review.
                  </p>
                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => approveMutation.mutate(p.id)}
                      className="h-7 text-xs"
                    >
                      Verify & Move to Candidates
                    </Button>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    )}

    <BrainUpdateSummaryModal
      open={summaryModalOpen}
      onOpenChange={setSummaryModalOpen}
      summary={committedSummary}
    />
  </div>

      {/* Reject Confirmation Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject Knowledge Proposal</DialogTitle>
            <DialogDescription>
              This candidate will be archived as rejected. Rejection reasons are retained to audit extraction accuracy.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <span className="text-xs font-semibold text-muted-foreground">Rejection Reason (Optional):</span>
            <Textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g. Inaccurate definition, duplicate phrasing, out of scope…"
              rows={3}
              className="text-xs"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => rejectMutation.mutate()}
              disabled={rejectMutation.isPending}
            >
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Proposal Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Knowledge Proposal</DialogTitle>
            <DialogDescription>
              Correct candidate information. The original AI output will be preserved for auditing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {editingProposal?.proposal_type === "CLAIM" ? (
              <div className="space-y-1">
                <span className="text-xs font-semibold text-muted-foreground">Claim Statement:</span>
                <Textarea
                  value={editedTitleOrStatement}
                  onChange={(e) => setEditedTitleOrStatement(e.target.value)}
                  rows={3}
                  className="text-xs"
                />
              </div>
            ) : editingProposal?.proposal_type === "ENTITY" ? (
              <>
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-muted-foreground">Entity Name:</span>
                  <Input
                    value={editedTitleOrStatement}
                    onChange={(e) => setEditedTitleOrStatement(e.target.value)}
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-muted-foreground">Description:</span>
                  <Textarea
                    value={editedDescription}
                    onChange={(e) => setEditedDescription(e.target.value)}
                    rows={2}
                    className="text-xs"
                  />
                </div>
              </>
            ) : (
              <div className="space-y-1">
                <span className="text-xs font-semibold text-muted-foreground">Description:</span>
                <Textarea
                  value={editedDescription}
                  onChange={(e) => setEditedDescription(e.target.value)}
                  rows={2}
                  className="text-xs"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => editMutation.mutate()}
              disabled={editMutation.isPending || !editedTitleOrStatement.trim()}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

// ---------------------------------------------------------------------
// PROPOSAL CARD COMPONENT
// ---------------------------------------------------------------------

interface ResolutionCandidateData {
  id: string;
  candidate_node_id: string;
  rank: number;
  exact_score: number;
  alias_score: number;
  text_score: number;
  semantic_score: number;
  type_score: number;
  hierarchy_score: number;
  graph_score: number;
  combined_score: number;
  signals?: Record<string, unknown> | null;
}

interface ResolutionResultData {
  id: string;
  proposal_id: string;
  status: string;
  canonical_node_id: string | null;
  resolution_confidence: number;
  extraction_confidence: number | null;
  match_type: string;
  reason_summary: string | null;
  manual_override: boolean;
  knowledge_resolution_candidates?: ResolutionCandidateData[];
}

function ProposalCard({
  proposal,
  resolution,
  canonicalNodes,
  onManualResolve,
  onApprove,
  onReject,
  onEdit,
}: {
  proposal: KnowledgeProposalItem;
  resolution?: ResolutionResultData;
  canonicalNodes?: Array<{ id: string; name: string; slug: string; node_type: string }>;
  onManualResolve?: (action: "USE_EXISTING" | "TREAT_AS_NEW" | "MARK_AMBIGUOUS", candidateNodeId?: string) => void;
  onApprove: () => void;
  onReject: () => void;
  onEdit: () => void;
}) {
  const payload = proposal.payload;
  const isPending = proposal.status === "pending";
  const isApproved = proposal.status === "approved";
  const isRejected = proposal.status === "rejected";
  const confidencePct = proposal.extraction_confidence != null ? Math.round(proposal.extraction_confidence * 100) : 85;

  const getTypeIcon = (type: ProposalType) => {
    switch (type) {
      case "ENTITY":
      case "CONCEPT":
      case "TOPIC":
        return Brain;
      case "CLAIM":
        return Quote;
      case "RELATION":
        return Network;
      case "HIERARCHY":
        return FolderTree;
      case "SOURCE":
      case "EVIDENCE":
        return BookOpen;
      case "CONFLICT":
        return AlertTriangle;
      case "OPEN_QUESTION":
        return HelpCircle;
      default:
        return Sparkles;
    }
  };

  const TypeIcon = getTypeIcon(proposal.proposal_type);

  return (
    <div className="group rounded-xl border border-border bg-card p-4 sm:p-5 shadow-xs transition-all hover:border-primary/40">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <TypeIcon className="size-3.5" />
          </div>
          <Badge variant="secondary" className="font-mono text-[10px] uppercase tracking-wider">
            {proposal.proposal_type}
          </Badge>
          <span className="text-xs text-muted-foreground">•</span>
          <span className="text-[11px] font-mono text-muted-foreground">
            Confidence: <span className="font-semibold text-foreground">{confidencePct}%</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              "text-[10px] font-medium capitalize",
              isPending && "border-amber-500/30 text-amber-500 bg-amber-500/5",
              isApproved && "border-emerald-500/30 text-emerald-500 bg-emerald-500/5",
              isRejected && "border-destructive/30 text-destructive bg-destructive/5",
            )}
          >
            {isApproved ? "Approved for Resolution" : proposal.status}
          </Badge>
          <span className="text-[10px] font-mono text-muted-foreground">
            {new Date(proposal.created_at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
      </div>

      {/* Main Content Body */}
      <div className="py-3">
        {proposal.proposal_type === "ENTITY" && (
          <div className="space-y-2">
            <div className="flex items-baseline gap-2">
              <h3 className="font-semibold text-base text-foreground">
                {String(payload["name"] ?? "Unnamed Entity")}
              </h3>
              <Badge variant="outline" className="font-mono text-[10px] uppercase">
                {String(payload["entity_type"] ?? "concept")}
              </Badge>
            </div>
            {payload["description"] ? (
              <p className="text-xs text-muted-foreground leading-relaxed">
                {String(payload["description"])}
              </p>
            ) : null}
            {Array.isArray(payload["aliases"]) && payload["aliases"].length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px]">
                <span className="text-muted-foreground font-medium">Aliases:</span>
                {payload["aliases"].map((a, i) => (
                  <Badge key={i} variant="secondary" className="text-[10px] py-0 px-1 font-normal">
                    {String(a)}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        {proposal.proposal_type === "CLAIM" && (
          <div className="space-y-2">
            <p className="font-medium text-sm text-foreground leading-relaxed">
              "{String(payload["statement"] ?? "")}"
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-muted-foreground">
              <Badge variant="outline" className="text-[10px] font-mono uppercase">
                {String(payload["claim_type"] ?? "fact")}
              </Badge>
              <Badge variant="secondary" className="text-[10px]">
                {String(payload["knowledge_state"] ?? "PROBABLE")}
              </Badge>
              {Boolean(payload["requires_verification"]) && (
                <span className="text-amber-500 text-[10px] flex items-center gap-1">
                  <AlertTriangle className="size-3" /> Requires verification
                </span>
              )}
            </div>
          </div>
        )}

        {proposal.proposal_type === "RELATION" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <span className="text-primary">{String(payload["source_entity_ref"] ?? "Source")}</span>
              <Badge variant="secondary" className="font-mono text-[11px]">
                --({String(payload["relation_type"] ?? "related_to")})--&gt;
              </Badge>
              <span className="text-primary">{String(payload["target_entity_ref"] ?? "Target")}</span>
            </div>
            {payload["description"] ? (
              <p className="text-xs text-muted-foreground">{String(payload["description"])}</p>
            ) : null}
          </div>
        )}

        {proposal.proposal_type === "HIERARCHY" && (
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Suggested Taxonomy Path:
            </span>
            <div className="flex flex-wrap items-center gap-1 text-xs font-mono text-foreground">
              {(Array.isArray(payload["path"]) ? payload["path"] : [String(payload["category"] ?? "")]).map(
                (step, i, arr) => (
                  <span key={i} className="flex items-center gap-1">
                    <span className="rounded bg-muted px-1.5 py-0.5">{String(step)}</span>
                    {i < arr.length - 1 && <span className="text-muted-foreground">&gt;</span>}
                  </span>
                ),
              )}
            </div>
          </div>
        )}

        {proposal.proposal_type === "SOURCE" && (
          <div className="space-y-1 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-foreground text-sm">{String(payload["title"] ?? "")}</span>
              {Boolean(payload["url"]) && (
                <a
                  href={String(payload["url"])}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary flex items-center gap-1 hover:underline"
                >
                  <ExternalLink className="size-3" />
                  <span>Visit URL</span>
                </a>
              )}
            </div>
            {payload["description"] ? (
              <p className="text-muted-foreground">{String(payload["description"])}</p>
            ) : null}
          </div>
        )}

        {proposal.proposal_type === "CONFLICT" && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2 text-xs">
            <div className="flex items-center gap-1.5 text-destructive font-semibold">
              <AlertTriangle className="size-3.5" />
              <span>Contradiction Candidate</span>
            </div>
            <div className="grid gap-1 pl-4 border-l-2 border-destructive/40 text-muted-foreground">
              <p><strong className="text-foreground">Claim A:</strong> "{String(payload["statement_a"] ?? "")}"</p>
              <p><strong className="text-foreground">Claim B:</strong> "{String(payload["statement_b"] ?? "")}"</p>
            </div>
            {payload["explanation"] ? (
              <p className="text-[11px] text-muted-foreground">{String(payload["explanation"])}</p>
            ) : null}
          </div>
        )}

        {proposal.proposal_type === "OPEN_QUESTION" && (
          <div className="space-y-1 text-xs">
            <p className="font-medium text-foreground">
              Q: {String(payload["question"] ?? "")}
            </p>
            {payload["context"] ? (
              <p className="text-muted-foreground text-[11px]">{String(payload["context"])}</p>
            ) : null}
          </div>
        )}

        {/* Audit info if rejected or edited */}
        {proposal.rejection_reason && (
          <div className="mt-2 rounded bg-destructive/10 px-2.5 py-1 text-[11px] text-destructive">
            <strong>Rejection reason:</strong> {proposal.rejection_reason}
          </div>
        )}

        {proposal.original_payload && (
          <div className="mt-2 rounded bg-muted/40 px-2.5 py-1 text-[10px] text-muted-foreground font-mono">
            Edited by user • Original extraction preserved in audit logs
          </div>
        )}

        {/* Phase 6 Resolution Analysis Block */}
        {resolution ? (
          <div className="mt-3 rounded-lg border border-border/80 bg-card/60 p-3 space-y-2.5 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider flex items-center gap-1">
                  <GitCompare className="size-3 text-primary" /> Entity Resolution:
                </span>
                {resolution.status === "EXISTING" ? (
                  <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 gap-1 text-[11px]">
                    <CheckCheck className="size-3" /> Existing Canonical Match
                  </Badge>
                ) : resolution.status === "POSSIBLE_DUPLICATE" ? (
                  <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 gap-1 text-[11px]">
                    <AlertTriangle className="size-3" /> Possible Duplicate (Needs Review)
                  </Badge>
                ) : resolution.status === "AMBIGUOUS" ? (
                  <Badge className="bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30 gap-1 text-[11px]">
                    <Compass className="size-3" /> Ambiguous Identity
                  </Badge>
                ) : resolution.status === "NEW" ? (
                  <Badge className="bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30 gap-1 text-[11px]">
                    <Sparkles className="size-3" /> Genuinely New Entity
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[11px]">
                    Unresolved
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-mono">
                <span>Signal: <strong className="text-foreground">{resolution.match_type}</strong></span>
                <span>•</span>
                <span>Resolution Conf: <strong className="text-foreground">{Math.round(resolution.resolution_confidence * 100)}%</strong></span>
              </div>
            </div>

            {resolution.reason_summary && (
              <p className="text-[11px] text-muted-foreground">
                {resolution.reason_summary}
              </p>
            )}

            {/* Candidate Rankings */}
            {resolution.knowledge_resolution_candidates && resolution.knowledge_resolution_candidates.length > 0 && (
              <div className="pt-2 border-t border-border/40 space-y-2">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Ranked Canonical Candidates:
                </span>
                <div className="space-y-1.5">
                  {resolution.knowledge_resolution_candidates.slice(0, 3).map((cand) => {
                    const matchedNode = canonicalNodes?.find((n) => n.id === cand.candidate_node_id);
                    const candName = matchedNode?.name || `Node ${cand.candidate_node_id.slice(0, 8)}`;
                    return (
                      <div
                        key={cand.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 rounded-md border border-border/50 bg-background/60 text-xs"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 font-medium">
                            <span className="text-muted-foreground font-mono">#{cand.rank}</span>
                            <span className="text-foreground font-semibold">{candName}</span>
                            <Badge variant="outline" className="text-[9px] py-0 px-1 font-mono uppercase">
                              {matchedNode?.node_type || "node"}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground font-mono">
                            <span>Score: <strong>{Math.round(cand.combined_score * 100)}%</strong></span>
                            {cand.exact_score > 0 && <span className="text-emerald-500">Exact: 100%</span>}
                            {cand.alias_score > 0 && <span className="text-blue-500">Alias: {Math.round(cand.alias_score * 100)}%</span>}
                            {cand.semantic_score > 0 && <span>Semantic: {Math.round(cand.semantic_score * 100)}%</span>}
                            {cand.graph_score > 0 && <span className="text-purple-500">Graph: {Math.round(cand.graph_score * 100)}%</span>}
                          </div>
                        </div>

                        {onManualResolve && (
                          <div className="flex items-center gap-1.5">
                            <Button
                              size="sm"
                              variant="secondary"
                              className="h-6 text-[11px] px-2"
                              onClick={() => onManualResolve("USE_EXISTING", cand.candidate_node_id)}
                            >
                              Use Existing
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 text-[11px] px-2 text-muted-foreground"
                              onClick={() => onManualResolve("TREAT_AS_NEW")}
                            >
                              Treat as New
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-between border-t border-border/50 pt-3 text-xs">
        <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[200px] sm:max-w-xs">
          Ref: {proposal.id.slice(0, 8)}… • Model: {proposal.model ?? "extractor"}
        </span>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onEdit} className="h-7 text-xs gap-1">
            <Edit3 className="size-3" /> Edit
          </Button>

          {!isRejected && (
            <Button
              variant="outline"
              size="sm"
              onClick={onReject}
              className="h-7 text-xs gap-1 border-destructive/40 text-destructive hover:bg-destructive/10"
            >
              <XCircle className="size-3" /> Reject
            </Button>
          )}

          {!isApproved && (
            <Button size="sm" onClick={onApprove} className="h-7 text-xs gap-1">
              <CheckCircle2 className="size-3" /> Approve for Resolution
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

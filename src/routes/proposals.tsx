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
} from "lucide-react";
import { toast } from "sonner";
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
  type KnowledgeProposalItem,
  type ProposalStatus,
  type ProposalType,
} from "@/lib/ai";

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

  // Counts
  const pendingCount = proposals.filter((p) => p.status === "pending").length;
  const approvedCount = proposals.filter((p) => p.status === "approved").length;
  const rejectedCount = proposals.filter((p) => p.status === "rejected").length;

  return (
    <AppShell
      title="Knowledge Proposals"
      description="Candidate entities, atomic claims, and relations extracted from conversations awaiting Phase 6 resolution."
    >
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
              Pending Review
            </span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-2xl font-bold font-mono text-amber-500">{pendingCount}</span>
              <Clock className="size-4 text-amber-500" />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Approved for Resolution
            </span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-2xl font-bold font-mono text-emerald-500">{approvedCount}</span>
              <CheckCircle2 className="size-4 text-emerald-500" />
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Rejected
            </span>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-2xl font-bold font-mono text-muted-foreground">{rejectedCount}</span>
              <XCircle className="size-4 text-muted-foreground" />
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

          {/* Type Filter & Search */}
          <div className="flex items-center gap-2">
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

function ProposalCard({
  proposal,
  onApprove,
  onReject,
  onEdit,
}: {
  proposal: KnowledgeProposalItem;
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

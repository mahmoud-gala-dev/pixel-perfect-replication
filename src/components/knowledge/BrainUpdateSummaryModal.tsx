// =====================================================================
// KNOWLEDGE BRAIN — PHASE 7: BRAIN UPDATE SUMMARY MODAL / CARD
// Displays clear, inspectable summary when a learning transaction commits
// =====================================================================

import { CheckCircle2, Sparkles, Brain, ArrowRight, GitCommit, Layers, ShieldCheck } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { KnowledgePlanSummary, KnowledgeTransaction } from "@/lib/ai/learning/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transaction?: KnowledgeTransaction | null;
  summary?: KnowledgePlanSummary | null;
  onViewActivity?: () => void;
}

export function BrainUpdateSummaryModal({
  open,
  onOpenChange,
  transaction,
  summary = transaction?.summary,
  onViewActivity,
}: Props) {
  if (!summary) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle2 className="size-5" />
            <DialogTitle>Brain Updated Successfully</DialogTitle>
          </div>
          <DialogDescription>
            Controlled automatic learning executed through Knowledge Engine.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Transaction Metadata */}
          {transaction && (
            <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-mono text-muted-foreground">
                <GitCommit className="size-3.5 text-primary" />
                <span>Tx #{transaction.id.slice(0, 10)}</span>
              </div>
              <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[10px]">
                {transaction.status.toUpperCase()}
              </Badge>
            </div>
          )}

          {/* Granular Breakdown */}
          <div className="divide-y divide-border/60 rounded-lg border border-border bg-card">
            {/* Reused Nodes */}
            <div className="flex items-center justify-between p-3 text-xs">
              <div className="flex items-center gap-2">
                <Brain className="size-4 text-blue-400" />
                <span className="font-medium text-foreground">Reused Canonical Nodes</span>
              </div>
              <Badge variant="secondary" className="font-mono text-xs">
                {summary.reused_nodes}
              </Badge>
            </div>

            {/* Created Nodes */}
            <div className="flex items-center justify-between p-3 text-xs">
              <div className="flex items-center gap-2">
                <Layers className="size-4 text-emerald-400" />
                <span className="font-medium text-foreground">Created New Concepts</span>
              </div>
              <Badge variant="secondary" className="font-mono text-xs text-emerald-400">
                +{summary.created_nodes}
              </Badge>
            </div>

            {/* Created Relations */}
            <div className="flex items-center justify-between p-3 text-xs">
              <div className="flex items-center gap-2">
                <GitCommit className="size-4 text-purple-400" />
                <span className="font-medium text-foreground">Created Graph Relations</span>
              </div>
              <Badge variant="secondary" className="font-mono text-xs text-purple-400">
                +{summary.created_relations}
              </Badge>
            </div>

            {/* Added Claims */}
            <div className="flex items-center justify-between p-3 text-xs">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-amber-400" />
                <span className="font-medium text-foreground">Added Atomic Claims</span>
              </div>
              <Badge variant="secondary" className="font-mono text-xs text-amber-400">
                +{summary.added_claims}
              </Badge>
            </div>

            {/* Skipped No-ops */}
            <div className="flex items-center justify-between p-3 text-xs">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-muted-foreground" />
                <span className="text-muted-foreground">Skipped (Identical Existing)</span>
              </div>
              <span className="font-mono text-xs text-muted-foreground">
                {summary.no_ops}
              </span>
            </div>

            {/* Review Required */}
            {summary.review_required > 0 && (
              <div className="flex items-center justify-between p-3 text-xs bg-amber-500/5">
                <span className="text-amber-400 font-medium">Pending Human Review</span>
                <Badge variant="outline" className="border-amber-500/30 text-amber-400 font-mono text-xs">
                  {summary.review_required}
                </Badge>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {onViewActivity && (
            <Button variant="outline" size="sm" onClick={onViewActivity} className="gap-1.5 text-xs">
              <span>View Brain Activity</span>
              <ArrowRight className="size-3.5" />
            </Button>
          )}
          <Button size="sm" onClick={() => onOpenChange(false)} className="text-xs">
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

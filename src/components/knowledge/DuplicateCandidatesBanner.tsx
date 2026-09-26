// =====================================================================
// KNOWLEDGE BRAIN — DUPLICATE CANDIDATES ALERT & SAFE MERGE COMPONENT
// Surfaced in KnowledgeTree and Graph Route when trigram/alias overlap > 0.82
// =====================================================================

import React, { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  GitMerge,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Sparkles,
  ShieldCheck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  DeduplicationService,
  type DuplicateCandidatePair,
} from "@/lib/ai/resolution/deduplication-service";

export interface DuplicateCandidatesBannerProps {
  candidates: DuplicateCandidatePair[];
  onMerged?: () => void;
  compact?: boolean;
}

export function DuplicateCandidatesBanner({
  candidates,
  onMerged,
  compact = false,
}: DuplicateCandidatesBannerProps) {
  const queryClient = useQueryClient();
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedPair, setSelectedPair] = useState<DuplicateCandidatePair | null>(null);
  const [isMerging, setIsMerging] = useState(false);
  const [dismissedPairs, setDismissedPairs] = useState<Set<string>>(new Set());

  const activeCandidates = candidates.filter((c) => !dismissedPairs.has(c.id));

  if (activeCandidates.length === 0) return null;

  const handleExecuteMerge = async (pair: DuplicateCandidatePair) => {
    setIsMerging(true);
    const mergeToast = toast.loading(
      `Executing Safe Merge: "${pair.absorbedNode.name}" -> "${pair.primaryNode.name}"...`,
    );

    try {
      const result = await DeduplicationService.executeSafeMerge(
        supabase,
        pair.primaryNode.id,
        pair.absorbedNode.id,
      );

      if (result.success) {
        toast.success(
          `Merged "${pair.absorbedNode.name}" into "${pair.primaryNode.name}". Transferred ${result.transferredClaimsCount} claims & created alias.`,
          { id: mergeToast, duration: 6000 },
        );

        setDismissedPairs((prev) => new Set([...prev, pair.id]));
        setSelectedPair(null);
        onMerged?.();

        // Invalidate react query caches
        void queryClient.invalidateQueries({ queryKey: ["knowledge_nodes"] });
        void queryClient.invalidateQueries({ queryKey: ["knowledge_edges"] });
        void queryClient.invalidateQueries({ queryKey: ["knowledge_claims"] });
        void queryClient.invalidateQueries({ queryKey: ["knowledge_aliases"] });
        void queryClient.invalidateQueries({ queryKey: ["graph-neighborhood"] });
      } else {
        toast.error(result.error || "Failed to execute Safe Merge", { id: mergeToast });
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Safe Merge failed", { id: mergeToast });
    } finally {
      setIsMerging(false);
    }
  };

  return (
    <>
      <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-foreground shadow-sm transition-all mb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400">
              <Sparkles className="size-3.5" />
            </span>
            <div>
              <div className="font-semibold flex items-center gap-1.5 text-amber-900 dark:text-amber-300">
                <span>Duplicate Candidates Detected</span>
                <Badge variant="outline" className="text-[10px] bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30 py-0">
                  {activeCandidates.length} pair{activeCandidates.length > 1 ? "s" : ""}
                </Badge>
              </div>
              {!compact && (
                <p className="text-[11px] text-muted-foreground">
                  High trigram similarity or alias overlap detected (&gt;82%). Safe Merge transfers claims and adds search aliases.
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs gap-1"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="size-3.5" /> Collapse
                </>
              ) : (
                <>
                  <ChevronDown className="size-3.5" /> Review ({activeCandidates.length})
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Expanded Candidates List */}
        {isExpanded && (
          <div className="mt-3 space-y-2 pt-2 border-t border-amber-500/20">
            {activeCandidates.map((pair) => (
              <div
                key={pair.id}
                className="rounded-lg border border-border/70 bg-card p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-semibold text-foreground">{pair.primaryNode.name}</span>
                    <ArrowRight className="size-3 text-muted-foreground" />
                    <span className="text-amber-600 dark:text-amber-400 font-medium">
                      {pair.absorbedNode.name}
                    </span>
                    <Badge variant="secondary" className="text-[10px] font-mono">
                      {Math.round(pair.similarity * 100)}% match
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground italic">{pair.reason}</p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDismissedPairs((prev) => new Set([...prev, pair.id]))}
                    className="h-6 text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    Dismiss
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setSelectedPair(pair)}
                    className="h-6 text-[10px] bg-primary hover:bg-primary/90 text-primary-foreground gap-1"
                  >
                    <GitMerge className="size-3" />
                    Safe Merge
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {selectedPair && (
        <Dialog open={Boolean(selectedPair)} onOpenChange={(open) => !open && setSelectedPair(null)}>
          <DialogContent className="max-w-md text-xs">
            <DialogHeader>
              <DialogTitle className="text-sm flex items-center gap-2">
                <GitMerge className="size-4 text-primary" />
                Confirm Intelligent Safe Merge
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Consolidates duplicate canonical nodes while preserving full referential integrity and search capability.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="rounded-lg border border-primary/40 bg-primary/5 p-2.5 space-y-1">
                  <span className="text-[10px] font-semibold uppercase text-primary">
                    Primary Canonical Node
                  </span>
                  <div className="font-bold text-sm text-foreground truncate">
                    {selectedPair.primaryNode.name}
                  </div>
                  <span className="text-[10px] text-muted-foreground">Retained as Canonical</span>
                </div>

                <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5 space-y-1">
                  <span className="text-[10px] font-semibold uppercase text-amber-600 dark:text-amber-400">
                    Absorbed Node
                  </span>
                  <div className="font-bold text-sm text-foreground truncate">
                    {selectedPair.absorbedNode.name}
                  </div>
                  <span className="text-[10px] text-muted-foreground">Archived & Converted to Alias</span>
                </div>
              </div>

              <div className="rounded-lg border border-border/80 bg-muted/30 p-2.5 space-y-1.5 text-[11px]">
                <div className="font-semibold text-foreground flex items-center gap-1.5">
                  <ShieldCheck className="size-3.5 text-emerald-500" />
                  <span>Guaranteed Safe Merge Operations:</span>
                </div>
                <ul className="space-y-1 text-muted-foreground pl-5 list-disc">
                  <li>Transfers all atomic claims and evidence to primary node.</li>
                  <li>Re-points inbound and outbound graph relations without breaking paths.</li>
                  <li>Adds &quot;{selectedPair.absorbedNode.name}&quot; as an alternate search alias.</li>
                  <li>Archives absorbed node instead of hard-deleting (Zero data loss).</li>
                </ul>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={isMerging}
                onClick={() => setSelectedPair(null)}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={isMerging}
                onClick={() => handleExecuteMerge(selectedPair)}
                className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
              >
                {isMerging ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-3.5" />
                )}
                Confirm Safe Merge
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

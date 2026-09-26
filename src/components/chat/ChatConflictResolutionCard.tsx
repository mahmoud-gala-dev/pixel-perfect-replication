// =====================================================================
// KNOWLEDGE BRAIN — IN-CHAT VISUAL CONFLICT RESOLUTION CARD
// Interactive dispute card embedded in Chat messages when conflicting claims occur
// Allows 1-click resolution directly via Knowledge & Conflict Engine
// =====================================================================

import React, { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Scale,
  CheckCircle2,
  XCircle,
  Split,
  ShieldAlert,
  ArrowRight,
  Brain,
  ExternalLink,
  Loader2,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { ConflictEngine } from "@/lib/ai/integrity/conflict-engine";
import type { ConflictResolutionType } from "@/lib/ai/integrity/types";

export interface ConflictingClaimInfo {
  id?: string;
  statement: string;
  confidence?: number;
  source_title?: string;
  source_url?: string;
  node_name?: string;
  created_at?: string;
}

export interface ChatConflictResolutionCardProps {
  conflictId?: string;
  claimA: ConflictingClaimInfo;
  claimB: ConflictingClaimInfo;
  reason?: string;
  onResolved?: (type: ConflictResolutionType) => void;
}

export function ChatConflictResolutionCard({
  conflictId,
  claimA,
  claimB,
  reason,
  onResolved,
}: ChatConflictResolutionCardProps) {
  const queryClient = useQueryClient();
  const [isResolving, setIsResolving] = useState(false);
  const [resolvedType, setResolvedType] = useState<ConflictResolutionType | null>(null);

  const handleResolve = async (type: ConflictResolutionType) => {
    setIsResolving(true);
    const loadingToast = toast.loading("Applying conflict resolution to Knowledge Brain...");

    try {
      const now = new Date().toISOString();
      const conflictEngine = new ConflictEngine(supabase);

      // 1. If we have a registered conflict ID, invoke the ConflictEngine
      if (conflictId) {
        await conflictEngine.resolveConflict(conflictId, type, {
          notes: `Resolved in-chat: ${type}`,
          resolved_by: "user_in_chat",
        });
      }

      // 2. Direct database updates for Claims A & B
      if (type === "ONE_SUPERSEDES_ANOTHER" || type === "B_SUPPORTED") {
        // Claim B becomes the active canonical fact; Claim A is superseded
        if (claimA.id) {
          await (supabase.from("knowledge_claims") as any)
            .update({
              status: "deprecated",
              knowledge_state: "superseded",
              superseded_by: claimB.id || null,
              updated_at: now,
            })
            .eq("id", claimA.id);
        }

        if (claimB.id) {
          await (supabase.from("knowledge_claims") as any)
            .update({
              status: "active",
              verification: "verified",
              knowledge_state: "known",
              updated_at: now,
            })
            .eq("id", claimB.id);
        }

        // Record Audit Operation
        await (supabase.from("knowledge_operations") as any).insert({
          operation_type: "SUPERSEDE_CLAIM",
          status: "executed",
          payload: {
            superseded_claim_id: claimA.id,
            new_claim_id: claimB.id,
            reason: "User accepted new fact in chat visual conflict resolution card",
          },
          created_at: now,
        });

        toast.success("⚡ Approved: New fact verified; previous claim marked superseded.", {
          id: loadingToast,
        });
      } else if (type === "BOTH_VALID_DIFFERENT_CONTEXT") {
        // Preserve both with contextual qualifiers
        if (claimA.id) {
          await (supabase.from("knowledge_claims") as any)
            .update({
              status: "active",
              verification: "verified",
              knowledge_state: "known",
              updated_at: now,
            })
            .eq("id", claimA.id);
        }

        if (claimB.id) {
          await (supabase.from("knowledge_claims") as any)
            .update({
              status: "active",
              verification: "verified",
              knowledge_state: "known",
              updated_at: now,
            })
            .eq("id", claimB.id);
        }

        // Record Audit Operation
        await (supabase.from("knowledge_operations") as any).insert({
          operation_type: "RESOLVE_CONFLICT",
          status: "executed",
          payload: {
            resolution: "BOTH_VALID_DIFFERENT_CONTEXT",
            claim_a_id: claimA.id,
            claim_b_id: claimB.id,
          },
          created_at: now,
        });

        toast.success("✓ Both facts preserved in Knowledge Brain with contextual distinction.", {
          id: loadingToast,
        });
      } else if (type === "A_SUPPORTED") {
        // Discard New Proposal; Preserve Claim A
        if (claimB.id) {
          await (supabase.from("knowledge_claims") as any)
            .update({
              status: "deprecated",
              verification: "disputed",
              knowledge_state: "uncertain",
              updated_at: now,
            })
            .eq("id", claimB.id);
        }

        toast.success("✕ Contradictory proposal discarded; original verified fact retained.", {
          id: loadingToast,
        });
      }

      setResolvedType(type);
      onResolved?.(type);

      // Invalidate React Query caches for immediate UI reactivity
      void queryClient.invalidateQueries({ queryKey: ["knowledge_claims"] });
      void queryClient.invalidateQueries({ queryKey: ["messages"] });
      void queryClient.invalidateQueries({ queryKey: ["brain-stats"] });
      void queryClient.invalidateQueries({ queryKey: ["knowledge_conflicts"] });
    } catch (err: unknown) {
      console.error("[ConflictCard] Resolution failed:", err);
      toast.error(err instanceof Error ? err.message : "Failed to resolve conflict", {
        id: loadingToast,
      });
    } finally {
      setIsResolving(false);
    }
  };

  if (resolvedType) {
    return (
      <div className="my-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between gap-3 animate-in fade-in-50 duration-200">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
          <span className="font-medium">
            {resolvedType === "ONE_SUPERSEDES_ANOTHER" && "Dispute Resolved: Approved new fact & superseded historical claim."}
            {resolvedType === "BOTH_VALID_DIFFERENT_CONTEXT" && "Dispute Resolved: Preserved both claims with contextual qualifiers."}
            {resolvedType === "A_SUPPORTED" && "Dispute Resolved: Discarded contradictory proposal & retained canonical knowledge."}
          </span>
        </div>
        <Badge variant="outline" className="text-[10px] bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 py-0.5">
          Settled
        </Badge>
      </div>
    );
  }

  return (
    <div className="my-3 rounded-xl border border-amber-500/40 bg-card/95 shadow-md overflow-hidden text-xs">
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-amber-500/10 border-b border-amber-500/20">
        <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-semibold">
          <Scale className="size-4 text-amber-500 animate-pulse" />
          <span>Knowledge Dispute Detected / تعارض في المعرفة بحاجة لحسمك</span>
        </div>
        <Badge variant="outline" className="text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30">
          Contradiction
        </Badge>
      </div>

      {reason && (
        <div className="px-3.5 pt-2 text-[11px] text-muted-foreground italic">
          {reason}
        </div>
      )}

      {/* Comparison Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3.5">
        {/* Claim A Card */}
        <div className="rounded-lg border border-border/80 bg-muted/30 p-3 space-y-2 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground mb-1">
              <span className="flex items-center gap-1">
                <Brain className="size-3 text-primary" />
                Claim A (Canonical Record)
              </span>
              <Badge variant="secondary" className="text-[10px] font-mono">
                {Math.round((claimA.confidence ?? 0.9) * 100)}% Conf
              </Badge>
            </div>
            <p className="text-xs text-foreground font-medium leading-relaxed">
              &quot;{claimA.statement}&quot;
            </p>
          </div>

          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground pt-1 border-t border-border/40">
            <span className="font-semibold">Source:</span>
            <span className="truncate">{claimA.source_title || "Canonical Brain Node"}</span>
          </div>
        </div>

        {/* Claim B Card */}
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-2 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-[11px] font-medium text-primary mb-1">
              <span className="flex items-center gap-1 font-semibold">
                <ShieldAlert className="size-3 text-amber-500" />
                Claim B (New Asserted Fact)
              </span>
              <Badge variant="secondary" className="text-[10px] font-mono bg-primary/20 text-primary border-primary/30">
                {Math.round((claimB.confidence ?? 0.95) * 100)}% Conf
              </Badge>
            </div>
            <p className="text-xs text-foreground font-medium leading-relaxed">
              &quot;{claimB.statement}&quot;
            </p>
          </div>

          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground pt-1 border-t border-border/40">
            <span className="font-semibold">Source:</span>
            <span className="truncate">{claimB.source_title || "Current Conversation Episode"}</span>
          </div>
        </div>
      </div>

      {/* 3 One-Click Actions */}
      <div className="px-3.5 pb-3 pt-1 border-t border-border/60 bg-muted/10 flex flex-wrap items-center gap-2 justify-end">
        <Button
          size="sm"
          variant="outline"
          disabled={isResolving}
          onClick={() => handleResolve("A_SUPPORTED")}
          className="h-7 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 border-border/70"
          title="Keep original knowledge and reject new contradictory proposal"
        >
          <XCircle className="size-3.5 mr-1" />
          <span>Discard New Proposal</span>
        </Button>

        <Button
          size="sm"
          variant="outline"
          disabled={isResolving}
          onClick={() => handleResolve("BOTH_VALID_DIFFERENT_CONTEXT")}
          className="h-7 text-xs border-cyan-500/40 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/10"
          title="Keep both facts in Brain qualified by specific versions/contexts"
        >
          <Split className="size-3.5 mr-1 text-cyan-500" />
          <span>Preserve Both (Contextual)</span>
        </Button>

        <Button
          size="sm"
          disabled={isResolving}
          onClick={() => handleResolve("ONE_SUPERSEDES_ANOTHER")}
          className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
          title="Accept the new fact as verified and mark the old claim as superseded"
        >
          {isResolving ? (
            <Loader2 className="size-3.5 animate-spin mr-1" />
          ) : (
            <CheckCircle2 className="size-3.5 mr-1" />
          )}
          <span>Approve New (Supersede Old)</span>
        </Button>
      </div>
    </div>
  );
}

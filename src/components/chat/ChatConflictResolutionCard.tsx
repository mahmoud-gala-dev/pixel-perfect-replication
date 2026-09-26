// =====================================================================
// KNOWLEDGE BRAIN — IN-CHAT VISUAL CONFLICT RESOLUTION CARD
// Interactive dispute card embedded in Chat messages when conflicting claims occur
// Allows 1-click resolution directly via Knowledge & Conflict Engine with Undo
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
  Undo2,
  Calendar,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  stance?: "verified" | "disputed" | "refuted" | "supporting" | "contradicting" | string;
  temporal_qualifier?: string;
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

  // Context qualifier for "Keep Both with Context"
  const [showContextInput, setShowContextInput] = useState(false);
  const [contextQualifier, setContextQualifier] = useState(
    claimB.temporal_qualifier || "Context-specific variation (e.g. Version / Domain)",
  );

  // Undo Handler
  const handleUndo = async (
    priorResolution: ConflictResolutionType,
    previousSnapshots: {
      claimAStatus?: string;
      claimBStatus?: string;
    },
  ) => {
    const undoToast = toast.loading("Undoing conflict resolution...");
    try {
      const now = new Date().toISOString();

      // Revert Claim A
      if (claimA.id) {
        await (supabase.from("knowledge_claims") as any)
          .update({
            status: previousSnapshots.claimAStatus || "active",
            knowledge_state: "known",
            superseded_by: null,
            updated_at: now,
          })
          .eq("id", claimA.id);
      }

      // Revert Claim B
      if (claimB.id) {
        await (supabase.from("knowledge_claims") as any)
          .update({
            status: previousSnapshots.claimBStatus || "deprecated",
            verification: "disputed",
            knowledge_state: "uncertain",
            updated_at: now,
          })
          .eq("id", claimB.id);
      }

      // If registered conflict, reopen it
      if (conflictId) {
        await (supabase.from("knowledge_conflicts") as any)
          .update({
            status: "unresolved",
            resolution_type: null,
            resolved_at: null,
            updated_at: now,
          })
          .eq("id", conflictId);
      }

      // Record Undo in Brain Audit Logs
      await (supabase.from("brain_audit_logs") as any).insert({
        action: "UNDO_CONFLICT_RESOLUTION",
        actor_role: "user",
        target_type: "claim",
        target_id: claimA.id || claimB.id || conflictId,
        result: "SUCCESS",
        metadata: {
          prior_resolution: priorResolution,
          conflict_id: conflictId,
          reason: "User triggered Undo toast in chat",
        },
      });

      setResolvedType(null);
      void queryClient.invalidateQueries({ queryKey: ["knowledge_claims"] });
      void queryClient.invalidateQueries({ queryKey: ["messages"] });
      void queryClient.invalidateQueries({ queryKey: ["knowledge_conflicts"] });

      toast.success("Action undone. Dispute restored for review.", { id: undoToast });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to undo resolution", {
        id: undoToast,
      });
    }
  };

  const handleResolve = async (type: ConflictResolutionType) => {
    setIsResolving(true);
    const loadingToast = toast.loading("Applying conflict resolution to Knowledge Brain...");

    try {
      const now = new Date().toISOString();
      const conflictEngine = new ConflictEngine(supabase);

      const previousSnapshots = {
        claimAStatus: "active",
        claimBStatus: "deprecated",
      };

      // 1. If registered conflict, update via ConflictEngine
      if (conflictId) {
        await conflictEngine.resolveConflict(conflictId, type, {
          notes: `Resolved in-chat: ${type}`,
          resolved_by: "user_in_chat",
        });
      }

      // 2. Action Execution
      if (type === "ONE_SUPERSEDES_ANOTHER" || type === "B_SUPPORTED") {
        // "Supersede Old": Claim B becomes verified canonical; Claim A is superseded
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

        // Audit Log
        await (supabase.from("brain_audit_logs") as any).insert({
          action: "SUPERSEDE_CLAIM",
          actor_role: "user",
          target_type: "claim",
          target_id: claimA.id,
          result: "SUCCESS",
          metadata: {
            superseded_claim_id: claimA.id,
            new_canonical_claim_id: claimB.id,
            reason: "Supersede Old accepted in chat conflict card",
          },
        });

        toast.success("⚡ Approved: New fact verified; historical claim marked superseded.", {
          id: loadingToast,
          duration: 8000,
          action: {
            label: "Undo / تراجع",
            onClick: () => handleUndo(type, previousSnapshots),
          },
        });
      } else if (type === "BOTH_VALID_DIFFERENT_CONTEXT") {
        // "Keep Both with Context": Retain both with context qualifiers
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

        // Audit Log
        await (supabase.from("brain_audit_logs") as any).insert({
          action: "RESOLVE_CONFLICT_CONTEXTUAL",
          actor_role: "user",
          target_type: "claim",
          target_id: claimB.id,
          result: "SUCCESS",
          metadata: {
            resolution: "BOTH_VALID_DIFFERENT_CONTEXT",
            qualifier: contextQualifier,
            claim_a_id: claimA.id,
            claim_b_id: claimB.id,
          },
        });

        toast.success("✓ Both facts retained with contextual distinction.", {
          id: loadingToast,
          duration: 8000,
          action: {
            label: "Undo / تراجع",
            onClick: () => handleUndo(type, previousSnapshots),
          },
        });
      } else if (type === "A_SUPPORTED") {
        // "Reject New Proposal": Keep Claim A, reject Claim B
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

        // Audit Log with explicit rejection reason
        await (supabase.from("brain_audit_logs") as any).insert({
          action: "REJECT_CONFLICT_PROPOSAL",
          actor_role: "user",
          target_type: "claim",
          target_id: claimB.id || conflictId,
          result: "SUCCESS",
          metadata: {
            resolution: "A_SUPPORTED",
            decision_reason: reason || "User rejected new proposal in favor of canonical fact",
          },
        });

        toast.success("✕ Contradictory proposal rejected; canonical fact retained.", {
          id: loadingToast,
          duration: 8000,
          action: {
            label: "Undo / تراجع",
            onClick: () => handleUndo(type, previousSnapshots),
          },
        });
      }

      setResolvedType(type);
      onResolved?.(type);

      // Invalidate caches
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
      setShowContextInput(false);
    }
  };

  if (resolvedType) {
    return (
      <div className="my-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between gap-3 animate-in fade-in-50 duration-200">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
          <span className="font-medium">
            {resolvedType === "ONE_SUPERSEDES_ANOTHER" &&
              "Dispute Resolved: Approved new fact & superseded historical canonical claim."}
            {resolvedType === "BOTH_VALID_DIFFERENT_CONTEXT" &&
              "Dispute Resolved: Preserved both claims with conditional contextual qualifiers."}
            {resolvedType === "A_SUPPORTED" &&
              "Dispute Resolved: Rejected contradictory proposal & preserved verified knowledge."}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="text-[10px] bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 py-0.5"
          >
            Settled
          </Badge>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleUndo(resolvedType, {})}
            className="h-6 px-2 text-[10px] text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 gap-1"
          >
            <Undo2 className="size-3" />
            <span>Undo</span>
          </Button>
        </div>
      </div>
    );
  }

  const claimACreatedDate = claimA.created_at
    ? new Date(claimA.created_at).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Established Record";

  const claimBCreatedDate = claimB.created_at
    ? new Date(claimB.created_at).toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Just Extracted";

  return (
    <div className="my-3 rounded-xl border border-amber-500/40 bg-card/95 shadow-md overflow-hidden text-xs">
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 bg-amber-500/10 border-b border-amber-500/20">
        <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-semibold">
          <Scale className="size-4 text-amber-500 animate-pulse" />
          <span>Knowledge Conflict Detected / تعارض معرفي بحاجة لحسمك</span>
        </div>
        <Badge
          variant="outline"
          className="text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
        >
          Direct Contradiction
        </Badge>
      </div>

      {reason && (
        <div className="px-3.5 pt-2 text-[11px] text-muted-foreground italic">
          {reason}
        </div>
      )}

      {/* Comparison Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3.5">
        {/* Left Side: Existing Canonical Fact */}
        <div className="rounded-lg border border-border/80 bg-muted/30 p-3 space-y-2.5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground mb-1.5">
              <span className="flex items-center gap-1 font-semibold text-foreground">
                <Brain className="size-3 text-primary" />
                Existing Canonical Fact
              </span>
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30 py-0">
                  {claimA.stance || "Canonical"}
                </Badge>
                <Badge variant="secondary" className="text-[10px] font-mono">
                  {Math.round((claimA.confidence ?? 0.95) * 100)}% Conf
                </Badge>
              </div>
            </div>
            <p className="text-xs text-foreground font-medium leading-relaxed bg-background/60 p-2 rounded border border-border/40">
              &quot;{claimA.statement}&quot;
            </p>
          </div>

          <div className="space-y-1 text-[10px] text-muted-foreground pt-1.5 border-t border-border/40">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Calendar className="size-2.5 text-muted-foreground" />
                <span>Created: {claimACreatedDate}</span>
              </span>
              <span className="font-semibold text-foreground/80 truncate max-w-[120px]">
                {claimA.node_name || "Knowledge Graph"}
              </span>
            </div>
            <div className="flex items-center gap-1.5 truncate">
              <span className="font-semibold text-muted-foreground">Source:</span>
              <span className="truncate text-foreground/90">{claimA.source_title || "Verified Canonical Record"}</span>
            </div>
          </div>
        </div>

        {/* Right Side: New Incoming Contradiction */}
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-3 space-y-2.5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-[11px] font-medium text-primary mb-1.5">
              <span className="flex items-center gap-1 font-semibold">
                <ShieldAlert className="size-3 text-amber-500" />
                New Incoming Contradiction
              </span>
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="text-[9px] bg-amber-500/15 text-amber-600 border-amber-500/30 py-0">
                  {claimB.stance || "Disputed"}
                </Badge>
                <Badge variant="secondary" className="text-[10px] font-mono bg-primary/20 text-primary border-primary/30">
                  {Math.round((claimB.confidence ?? 0.92) * 100)}% Conf
                </Badge>
              </div>
            </div>
            <p className="text-xs text-foreground font-medium leading-relaxed bg-background/80 p-2 rounded border border-primary/20">
              &quot;{claimB.statement}&quot;
            </p>
          </div>

          <div className="space-y-1 text-[10px] text-muted-foreground pt-1.5 border-t border-border/40">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Calendar className="size-2.5 text-muted-foreground" />
                <span>Detected: {claimBCreatedDate}</span>
              </span>
              <span className="font-semibold text-primary truncate max-w-[120px]">
                Active Dialogue
              </span>
            </div>
            <div className="flex items-center gap-1.5 truncate">
              <span className="font-semibold text-muted-foreground">Source:</span>
              <span className="truncate text-foreground/90">{claimB.source_title || "Current Conversation Episode"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Contextual Qualifier Input Drawer if toggled */}
      {showContextInput && (
        <div className="px-3.5 pb-3 pt-1 border-t border-border/50 bg-accent/20 space-y-2 animate-in fade-in-50 duration-150">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-medium text-foreground">
              Define Contextual Distinction / تحديد السياق المشروط:
            </span>
            <button
              onClick={() => setShowContextInput(false)}
              className="text-muted-foreground hover:text-foreground text-[10px]"
            >
              Cancel
            </button>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={contextQualifier}
              onChange={(e) => setContextQualifier(e.target.value)}
              placeholder="e.g. In Laravel 11 vs Laravel 10, or Production vs Local"
              className="h-7 text-xs bg-background"
            />
            <Button
              size="sm"
              onClick={() => handleResolve("BOTH_VALID_DIFFERENT_CONTEXT")}
              disabled={isResolving || !contextQualifier.trim()}
              className="h-7 text-xs bg-cyan-600 hover:bg-cyan-700 text-white shrink-0"
            >
              Confirm Both
            </Button>
          </div>
        </div>
      )}

      {/* 3 One-Click Actions */}
      <div className="px-3.5 pb-3 pt-1.5 border-t border-border/60 bg-muted/10 flex flex-wrap items-center gap-2 justify-end">
        {/* Action 3: Reject New Proposal (استبعاد الطرح الجديد) */}
        <Button
          size="sm"
          variant="outline"
          disabled={isResolving}
          onClick={() => handleResolve("A_SUPPORTED")}
          className="h-7 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 border-border/70"
          title="Reject new incoming contradiction and record decision in audit logs"
        >
          <XCircle className="size-3.5 mr-1" />
          <span>Reject New Proposal (استبعاد الطرح الجديد)</span>
        </Button>

        {/* Action 2: Keep Both with Context (الحفاظ على الاثنين بسياق مشروط) */}
        <Button
          size="sm"
          variant="outline"
          disabled={isResolving}
          onClick={() => {
            if (!showContextInput) {
              setShowContextInput(true);
            } else {
              handleResolve("BOTH_VALID_DIFFERENT_CONTEXT");
            }
          }}
          className="h-7 text-xs border-cyan-500/40 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/10"
          title="Keep both claims qualified by temporal or environmental boundaries"
        >
          <Split className="size-3.5 mr-1 text-cyan-500" />
          <span>Keep Both with Context (الحفاظ على الاثنين بسياق مشروط)</span>
        </Button>

        {/* Action 1: Supersede Old (اعتماد الحقيقة الأحدث) */}
        <Button
          size="sm"
          disabled={isResolving}
          onClick={() => handleResolve("ONE_SUPERSEDES_ANOTHER")}
          className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
          title="Mark the old claim as superseded and upgrade the new claim to canonical"
        >
          {isResolving ? (
            <Loader2 className="size-3.5 animate-spin mr-1" />
          ) : (
            <CheckCircle2 className="size-3.5 mr-1" />
          )}
          <span>Supersede Old (اعتماد الحقيقة الأحدث)</span>
        </Button>
      </div>
    </div>
  );
}

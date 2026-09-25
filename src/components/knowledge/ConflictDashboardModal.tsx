// =====================================================================
// KNOWLEDGE BRAIN — PHASE 8: CONFLICT DASHBOARD & REVIEW MODAL
// Review, compare & resolve knowledge contradictions with historical preservation
// =====================================================================

import { useState, useEffect } from "react";
import {
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  Clock,
  Split,
  Shield,
  Layers,
  FileText,
  Loader2,
  ChevronRight,
  ArrowRight,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConflictEngine } from "@/lib/ai/integrity/conflict-engine";
import type {
  KnowledgeConflict,
  ConflictResolutionType,
  ConflictType,
} from "@/lib/ai/integrity/types";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  context?: any;
  onConflictResolved?: () => void;
}

export function ConflictDashboardModal({ isOpen, onClose, context = {}, onConflictResolved }: Props) {
  const [loading, setLoading] = useState<boolean>(true);
  const [conflicts, setConflicts] = useState<KnowledgeConflict[]>([]);
  const [selectedConflict, setSelectedConflict] = useState<KnowledgeConflict | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [resolving, setResolving] = useState<boolean>(false);
  const [notes, setNotes] = useState<string>("");

  const loadConflicts = async () => {
    setLoading(true);
    try {
      let confList: KnowledgeConflict[] = [];

      if (supabase) {
        try {
          const { data } = await supabase
            .from("knowledge_conflicts" as any)
            .select("*")
            .order("created_at", { ascending: false });
          if (data && data.length > 0) {
            confList = data as unknown as KnowledgeConflict[];
          }
        } catch {
          // Fallback to in-memory
        }
      }

      if (confList.length === 0 && context.conflicts) {
        confList = context.conflicts;
      }

      setConflicts(confList);
      const first = confList[0];
      if (first && !selectedConflict) {
        setSelectedConflict(first);
      }
    } catch (err) {
      console.error("Failed to load conflicts", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadConflicts();
    }
  }, [isOpen]);

  const handleResolve = async (type: ConflictResolutionType) => {
    if (!selectedConflict) return;
    setResolving(true);

    try {
      const engine = new ConflictEngine(supabase);
      await engine.resolveConflict(selectedConflict.id, type, {
        notes,
        resolved_by: "reviewer",
        contextClaims: context.claims || [],
      });

      onConflictResolved?.();
      await loadConflicts();
      setNotes("");
    } catch (err) {
      console.error("Failed to resolve conflict", err);
    } finally {
      setResolving(false);
    }
  };

  const filteredConflicts = conflicts.filter((c) => {
    if (statusFilter === "ALL") return true;
    return c.status === statusFilter;
  });

  const getSeverityBadge = (sev: string) => {
    switch (sev) {
      case "HIGH":
        return <Badge variant="outline" className="border-rose-500/30 bg-rose-500/10 text-rose-400">HIGH SEVERITY</Badge>;
      case "MEDIUM":
        return <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-400">MEDIUM</Badge>;
      default:
        return <Badge variant="outline" className="border-blue-500/30 bg-blue-500/10 text-blue-400">LOW</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "OPEN":
        return <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/30">OPEN</Badge>;
      case "UNDER_REVIEW":
        return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">UNDER REVIEW</Badge>;
      case "RESOLVED":
        return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">RESOLVED</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getClaimStatement = (claimId: string): string => {
    const found = context.claims?.find((c: any) => c.id === claimId);
    return found ? (found.claim_text || found.statement || "") : `Claim (${claimId})`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-rose-500/10 text-rose-400">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                Knowledge Conflict Engine
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Section 22–29 & 60–61: Contradiction review, side-by-side comparison & non-destructive resolution.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Filter bar */}
        <div className="flex items-center gap-2 border-b border-border pb-3">
          {["ALL", "OPEN", "UNDER_REVIEW", "RESOLVED"].map((status) => (
            <Button
              key={status}
              variant={statusFilter === status ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(status)}
              className="h-7 text-xs"
            >
              {status.replace("_", " ")}
            </Button>
          ))}
          <span className="ml-auto text-xs text-muted-foreground">
            {filteredConflicts.length} conflict(s)
          </span>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-2 text-xs text-muted-foreground">Scanning knowledge conflicts...</p>
          </div>
        ) : filteredConflicts.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-10 text-center text-xs text-muted-foreground">
            No knowledge conflicts in this view. All claims are currently consistent.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Conflict List */}
            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
              {filteredConflicts.map((c) => {
                const isSelected = selectedConflict?.id === c.id;
                return (
                  <div
                    key={c.id}
                    onClick={() => setSelectedConflict(c)}
                    className={`cursor-pointer rounded-lg border p-3 text-xs transition ${
                      isSelected
                        ? "border-primary bg-primary/10 shadow-sm"
                        : "border-border bg-card hover:border-border/80"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-semibold text-foreground text-[11px] font-mono">
                        {c.conflict_type}
                      </span>
                      {getStatusBadge(c.status)}
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground line-clamp-2">
                      {c.reason_summary}
                    </p>
                    <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>{getSeverityBadge(c.severity)}</span>
                      <span>{new Date(c.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Side-by-side Review Panel */}
            <div className="md:col-span-2 space-y-4 rounded-lg border border-border bg-card p-4">
              {selectedConflict ? (
                <div className="space-y-4 text-xs">
                  <div className="flex items-center justify-between border-b border-border/80 pb-2">
                    <div>
                      <span className="font-semibold text-foreground text-sm">
                        {selectedConflict.conflict_type}
                      </span>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {selectedConflict.reason_summary}
                      </p>
                    </div>
                    <div>{getStatusBadge(selectedConflict.status)}</div>
                  </div>

                  {/* Side-by-side Claims */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {/* Claim A */}
                    <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-foreground">Claim A</span>
                        <span className="font-mono text-[10px] text-muted-foreground">{selectedConflict.claim_a_id}</span>
                      </div>
                      <p className="font-semibold text-foreground text-xs">
                        "{getClaimStatement(selectedConflict.claim_a_id)}"
                      </p>
                    </div>

                    {/* Claim B */}
                    <div className="rounded-lg border border-border bg-muted/40 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-foreground">Claim B</span>
                        <span className="font-mono text-[10px] text-muted-foreground">{selectedConflict.claim_b_id}</span>
                      </div>
                      <p className="font-semibold text-foreground text-xs">
                        "{getClaimStatement(selectedConflict.claim_b_id)}"
                      </p>
                    </div>
                  </div>

                  {/* Status / Resolution summary */}
                  {selectedConflict.status === "RESOLVED" ? (
                    <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-300 space-y-1">
                      <div className="flex items-center gap-1.5 font-semibold">
                        <CheckCircle className="h-4 w-4" />
                        Resolved as {selectedConflict.resolution_type}
                      </div>
                      <p className="text-[11px]">{selectedConflict.resolution_notes}</p>
                    </div>
                  ) : (
                    /* Resolution actions */
                    <div className="space-y-3 border-t border-border/80 pt-3">
                      <label className="font-semibold text-foreground block text-[11px]">
                        Resolution Decision (Non-Destructive)
                      </label>
                      <input
                        type="text"
                        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Resolution justification or notes..."
                      />

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={resolving}
                          onClick={() => handleResolve("BOTH_VALID_DIFFERENT_CONTEXT")}
                          className="text-[11px] justify-start"
                        >
                          Both valid in diff contexts
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={resolving}
                          onClick={() => handleResolve("BOTH_VALID_DIFFERENT_TIME")}
                          className="text-[11px] justify-start"
                        >
                          Both valid in diff times
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={resolving}
                          onClick={() => handleResolve("A_SUPPORTED")}
                          className="text-[11px] justify-start text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                        >
                          Claim A supported
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={resolving}
                          onClick={() => handleResolve("B_SUPPORTED")}
                          className="text-[11px] justify-start text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                        >
                          Claim B supported
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={resolving}
                          onClick={() => handleResolve("ONE_SUPERSEDES_ANOTHER")}
                          className="text-[11px] justify-start text-purple-400 border-purple-500/30 hover:bg-purple-500/10"
                        >
                          One supersedes another
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={resolving}
                          onClick={() => handleResolve("NOT_A_CONFLICT")}
                          className="text-[11px] justify-start text-muted-foreground"
                        >
                          Not a conflict
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-20 text-center text-xs text-muted-foreground">
                  Select a conflict to review side-by-side details
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// KNOWLEDGE BRAIN — PHASE 8: ROLLBACK PREVIEW & CONFIRMATION MODAL
// Controlled non-destructive rollback preview with reverse diff & blast radius
// =====================================================================

import { useState, useEffect } from "react";
import {
  RotateCcw,
  AlertTriangle,
  CheckCircle,
  Shield,
  Layers,
  FileText,
  GitBranch,
  ArrowRight,
  Database,
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RollbackEngine } from "@/lib/ai/integrity/rollback-engine";
import type { RollbackPreview, RollbackResult } from "@/lib/ai/integrity/types";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  subjectTable: string;
  subjectId: string;
  entityName: string;
  targetVersion: number;
  expectedCurrentVersion?: number | undefined;
  context?: any;
  onRollbackSuccess?: (result: RollbackResult) => void;
}

export function RollbackPreviewModal({
  isOpen,
  onClose,
  subjectTable,
  subjectId,
  entityName,
  targetVersion,
  expectedCurrentVersion,
  context = {},
  onRollbackSuccess,
}: Props) {
  const [loading, setLoading] = useState<boolean>(true);
  const [executing, setExecuting] = useState<boolean>(false);
  const [preview, setPreview] = useState<RollbackPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState<string>("");

  useEffect(() => {
    if (!isOpen) {
      setPreview(null);
      setError(null);
      return;
    }

    let isMounted = true;
    setLoading(true);
    setError(null);

    async function loadPreview() {
      try {
        const engine = new RollbackEngine(supabase);
        const result = await engine.previewRollback(
          subjectTable,
          subjectId,
          targetVersion,
          context,
        );
        if (isMounted) {
          setPreview(result);
          setReason(`Rollback ${subjectTable === "knowledge_nodes" ? "concept" : "claim"} to version v${targetVersion}`);
          setLoading(false);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err?.message || "Failed to calculate rollback preview");
          setLoading(false);
        }
      }
    }

    loadPreview();

    return () => {
      isMounted = false;
    };
  }, [isOpen, subjectTable, subjectId, targetVersion]);

  const handleConfirm = async () => {
    if (!preview) return;
    setExecuting(true);
    setError(null);

    try {
      const engine = new RollbackEngine(supabase);
      const res = await engine.executeRollback(
        {
          subject_table: subjectTable,
          subject_id: subjectId,
          target_version: targetVersion,
          expected_current_version: expectedCurrentVersion || preview.current_version,
          reason,
          user_id: "user-editor",
          user_role: "editor",
        },
        context,
      );

      if (res.success) {
        onRollbackSuccess?.(res);
        onClose();
      } else {
        setError(res.error || "Rollback execution was rejected.");
      }
    } catch (err: any) {
      setError(err?.message || "Rollback failed unexpectedly.");
    } finally {
      setExecuting(false);
    }
  };

  const getImpactBadge = (level: string) => {
    switch (level) {
      case "LOW":
        return <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400">LOW IMPACT</Badge>;
      case "MEDIUM":
        return <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-400">MEDIUM IMPACT</Badge>;
      case "HIGH":
        return <Badge variant="outline" className="border-rose-500/30 bg-rose-500/10 text-rose-400">HIGH IMPACT</Badge>;
      default:
        return null;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <RotateCcw className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                Rollback Preview: {entityName}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Section 40–45 Non-Destructive Restoration. Creates a forward version without erasing history.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-2 text-xs text-muted-foreground">Calculating reverse diff & impact analysis...</p>
          </div>
        ) : error ? (
          <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-300">
            <div className="flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4" />
              Rollback Check Warning
            </div>
            <p className="mt-1">{error}</p>
          </div>
        ) : preview ? (
          <div className="space-y-4 text-xs">
            {/* Version Progression Banner */}
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 p-3">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-foreground">Current: v{preview.current_version}</span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="font-semibold text-primary">Target: v{preview.target_version}</span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary font-mono">
                  Creates v{preview.current_version + 1}
                </Badge>
              </div>
              <div>{getImpactBadge(preview.impact.impact_level)}</div>
            </div>

            {/* Invariant Explanation */}
            <div className="rounded-md border border-border/80 bg-card p-3 text-muted-foreground space-y-1">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <Shield className="h-3.5 w-3.5 text-primary" />
                Integrity Guarantee
              </div>
              <p>
                History remains intact: intermediate versions between v{preview.target_version} and v{preview.current_version} will NOT be erased. A new audit change is registered.
              </p>
            </div>

            {/* Impact Analysis Warnings */}
            {preview.impact.warnings.length > 0 && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-amber-300 space-y-1.5">
                <div className="flex items-center gap-1.5 font-semibold">
                  <AlertTriangle className="h-4 w-4" />
                  Blast Radius Notice
                </div>
                <ul className="list-disc pl-4 space-y-0.5">
                  {preview.impact.warnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Reverse Diff */}
            <div className="space-y-2">
              <h4 className="font-semibold text-foreground flex items-center gap-1.5">
                <GitBranch className="h-3.5 w-3.5 text-primary" />
                Reverse Diff (What will change)
              </h4>
              <div className="rounded-md border border-border bg-card p-3 space-y-2 font-mono text-[11px]">
                {Object.keys(preview.reverse_diff.modified).length === 0 &&
                Object.keys(preview.reverse_diff.added).length === 0 &&
                Object.keys(preview.reverse_diff.removed).length === 0 ? (
                  <p className="text-muted-foreground">State is already identical to v{preview.target_version}.</p>
                ) : (
                  <>
                    {Object.entries(preview.reverse_diff.modified).map(([key, change]) => (
                      <div key={key} className="space-y-1 border-b border-border/40 pb-1.5 last:border-b-0">
                        <span className="font-semibold text-foreground">{key}:</span>
                        <div className="flex flex-col gap-0.5 pl-2">
                          <span className="text-rose-400 line-through">
                            - {typeof change.from === "object" ? JSON.stringify(change.from) : String(change.from ?? "null")}
                          </span>
                          <span className="text-emerald-400">
                            + {typeof change.to === "object" ? JSON.stringify(change.to) : String(change.to ?? "null")}
                          </span>
                        </div>
                      </div>
                    ))}
                    {Object.entries(preview.reverse_diff.added).map(([key, val]) => (
                      <div key={key} className="text-emerald-400">
                        + {key}: {String(val)}
                      </div>
                    ))}
                    {Object.entries(preview.reverse_diff.removed).map(([key, val]) => (
                      <div key={key} className="text-rose-400 line-through">
                        - {key}: {String(val)}
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>

            {/* Reason Input */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-foreground">
                Audit Reason Summary (Required for History)
              </label>
              <input
                type="text"
                className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason for reverting to this historical state..."
              />
            </div>
          </div>
        ) : null}

        <DialogFooter className="mt-4 gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={executing}>
            Cancel
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={handleConfirm}
            disabled={loading || executing || !!error || !preview}
            className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {executing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            Confirm Rollback
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

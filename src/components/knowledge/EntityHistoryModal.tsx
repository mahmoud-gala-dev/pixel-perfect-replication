// =====================================================================
// KNOWLEDGE BRAIN — PHASE 8: ENTITY HISTORY & VERSION TIMELINE MODAL
// Detailed chronological version history, visual diffs & non-destructive rollback
// =====================================================================

import { useState, useEffect } from "react";
import {
  History,
  RotateCcw,
  GitBranch,
  Calendar,
  User,
  Shield,
  Code2,
  ChevronDown,
  ChevronRight,
  Loader2,
  ArrowRight,
  Database,
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
import { VersioningEngine } from "@/lib/ai/integrity/versioning-engine";
import type { KnowledgeVersion, KnowledgeChange, RollbackResult } from "@/lib/ai/integrity/types";
import { RollbackPreviewModal } from "./RollbackPreviewModal";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  subjectTable: string;
  subjectId: string;
  entityName: string;
  context?: any;
  onEntityUpdated?: () => void;
}

export function EntityHistoryModal({
  isOpen,
  onClose,
  subjectTable,
  subjectId,
  entityName,
  context = {},
  onEntityUpdated,
}: Props) {
  const [loading, setLoading] = useState<boolean>(true);
  const [versions, setVersions] = useState<KnowledgeVersion[]>([]);
  const [changes, setChanges] = useState<KnowledgeChange[]>([]);
  const [expandedVerId, setExpandedVerId] = useState<string | null>(null);
  const [showRawJson, setShowRawJson] = useState<boolean>(false);
  const [rollbackTarget, setRollbackTarget] = useState<number | null>(null);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const engine = new VersioningEngine(supabase);
      let vers = await engine.getEntityVersions(subjectTable, subjectId);
      let chgs = await engine.getEntityChanges(subjectTable, subjectId);

      // If database returned nothing, check in-memory context
      if (vers.length === 0 && context.versions) {
        vers = context.versions
          .filter((v: any) => v.subject_table === subjectTable && v.subject_id === subjectId)
          .sort((a: any, b: any) => b.version - a.version);
      }
      if (chgs.length === 0 && context.changes) {
        chgs = context.changes
          .filter((c: any) => c.subject_table === subjectTable && c.subject_id === subjectId)
          .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      }

      setVersions(vers);
      setChanges(chgs);
      const firstVer = vers[0];
      if (firstVer && !expandedVerId) {
        setExpandedVerId(firstVer.id);
      }
    } catch (err) {
      console.error("Failed to load entity history", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen, subjectTable, subjectId]);

  const handleRollbackSuccess = (result: RollbackResult) => {
    onEntityUpdated?.();
    loadHistory();
  };

  const getChangeBadge = (changeType: string) => {
    switch (changeType) {
      case "CREATE":
        return <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400">CREATE</Badge>;
      case "UPDATE":
        return <Badge variant="outline" className="border-blue-500/30 bg-blue-500/10 text-blue-400">UPDATE</Badge>;
      case "ROLLBACK":
        return <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-400">ROLLBACK</Badge>;
      case "ADD_CLAIM":
        return <Badge variant="outline" className="border-teal-500/30 bg-teal-500/10 text-teal-400">ADD_CLAIM</Badge>;
      case "SUPERSEDE":
        return <Badge variant="outline" className="border-purple-500/30 bg-purple-500/10 text-purple-400">SUPERSEDE</Badge>;
      case "DEPRECATE":
        return <Badge variant="outline" className="border-zinc-500/30 bg-zinc-500/10 text-zinc-400">DEPRECATE</Badge>;
      default:
        return <Badge variant="outline">{changeType}</Badge>;
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <History className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-base font-semibold">
                    Version History: {entityName}
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    Deterministic sequential history (v1, v2...) & immutable audit log
                  </DialogDescription>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowRawJson(!showRawJson)}
                className="gap-1.5 text-xs text-muted-foreground"
              >
                <Code2 className="h-3.5 w-3.5" />
                {showRawJson ? "Visual View" : "Raw JSON"}
              </Button>
            </div>
          </DialogHeader>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="mt-2 text-xs text-muted-foreground">Loading immutable version sequence...</p>
            </div>
          ) : versions.length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-8 text-center text-xs text-muted-foreground">
              No historical versions recorded for this entity yet.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-xs text-muted-foreground">
                Displaying {versions.length} chronological version(s). Latest active version is{" "}
                <span className="font-semibold text-foreground">v{versions[0]?.version}</span>.
              </div>

              {/* Timeline container */}
              <div className="relative border-l border-border/80 ml-4 space-y-4 pl-6">
                {versions.map((ver, idx) => {
                  const isCurrent = idx === 0;
                  const isExpanded = expandedVerId === ver.id;
                  const matchingChange = changes.find((c) => c.subject_id === ver.subject_id && c.created_at === ver.created_at);

                  return (
                    <div key={ver.id} className="relative group">
                      {/* Timeline dot */}
                      <div
                        className={`absolute -left-[31px] top-1.5 flex h-4 w-4 items-center justify-center rounded-full border ${
                          isCurrent
                            ? "border-primary bg-primary text-primary-foreground shadow-sm"
                            : "border-border bg-card text-muted-foreground"
                        }`}
                      >
                        <div className={`h-1.5 w-1.5 rounded-full ${isCurrent ? "bg-white" : "bg-muted-foreground"}`} />
                      </div>

                      {/* Version Card */}
                      <div className="rounded-lg border border-border bg-card p-3.5 shadow-sm transition hover:border-border/80">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-bold text-foreground">
                              v{ver.version}
                            </span>
                            {isCurrent && (
                              <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px]">
                                CURRENT
                              </Badge>
                            )}
                            {getChangeBadge(ver.change_type || "UPDATE")}
                          </div>

                          <div className="flex items-center gap-2">
                            {!isCurrent && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setRollbackTarget(ver.version)}
                                className="h-7 gap-1 px-2 text-[11px] text-amber-400 border-amber-500/30 hover:bg-amber-500/10"
                              >
                                <RotateCcw className="h-3 w-3" />
                                Rollback to this
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setExpandedVerId(isExpanded ? null : ver.id)}
                              className="h-7 w-7 p-0"
                            >
                              {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            </Button>
                          </div>
                        </div>

                        {/* Metadata row */}
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(ver.created_at).toLocaleString()}
                          </div>
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {ver.created_by}
                          </div>
                          {ver.knowledge_transaction_id && (
                            <div className="flex items-center gap-1 font-mono text-[10px] text-primary/80">
                              <Database className="h-3 w-3" />
                              {ver.knowledge_transaction_id}
                            </div>
                          )}
                        </div>

                        {/* Reason summary */}
                        {ver.reason_summary && (
                          <p className="mt-2 text-xs italic text-foreground/90 bg-muted/30 p-2 rounded">
                            "{ver.reason_summary}"
                          </p>
                        )}

                        {/* Expanded details */}
                        {isExpanded && (
                          <div className="mt-3 border-t border-border/40 pt-3">
                            {showRawJson ? (
                              <pre className="max-h-60 overflow-x-auto rounded bg-muted/50 p-2.5 font-mono text-[10px] text-foreground">
                                {JSON.stringify(ver.snapshot, null, 2)}
                              </pre>
                            ) : (
                              <div className="space-y-1.5 text-xs">
                                <span className="font-semibold text-foreground text-[11px]">Snapshot State:</span>
                                <div className="grid grid-cols-2 gap-2 rounded bg-muted/40 p-2 text-[11px]">
                                  {Object.entries(ver.snapshot).map(([k, v]) => {
                                    if (["id", "metadata", "created_at", "updated_at"].includes(k)) return null;
                                    return (
                                      <div key={k} className="truncate">
                                        <span className="font-medium text-muted-foreground">{k}: </span>
                                        <span className="text-foreground">{typeof v === "object" ? JSON.stringify(v) : String(v ?? "")}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Rollback preview modal */}
      {rollbackTarget !== null && (
        <RollbackPreviewModal
          isOpen={rollbackTarget !== null}
          onClose={() => setRollbackTarget(null)}
          subjectTable={subjectTable}
          subjectId={subjectId}
          entityName={entityName}
          targetVersion={rollbackTarget}
          expectedCurrentVersion={versions[0]?.version}
          context={context}
          onRollbackSuccess={handleRollbackSuccess}
        />
      )}
    </>
  );
}

// =====================================================================
// KNOWLEDGE BRAIN — PHASE 7: KNOWLEDGE DIFF VIEWER
// Displays side-by-side / stacked Before vs After diff for Brain operations
// =====================================================================

import { Plus, Minus, Shield, AlertTriangle, CheckCircle, Database } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { KnowledgeDiff, KnowledgeOperationItem, RiskLevel, TrustTier } from "@/lib/ai/learning/types";

interface Props {
  diff?: KnowledgeDiff | any | null;
  operations?: KnowledgeOperationItem[];
  riskLevel?: RiskLevel | string;
  trustTier?: TrustTier | string;
  className?: string;
}

export function KnowledgeDiffViewer({ diff, operations = [], riskLevel, trustTier, className }: Props) {
  if (!diff && operations.length === 0) {
    return (
      <div className={cn("rounded-lg border border-border p-4 text-center text-xs text-muted-foreground", className)}>
        No modifications proposed.
      </div>
    );
  }

  const normalizedRisk = String(riskLevel || "").toLowerCase();
  const normalizedTier = String(trustTier || "").toLowerCase();

  const getRiskBadge = (risk: string) => {
    switch (risk) {
      case "low":
        return <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[10px]">LOW RISK</Badge>;
      case "medium":
        return <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-400 text-[10px]">MEDIUM RISK</Badge>;
      case "high":
        return <Badge variant="outline" className="border-rose-500/30 bg-rose-500/10 text-rose-400 text-[10px]">HIGH RISK</Badge>;
      default:
        return null;
    }
  };

  const getTierBadge = (tier: string) => {
    switch (tier) {
      case "tier_a":
        return <Badge variant="outline" className="border-blue-500/30 bg-blue-500/10 text-blue-400 text-[10px]">TIER A: SAFE AUTO-COMMIT</Badge>;
      case "tier_b":
        return <Badge variant="outline" className="border-violet-500/30 bg-violet-500/10 text-violet-400 text-[10px]">TIER B: AUTO AUDIT</Badge>;
      case "tier_c":
        return <Badge variant="outline" className="border-amber-500/30 bg-amber-500/10 text-amber-400 text-[10px]">TIER C: REVIEW REQUIRED</Badge>;
      default:
        return null;
    }
  };

  const fieldDiffs = Array.isArray(diff?.field_diffs) ? diff.field_diffs : [];

  return (
    <div className={cn("space-y-3 rounded-lg border border-border bg-card p-4", className)}>
      {/* Header bar with Risk & Tier */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2.5">
        <div className="flex items-center gap-2">
          <Database className="size-4 text-primary" />
          <span className="font-semibold text-xs text-foreground uppercase tracking-wider">
            Canonical Knowledge Diff
          </span>
          {diff?.target_identifier && (
            <Badge variant="secondary" className="font-mono text-[10px]">
              {diff.target_type}: {diff.target_identifier}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {normalizedRisk && getRiskBadge(normalizedRisk)}
          {normalizedTier && getTierBadge(normalizedTier)}
        </div>
      </div>

      {/* Summary message */}
      {diff?.summary && (
        <p className="text-xs text-muted-foreground leading-relaxed">
          {diff.summary}
        </p>
      )}

      {/* Field Diffs Visual Comparison */}
      {fieldDiffs.length > 0 && (
        <div className="space-y-2 pt-1">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            Field-Level Changes ({fieldDiffs.length})
          </div>
          <div className="divide-y divide-border/50 rounded-md border border-border/70 bg-background/60">
            {fieldDiffs.map((fd: any, idx: number) => (
              <div key={fd.field + idx} className="p-3 text-xs flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-foreground text-[11px]">{fd.field}</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[9px] font-mono",
                        fd.action === "ADDED" && "border-emerald-500/40 text-emerald-400 bg-emerald-500/5",
                        fd.action === "MODIFIED" && "border-amber-500/40 text-amber-400 bg-amber-500/5",
                        fd.action === "UNCHANGED" && "border-muted-foreground/30 text-muted-foreground",
                      )}
                    >
                      {fd.action}
                    </Badge>
                  </div>

                  {fd.action === "ADDED" && (
                    <div className="flex items-center gap-1 text-emerald-400 font-mono text-xs">
                      <Plus className="size-3 shrink-0" />
                      <span>{String(fd.proposed_value ?? "null")}</span>
                    </div>
                  )}

                  {fd.action === "MODIFIED" && (
                    <div className="space-y-0.5 font-mono text-xs">
                      <div className="flex items-center gap-1 text-rose-400/80 line-through">
                        <Minus className="size-3 shrink-0" />
                        <span>{String(fd.previous_value ?? "null")}</span>
                      </div>
                      <div className="flex items-center gap-1 text-emerald-400 font-medium">
                        <Plus className="size-3 shrink-0" />
                        <span>{String(fd.proposed_value ?? "null")}</span>
                      </div>
                    </div>
                  )}

                  {fd.action === "UNCHANGED" && (
                    <span className="font-mono text-xs text-muted-foreground">
                      {String(fd.proposed_value ?? fd.previous_value ?? "null")}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Operations List Breakdown */}
      {operations.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-border">
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            Plan Operations Breakdown ({operations.length})
          </div>
          <div className="divide-y divide-border/40 rounded-md border border-border/60 bg-muted/10">
            {operations.map((op, idx) => (
              <div key={op.id || idx} className="p-2.5 text-xs flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] font-bold text-foreground">
                    #{op.execution_order}
                  </span>
                  <Badge variant="outline" className={cn("text-[10px] font-mono",
                    op.operation_type === "NO_OP" && "border-muted-foreground/30 text-muted-foreground",
                    op.operation_type === "CREATE_NODE" && "border-blue-500/40 text-blue-400",
                    op.operation_type === "CREATE_RELATION" && "border-emerald-500/40 text-emerald-400",
                    op.operation_type === "ADD_CLAIM" && "border-purple-500/40 text-purple-400",
                    op.operation_type === "ADD_ALIAS" && "border-amber-500/40 text-amber-400",
                    op.operation_type.startsWith("QUARANTINE") && "border-rose-500/40 text-rose-400",
                  )}>
                    {op.operation_type}
                  </Badge>
                  <span className="text-muted-foreground text-xs">
                    {op.reason_summary}
                  </span>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <span className="text-[10px] text-muted-foreground">
                    Conf: {Math.round(op.confidence * 100)}%
                  </span>
                  {getRiskBadge(op.risk_level)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

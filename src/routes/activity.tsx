// =====================================================================
// KNOWLEDGE BRAIN — PHASE 7: BRAIN ACTIVITY PAGE
// Transactions, Knowledge Operations & Canonical Audit Trail
// =====================================================================

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Activity,
  GitCommit,
  Layers,
  Brain,
  ShieldCheck,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Database,
  Clock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, EmptyState } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { KnowledgeDiffViewer } from "@/components/knowledge/KnowledgeDiffViewer";
import type { KnowledgeDiff } from "@/lib/ai/learning/types";

export const Route = createFileRoute("/activity")({
  head: () => ({
    meta: [
      { title: "Brain Activity — Knowledge Brain" },
      { name: "description", content: "Inspect atomic learning transactions, operations, and canonical audit history." },
      { property: "og:title", content: "Brain Activity — Knowledge Brain" },
      { property: "og:description", content: "Inspect atomic learning transactions, operations, and canonical audit history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ActivityPage,
});

export function ActivityPage() {
  const { session } = useAuth();
  const [activeTab, setActiveTab] = useState<"transactions" | "operations" | "history">("transactions");
  const [expandedOpId, setExpandedOpId] = useState<string | null>(null);

  // 1. Fetch Knowledge Transactions (Phase 7)
  const { data: transactions = [], isLoading: loadingTx } = useQuery({
    queryKey: ["knowledge-transactions"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_transactions")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  // 2. Fetch Knowledge Operations
  const { data: operations = [], isLoading: loadingOps } = useQuery({
    queryKey: ["operations"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_operations")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  // 3. Fetch Change History
  const { data: changes = [], isLoading: loadingChanges } = useQuery({
    queryKey: ["changes"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_changes")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <AppShell
      title="Brain Activity"
      description="Inspect atomic learning transactions, knowledge operations, and the canonical audit trail."
    >
      <div className="space-y-4">
        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
          <Button
            variant={activeTab === "transactions" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("transactions")}
            className="gap-2 text-xs font-medium"
          >
            <GitCommit className="size-3.5 text-primary" />
            <span>Learning Transactions</span>
            <Badge variant="outline" className="ml-1 text-[10px] font-mono">
              {transactions.length}
            </Badge>
          </Button>

          <Button
            variant={activeTab === "operations" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("operations")}
            className="gap-2 text-xs font-medium"
          >
            <Activity className="size-3.5 text-purple-400" />
            <span>Knowledge Operations</span>
            <Badge variant="outline" className="ml-1 text-[10px] font-mono">
              {operations.length}
            </Badge>
          </Button>

          <Button
            variant={activeTab === "history" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setActiveTab("history")}
            className="gap-2 text-xs font-medium"
          >
            <Database className="size-3.5 text-blue-400" />
            <span>Canonical Change History</span>
            <Badge variant="outline" className="ml-1 text-[10px] font-mono">
              {changes.length}
            </Badge>
          </Button>
        </div>

        {/* Tab 1: Knowledge Transactions (Phase 7) */}
        {activeTab === "transactions" && (
          <div>
            {transactions.length === 0 ? (
              <EmptyState
                icon={GitCommit}
                title="No Learning Transactions Yet"
                description="Atomic Knowledge Transactions are generated when approved or safe auto-learning operations commit to the Brain."
              />
            ) : (
              <div className="panel divide-y divide-border">
                {transactions.map((tx: any) => {
                  const summary = tx.summary as any;
                  return (
                    <div key={tx.id} className="p-4 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold text-foreground">
                            Tx #{tx.id.slice(0, 10)}
                          </span>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px]",
                              tx.status === "committed" && "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
                              tx.status === "partially_committed" && "border-amber-500/40 bg-amber-500/10 text-amber-400",
                              tx.status === "failed" && "border-rose-500/40 bg-rose-500/10 text-rose-400",
                            )}
                          >
                            {tx.status.toUpperCase()}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {tx.operation_count} operations
                          </span>
                        </div>

                        <span className="text-[11px] text-muted-foreground flex items-center gap-1 font-mono">
                          <Clock className="size-3" />
                          {new Date(tx.started_at).toLocaleString()}
                        </span>
                      </div>

                      {/* Granular Summary Badges */}
                      {summary && (
                        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                          {summary.reused_nodes > 0 && (
                            <span className="inline-flex items-center gap-1 rounded bg-blue-500/10 px-2 py-0.5 text-[11px] text-blue-400 border border-blue-500/20">
                              <Brain className="size-3" /> Reused {summary.reused_nodes}
                            </span>
                          )}
                          {summary.created_nodes > 0 && (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-400 border border-emerald-500/20">
                              <Layers className="size-3" /> Created {summary.created_nodes} nodes
                            </span>
                          )}
                          {summary.created_relations > 0 && (
                            <span className="inline-flex items-center gap-1 rounded bg-purple-500/10 px-2 py-0.5 text-[11px] text-purple-400 border border-purple-500/20">
                              <GitCommit className="size-3" /> +{summary.created_relations} relations
                            </span>
                          )}
                          {summary.added_claims > 0 && (
                            <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-400 border border-amber-500/20">
                              <Sparkles className="size-3" /> +{summary.added_claims} claims
                            </span>
                          )}
                          {summary.no_ops > 0 && (
                            <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                              <ShieldCheck className="size-3" /> {summary.no_ops} skipped (duplicate/no-op)
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Knowledge Operations */}
        {activeTab === "operations" && (
          <div>
            {operations.length === 0 ? (
              <EmptyState
                icon={Activity}
                title="No Operations Recorded Yet"
                description="Structured operations (CREATE_NODE, CREATE_RELATION, ADD_CLAIM, ADD_ALIAS, NO_OP) will appear here."
              />
            ) : (
              <div className="panel divide-y divide-border">
                {operations.map((op: any) => {
                  const isExpanded = expandedOpId === op.id;
                  const diff = op.diff as KnowledgeDiff | null;

                  return (
                    <div key={op.id} className="p-3.5 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setExpandedOpId(isExpanded ? null : op.id)}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            {isExpanded ? (
                              <ChevronDown className="size-3.5" />
                            ) : (
                              <ChevronRight className="size-3.5" />
                            )}
                          </button>
                          <span className="font-mono font-bold text-foreground">
                            {op.operation_type}
                          </span>
                          <span className="rounded bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
                            {op.status}
                          </span>
                          {op.risk_level && (
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[10px]",
                                op.risk_level === "LOW" && "border-emerald-500/30 text-emerald-400",
                                op.risk_level === "MEDIUM" && "border-amber-500/30 text-amber-400",
                                op.risk_level === "HIGH" && "border-rose-500/30 text-rose-400",
                              )}
                            >
                              {op.risk_level} RISK
                            </Badge>
                          )}
                        </div>

                        <span className="text-[11px] text-muted-foreground font-mono">
                          {new Date(op.created_at).toLocaleString()}
                        </span>
                      </div>

                      {op.reason_summary && (
                        <p className="text-xs text-muted-foreground pl-5">
                          {op.reason_summary}
                        </p>
                      )}

                      {/* Expandable Diff & States */}
                      {isExpanded && (
                        <div className="pl-5 pt-2">
                          {diff ? (
                            <KnowledgeDiffViewer
                              diff={diff}
                              riskLevel={op.risk_level}
                              trustTier={op.trust_tier}
                            />
                          ) : (
                            <div className="rounded border border-border/60 bg-muted/20 p-2 font-mono text-[11px] text-muted-foreground">
                              Payload: {JSON.stringify(op.payload ?? {}, null, 2)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Canonical Change History */}
        {activeTab === "history" && (
          <div>
            {changes.length === 0 ? (
              <EmptyState
                icon={Database}
                title="No Changes Recorded Yet"
                description="Every create, update, or deprecation of a canonical node, relation, alias or claim is recorded automatically."
              />
            ) : (
              <div className="panel divide-y divide-border">
                {changes.map((change: any) => (
                  <div key={change.id} className="p-3 text-xs flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-primary font-semibold">{change.change_type}</span>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground font-mono">
                        {change.subject_table}
                      </span>
                      {change.subject_id && (
                        <span className="font-mono text-[10px] text-muted-foreground">
                          id: {change.subject_id.slice(0, 8)}…
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      {new Date(change.created_at).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
export default ActivityPage;

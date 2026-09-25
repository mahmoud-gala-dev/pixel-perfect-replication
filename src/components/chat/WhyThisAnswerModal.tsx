// =====================================================================
// KNOWLEDGE BRAIN — PHASE 9: WHY THIS ANSWER MODAL
// Structured attribution: topics, claims, evidence, sources & graph paths
// Zero hidden chain-of-thought
// =====================================================================

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Brain,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  GitCommit,
  Layers,
  FileText,
  ShieldCheck,
  Share2,
} from "lucide-react";
import type { ChatResponseContract } from "@/lib/ai/types";

interface WhyThisAnswerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  response: ChatResponseContract | null;
  onNavigateToNode?: (nodeId: string) => void;
}

export function WhyThisAnswerModal({
  open,
  onOpenChange,
  response,
  onNavigateToNode,
}: WhyThisAnswerModalProps) {
  if (!response) return null;

  const groundingState = response.grounding_state || (response.brain_context_used ? "STRONGLY_GROUNDED" : "GENERAL_KNOWLEDGE_USED");
  const claims = response.references?.claims || [];
  const nodes = response.references?.nodes || [];
  const relations = response.references?.relations || [];
  const paths = response.graph_paths || [];
  const sources = response.sources || [];
  const conflicts = response.conflicts_detected || [];
  const claimLedger = response.claim_ledger || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            <DialogTitle>Why this answer? — Structured Attribution</DialogTitle>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Inspect the exact grounded topics, claims, evidence, sources, and graph paths used by the Knowledge Brain to generate this response.
          </p>
        </DialogHeader>

        {/* Grounding & Answer Mode Status */}
        <div className="flex flex-wrap items-center gap-2 p-3 bg-muted/30 rounded-lg border">
          <span className="text-xs font-medium text-muted-foreground">Grounding Status:</span>
          <Badge
            variant={
              groundingState === "STRONGLY_GROUNDED"
                ? "default"
                : groundingState === "CONFLICTED_KNOWLEDGE"
                ? "destructive"
                : "secondary"
            }
          >
            {groundingState.replace(/_/g, " ")}
          </Badge>

          <span className="text-xs font-medium text-muted-foreground ml-3">Answer Mode:</span>
          <Badge variant="outline">
            {response.answer_mode || "BRAIN_PREFERRED"}
          </Badge>

          {response.retrieval_run_id && (
            <span className="text-[10px] text-muted-foreground ml-auto font-mono">
              Run: {response.retrieval_run_id.slice(0, 16)}…
            </span>
          )}
        </div>

        {/* Conflicts Warning Banner */}
        {conflicts.length > 0 && (
          <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg text-xs flex items-start gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">Unresolved Knowledge Conflict Detected</div>
              <div>The Knowledge Brain contains differing assertions for topics in this answer. The answer highlights this uncertainty rather than picking a winner.</div>
            </div>
          </div>
        )}

        {/* 1. Resolved Canonical Topics */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-foreground flex items-center gap-1.5 uppercase tracking-wider">
            <Layers className="h-3.5 w-3.5 text-primary" />
            Canonical Topics & Entities ({nodes.length})
          </div>
          {nodes.length === 0 ? (
            <div className="text-xs text-muted-foreground italic">No canonical nodes referenced.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {nodes.map((n) => (
                <div
                  key={n.id}
                  className="p-2.5 rounded-md border bg-card/60 flex items-center justify-between text-xs"
                >
                  <div>
                    <span className="font-medium text-foreground">{n.name}</span>
                    <span className="text-[10px] text-muted-foreground ml-1.5 font-mono">[{n.node_type}]</span>
                    {n.description && (
                      <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{n.description}</p>
                    )}
                  </div>
                  {onNavigateToNode && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => {
                        onNavigateToNode(n.id);
                        onOpenChange(false);
                      }}
                    >
                      <ExternalLink className="h-3 w-3 mr-1" />
                      Open
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 2. Grounded Claims & Claim Ledger */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-foreground flex items-center gap-1.5 uppercase tracking-wider">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            Grounded Canonical Claims ({claims.length})
          </div>
          {claims.length === 0 ? (
            <div className="text-xs text-muted-foreground italic">No canonical claims used.</div>
          ) : (
            <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
              {claims.map((c, idx) => (
                <div key={c.id || idx} className="p-2.5 rounded border bg-card/40 text-xs space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-foreground">
                      <span className="text-primary font-mono mr-1.5">[C{idx + 1}]</span>
                      "{c.statement}"
                    </span>
                    <Badge variant={c.verification === "verified" ? "secondary" : "outline"} className="text-[10px]">
                      {c.verification}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span>State: <b className="text-foreground">{c.knowledge_state || "known"}</b></span>
                    {c.valid_from && <span>Valid: {c.valid_from}{c.valid_until ? ` → ${c.valid_until}` : ""}</span>}
                    {c.source && <span>Source: {c.source.title}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 3. Knowledge Graph Paths & Relations */}
        {(paths.length > 0 || relations.length > 0) && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-foreground flex items-center gap-1.5 uppercase tracking-wider">
              <Share2 className="h-3.5 w-3.5 text-primary" />
              Graph Paths & Relations ({paths.length + relations.length})
            </div>
            {paths.map((p, pIdx) => (
              <div key={pIdx} className="p-2 rounded bg-muted/40 border text-xs font-mono">
                <div className="text-[10px] text-muted-foreground mb-1">Multi-Hop Path (Length: {p.length}):</div>
                <div className="flex flex-wrap items-center gap-1 text-foreground">
                  {p.nodes.map((node, nIdx) => (
                    <span key={node.id} className="flex items-center gap-1">
                      <span className="bg-background px-1.5 py-0.5 rounded border font-sans">{node.name}</span>
                      {p.relations[nIdx] && (
                        <span className="text-[11px] text-primary">--({p.relations[nIdx]})--&gt;</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {relations.length > 0 && paths.length === 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                {relations.map((r) => (
                  <div key={r.id} className="p-2 rounded border bg-card/40 text-xs flex items-center gap-1.5">
                    <GitCommit className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span>{r.source.name}</span>
                    <span className="text-primary font-mono text-[10px]">--({r.relation_type})--&gt;</span>
                    <span>{r.target.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 4. Sources */}
        {sources.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-foreground flex items-center gap-1.5 uppercase tracking-wider">
              <FileText className="h-3.5 w-3.5 text-primary" />
              Indexed Sources ({sources.length})
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {sources.map((s, idx) => (
                <div key={s.id || idx} className="p-2 rounded border bg-card/60 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground">
                      <span className="text-primary font-mono mr-1">[S{idx + 1}]</span>
                      {s.title}
                    </span>
                    {s.source_quality && (
                      <Badge variant="outline" className="text-[10px]">
                        {s.source_quality}
                      </Badge>
                    )}
                  </div>
                  {s.url && (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-primary hover:underline line-clamp-1 mt-1 block"
                    >
                      {s.url}
                    </a>
                  )}
                  {s.availability && s.availability !== "active" && (
                    <span className="text-[10px] text-amber-500 font-semibold mt-1 block">
                      Status: {s.availability.toUpperCase()}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// KNOWLEDGE BRAIN — PHASE 9: RETRIEVAL DEBUG INSPECTOR MODAL
// Multi-signal breakdown, RRF ranking scores, candidate discovery & budget
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
  Sliders,
  Clock,
  Sparkles,
  GitBranch,
  Layers,
  Database,
  Filter,
} from "lucide-react";
import type { ChatResponseContract } from "@/lib/ai/types";

interface RetrievalInspectorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  response: ChatResponseContract | null;
  userPrompt?: string;
}

export function RetrievalInspectorModal({
  open,
  onOpenChange,
  response,
  userPrompt,
}: RetrievalInspectorModalProps) {
  if (!response) return null;

  const nodes = response.references?.nodes || [];
  const claims = response.references?.claims || [];
  const paths = response.graph_paths || [];
  const metadata = response.metadata || {};

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Sliders className="h-5 w-5 text-primary" />
            <DialogTitle>Retrieval Trace & Inspector</DialogTitle>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Debug view of query interpretation, search strategies, candidates, and context selection.
          </p>
        </DialogHeader>

        {/* User Query & Execution Metadata */}
        <div className="p-3 bg-muted/30 rounded-lg border space-y-2 text-xs">
          {userPrompt && (
            <div>
              <span className="text-muted-foreground font-semibold">User Query: </span>
              <span className="text-foreground italic">"{userPrompt}"</span>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              <span>Latency: <b>{metadata.latency_ms ?? 0} ms</b></span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Database className="h-3.5 w-3.5" />
              <span>Mode: <b>{response.answer_mode ?? "BRAIN_PREFERRED"}</b></span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Filter className="h-3.5 w-3.5" />
              <span>Nodes: <b>{nodes.length}</b></span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Claims: <b>{claims.length}</b></span>
            </div>
          </div>
        </div>

        {/* Strategies Used */}
        <div className="space-y-1.5">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Hybrid Strategies Executed
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary" className="text-xs">Exact Match (1.0)</Badge>
            <Badge variant="secondary" className="text-xs">Alias Resolution (0.85)</Badge>
            <Badge variant="secondary" className="text-xs">Trigram Full-Text (0.6)</Badge>
            <Badge variant="secondary" className="text-xs">pgvector Semantic (0.7)</Badge>
            <Badge variant="secondary" className="text-xs">Graph Traversal (0.75)</Badge>
            <Badge variant="secondary" className="text-xs">Claim Verification (0.8)</Badge>
          </div>
        </div>

        {/* Selected Canonical Context */}
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <Layers className="h-3.5 w-3.5 text-primary" />
            Selected Canonical Entities ({nodes.length})
          </div>
          <div className="space-y-1">
            {nodes.map((n, i) => (
              <div key={n.id} className="p-2 rounded border bg-card/40 text-xs flex items-center justify-between">
                <div>
                  <span className="font-semibold text-foreground">{n.name}</span>
                  <span className="text-[10px] text-muted-foreground ml-2 font-mono">[{n.node_type}]</span>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  Rank #{i + 1}
                </Badge>
              </div>
            ))}
          </div>
        </div>

        {/* Graph Traversal Hops */}
        {paths.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
              <GitBranch className="h-3.5 w-3.5 text-primary" />
              Bounded Multi-Hop Paths ({paths.length})
            </div>
            {paths.map((p, i) => (
              <div key={i} className="p-2 bg-muted/40 rounded border text-xs font-mono">
                {p.nodes.map((n, ni) => `${n.name}${p.relations[ni] ? ` -> [${p.relations[ni]}] -> ` : ""}`).join("")}
              </div>
            ))}
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

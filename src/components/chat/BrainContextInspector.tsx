// =====================================================================
// KNOWLEDGE BRAIN — PHASE 4: BRAIN CONTEXT INSPECTOR MODAL
// Inspects verified concepts, claims, relations & sources used by AI
// =====================================================================

import { Sparkles, Brain, Network, Quote, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import type { BrainContextNode, BrainContextClaim, BrainContextRelation } from "@/lib/ai";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  references?: {
    nodes?: BrainContextNode[];
    claims?: BrainContextClaim[];
    relations?: BrainContextRelation[];
  } | null | undefined;
}

export function BrainContextInspector({ open, onOpenChange, references }: Props) {
  const nodes = references?.nodes ?? [];
  const claims = references?.claims ?? [];
  const relations = references?.relations ?? [];

  const totalItems = nodes.length + claims.length + relations.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="size-5" />
            <DialogTitle>Retrieved Brain Context (Read-Only)</DialogTitle>
          </div>
          <DialogDescription>
            The assistant grounded its answer on {totalItems} verified record{totalItems === 1 ? "" : "s"} from your Knowledge Brain. No data was modified.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-2">
          {/* 1. Topics & Entities */}
          {nodes.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Brain className="size-3.5 text-primary" />
                <span>Canonical Topics & Entities ({nodes.length})</span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {nodes.map((n) => (
                  <div key={n.id} className="rounded-lg border border-border bg-card/60 p-2.5">
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="font-medium text-foreground text-sm truncate">{n.name}</span>
                      <Badge variant="outline" className="text-[10px] uppercase font-mono">
                        {n.node_type}
                      </Badge>
                    </div>
                    {n.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{n.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2. Semantic Relations */}
          {relations.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Network className="size-3.5 text-blue-500" />
                <span>Knowledge Graph Relations ({relations.length})</span>
              </div>
              <div className="space-y-1.5">
                {relations.map((r, i) => (
                  <div key={r.id || i} className="flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
                    <div className="flex items-center gap-2 truncate">
                      <span className="font-semibold text-foreground">{r.source.name}</span>
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        {r.relation_type}
                      </Badge>
                      <span className="font-semibold text-foreground">{r.target.name}</span>
                    </div>
                    {r.confidence != null && (
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {(r.confidence * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. Atomic Claims */}
          {claims.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Quote className="size-3.5 text-emerald-500" />
                <span>Grounded Atomic Claims ({claims.length})</span>
              </div>
              <div className="space-y-2">
                {claims.map((c) => (
                  <div key={c.id} className="rounded-lg border border-border bg-card/60 p-3 space-y-1.5">
                    <p className="text-xs text-foreground font-medium leading-snug">
                      "{c.statement}"
                    </p>
                    <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-muted-foreground">
                      <Badge variant="outline" className="text-[10px] font-mono uppercase">
                        {c.claim_type}
                      </Badge>
                      <span className="text-emerald-500 capitalize">{c.verification}</span>
                      {c.source && (
                        <div className="flex items-center gap-1 text-primary">
                          <ExternalLink className="size-3" />
                          <span>{c.source.title}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {totalItems === 0 && (
            <p className="text-center py-6 text-sm text-muted-foreground">
              No specific Brain records were attached to this response.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================================
// KNOWLEDGE BRAIN — PHASE 5: CONVERSATION KNOWLEDGE ACTIVITY DRAWER
// Displays detected candidate concepts, atomic claims, and relations
// for the current conversation. STRICT CLARITY: Proposals awaiting Phase 6.
// =====================================================================

import { Link } from "@tanstack/react-router";
import {
  Sparkles,
  Brain,
  Quote,
  Network,
  FolderTree,
  ExternalLink,
  CheckCircle2,
  Clock,
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
import type { KnowledgeProposalItem } from "@/lib/ai";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversationTitle?: string | undefined;
  conversationId?: string | null | undefined;
  proposals: KnowledgeProposalItem[];
  onTriggerExtraction?: (() => void) | undefined;
  isExtracting?: boolean | undefined;
}

export function KnowledgeActivityDrawer({
  open,
  onOpenChange,
  conversationTitle,
  conversationId,
  proposals,
  onTriggerExtraction,
  isExtracting,
}: Props) {
  const entityProposals = proposals.filter((p) => ["ENTITY", "TOPIC", "CONCEPT"].includes(p.proposal_type));
  const claimProposals = proposals.filter((p) => p.proposal_type === "CLAIM");
  const relationProposals = proposals.filter((p) => p.proposal_type === "RELATION");
  const hierarchyProposals = proposals.filter((p) => p.proposal_type === "HIERARCHY");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="size-5" />
            <DialogTitle>Knowledge Activity</DialogTitle>
          </div>
          <DialogDescription>
            Candidates detected in <span className="font-semibold text-foreground">"{conversationTitle || "this chat"}"</span>.
          </DialogDescription>
        </DialogHeader>

        {/* Safety Boundary Banner */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground flex items-center justify-between gap-3">
          <div className="space-y-0.5">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <Clock className="size-3.5 text-primary" /> Pending Resolution
            </span>
            <p className="text-[11px] leading-relaxed">
              These detected items are stored as <strong>Knowledge Proposals</strong>. They are NOT directly added to the Brain yet. Resolution occurs in Phase 6.
            </p>
          </div>

          <Link to="/proposals">
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 shrink-0">
              <span>All Proposals</span>
              <ArrowRight className="size-3" />
            </Button>
          </Link>
        </div>

        {proposals.length === 0 ? (
          <div className="py-8 text-center space-y-3">
            <Brain className="mx-auto size-10 text-muted-foreground/40 animate-pulse" />
            <div className="space-y-1">
              <h4 className="font-semibold text-sm">No knowledge candidates extracted yet</h4>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Trigger extraction on this conversation episode to detect reusable concepts, atomic claims, and graph relations.
              </p>
            </div>
            {onTriggerExtraction && (
              <Button
                size="sm"
                onClick={onTriggerExtraction}
                disabled={isExtracting}
                className="gap-1.5"
              >
                <Sparkles className="size-3.5" />
                <span>{isExtracting ? "Extracting Candidates…" : "Analyze Episode & Extract"}</span>
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-5 pt-1">
            {/* Quick Stats Pill Bar */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="secondary" className="gap-1 font-mono">
                <Brain className="size-3 text-primary" /> {entityProposals.length} Detected Concepts
              </Badge>
              <Badge variant="secondary" className="gap-1 font-mono">
                <Quote className="size-3 text-emerald-500" /> {claimProposals.length} Detected Claims
              </Badge>
              <Badge variant="secondary" className="gap-1 font-mono">
                <Network className="size-3 text-blue-500" /> {relationProposals.length} Detected Relations
              </Badge>
              {hierarchyProposals.length > 0 && (
                <Badge variant="secondary" className="gap-1 font-mono">
                  <FolderTree className="size-3 text-amber-500" /> {hierarchyProposals.length} Hierarchy Suggestions
                </Badge>
              )}
            </div>

            {/* 1. Detected Concepts */}
            {entityProposals.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Brain className="size-3.5 text-primary" /> Detected Concepts ({entityProposals.length})
                </span>
                <div className="grid gap-2 sm:grid-cols-2">
                  {entityProposals.map((p) => {
                    const payload = p.payload;
                    return (
                      <div key={p.id} className="rounded-lg border border-border bg-card/60 p-2.5 space-y-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-semibold text-foreground text-xs">{String(payload["name"] ?? "")}</span>
                          <Badge variant="outline" className="text-[9px] uppercase font-mono">
                            {String(payload["entity_type"] ?? "concept")}
                          </Badge>
                        </div>
                        {payload["description"] ? (
                          <p className="text-[11px] text-muted-foreground line-clamp-2">{String(payload["description"])}</p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 2. Detected Atomic Claims */}
            {claimProposals.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Quote className="size-3.5 text-emerald-500" /> Detected Claims ({claimProposals.length})
                </span>
                <div className="space-y-1.5">
                  {claimProposals.map((p) => {
                    const payload = p.payload;
                    return (
                      <div key={p.id} className="rounded-lg border border-border bg-card/60 p-2.5 text-xs space-y-1">
                        <p className="font-medium text-foreground">"{String(payload["statement"] ?? "")}"</p>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
                          <span className="capitalize">{String(payload["claim_type"] ?? "fact")}</span>
                          <span>•</span>
                          <span>{String(payload["knowledge_state"] ?? "PROBABLE")}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 3. Detected Relations */}
            {relationProposals.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Network className="size-3.5 text-blue-500" /> Detected Relations ({relationProposals.length})
                </span>
                <div className="space-y-1.5">
                  {relationProposals.map((p) => {
                    const payload = p.payload;
                    return (
                      <div key={p.id} className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-primary">{String(payload["source_entity_ref"] ?? "Source")}</span>
                          <Badge variant="secondary" className="font-mono text-[10px]">
                            --({String(payload["relation_type"] ?? "related_to")})--&gt;
                          </Badge>
                          <span className="font-semibold text-primary">{String(payload["target_entity_ref"] ?? "Target")}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 4. Hierarchy Suggestions */}
            {hierarchyProposals.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <FolderTree className="size-3.5 text-amber-500" /> Suggested Taxonomy
                </span>
                <div className="space-y-1">
                  {hierarchyProposals.map((p) => {
                    const path = Array.isArray(p.payload["path"]) ? p.payload["path"] : [];
                    return (
                      <div key={p.id} className="rounded border border-border bg-card p-2 text-xs font-mono text-muted-foreground">
                        {path.join(" > ")}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Re-trigger action button */}
            {onTriggerExtraction && (
              <div className="flex justify-end pt-2 border-t border-border">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onTriggerExtraction}
                  disabled={isExtracting}
                  className="gap-1.5 text-xs"
                >
                  <Sparkles className="size-3.5" />
                  <span>{isExtracting ? "Extracting…" : "Re-analyze Episode"}</span>
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

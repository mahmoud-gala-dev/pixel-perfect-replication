// =====================================================================
// KNOWLEDGE BRAIN — PHASE 8: EVIDENCE PATH MODAL
// Answers: "Why does the Brain know this?" with verifiable evidence & source provenance
// =====================================================================

import { useState, useEffect } from "react";
import {
  HelpCircle,
  ShieldCheck,
  AlertTriangle,
  ExternalLink,
  BookOpen,
  Calendar,
  MessageSquare,
  Database,
  CheckCircle2,
  XCircle,
  FileText,
  Clock,
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { EvidenceEngine } from "@/lib/ai/integrity/evidence-engine";
import type { ExplainKnowledgeResult } from "@/lib/ai/integrity/types";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  claimId: string;
  context?: any;
}

export function EvidencePathModal({ isOpen, onClose, claimId, context = {} }: Props) {
  const [loading, setLoading] = useState<boolean>(true);
  const [data, setData] = useState<ExplainKnowledgeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !claimId) return;

    let isMounted = true;
    setLoading(true);
    setError(null);

    async function loadExplanation() {
      try {
        const engine = new EvidenceEngine(supabase);
        const res = await engine.explainKnowledge(claimId, context);
        if (isMounted) {
          setData(res);
          setLoading(false);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err?.message || "Failed to load knowledge explanation.");
          setLoading(false);
        }
      }
    }

    loadExplanation();

    return () => {
      isMounted = false;
    };
  }, [isOpen, claimId]);

  const getStateBadge = (state: string) => {
    switch (state.toUpperCase()) {
      case "KNOWN":
        return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">KNOWN</Badge>;
      case "PROBABLE":
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">PROBABLE</Badge>;
      case "CONFLICTED":
        return <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/30">CONFLICTED</Badge>;
      case "OUTDATED":
        return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">OUTDATED</Badge>;
      case "SUPERSEDED":
        return <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">SUPERSEDED</Badge>;
      default:
        return <Badge variant="outline">{state}</Badge>;
    }
  };

  const getVerificationBadge = (ver: string) => {
    switch (ver.toUpperCase()) {
      case "VERIFIED":
        return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">VERIFIED</Badge>;
      case "PARTIALLY_VERIFIED":
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">PARTIALLY VERIFIED</Badge>;
      case "DISPUTED":
        return <Badge className="bg-rose-500/20 text-rose-400 border-rose-500/30">DISPUTED</Badge>;
      case "NEEDS_REVIEW":
        return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">NEEDS REVIEW</Badge>;
      default:
        return <Badge variant="outline">{ver}</Badge>;
    }
  };

  const getSourceQualityBadge = (quality: string) => {
    switch (quality.toLowerCase()) {
      case "official":
        return <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 text-[10px]">OFFICIAL</Badge>;
      case "primary":
        return <Badge variant="outline" className="border-blue-500/40 text-blue-400 text-[10px]">PRIMARY</Badge>;
      case "secondary":
        return <Badge variant="outline" className="border-purple-500/40 text-purple-400 text-[10px]">SECONDARY</Badge>;
      case "community":
        return <Badge variant="outline" className="border-zinc-500/40 text-zinc-400 text-[10px]">COMMUNITY</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px]">{quality}</Badge>;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <HelpCircle className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                Why does the Brain know this?
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Inspectable knowledge proof: Evidence, sources, and provenance without hidden reasoning.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="mt-2 text-xs text-muted-foreground">Tracing knowledge path across evidence graph...</p>
          </div>
        ) : error || !data ? (
          <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-300">
            {error || "Claim details not found"}
          </div>
        ) : (
          <div className="space-y-4 text-xs">
            {/* Claim Statement Box */}
            <div className="rounded-lg border border-border bg-card p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] text-muted-foreground">Claim ID: {data.claim?.id}</span>
                <div className="flex items-center gap-1.5">
                  {getStateBadge(data.claim?.knowledge_state || "known")}
                  {getVerificationBadge(data.claim?.verification || "unverified")}
                </div>
              </div>
              <p className="text-sm font-semibold text-foreground">
                "{data.claim?.statement}"
              </p>
            </div>

            {/* Warnings banner for conflicted or outdated */}
            {data.claim?.knowledge_state === "conflicted" && (
              <div className="flex items-start gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-rose-300">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Conflicted Knowledge Warning:</span>
                  <p className="mt-0.5 text-[11px]">
                    This claim is marked CONFLICTED due to competing evidence or assertions. It must not be presented as settled fact.
                  </p>
                </div>
              </div>
            )}

            {data.claim?.knowledge_state === "outdated" && (
              <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-amber-300">
                <Clock className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Outdated Knowledge Warning:</span>
                  <p className="mt-0.5 text-[11px]">
                    This claim was marked OUTDATED. Historical validity preserved, but information is expired for current contexts.
                  </p>
                </div>
              </div>
            )}

            {/* Temporal validity context */}
            {(data.claim?.valid_from || data.claim?.valid_until) && (
              <div className="rounded-md border border-border bg-muted/40 p-3 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-foreground">
                  <Calendar className="h-3.5 w-3.5 text-primary" />
                  Temporal Validity Interval
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                  {data.claim?.valid_from && <div>Valid From: <span className="text-foreground">{data.claim.valid_from}</span></div>}
                  {data.claim?.valid_until && <div>Valid Until: <span className="text-foreground">{data.claim.valid_until}</span></div>}
                </div>
              </div>
            )}

            {/* Supporting Evidence */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 font-semibold text-foreground">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                Supporting Evidence ({data.supporting_evidence.length})
              </div>

              {data.supporting_evidence.length === 0 ? (
                <div className="rounded border border-border/80 bg-card p-3 text-muted-foreground text-[11px]">
                  No formal supporting external evidence attached yet. (AI output alone is NOT evidence).
                </div>
              ) : (
                <div className="space-y-2">
                  {data.supporting_evidence.map((ev) => (
                    <div key={ev.id} className="rounded-md border border-border bg-card p-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-foreground text-[11px]">
                          {ev.source?.title || "External Source"}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {ev.source?.source_quality && getSourceQualityBadge(ev.source.source_quality)}
                          {ev.source?.url && (
                            <a
                              href={ev.source.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary hover:underline flex items-center gap-0.5 text-[10px]"
                            >
                              Link <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          )}
                        </div>
                      </div>
                      {ev.excerpt && (
                        <p className="text-[11px] italic text-muted-foreground bg-muted/30 p-2 rounded">
                          "{ev.excerpt}"
                        </p>
                      )}
                      {ev.locator && (
                        <div className="text-[10px] text-muted-foreground font-mono">
                          Locator: {ev.locator}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Counter-Evidence */}
            {data.counter_evidence.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 font-semibold text-rose-400">
                  <XCircle className="h-4 w-4" />
                  Counter-Evidence / Contradictions ({data.counter_evidence.length})
                </div>
                <div className="space-y-2">
                  {data.counter_evidence.map((ev) => (
                    <div key={ev.id} className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-rose-300 text-[11px]">
                          {ev.source?.title || "Counter-Source"}
                        </span>
                        {ev.source?.url && (
                          <a
                            href={ev.source.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-rose-400 hover:underline flex items-center gap-0.5 text-[10px]"
                          >
                            Link <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        )}
                      </div>
                      {ev.excerpt && (
                        <p className="text-[11px] italic text-rose-200 bg-black/20 p-2 rounded">
                          "{ev.excerpt}"
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Provenance trace */}
            <div className="rounded-lg border border-border bg-card p-3 space-y-2">
              <div className="flex items-center gap-1.5 font-semibold text-foreground text-[11px]">
                <Database className="h-3.5 w-3.5 text-primary" />
                Provenance Chain
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                <div>
                  Origin: <span className="text-foreground">{data.provenance?.origin || "manual"}</span>
                </div>
                {data.provenance?.conversation_id && (
                  <div>
                    Episode: <span className="font-mono text-foreground">{data.provenance.conversation_id.slice(0, 8)}...</span>
                  </div>
                )}
                <div>
                  Recorded History: <span className="text-foreground">{data.version_history.length} version(s)</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

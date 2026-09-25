// =====================================================================
// KNOWLEDGE BRAIN — PHASE 9: CLAIM RETRIEVER
// First-class claim retrieval, temporal/status filtering, evidence & sources
// =====================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { TemporalIntent } from "./types";

export interface ClaimItem {
  id: string;
  node_id: string | null;
  claim_text?: string | undefined;
  statement?: string | undefined;
  claim_type?: string | undefined;
  status: string;
  knowledge_state?: string | undefined;
  verification?: string | undefined;
  confidence?: number | null | undefined;
  valid_from?: string | null | undefined;
  valid_until?: string | null | undefined;
  temporal_context?: Record<string, unknown> | null | undefined;
  superseded_by?: string | null | undefined;
  source_id?: string | null | undefined;
  created_at: string;
}

export interface InMemoryClaimDataset {
  claims: ClaimItem[];
  evidence?: any[] | undefined;
  sources?: any[] | undefined;
  conflicts?: any[] | undefined;
}

export interface EnrichedClaim {
  id: string;
  node_id: string | null;
  statement: string;
  claim_type: string;
  knowledge_state: string;
  verification: string;
  confidence: number;
  valid_from: string | null;
  valid_until: string | null;
  temporal_context: Record<string, unknown> | null;
  superseded_by: string | null;
  is_conflicted: boolean;
  is_outdated: boolean;
  is_superseded: boolean;
  supporting_evidence: any[];
  counter_evidence: any[];
  sources: any[];
  citation_token?: string | undefined;
}

export class ClaimRetriever {
  constructor(private supabase: SupabaseClient<Database> | null = null) {}

  /**
   * Retrieves and filters claims associated with relevant node IDs.
   * Respects temporal intent (Current vs Historical/Version-specific).
   */
  public async retrieveForNodes(
    nodeIds: string[],
    temporalIntent: TemporalIntent,
    context?: { claimDataset?: InMemoryClaimDataset } | undefined,
  ): Promise<EnrichedClaim[]> {
    return this.retrieveClaims(nodeIds, temporalIntent, context?.claimDataset);
  }

  public async retrieveClaims(
    nodeIds: string[],
    temporalIntent: TemporalIntent,
    dataset?: InMemoryClaimDataset | undefined,
    options: {
      maxClaims?: number | undefined;
      queryKeywords?: string[] | undefined;
    } = {},
  ): Promise<EnrichedClaim[]> {
    if (nodeIds.length === 0) return [];

    const maxClaims = options.maxClaims ?? 10;
    const nodeIdSet = new Set(nodeIds);

    // 1. In-memory retrieval
    if (dataset) {
      const allClaims = dataset.claims || [];
      const evidence = dataset.evidence || [];
      const sources = dataset.sources || [];
      const conflicts = dataset.conflicts || [];
      const sourceMap = new Map<string, any>(sources.map((s) => [s.id, s]));

      // Filter by node IDs
      let matched = allClaims.filter((c) => c.node_id && nodeIdSet.has(c.node_id));

      // Filter based on temporal intent
      matched = matched.filter((c) => {
        const kState = (c.knowledge_state || "").toLowerCase();
        const isOutdated = kState === "outdated" || c.status === "outdated";
        const isSuperseded = kState === "superseded" || c.status === "superseded";

        if (temporalIntent.isHistorical) {
          // If asking for a specific version
          if (temporalIntent.explicitVersion) {
            const cVer = (c.temporal_context as any)?.["version"] || "";
            const stmt = (c.claim_text || c.statement || "").toLowerCase();
            if (cVer && cVer.includes(temporalIntent.explicitVersion)) return true;
            if (stmt.includes(`version ${temporalIntent.explicitVersion}`) || stmt.includes(`v${temporalIntent.explicitVersion}`)) return true;
          }
          // Accept historical/outdated/superseded claims
          return true;
        }

        // Current mode: prioritize non-outdated, non-superseded claims
        if (temporalIntent.isCurrentOnly || !temporalIntent.isHistorical) {
          if (isOutdated || isSuperseded) {
            // Deprioritize unless no other claims exist
            return false;
          }
        }

        return true;
      });

      // Rank by confidence, verification, and keyword overlap
      const kwSet = new Set((options.queryKeywords || []).map((k) => k.toLowerCase()));
      matched.sort((a, b) => {
        const stmtA = (a.claim_text || a.statement || "").toLowerCase();
        const stmtB = (b.claim_text || b.statement || "").toLowerCase();
        const scoreA = (a.confidence ?? 0.8) + (a.verification === "verified" ? 0.3 : 0) + (kwSet.size > 0 ? Array.from(kwSet).filter((k) => stmtA.includes(k)).length * 0.2 : 0);
        const scoreB = (b.confidence ?? 0.8) + (b.verification === "verified" ? 0.3 : 0) + (kwSet.size > 0 ? Array.from(kwSet).filter((k) => stmtB.includes(k)).length * 0.2 : 0);
        return scoreB - scoreA;
      });

      const selected = matched.slice(0, maxClaims);

      // Enrich with evidence, sources, and conflict markers
      return selected.map((c, idx) => {
        const claimId = c.id;
        const claimEvidence = evidence.filter((e) => e.claim_id === claimId);
        const supporting: any[] = [];
        const counter: any[] = [];
        const claimSources: any[] = [];
        const seenSourceIds = new Set<string>();

        for (const ev of claimEvidence) {
          const src = sourceMap.get(ev.source_id);
          if (src && !seenSourceIds.has(src.id)) {
            seenSourceIds.add(src.id);
            claimSources.push({
              id: src.id,
              title: src.title,
              url: src.url || null,
              source_quality: src.source_quality || "unknown",
              availability: src.availability || "active",
            });
          }

          const stance = (ev.stance || "").toLowerCase();
          if (["support", "supported", "verified", "qualifies", "mentions"].includes(stance)) {
            supporting.push(ev);
          } else {
            counter.push(ev);
          }
        }

        // Direct claim source if available
        if (c.source_id && !seenSourceIds.has(c.source_id)) {
          const src = sourceMap.get(c.source_id);
          if (src) {
            seenSourceIds.add(src.id);
            claimSources.push({
              id: src.id,
              title: src.title,
              url: src.url || null,
              source_quality: src.source_quality || "unknown",
              availability: src.availability || "active",
            });
          }
        }

        const isConflicted =
          (c.knowledge_state || "").toLowerCase() === "conflicted" ||
          c.status === "conflicted" ||
          conflicts.some(
            (conf) => (conf.claim_a_id === claimId || conf.claim_b_id === claimId) && conf.status !== "RESOLVED",
          );

        return {
          id: c.id,
          node_id: c.node_id,
          statement: c.claim_text || c.statement || "",
          claim_type: c.claim_type || "fact",
          knowledge_state: c.knowledge_state || (isConflicted ? "conflicted" : "known"),
          verification: c.verification || "verified",
          confidence: c.confidence ?? 0.9,
          valid_from: c.valid_from || null,
          valid_until: c.valid_until || null,
          temporal_context: (c.temporal_context as Record<string, unknown>) || null,
          superseded_by: c.superseded_by || null,
          is_conflicted: isConflicted,
          is_outdated: (c.knowledge_state || "").toLowerCase() === "outdated" || c.status === "outdated",
          is_superseded: Boolean(c.superseded_by) || (c.knowledge_state || "").toLowerCase() === "superseded",
          supporting_evidence: supporting,
          counter_evidence: counter,
          sources: claimSources,
          citation_token: `[C${idx + 1}]`,
        };
      });
    }

    // 2. Database query
    if (this.supabase) {
      try {
        let query = this.supabase
          .from("knowledge_claims")
          .select("id, node_id, claim_text, claim_type, status, knowledge_state, verification, confidence, valid_from, valid_until, temporal_context, superseded_by, source_id, created_at")
          .in("node_id", nodeIds)
          .neq("status", "archived");

        if (!temporalIntent.isHistorical) {
          query = query.not("knowledge_state", "in", '("outdated","superseded")');
        }

        const { data: dbClaims, error } = await query.limit(maxClaims);
        if (!error && dbClaims && dbClaims.length > 0) {
          const claimIds = dbClaims.map((c) => c.id);

          // Fetch evidence
          const { data: dbEvidence } = await this.supabase
            .from("evidence")
            .select("id, claim_id, source_id, stance, excerpt, locator, source_location, strength")
            .in("claim_id", claimIds);

          // Fetch sources
          const sourceIds = Array.from(
            new Set([
              ...dbClaims.map((c) => c.source_id).filter(Boolean),
              ...(dbEvidence || []).map((e) => e.source_id).filter(Boolean),
            ]),
          ) as string[];

          let dbSources: any[] = [];
          if (sourceIds.length > 0) {
            const { data: sData } = await this.supabase
              .from("sources")
              .select("id, title, url, source_quality, availability")
              .in("id", sourceIds);
            dbSources = sData || [];
          }

          const sourceMap = new Map(dbSources.map((s) => [s.id, s]));

          return dbClaims.map((c, idx) => {
            const cEvidence = (dbEvidence || []).filter((e) => e.claim_id === c.id);
            const supporting: any[] = [];
            const counter: any[] = [];
            const claimSources: any[] = [];
            const seenSources = new Set<string>();

            for (const ev of cEvidence) {
              const src = sourceMap.get(ev.source_id);
              if (src && !seenSources.has(src.id)) {
                seenSources.add(src.id);
                claimSources.push(src);
              }
              const stance = (ev.stance || "").toLowerCase();
              if (["support", "supported", "verified", "qualifies", "mentions"].includes(stance)) {
                supporting.push(ev);
              } else {
                counter.push(ev);
              }
            }

            if (c.source_id && !seenSources.has(c.source_id)) {
              const src = sourceMap.get(c.source_id);
              if (src) {
                seenSources.add(src.id);
                claimSources.push(src);
              }
            }

            const kState = (c.knowledge_state || "").toLowerCase();
            return {
              id: c.id,
              node_id: c.node_id,
              statement: c.claim_text || "",
              claim_type: c.claim_type || "fact",
              knowledge_state: kState || "known",
              verification: c.verification || "verified",
              confidence: c.confidence ?? 0.9,
              valid_from: c.valid_from || null,
              valid_until: c.valid_until || null,
              temporal_context: (c.temporal_context as Record<string, unknown>) || null,
              superseded_by: c.superseded_by || null,
              is_conflicted: kState === "conflicted",
              is_outdated: kState === "outdated",
              is_superseded: Boolean(c.superseded_by) || kState === "superseded",
              supporting_evidence: supporting,
              counter_evidence: counter,
              sources: claimSources,
              citation_token: `[C${idx + 1}]`,
            };
          });
        }
      } catch (err) {
        console.warn("Database claim retrieval failed", err);
      }
    }

    return [];
  }
}

// =====================================================================
// KNOWLEDGE BRAIN — PHASE 8: EVIDENCE ENGINE
// Evidence graph, supporting vs counter-evidence, source quality & explainKnowledge
// =====================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type {
  EvidenceItem,
  ExplainKnowledgeResult,
  SourceQuality,
  SourceAvailability,
  EvidenceStance,
} from "./types";

export interface EvidenceEngineContext {
  claims?: any[];
  nodes?: any[];
  sources?: any[];
  evidence?: any[];
  conflicts?: any[];
  versions?: any[];
  provenance?: any[];
}

export class EvidenceEngine {
  constructor(private supabase: SupabaseClient<Database> | null = null) {}

  /**
   * Explains why the Brain knows a claim ("Why does the Brain know this?").
   * Returns a structured, inspectable trace with zero hidden chain-of-thought.
   */
  public async explainKnowledge(
    claimId: string,
    inMemoryContext?: EvidenceEngineContext,
  ): Promise<ExplainKnowledgeResult> {
    // 1. Try server-side RPC if Supabase is connected
    if (this.supabase && !inMemoryContext) {
      try {
        const { data, error } = await this.supabase.rpc("explain_claim_knowledge" as any, {
          p_claim_id: claimId,
        });
        if (!error && data && (data as any).found) {
          const res = data as any;
          return {
            found: true,
            claim: res.claim,
            node: res.node,
            supporting_evidence: res.supporting_evidence || [],
            counter_evidence: res.counter_evidence || [],
            sources: res.sources || [],
            conflicts: res.conflicts || [],
            version_history: res.version_history || [],
          };
        }
      } catch {
        // Fallback to client-side / memory
      }
    }

    // 2. In-memory / client-side resolution
    const claims = inMemoryContext?.claims || [];
    const claim = claims.find((c) => c.id === claimId);

    if (!claim) {
      return {
        found: false,
        supporting_evidence: [],
        counter_evidence: [],
        sources: [],
        conflicts: [],
        version_history: [],
      };
    }

    const nodes = inMemoryContext?.nodes || [];
    const nodeId = claim.node_id || claim.subject_node_id;
    const node = nodes.find((n) => n.id === nodeId) || null;

    const allEvidence: any[] = inMemoryContext?.evidence || [];
    const claimEvidence = allEvidence.filter((e) => e.claim_id === claimId);

    const sources: any[] = inMemoryContext?.sources || [];
    const sourceMap = new Map<string, any>(sources.map((s) => [s.id, s]));

    const supporting: EvidenceItem[] = [];
    const counter: EvidenceItem[] = [];
    const referencedSources: any[] = [];
    const seenSourceIds = new Set<string>();

    for (const ev of claimEvidence) {
      const src = sourceMap.get(ev.source_id) || null;
      if (src && !seenSourceIds.has(src.id)) {
        seenSourceIds.add(src.id);
        referencedSources.push({
          id: src.id,
          title: src.title,
          url: src.url || null,
          source_quality: (src.source_quality || "unknown") as SourceQuality,
          availability: (src.availability || "active") as SourceAvailability,
        });
      }

      const item: EvidenceItem = {
        id: ev.id,
        source_id: ev.source_id,
        claim_id: claimId,
        node_id: nodeId,
        stance: (ev.stance || "supported") as EvidenceStance,
        excerpt: ev.excerpt || null,
        locator: ev.locator || ev.source_location || null,
        source_location: ev.source_location || ev.locator || null,
        strength: ev.strength ?? ev.confidence ?? 1.0,
        confidence: ev.confidence ?? 1.0,
        content_hash: ev.content_hash || null,
        source: src
          ? {
              id: src.id,
              title: src.title,
              url: src.url,
              source_quality: (src.source_quality || "unknown") as SourceQuality,
              availability: (src.availability || "active") as SourceAvailability,
              reliability: src.reliability ?? 1.0,
            }
          : null,
        created_by: ev.created_by || "system",
        created_at: ev.created_at || new Date().toISOString(),
      };

      const stanceLower = (item.stance || "").toLowerCase();
      if (["supported", "support", "verified", "qualifies", "qualify", "mentions", "mention"].includes(stanceLower)) {
        supporting.push(item);
      } else {
        counter.push(item);
      }
    }

    // Direct claim source if attached
    if (claim.source_id && !seenSourceIds.has(claim.source_id)) {
      const src = sourceMap.get(claim.source_id);
      if (src) {
        seenSourceIds.add(src.id);
        referencedSources.push({
          id: src.id,
          title: src.title,
          url: src.url || null,
          source_quality: (src.source_quality || "unknown") as SourceQuality,
          availability: (src.availability || "active") as SourceAvailability,
        });
      }
    }

    // Conflicts
    const allConflicts: any[] = inMemoryContext?.conflicts || [];
    const relevantConflicts = allConflicts
      .filter((c) => (c.claim_a_id === claimId || c.claim_b_id === claimId) && c.status !== "RESOLVED")
      .map((c) => ({
        id: c.id,
        conflict_type: c.conflict_type,
        status: c.status,
        severity: c.severity,
        reason_summary: c.reason_summary,
        other_claim_id: c.claim_a_id === claimId ? c.claim_b_id : c.claim_a_id,
      }));

    // Provenance
    const allProv: any[] = inMemoryContext?.provenance || [];
    const prov = allProv.find((p) => p.subject_id === claimId) || null;

    // Version history
    const allVersions: any[] = inMemoryContext?.versions || [];
    const claimVersions = allVersions
      .filter((v) => v.subject_table === "knowledge_claims" && v.subject_id === claimId)
      .sort((a, b) => b.version - a.version)
      .map((v) => ({
        version: v.version,
        change_type: v.change_type || "UPDATE",
        reason_summary: v.reason_summary || null,
        created_at: v.created_at,
      }));

    return {
      found: true,
      claim: {
        id: claim.id,
        statement: claim.claim_text || claim.statement || "",
        claim_type: claim.claim_type || "fact",
        knowledge_state: claim.knowledge_state || "known",
        verification: claim.verification || "unverified",
        confidence: claim.confidence ?? 1.0,
        valid_from: claim.valid_from || null,
        valid_until: claim.valid_until || null,
        superseded_by: claim.superseded_by || null,
        created_at: claim.created_at || new Date().toISOString(),
        updated_at: claim.updated_at || new Date().toISOString(),
      },
      node: node ? { id: node.id, name: node.name, node_type: node.node_type } : null,
      supporting_evidence: supporting,
      counter_evidence: counter,
      sources: referencedSources,
      conflicts: relevantConflicts,
      provenance: prov
        ? {
            conversation_id: prov.conversation_id,
            message_id: prov.message_id,
            origin: prov.origin,
          }
        : null,
      version_history: claimVersions,
    };
  }

  /**
   * Attaches evidence to a claim with stance and locator metadata.
   */
  public static createEvidenceItem(
    claimId: string,
    sourceId: string,
    stance: EvidenceStance,
    options: {
      excerpt?: string | null;
      locator?: string | null;
      strength?: number;
      created_by?: string;
    } = {},
  ): EvidenceItem {
    return {
      id: `ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      source_id: sourceId,
      claim_id: claimId,
      stance,
      excerpt: options.excerpt || null,
      locator: options.locator || null,
      source_location: options.locator || null,
      strength: options.strength ?? 1.0,
      confidence: options.strength ?? 1.0,
      created_by: options.created_by || "system",
      created_at: new Date().toISOString(),
    };
  }

  /**
   * Attaches evidence to a claim and records it in context and database.
   */
  public async attachEvidence(
    params: {
      claim_id: string;
      source_id: string;
      stance: EvidenceStance | string;
      excerpt?: string | null;
      locator?: string | null;
      strength?: number;
      source_quality?: SourceQuality | string;
      user_id?: string;
    },
    context?: EvidenceEngineContext,
  ): Promise<EvidenceItem> {
    const item = EvidenceEngine.createEvidenceItem(
      params.claim_id,
      params.source_id,
      params.stance as EvidenceStance,
      {
        excerpt: params.excerpt,
        locator: params.locator,
        strength: params.strength,
        created_by: params.user_id,
      },
    );

    if (context && context.evidence) {
      context.evidence.push(item);
    }

    if (this.supabase) {
      try {
        await this.supabase.from("evidence" as any).insert({
          id: item.id,
          claim_id: item.claim_id,
          source_id: item.source_id,
          stance: item.stance,
          excerpt: item.excerpt,
          locator: item.locator,
          strength: item.strength,
          created_by: item.created_by,
        });
      } catch {
        // Fallback / ignore in test mode
      }
    }

    return item;
  }
}


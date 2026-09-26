// =====================================================================
// KNOWLEDGE BRAIN — PHASE 11: BRAIN OBSERVER
// Continuous inspection of Brain health, knowledge gaps, conflicts,
// evidence absence, broken sources, duplicates & retrieval feedback
// =====================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type {
  BrainObservation,
  ObservationSeverity,
  ObservationType,
} from "./types";
import type {
  KnowledgeNode,
  KnowledgeClaim,
  KnowledgeEdge,
} from "@/lib/knowledge-engine/types";

export interface ObserverScanDataset {
  nodes?: KnowledgeNode[];
  edges?: KnowledgeEdge[];
  claims?: any[];
  sources?: any[];
  evidence?: any[];
  conflicts?: any[];
  gaps?: any[];
  feedback?: any[];
  proposals?: any[];
}

export class BrainObserver {
  private inMemoryObservations: Map<string, BrainObservation> = new Map();

  constructor(private supabase: SupabaseClient<Database> | null = null) {}

  /**
   * Generates a deterministic deduplication key for an observation:
   * (observation_type, target_type, target_id).
   */
  public getDeduplicationKey(
    type: ObservationType,
    targetType: string,
    targetId: string,
  ): string {
    return `${type}:${targetType}:${targetId}`;
  }

  /**
   * Records or updates a deduplicated observation.
   */
  public async recordObservation(
    obs: Omit<BrainObservation, "id" | "first_detected_at" | "last_detected_at" | "occurrence_count"> & {
      id?: string;
    },
  ): Promise<BrainObservation> {
    const key = this.getDeduplicationKey(obs.observation_type, obs.target_type, obs.target_id);
    const now = new Date().toISOString();

    const existing = this.inMemoryObservations.get(key);
    let record: BrainObservation;

    if (existing) {
      // Re-confirm existing observation: bump count, update timestamp, merge signals
      record = {
        ...existing,
        last_detected_at: now,
        occurrence_count: existing.occurrence_count + 1,
        summary: obs.summary || existing.summary,
        severity: this.escalateSeverity(existing.severity, obs.severity),
        signals: { ...existing.signals, ...obs.signals },
        status: existing.status === "resolved" ? "open" : existing.status,
      };
    } else {
      record = {
        id: obs.id || `obs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        user_id: obs.user_id,
        observation_type: obs.observation_type,
        target_type: obs.target_type,
        target_id: obs.target_id,
        severity: obs.severity,
        confidence: obs.confidence,
        status: obs.status || "open",
        summary: obs.summary,
        signals: obs.signals || {},
        detected_by: obs.detected_by || "brain_observer",
        first_detected_at: now,
        last_detected_at: now,
        occurrence_count: 1,
        resolved_at: null,
        metadata: obs.metadata || {},
      };
    }

    this.inMemoryObservations.set(key, record);

    // Persist to database if client connected
    if (this.supabase) {
      try {
        await this.supabase.rpc("record_brain_observation", {
          p_observation_type: record.observation_type,
          p_target_type: record.target_type,
          p_target_id: record.target_id,
          p_summary: record.summary,
          p_severity: record.severity,
          p_confidence: record.confidence,
          p_signals: record.signals as any,
          p_detected_by: record.detected_by,
          p_metadata: record.metadata as any,
        });
      } catch (err) {
        console.warn("Failed to record observation to database, preserved in memory", err);
      }
    }

    return record;
  }

  /**
   * Scans dataset or database to discover operational weaknesses.
   */
  public async scan(dataset?: ObserverScanDataset, userId: string = "system"): Promise<BrainObservation[]> {
    const observations: BrainObservation[] = [];

    // 1. Check Claims for Missing Evidence or Outdated Status
    if (dataset?.claims) {
      const evidenceClaimIds = new Set(
        (dataset.evidence || []).map((e: any) => e.claim_id || e.id),
      );

      for (const claim of dataset.claims) {
        // Missing evidence check
        if (!evidenceClaimIds.has(claim.id) && claim.status !== "quarantined") {
          const obs = await this.recordObservation({
            user_id: userId,
            observation_type: "MISSING_EVIDENCE",
            target_type: "claim",
            target_id: claim.id,
            severity: claim.verification_status === "verified" ? "high" : "medium",
            confidence: 0.95,
            status: "open",
            summary: `Claim "${claim.claim_text?.slice(0, 60)}..." lacks supporting evidence.`,
            signals: { claim_id: claim.id, status: claim.status },
            detected_by: "claim_integrity_scanner",
          });
          observations.push(obs);
        }

        // Outdated claim check
        if (claim.is_outdated || claim.status === "outdated") {
          const obs = await this.recordObservation({
            user_id: userId,
            observation_type: "OUTDATED_KNOWLEDGE",
            target_type: "claim",
            target_id: claim.id,
            severity: "medium",
            confidence: 0.98,
            status: "open",
            summary: `Claim "${claim.claim_text?.slice(0, 60)}..." is marked outdated and requires revalidation.`,
            signals: { claim_id: claim.id, is_outdated: true },
            detected_by: "temporal_freshness_scanner",
          });
          observations.push(obs);
        }
      }
    }

    // 2. Check Knowledge Gaps
    if (dataset?.gaps) {
      for (const gap of dataset.gaps) {
        if (gap.status === "open") {
          const obs = await this.recordObservation({
            user_id: userId,
            observation_type: "KNOWLEDGE_GAP",
            target_type: "gap",
            target_id: gap.id,
            severity: gap.priority === "high" || gap.priority === "critical" ? "high" : "medium",
            confidence: 0.90,
            status: "open",
            summary: `Unresolved knowledge gap: "${gap.query}"`,
            signals: { gap_id: gap.id, related_nodes: gap.related_node_ids },
            detected_by: "gap_tracker",
          });
          observations.push(obs);
        }
      }
    }

    // 3. Check Broken Sources
    if (dataset?.sources) {
      for (const src of dataset.sources) {
        if (src.availability === "broken" || src.availability === "offline") {
          const obs = await this.recordObservation({
            user_id: userId,
            observation_type: "BROKEN_SOURCE",
            target_type: "source",
            target_id: src.id,
            severity: "high",
            confidence: 1.0,
            status: "open",
            summary: `Source "${src.title || src.url}" is unavailable or broken.`,
            signals: { source_id: src.id, url: src.url },
            detected_by: "source_monitor",
          });
          observations.push(obs);
        }
      }
    }

    // 4. Check Open Conflicts
    if (dataset?.conflicts) {
      for (const conflict of dataset.conflicts) {
        if (conflict.status === "open") {
          const obs = await this.recordObservation({
            user_id: userId,
            observation_type: "OPEN_CONFLICT",
            target_type: "claim",
            target_id: conflict.id || conflict.claim_a_id,
            severity: conflict.severity === "high" ? "high" : "medium",
            confidence: 1.0,
            status: "open",
            summary: `Unresolved contradiction: ${conflict.reason_summary || "Contradictory claims detected"}`,
            signals: { conflict_id: conflict.id, claim_a: conflict.claim_a_id, claim_b: conflict.claim_b_id },
            detected_by: "conflict_scanner",
          });
          observations.push(obs);
        }
      }
    }

    // 5. Check Orphan Nodes
    if (dataset?.nodes) {
      const connectedNodeIds = new Set<string>();
      for (const e of dataset.edges || []) {
        if (e.status !== "archived") {
          connectedNodeIds.add(e.source_node_id);
          connectedNodeIds.add(e.target_node_id);
        }
      }

      for (const node of dataset.nodes) {
        if (!node.parent_id && !connectedNodeIds.has(node.id) && node.status === "active") {
          const obs = await this.recordObservation({
            user_id: userId,
            observation_type: "ORPHAN_NODE",
            target_type: "node",
            target_id: node.id,
            severity: "low",
            confidence: 0.95,
            status: "open",
            summary: `Concept "${node.name}" is an isolated orphan without hierarchy or relations.`,
            signals: { node_id: node.id, node_type: node.node_type },
            detected_by: "structure_analyst",
          });
          observations.push(obs);
        }
      }
    }

    // 6. Check Retrieval Feedback
    if (dataset?.feedback) {
      for (const fb of dataset.feedback) {
        if (fb.rating === "negative" || fb.feedback_type === "wrong_retrieval" || fb.feedback_type === "outdated_knowledge") {
          const obs = await this.recordObservation({
            user_id: userId,
            observation_type: "RETRIEVAL_FAILURE",
            target_type: "retrieval",
            target_id: fb.retrieval_run_id || fb.id,
            severity: "medium",
            confidence: 0.90,
            status: "open",
            summary: `User flagged retrieval as unsatisfactory: ${fb.notes || fb.feedback_type}`,
            signals: { feedback_id: fb.id, feedback_type: fb.feedback_type },
            detected_by: "feedback_listener",
          });
          observations.push(obs);
        }
      }
    }

    return observations;
  }

  public getObservations(filter?: { status?: string; type?: ObservationType }): BrainObservation[] {
    let list = Array.from(this.inMemoryObservations.values());
    if (filter?.status) {
      list = list.filter((o) => o.status === filter.status);
    }
    if (filter?.type) {
      list = list.filter((o) => o.observation_type === filter.type);
    }
    return list;
  }

  private escalateSeverity(current: ObservationSeverity, incoming: ObservationSeverity): ObservationSeverity {
    const rank: Record<ObservationSeverity, number> = {
      low: 1,
      medium: 2,
      high: 3,
      critical: 4,
    };
    return rank[incoming] > rank[current] ? incoming : current;
  }
}

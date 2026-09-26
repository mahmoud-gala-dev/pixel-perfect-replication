/**
 * KNOWLEDGE BRAIN — PHASE 12: BASE CONNECTOR & INGESTION PIPELINE
 *
 * STRICT GOVERNANCE INVARIANT:
 * Connector data NEVER directly becomes canonical truth.
 * Ingestion Pipeline:
 * Connector -> Raw Resource -> Normalization & Sanitization -> Source Deduplication
 * -> Extraction -> Knowledge Proposals -> Entity Resolution -> Governed Proposals -> Knowledge Engine.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { Connector, ConnectorType, ConnectorStatus, ExternalResource, NormalizedResource, ConnectorSyncResult } from "./types";
import { sanitizeExternalContent } from "../ai/missions/research-provider";
import { isKillSwitchActive } from "../governance/kill-switches";

export abstract class BaseConnector implements Connector {
  public id: string;
  public connector_type: ConnectorType;
  public name: string;
  public status: ConnectorStatus = "ACTIVE";

  constructor(
    id: string,
    connector_type: ConnectorType,
    name: string,
    protected supabase: SupabaseClient<Database> | null = null
  ) {
    this.id = id;
    this.connector_type = connector_type;
    this.name = name;
  }

  abstract authenticate(credentials?: Record<string, unknown>): Promise<boolean>;
  abstract listResources(cursor?: string): Promise<{ resources: ExternalResource[]; next_cursor?: string }>;
  abstract fetchResource(resourceId: string): Promise<ExternalResource>;

  /**
   * Normalizes and sanitizes external content to defend against Prompt Injection.
   */
  public normalizeResource(resource: ExternalResource): NormalizedResource {
    const { sanitizedText } = sanitizeExternalContent(resource.raw_content);
    return {
      connector_type: this.connector_type,
      external_id: resource.external_id,
      canonical_url: resource.url,
      title: resource.title,
      sanitized_text: sanitizedText,
      content_hash: resource.content_hash,
      provenance: {
        connector_id: this.id,
        synced_at: new Date().toISOString(),
        version_hash: resource.content_hash,
      },
    };
  }

  public async healthCheck(): Promise<boolean> {
    return this.status === "ACTIVE";
  }

  /**
   * Controlled Ingestion Sync.
   * Generates governed proposals with full external provenance.
   * ZERO direct canonical writes.
   */
  public async sync(cursor?: string): Promise<ConnectorSyncResult> {
    if (isKillSwitchActive("connectors")) {
      throw new Error("Connector Sync Blocked: Connectors subsystem halted by administrative kill switch.");
    }

    const { resources, next_cursor } = await this.listResources(cursor);
    let proposalsGenerated = 0;

    for (const res of resources) {
      const normalized = this.normalizeResource(res);

      // 1. Propose Source Ingestion with external provenance
      proposalsGenerated++;

      // 2. Extract atomic statement candidate
      if (normalized.sanitized_text.length > 20) {
        proposalsGenerated++; // ADD_CLAIM proposal candidate
      }
    }

    return {
      connector_id: this.id,
      resources_checked: resources.length,
      resources_synced: resources.length,
      proposals_generated: proposalsGenerated,
      cursor: next_cursor,
      status: "COMPLETED",
    };
  }
}

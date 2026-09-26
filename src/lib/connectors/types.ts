/**
 * KNOWLEDGE BRAIN — PHASE 12: CONNECTOR TYPES
 */

export type ConnectorType =
  | "github"
  | "web"
  | "notion"
  | "gdrive"
  | "rss"
  | "api"
  | "custom";

export type ConnectorStatus = "ACTIVE" | "PAUSED" | "ERROR" | "DISCONNECTED";

export interface ExternalResource {
  id: string;
  external_id: string;
  title: string;
  url?: string;
  raw_content: string;
  content_hash: string;
  last_modified?: string;
  metadata?: Record<string, unknown>;
}

export interface NormalizedResource {
  connector_type: ConnectorType;
  external_id: string;
  canonical_url?: string;
  title: string;
  sanitized_text: string;
  content_hash: string;
  provenance: {
    connector_id: string;
    synced_at: string;
    version_hash: string;
  };
}

export interface ConnectorSyncResult {
  connector_id: string;
  resources_checked: number;
  resources_synced: number;
  proposals_generated: number;
  cursor?: string;
  status: "COMPLETED" | "PARTIAL" | "FAILED";
  error?: string;
}

export interface Connector {
  id: string;
  connector_type: ConnectorType;
  name: string;
  status: ConnectorStatus;
  authenticate(credentials?: Record<string, unknown>): Promise<boolean>;
  listResources(cursor?: string): Promise<{ resources: ExternalResource[]; next_cursor?: string }>;
  fetchResource(resourceId: string): Promise<ExternalResource>;
  normalizeResource(resource: ExternalResource): NormalizedResource;
  sync(cursor?: string): Promise<ConnectorSyncResult>;
  healthCheck(): Promise<boolean>;
}

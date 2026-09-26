/**
 * KNOWLEDGE BRAIN — PHASE 12: IMMUTABLE AUDIT LOGGING
 * Append-only structured audit logs for sensitive actions and decisions.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { BrainRole } from "./roles";

export type AuditAction =
  | "ROLE_CHANGE"
  | "CLAIM_VERIFIED"
  | "CLAIM_DISPUTED"
  | "CONFLICT_RESOLVED"
  | "ROLLBACK_EXECUTED"
  | "NODE_MERGED"
  | "TAXONOMY_RESTRUCTURED"
  | "POLICY_CHANGED"
  | "KILL_SWITCH_TOGGLED"
  | "HIGH_RISK_COMMIT"
  | "MISSION_APPROVED"
  | "CONNECTOR_AUTHORIZED"
  | "BRAIN_EXPORTED"
  | "SECURITY_ALERT_TRIGGERED";

export interface AuditEventInput {
  actor_id: string;
  actor_role: BrainRole;
  action: AuditAction;
  target_type: string;
  target_id: string;
  correlation_id?: string;
  result?: "SUCCESS" | "FAILED" | "REJECTED";
  diff?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface AuditLogEntry extends AuditEventInput {
  id: string;
  created_at: string;
}

/**
 * In-memory buffer for offline/test environments
 */
const inMemoryAuditLogs: AuditLogEntry[] = [];

/**
 * Records an immutable audit log entry.
 * STRICT INVARIANT: Passwords, API secrets, and sensitive tokens are strictly scrubbed before logging.
 */
export async function recordAuditEvent(
  supabase: SupabaseClient<Database> | null,
  event: AuditEventInput
): Promise<AuditLogEntry> {
  // Scrub any accidental secrets from metadata or diff
  const sanitizedDiff = sanitizeAuditData(event.diff || {});
  const sanitizedMetadata = sanitizeAuditData(event.metadata || {});

  const entry: AuditLogEntry = {
    id: `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    actor_id: event.actor_id,
    actor_role: event.actor_role,
    action: event.action,
    target_type: event.target_type,
    target_id: event.target_id,
    correlation_id: event.correlation_id || `corr-${Date.now().toString(36)}`,
    result: event.result || "SUCCESS",
    diff: sanitizedDiff,
    metadata: sanitizedMetadata,
    created_at: new Date().toISOString(),
  };

  inMemoryAuditLogs.push(entry);

  if (supabase) {
    try {
      await supabase.from("brain_audit_logs").insert({
        actor_id: entry.actor_id,
        actor_role: entry.actor_role,
        action: entry.action,
        target_type: entry.target_type,
        target_id: entry.target_id,
        correlation_id: entry.correlation_id,
        result: entry.result,
        diff: entry.diff as any,
        metadata: entry.metadata as any,
      });
    } catch {
      // Offline fallback: keep in memory
    }
  }

  return entry;
}

/**
 * Helper to fetch audit history in tests or UI.
 */
export function getRecentAuditLogs(limit = 50): AuditLogEntry[] {
  return [...inMemoryAuditLogs].reverse().slice(0, limit);
}

/**
 * Recursively scrubs known sensitive keys from audit payloads.
 */
function sanitizeAuditData(data: Record<string, unknown>): Record<string, unknown> {
  const SENSITIVE_KEYS = [
    "password",
    "secret",
    "token",
    "apikey",
    "api_key",
    "auth",
    "credential",
    "private_key",
    "bearer",
  ];
  const cleaned: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.some((s) => lowerKey.includes(s.toLowerCase()))) {
      cleaned[key] = "[REDACTED]";
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      cleaned[key] = sanitizeAuditData(value as Record<string, unknown>);
    } else {
      cleaned[key] = value;
    }
  }

  return cleaned;
}

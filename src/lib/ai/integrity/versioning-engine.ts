// =====================================================================
// KNOWLEDGE BRAIN — PHASE 8: VERSIONING ENGINE
// Deterministic sequential version history & change tracking
// =====================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { KnowledgeVersion, KnowledgeChange } from "./types";

export interface VersionCreationInput {
  subject_table: string;
  subject_id: string;
  snapshot: Record<string, unknown>;
  change_type?: string;
  previous_version_id?: string | null;
  knowledge_transaction_id?: string | null;
  knowledge_operation_id?: string | null;
  reason_summary?: string;
  diff?: Record<string, unknown> | null;
  conversation_id?: string | null;
  message_id?: string | null;
  user_id?: string;
}

export class VersioningEngine {
  private inMemoryVersions: KnowledgeVersion[] = [];
  private inMemoryChanges: KnowledgeChange[] = [];
  private changeSequence = 0;

  constructor(private supabase: SupabaseClient<Database> | null = null) {}

  /**
   * Records a new deterministic version and corresponding change log entry.
   * Ensures v1, v2, v3... sequencing per entity.
   */
  public async recordVersion(input: VersionCreationInput): Promise<{
    version: KnowledgeVersion;
    change: KnowledgeChange;
  }> {
    const userId = input.user_id || "system";
    const now = new Date().toISOString();

    // 1. Fetch latest version number to determine next version
    let nextVersion = 1;
    let prevVersionId: string | null = input.previous_version_id || null;
    let prevSnapshot: Record<string, unknown> | null = null;

    if (this.supabase) {
      try {
        const { data: latest } = await this.supabase
          .from("knowledge_versions" as any)
          .select("id, version, snapshot")
          .eq("subject_table", input.subject_table)
          .eq("subject_id", input.subject_id)
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latest) {
          nextVersion = (latest as any).version + 1;
          prevVersionId = (latest as any).id;
          prevSnapshot = (latest as any).snapshot;
        }
      } catch {
        // Fallback to in-memory check
      }
    }

    // Check in-memory store
    const existingMem = this.inMemoryVersions
      .filter((v) => v.subject_table === input.subject_table && v.subject_id === input.subject_id)
      .sort((a, b) => b.version - a.version);

    const firstMem = existingMem[0];
    if (firstMem) {
      if (firstMem.version >= nextVersion) {
        nextVersion = firstMem.version + 1;
        prevVersionId = firstMem.id;
        prevSnapshot = firstMem.snapshot;
      }
    }

    const versionId = `ver-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const newVersion: KnowledgeVersion = {
      id: versionId,
      subject_table: input.subject_table,
      subject_id: input.subject_id,
      version: nextVersion,
      snapshot: input.snapshot,
      change_type: input.change_type || "UPDATE",
      previous_version_id: prevVersionId,
      knowledge_transaction_id: input.knowledge_transaction_id || null,
      knowledge_operation_id: input.knowledge_operation_id || null,
      reason_summary: input.reason_summary || null,
      metadata: {},
      created_by: userId,
      created_at: now,
    };

    const changeId = `chg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const newChange: KnowledgeChange = {
      id: changeId,
      subject_table: input.subject_table,
      subject_id: input.subject_id,
      change_type: input.change_type || "UPDATE",
      previous_state: prevSnapshot,
      new_state: input.snapshot,
      diff: input.diff || null,
      reason: input.reason_summary || null,
      reason_summary: input.reason_summary || null,
      operation_id: input.knowledge_operation_id || null,
      transaction_id: input.knowledge_transaction_id || null,
      conversation_id: input.conversation_id || null,
      message_id: input.message_id || null,
      changed_by: userId,
      created_at: now,
      metadata: { seq: ++this.changeSequence },
    };

    // Save to in-memory cache
    this.inMemoryVersions.push(newVersion);
    this.inMemoryChanges.push(newChange);

    // Save to database if connected
    if (this.supabase) {
      try {
        await this.supabase.from("knowledge_versions" as any).insert({
          id: newVersion.id,
          subject_table: newVersion.subject_table,
          subject_id: newVersion.subject_id,
          version: newVersion.version,
          snapshot: newVersion.snapshot,
          change_type: newVersion.change_type,
          previous_version_id: newVersion.previous_version_id,
          knowledge_transaction_id: newVersion.knowledge_transaction_id,
          knowledge_operation_id: newVersion.knowledge_operation_id,
          reason_summary: newVersion.reason_summary,
          created_by: newVersion.created_by,
          created_at: newVersion.created_at,
        });

        await this.supabase.from("knowledge_changes" as any).insert({
          id: newChange.id,
          subject_table: newChange.subject_table,
          subject_id: newChange.subject_id,
          change_type: newChange.change_type,
          previous_state: newChange.previous_state,
          new_state: newChange.new_state,
          diff: newChange.diff,
          reason: newChange.reason,
          reason_summary: newChange.reason_summary,
          operation_id: newChange.operation_id,
          transaction_id: newChange.transaction_id,
          conversation_id: newChange.conversation_id,
          message_id: newChange.message_id,
          changed_by: newChange.changed_by,
          created_at: newChange.created_at,
        });
      } catch (err) {
        console.warn("Failed to persist version/change to database, kept in memory", err);
      }
    }

    return { version: newVersion, change: newChange };
  }

  /**
   * Retrieves all historical versions for an entity in chronological order (latest first).
   */
  public async getEntityVersions(subjectTable: string, subjectId: string): Promise<KnowledgeVersion[]> {
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from("knowledge_versions" as any)
          .select("*")
          .eq("subject_table", subjectTable)
          .eq("subject_id", subjectId)
          .order("version", { ascending: false });

        if (!error && data && data.length > 0) {
          return data as unknown as KnowledgeVersion[];
        }
      } catch {
        // Fallback to in-memory
      }
    }

    return this.inMemoryVersions
      .filter((v) => v.subject_table === subjectTable && v.subject_id === subjectId)
      .sort((a, b) => b.version - a.version);
  }

  /**
   * Retrieves a specific version of an entity.
   */
  public async getVersion(subjectTable: string, subjectId: string, versionNumber: number): Promise<KnowledgeVersion | null> {
    const all = await this.getEntityVersions(subjectTable, subjectId);
    return all.find((v) => v.version === versionNumber) || null;
  }

  /**
   * Retrieves all change events for an entity.
   */
  public async getEntityChanges(subjectTable: string, subjectId: string): Promise<KnowledgeChange[]> {
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from("knowledge_changes" as any)
          .select("*")
          .eq("subject_table", subjectTable)
          .eq("subject_id", subjectId)
          .order("created_at", { ascending: false });

        if (!error && data && data.length > 0) {
          return data as unknown as KnowledgeChange[];
        }
      } catch {
        // Fallback to in-memory
      }
    }

    return this.inMemoryChanges
      .filter((c) => c.subject_table === subjectTable && c.subject_id === subjectId)
      .sort((a, b) => {
        const timeDiff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        if (timeDiff !== 0) return timeDiff;
        const seqA = (a.metadata as any)?.["seq"] ?? 0;
        const seqB = (b.metadata as any)?.["seq"] ?? 0;
        return seqB - seqA;
      });
  }
}

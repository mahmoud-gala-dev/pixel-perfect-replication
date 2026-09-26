export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_runs: {
        Row: {
          agent_type: string
          completed_at: string | null
          created_at: string
          error: string | null
          id: string
          input: Json | null
          mission_id: string | null
          model: string | null
          provider: string | null
          reason_summary: string | null
          started_at: string
          status: string
          structured_output: Json | null
          usage_metadata: Json | null
          user_id: string
        }
        Insert: {
          agent_type: string
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          input?: Json | null
          mission_id?: string | null
          model?: string | null
          provider?: string | null
          reason_summary?: string | null
          started_at?: string
          status?: string
          structured_output?: Json | null
          usage_metadata?: Json | null
          user_id?: string
        }
        Update: {
          agent_type?: string
          completed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          input?: Json | null
          mission_id?: string | null
          model?: string | null
          provider?: string | null
          reason_summary?: string | null
          started_at?: string
          status?: string
          structured_output?: Json | null
          usage_metadata?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "brain_missions"
            referencedColumns: ["id"]
          },
        ]
      }
      answer_claim_support: {
        Row: {
          answer_claim_id: string
          created_at: string
          evidence_id: string | null
          id: string
          knowledge_claim_id: string | null
          notes: string | null
          source_id: string | null
          support_type: string
        }
        Insert: {
          answer_claim_id: string
          created_at?: string
          evidence_id?: string | null
          id?: string
          knowledge_claim_id?: string | null
          notes?: string | null
          source_id?: string | null
          support_type?: string
        }
        Update: {
          answer_claim_id?: string
          created_at?: string
          evidence_id?: string | null
          id?: string
          knowledge_claim_id?: string | null
          notes?: string | null
          source_id?: string | null
          support_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "answer_claim_support_answer_claim_id_fkey"
            columns: ["answer_claim_id"]
            isOneToOne: false
            referencedRelation: "answer_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answer_claim_support_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answer_claim_support_knowledge_claim_id_fkey"
            columns: ["knowledge_claim_id"]
            isOneToOne: false
            referencedRelation: "knowledge_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "answer_claim_support_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      answer_claims: {
        Row: {
          assistant_message_id: string | null
          citation_token: string | null
          confidence: number | null
          created_at: string
          id: string
          metadata: Json
          position: number
          statement: string
          support_status: string
        }
        Insert: {
          assistant_message_id?: string | null
          citation_token?: string | null
          confidence?: number | null
          created_at?: string
          id?: string
          metadata?: Json
          position?: number
          statement: string
          support_status?: string
        }
        Update: {
          assistant_message_id?: string | null
          citation_token?: string | null
          confidence?: number | null
          created_at?: string
          id?: string
          metadata?: Json
          position?: number
          statement?: string
          support_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "answer_claims_assistant_message_id_fkey"
            columns: ["assistant_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_alerts: {
        Row: {
          acknowledged_at: string | null
          alert_type: string
          created_at: string
          id: string
          metadata: Json | null
          severity: string
          status: string
          summary: string
          target_id: string | null
          target_type: string | null
          user_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          alert_type: string
          created_at?: string
          id?: string
          metadata?: Json | null
          severity?: string
          status?: string
          summary: string
          target_id?: string | null
          target_type?: string | null
          user_id?: string
        }
        Update: {
          acknowledged_at?: string | null
          alert_type?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          severity?: string
          status?: string
          summary?: string
          target_id?: string | null
          target_type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      brain_audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: string
          correlation_id: string | null
          created_at: string
          diff: Json | null
          id: string
          metadata: Json | null
          result: string
          target_id: string
          target_type: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: string
          correlation_id?: string | null
          created_at?: string
          diff?: Json | null
          id?: string
          metadata?: Json | null
          result?: string
          target_id: string
          target_type: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: string
          correlation_id?: string | null
          created_at?: string
          diff?: Json | null
          id?: string
          metadata?: Json | null
          result?: string
          target_id?: string
          target_type?: string
        }
        Relationships: []
      }
      brain_connector_resources: {
        Row: {
          connector_id: string
          content_hash: string | null
          created_at: string
          external_resource_id: string
          id: string
          last_seen_at: string
          status: string
          title: string
          url: string | null
          user_id: string
        }
        Insert: {
          connector_id: string
          content_hash?: string | null
          created_at?: string
          external_resource_id: string
          id?: string
          last_seen_at?: string
          status?: string
          title: string
          url?: string | null
          user_id?: string
        }
        Update: {
          connector_id?: string
          content_hash?: string | null
          created_at?: string
          external_resource_id?: string
          id?: string
          last_seen_at?: string
          status?: string
          title?: string
          url?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brain_connector_resources_connector_id_fkey"
            columns: ["connector_id"]
            isOneToOne: false
            referencedRelation: "brain_connectors"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_connectors: {
        Row: {
          config_encrypted: string | null
          connector_type: string
          created_at: string
          id: string
          last_synced_at: string | null
          name: string
          status: string
          sync_cursor: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          config_encrypted?: string | null
          connector_type: string
          created_at?: string
          id?: string
          last_synced_at?: string | null
          name: string
          status?: string
          sync_cursor?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          config_encrypted?: string | null
          connector_type?: string
          created_at?: string
          id?: string
          last_synced_at?: string | null
          name?: string
          status?: string
          sync_cursor?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      brain_goals: {
        Row: {
          created_at: string
          description: string | null
          id: string
          metadata: Json | null
          priority: string
          scope: Json | null
          status: string
          success_criteria: Json | null
          target_date: string | null
          title: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          priority?: string
          scope?: Json | null
          status?: string
          success_criteria?: Json | null
          target_date?: string | null
          title: string
          user_id?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json | null
          priority?: string
          scope?: Json | null
          status?: string
          success_criteria?: Json | null
          target_date?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      brain_missions: {
        Row: {
          assigned_agent: string
          budget: Json | null
          budget_used: Json | null
          completed_at: string | null
          constraints: Json | null
          created_at: string
          description: string | null
          goal: string
          id: string
          metadata: Json | null
          mission_type: string
          outcome: string | null
          outcome_summary: string | null
          priority: string
          reviewed_at: string | null
          risk_level: string
          started_at: string | null
          status: string
          target_id: string | null
          target_type: string | null
          title: string
          trigger_observation_id: string | null
          user_id: string
        }
        Insert: {
          assigned_agent?: string
          budget?: Json | null
          budget_used?: Json | null
          completed_at?: string | null
          constraints?: Json | null
          created_at?: string
          description?: string | null
          goal: string
          id?: string
          metadata?: Json | null
          mission_type: string
          outcome?: string | null
          outcome_summary?: string | null
          priority?: string
          reviewed_at?: string | null
          risk_level?: string
          started_at?: string | null
          status?: string
          target_id?: string | null
          target_type?: string | null
          title: string
          trigger_observation_id?: string | null
          user_id?: string
        }
        Update: {
          assigned_agent?: string
          budget?: Json | null
          budget_used?: Json | null
          completed_at?: string | null
          constraints?: Json | null
          created_at?: string
          description?: string | null
          goal?: string
          id?: string
          metadata?: Json | null
          mission_type?: string
          outcome?: string | null
          outcome_summary?: string | null
          priority?: string
          reviewed_at?: string | null
          risk_level?: string
          started_at?: string | null
          status?: string
          target_id?: string | null
          target_type?: string | null
          title?: string
          trigger_observation_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brain_missions_trigger_observation_id_fkey"
            columns: ["trigger_observation_id"]
            isOneToOne: false
            referencedRelation: "brain_observations"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_observations: {
        Row: {
          confidence: number | null
          created_at: string
          detected_by: string
          first_detected_at: string
          id: string
          last_detected_at: string
          metadata: Json | null
          observation_type: string
          occurrence_count: number
          resolved_at: string | null
          severity: string
          signals: Json | null
          status: string
          summary: string
          target_id: string
          target_type: string
          user_id: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          detected_by?: string
          first_detected_at?: string
          id?: string
          last_detected_at?: string
          metadata?: Json | null
          observation_type: string
          occurrence_count?: number
          resolved_at?: string | null
          severity?: string
          signals?: Json | null
          status?: string
          summary: string
          target_id: string
          target_type: string
          user_id?: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          detected_by?: string
          first_detected_at?: string
          id?: string
          last_detected_at?: string
          metadata?: Json | null
          observation_type?: string
          occurrence_count?: number
          resolved_at?: string | null
          severity?: string
          signals?: Json | null
          status?: string
          summary?: string
          target_id?: string
          target_type?: string
          user_id?: string
        }
        Relationships: []
      }
      brain_user_roles: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      conversations: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          metadata: Json
          status: Database["public"]["Enums"]["knowledge_status"]
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          metadata?: Json
          status?: Database["public"]["Enums"]["knowledge_status"]
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          metadata?: Json
          status?: Database["public"]["Enums"]["knowledge_status"]
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      evidence: {
        Row: {
          claim_id: string | null
          confidence: number | null
          content_hash: string | null
          created_at: string
          created_by: string
          entry_id: string | null
          evidence_type: string
          excerpt: string | null
          id: string
          locator: string | null
          metadata: Json
          node_id: string | null
          observed_at: string | null
          source_id: string
          source_location: string | null
          stance: Database["public"]["Enums"]["verification_status"]
          strength: number | null
        }
        Insert: {
          claim_id?: string | null
          confidence?: number | null
          content_hash?: string | null
          created_at?: string
          created_by?: string
          entry_id?: string | null
          evidence_type?: string
          excerpt?: string | null
          id?: string
          locator?: string | null
          metadata?: Json
          node_id?: string | null
          observed_at?: string | null
          source_id: string
          source_location?: string | null
          stance?: Database["public"]["Enums"]["verification_status"]
          strength?: number | null
        }
        Update: {
          claim_id?: string | null
          confidence?: number | null
          content_hash?: string | null
          created_at?: string
          created_by?: string
          entry_id?: string | null
          evidence_type?: string
          excerpt?: string | null
          id?: string
          locator?: string | null
          metadata?: Json
          node_id?: string | null
          observed_at?: string | null
          source_id?: string
          source_location?: string | null
          stance?: Database["public"]["Enums"]["verification_status"]
          strength?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "evidence_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "knowledge_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "knowledge_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "knowledge_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_aliases: {
        Row: {
          alias: string
          alias_type: string
          canonical_alias: string | null
          created_at: string
          created_by: string
          id: string
          language: string | null
          metadata: Json
          node_id: string
          normalized_alias: string | null
          updated_at: string
        }
        Insert: {
          alias: string
          alias_type?: string
          canonical_alias?: string | null
          created_at?: string
          created_by?: string
          id?: string
          language?: string | null
          metadata?: Json
          node_id: string
          normalized_alias?: string | null
          updated_at?: string
        }
        Update: {
          alias?: string
          alias_type?: string
          canonical_alias?: string | null
          created_at?: string
          created_by?: string
          id?: string
          language?: string | null
          metadata?: Json
          node_id?: string
          normalized_alias?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_aliases_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "knowledge_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_changes: {
        Row: {
          change_type: string
          changed_by: string
          confidence: number | null
          conversation_id: string | null
          created_at: string
          diff: Json | null
          id: string
          message_id: string | null
          metadata: Json | null
          new_state: Json | null
          operation_id: string | null
          previous_state: Json | null
          reason: string | null
          reason_summary: string | null
          source_id: string | null
          subject_id: string
          subject_table: string
          transaction_id: string | null
        }
        Insert: {
          change_type: string
          changed_by?: string
          confidence?: number | null
          conversation_id?: string | null
          created_at?: string
          diff?: Json | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          new_state?: Json | null
          operation_id?: string | null
          previous_state?: Json | null
          reason?: string | null
          reason_summary?: string | null
          source_id?: string | null
          subject_id: string
          subject_table: string
          transaction_id?: string | null
        }
        Update: {
          change_type?: string
          changed_by?: string
          confidence?: number | null
          conversation_id?: string | null
          created_at?: string
          diff?: Json | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          new_state?: Json | null
          operation_id?: string | null
          previous_state?: Json | null
          reason?: string | null
          reason_summary?: string | null
          source_id?: string | null
          subject_id?: string
          subject_table?: string
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_changes_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_changes_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_changes_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "knowledge_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_changes_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_changes_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "knowledge_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          embedding: string | null
          embedding_model: string | null
          entry_id: string | null
          id: string
          metadata: Json
          node_id: string | null
          section: string | null
          source_id: string | null
          updated_at: string
        }
        Insert: {
          chunk_index?: number
          content: string
          created_at?: string
          embedding?: string | null
          embedding_model?: string | null
          entry_id?: string | null
          id?: string
          metadata?: Json
          node_id?: string | null
          section?: string | null
          source_id?: string | null
          updated_at?: string
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          embedding?: string | null
          embedding_model?: string | null
          entry_id?: string | null
          id?: string
          metadata?: Json
          node_id?: string | null
          section?: string | null
          source_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "knowledge_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_chunks_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "knowledge_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_chunks_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_claims: {
        Row: {
          claim_text: string
          claim_type: string
          confidence: number | null
          created_at: string
          created_by: string
          deprecated_at: string | null
          entry_id: string | null
          id: string
          knowledge_state: string
          last_verified_at: string | null
          metadata: Json
          node_id: string | null
          normalized_statement: string | null
          observed_at: string | null
          scope: string
          source_id: string | null
          status: Database["public"]["Enums"]["knowledge_status"]
          superseded_at: string | null
          superseded_by: string | null
          temporal_context: Json | null
          updated_at: string
          valid_from: string | null
          valid_until: string | null
          verification: Database["public"]["Enums"]["verification_status"]
        }
        Insert: {
          claim_text: string
          claim_type?: string
          confidence?: number | null
          created_at?: string
          created_by?: string
          deprecated_at?: string | null
          entry_id?: string | null
          id?: string
          knowledge_state?: string
          last_verified_at?: string | null
          metadata?: Json
          node_id?: string | null
          normalized_statement?: string | null
          observed_at?: string | null
          scope?: string
          source_id?: string | null
          status?: Database["public"]["Enums"]["knowledge_status"]
          superseded_at?: string | null
          superseded_by?: string | null
          temporal_context?: Json | null
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
          verification?: Database["public"]["Enums"]["verification_status"]
        }
        Update: {
          claim_text?: string
          claim_type?: string
          confidence?: number | null
          created_at?: string
          created_by?: string
          deprecated_at?: string | null
          entry_id?: string | null
          id?: string
          knowledge_state?: string
          last_verified_at?: string | null
          metadata?: Json
          node_id?: string | null
          normalized_statement?: string | null
          observed_at?: string | null
          scope?: string
          source_id?: string | null
          status?: Database["public"]["Enums"]["knowledge_status"]
          superseded_at?: string | null
          superseded_by?: string | null
          temporal_context?: Json | null
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
          verification?: Database["public"]["Enums"]["verification_status"]
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_claims_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "knowledge_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_claims_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "knowledge_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_claims_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_claims_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "knowledge_claims"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_conflicts: {
        Row: {
          claim_a_id: string
          claim_b_id: string
          conflict_type: string
          created_at: string
          created_by: string
          detected_by: string
          id: string
          metadata: Json | null
          reason_summary: string | null
          resolution_notes: string | null
          resolution_type: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          status: string
          updated_at: string
        }
        Insert: {
          claim_a_id: string
          claim_b_id: string
          conflict_type: string
          created_at?: string
          created_by?: string
          detected_by?: string
          id?: string
          metadata?: Json | null
          reason_summary?: string | null
          resolution_notes?: string | null
          resolution_type?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          updated_at?: string
        }
        Update: {
          claim_a_id?: string
          claim_b_id?: string
          conflict_type?: string
          created_at?: string
          created_by?: string
          detected_by?: string
          id?: string
          metadata?: Json | null
          reason_summary?: string | null
          resolution_notes?: string | null
          resolution_type?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_conflicts_claim_a_id_fkey"
            columns: ["claim_a_id"]
            isOneToOne: false
            referencedRelation: "knowledge_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_conflicts_claim_b_id_fkey"
            columns: ["claim_b_id"]
            isOneToOne: false
            referencedRelation: "knowledge_claims"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_edges: {
        Row: {
          confidence: number | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          metadata: Json
          relation_type: string
          source_node_id: string
          status: Database["public"]["Enums"]["knowledge_status"]
          target_node_id: string
          updated_at: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          metadata?: Json
          relation_type: string
          source_node_id: string
          status?: Database["public"]["Enums"]["knowledge_status"]
          target_node_id: string
          updated_at?: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          metadata?: Json
          relation_type?: string
          source_node_id?: string
          status?: Database["public"]["Enums"]["knowledge_status"]
          target_node_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_edges_source_node_id_fkey"
            columns: ["source_node_id"]
            isOneToOne: false
            referencedRelation: "knowledge_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_edges_target_node_id_fkey"
            columns: ["target_node_id"]
            isOneToOne: false
            referencedRelation: "knowledge_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_embeddings: {
        Row: {
          chunk_index: number
          content: string | null
          created_at: string
          created_by: string
          dimensions: number
          embedding: string | null
          id: string
          metadata: Json
          model: string
          subject_id: string
          subject_table: string
        }
        Insert: {
          chunk_index?: number
          content?: string | null
          created_at?: string
          created_by?: string
          dimensions: number
          embedding?: string | null
          id?: string
          metadata?: Json
          model: string
          subject_id: string
          subject_table: string
        }
        Update: {
          chunk_index?: number
          content?: string | null
          created_at?: string
          created_by?: string
          dimensions?: number
          embedding?: string | null
          id?: string
          metadata?: Json
          model?: string
          subject_id?: string
          subject_table?: string
        }
        Relationships: []
      }
      knowledge_entries: {
        Row: {
          content: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          id: string
          language: string
          metadata: Json
          slug: string
          status: Database["public"]["Enums"]["knowledge_status"]
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          id?: string
          language?: string
          metadata?: Json
          slug: string
          status?: Database["public"]["Enums"]["knowledge_status"]
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          content?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          id?: string
          language?: string
          metadata?: Json
          slug?: string
          status?: Database["public"]["Enums"]["knowledge_status"]
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      knowledge_entry_nodes: {
        Row: {
          created_at: string
          created_by: string
          entry_id: string
          id: string
          node_id: string
          relevance: number | null
          role: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          entry_id: string
          id?: string
          node_id: string
          relevance?: number | null
          role?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          entry_id?: string
          id?: string
          node_id?: string
          relevance?: number | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_entry_nodes_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "knowledge_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_entry_nodes_node_id_fkey"
            columns: ["node_id"]
            isOneToOne: false
            referencedRelation: "knowledge_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_extraction_runs: {
        Row: {
          completed_at: string | null
          conversation_id: string
          created_at: string
          error: string | null
          id: string
          metrics: Json
          model: string | null
          provider: string | null
          relevance: string
          started_at: string
          status: string
          trigger_message_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          conversation_id: string
          created_at?: string
          error?: string | null
          id?: string
          metrics?: Json
          model?: string | null
          provider?: string | null
          relevance?: string
          started_at?: string
          status?: string
          trigger_message_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          completed_at?: string | null
          conversation_id?: string
          created_at?: string
          error?: string | null
          id?: string
          metrics?: Json
          model?: string | null
          provider?: string | null
          relevance?: string
          started_at?: string
          status?: string
          trigger_message_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_extraction_runs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_extraction_runs_trigger_message_id_fkey"
            columns: ["trigger_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_gaps: {
        Row: {
          conversation_id: string | null
          created_at: string
          gap_type: string
          id: string
          message_id: string | null
          metadata: Json
          normalized_query: string | null
          priority: string
          query: string
          related_node_ids: string[]
          resolved_at: string | null
          resolved_by: string | null
          status: string
          suggested_action: string | null
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          gap_type?: string
          id?: string
          message_id?: string | null
          metadata?: Json
          normalized_query?: string | null
          priority?: string
          query: string
          related_node_ids?: string[]
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          suggested_action?: string | null
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          gap_type?: string
          id?: string
          message_id?: string | null
          metadata?: Json
          normalized_query?: string | null
          priority?: string
          query?: string
          related_node_ids?: string[]
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          suggested_action?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_gaps_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_gaps_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_nodes: {
        Row: {
          canonical_name: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          description: string | null
          embedded_at: string | null
          embedding_status: string | null
          id: string
          metadata: Json
          name: string
          node_type: Database["public"]["Enums"]["node_type"]
          parent_id: string | null
          scope: string
          slug: string
          status: Database["public"]["Enums"]["knowledge_status"]
          summary: string | null
          updated_at: string
        }
        Insert: {
          canonical_name?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          description?: string | null
          embedded_at?: string | null
          embedding_status?: string | null
          id?: string
          metadata?: Json
          name: string
          node_type?: Database["public"]["Enums"]["node_type"]
          parent_id?: string | null
          scope?: string
          slug: string
          status?: Database["public"]["Enums"]["knowledge_status"]
          summary?: string | null
          updated_at?: string
        }
        Update: {
          canonical_name?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          description?: string | null
          embedded_at?: string | null
          embedding_status?: string | null
          id?: string
          metadata?: Json
          name?: string
          node_type?: Database["public"]["Enums"]["node_type"]
          parent_id?: string | null
          scope?: string
          slug?: string
          status?: Database["public"]["Enums"]["knowledge_status"]
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_nodes_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "knowledge_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_operations: {
        Row: {
          approved_by: string | null
          confidence: number | null
          conversation_id: string | null
          created_at: string
          diff: Json | null
          error: string | null
          executed_at: string | null
          id: string
          message_id: string | null
          operation_type: string
          payload: Json
          plan_id: string | null
          previous_state: Json | null
          proposal_id: string | null
          proposed_state: Json | null
          reason: string | null
          reason_summary: string | null
          requested_by: string
          result: Json | null
          risk_level: string | null
          status: Database["public"]["Enums"]["operation_status"]
          target_id: string | null
          target_type: string | null
          transaction_id: string | null
          trust_tier: string | null
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          confidence?: number | null
          conversation_id?: string | null
          created_at?: string
          diff?: Json | null
          error?: string | null
          executed_at?: string | null
          id?: string
          message_id?: string | null
          operation_type: string
          payload?: Json
          plan_id?: string | null
          previous_state?: Json | null
          proposal_id?: string | null
          proposed_state?: Json | null
          reason?: string | null
          reason_summary?: string | null
          requested_by?: string
          result?: Json | null
          risk_level?: string | null
          status?: Database["public"]["Enums"]["operation_status"]
          target_id?: string | null
          target_type?: string | null
          transaction_id?: string | null
          trust_tier?: string | null
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          confidence?: number | null
          conversation_id?: string | null
          created_at?: string
          diff?: Json | null
          error?: string | null
          executed_at?: string | null
          id?: string
          message_id?: string | null
          operation_type?: string
          payload?: Json
          plan_id?: string | null
          previous_state?: Json | null
          proposal_id?: string | null
          proposed_state?: Json | null
          reason?: string | null
          reason_summary?: string | null
          requested_by?: string
          result?: Json | null
          risk_level?: string | null
          status?: Database["public"]["Enums"]["operation_status"]
          target_id?: string | null
          target_type?: string | null
          transaction_id?: string | null
          trust_tier?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_operations_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_operations_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_operations_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "knowledge_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_operations_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "knowledge_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_operations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "knowledge_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_plans: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          committed_at: string | null
          conversation_id: string | null
          created_at: string
          created_by: string
          diff_summary: Json | null
          extraction_run_id: string | null
          id: string
          learning_mode: string
          metadata: Json | null
          overall_confidence: number | null
          plan_version: number
          risk_level: string
          status: string
          summary: Json | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          committed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string
          diff_summary?: Json | null
          extraction_run_id?: string | null
          id?: string
          learning_mode?: string
          metadata?: Json | null
          overall_confidence?: number | null
          plan_version?: number
          risk_level?: string
          status?: string
          summary?: Json | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          committed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string
          diff_summary?: Json | null
          extraction_run_id?: string | null
          id?: string
          learning_mode?: string
          metadata?: Json | null
          overall_confidence?: number | null
          plan_version?: number
          risk_level?: string
          status?: string
          summary?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_plans_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_plans_extraction_run_id_fkey"
            columns: ["extraction_run_id"]
            isOneToOne: false
            referencedRelation: "knowledge_extraction_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_proposals: {
        Row: {
          conversation_id: string
          created_at: string
          extraction_confidence: number | null
          extraction_run_id: string | null
          id: string
          model: string | null
          original_payload: Json | null
          payload: Json
          proposal_type: string
          provider: string | null
          rejection_reason: string | null
          source_message_id: string | null
          status: string
          updated_at: string
          user_id: string
          validation_status: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          extraction_confidence?: number | null
          extraction_run_id?: string | null
          id?: string
          model?: string | null
          original_payload?: Json | null
          payload?: Json
          proposal_type: string
          provider?: string | null
          rejection_reason?: string | null
          source_message_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          validation_status?: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          extraction_confidence?: number | null
          extraction_run_id?: string | null
          id?: string
          model?: string | null
          original_payload?: Json | null
          payload?: Json
          proposal_type?: string
          provider?: string | null
          rejection_reason?: string | null
          source_message_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          validation_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_proposals_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_proposals_extraction_run_id_fkey"
            columns: ["extraction_run_id"]
            isOneToOne: false
            referencedRelation: "knowledge_extraction_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_proposals_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_provenance: {
        Row: {
          confidence: number | null
          conversation_id: string | null
          created_at: string
          created_by: string
          id: string
          message_id: string | null
          metadata: Json
          note: string | null
          origin: Database["public"]["Enums"]["provenance_origin"]
          source_id: string | null
          subject_id: string
          subject_table: string
        }
        Insert: {
          confidence?: number | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          message_id?: string | null
          metadata?: Json
          note?: string | null
          origin: Database["public"]["Enums"]["provenance_origin"]
          source_id?: string | null
          subject_id: string
          subject_table: string
        }
        Update: {
          confidence?: number | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string
          id?: string
          message_id?: string | null
          metadata?: Json
          note?: string | null
          origin?: Database["public"]["Enums"]["provenance_origin"]
          source_id?: string | null
          subject_id?: string
          subject_table?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_provenance_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_provenance_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_provenance_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_resolution_candidates: {
        Row: {
          alias_score: number
          candidate_node_id: string
          combined_score: number
          created_at: string
          exact_score: number
          graph_score: number
          hierarchy_score: number
          id: string
          rank: number
          resolution_result_id: string
          semantic_score: number
          signals: Json
          text_score: number
          type_score: number
        }
        Insert: {
          alias_score?: number
          candidate_node_id: string
          combined_score?: number
          created_at?: string
          exact_score?: number
          graph_score?: number
          hierarchy_score?: number
          id?: string
          rank?: number
          resolution_result_id: string
          semantic_score?: number
          signals?: Json
          text_score?: number
          type_score?: number
        }
        Update: {
          alias_score?: number
          candidate_node_id?: string
          combined_score?: number
          created_at?: string
          exact_score?: number
          graph_score?: number
          hierarchy_score?: number
          id?: string
          rank?: number
          resolution_result_id?: string
          semantic_score?: number
          signals?: Json
          text_score?: number
          type_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_resolution_candidates_candidate_node_id_fkey"
            columns: ["candidate_node_id"]
            isOneToOne: false
            referencedRelation: "knowledge_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_resolution_candidates_resolution_result_id_fkey"
            columns: ["resolution_result_id"]
            isOneToOne: false
            referencedRelation: "knowledge_resolution_results"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_resolution_results: {
        Row: {
          canonical_node_id: string | null
          created_at: string
          extraction_confidence: number | null
          extraction_run_id: string | null
          id: string
          manual_override: boolean
          manual_override_at: string | null
          manual_override_by: string | null
          match_type: string
          metadata: Json
          proposal_id: string
          reason_summary: string | null
          resolution_confidence: number
          resolver_version: string
          selected_candidate_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          canonical_node_id?: string | null
          created_at?: string
          extraction_confidence?: number | null
          extraction_run_id?: string | null
          id?: string
          manual_override?: boolean
          manual_override_at?: string | null
          manual_override_by?: string | null
          match_type?: string
          metadata?: Json
          proposal_id: string
          reason_summary?: string | null
          resolution_confidence?: number
          resolver_version?: string
          selected_candidate_id?: string | null
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          canonical_node_id?: string | null
          created_at?: string
          extraction_confidence?: number | null
          extraction_run_id?: string | null
          id?: string
          manual_override?: boolean
          manual_override_at?: string | null
          manual_override_by?: string | null
          match_type?: string
          metadata?: Json
          proposal_id?: string
          reason_summary?: string | null
          resolution_confidence?: number
          resolver_version?: string
          selected_candidate_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_resolution_results_canonical_node_id_fkey"
            columns: ["canonical_node_id"]
            isOneToOne: false
            referencedRelation: "knowledge_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_resolution_results_extraction_run_id_fkey"
            columns: ["extraction_run_id"]
            isOneToOne: false
            referencedRelation: "knowledge_extraction_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_resolution_results_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "knowledge_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_resolution_results_selected_candidate_id_fkey"
            columns: ["selected_candidate_id"]
            isOneToOne: false
            referencedRelation: "knowledge_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_settings: {
        Row: {
          allowed_domains: Json | null
          auto_add_aliases: boolean
          auto_add_claims: boolean
          auto_add_relations: boolean
          auto_create_nodes: boolean
          autonomy_mode: string
          blocked_domains: Json | null
          daily_mission_budget: number
          kill_switch_auto_learning: boolean
          kill_switch_connectors: boolean
          kill_switch_embeddings: boolean
          kill_switch_missions: boolean
          kill_switch_research: boolean
          learning_mode: string
          max_ai_calls_per_mission: number
          max_concurrent_missions: number
          max_research_calls_per_mission: number
          max_sources_per_mission: number
          min_claim_confidence: number
          min_node_confidence: number
          min_relation_confidence: number
          require_evidence_for_claims: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          allowed_domains?: Json | null
          auto_add_aliases?: boolean
          auto_add_claims?: boolean
          auto_add_relations?: boolean
          auto_create_nodes?: boolean
          autonomy_mode?: string
          blocked_domains?: Json | null
          daily_mission_budget?: number
          kill_switch_auto_learning?: boolean
          kill_switch_connectors?: boolean
          kill_switch_embeddings?: boolean
          kill_switch_missions?: boolean
          kill_switch_research?: boolean
          learning_mode?: string
          max_ai_calls_per_mission?: number
          max_concurrent_missions?: number
          max_research_calls_per_mission?: number
          max_sources_per_mission?: number
          min_claim_confidence?: number
          min_node_confidence?: number
          min_relation_confidence?: number
          require_evidence_for_claims?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          allowed_domains?: Json | null
          auto_add_aliases?: boolean
          auto_add_claims?: boolean
          auto_add_relations?: boolean
          auto_create_nodes?: boolean
          autonomy_mode?: string
          blocked_domains?: Json | null
          daily_mission_budget?: number
          kill_switch_auto_learning?: boolean
          kill_switch_connectors?: boolean
          kill_switch_embeddings?: boolean
          kill_switch_missions?: boolean
          kill_switch_research?: boolean
          learning_mode?: string
          max_ai_calls_per_mission?: number
          max_concurrent_missions?: number
          max_research_calls_per_mission?: number
          max_sources_per_mission?: number
          min_claim_confidence?: number
          min_node_confidence?: number
          min_relation_confidence?: number
          require_evidence_for_claims?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      knowledge_transactions: {
        Row: {
          approved_by: string | null
          completed_at: string | null
          conversation_id: string | null
          id: string
          initiated_by: string
          metadata: Json | null
          operation_count: number
          plan_id: string | null
          started_at: string
          status: string
          summary: Json | null
        }
        Insert: {
          approved_by?: string | null
          completed_at?: string | null
          conversation_id?: string | null
          id?: string
          initiated_by?: string
          metadata?: Json | null
          operation_count?: number
          plan_id?: string | null
          started_at?: string
          status?: string
          summary?: Json | null
        }
        Update: {
          approved_by?: string | null
          completed_at?: string | null
          conversation_id?: string | null
          id?: string
          initiated_by?: string
          metadata?: Json | null
          operation_count?: number
          plan_id?: string | null
          started_at?: string
          status?: string
          summary?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_transactions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_transactions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "knowledge_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_versions: {
        Row: {
          change_type: string | null
          created_at: string
          created_by: string
          id: string
          knowledge_operation_id: string | null
          knowledge_transaction_id: string | null
          metadata: Json | null
          previous_version_id: string | null
          reason_summary: string | null
          snapshot: Json
          subject_id: string
          subject_table: string
          version: number
        }
        Insert: {
          change_type?: string | null
          created_at?: string
          created_by?: string
          id?: string
          knowledge_operation_id?: string | null
          knowledge_transaction_id?: string | null
          metadata?: Json | null
          previous_version_id?: string | null
          reason_summary?: string | null
          snapshot: Json
          subject_id: string
          subject_table: string
          version: number
        }
        Update: {
          change_type?: string | null
          created_at?: string
          created_by?: string
          id?: string
          knowledge_operation_id?: string | null
          knowledge_transaction_id?: string | null
          metadata?: Json | null
          previous_version_id?: string | null
          reason_summary?: string | null
          snapshot?: Json
          subject_id?: string
          subject_table?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_versions_knowledge_operation_id_fkey"
            columns: ["knowledge_operation_id"]
            isOneToOne: false
            referencedRelation: "knowledge_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_versions_knowledge_transaction_id_fkey"
            columns: ["knowledge_transaction_id"]
            isOneToOne: false
            referencedRelation: "knowledge_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_versions_previous_version_id_fkey"
            columns: ["previous_version_id"]
            isOneToOne: false
            referencedRelation: "knowledge_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          metadata: Json
          model: string | null
          role: Database["public"]["Enums"]["message_role"]
          token_count: number | null
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          metadata?: Json
          model?: string | null
          role: Database["public"]["Enums"]["message_role"]
          token_count?: number | null
          user_id?: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          model?: string | null
          role?: Database["public"]["Enums"]["message_role"]
          token_count?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      relation_types: {
        Row: {
          allows_self_relation: boolean
          created_at: string
          description: string | null
          id: string
          inverse_key: string | null
          is_symmetric: boolean
          key: string
          metadata: Json
          name: string
          status: Database["public"]["Enums"]["knowledge_status"]
          updated_at: string
        }
        Insert: {
          allows_self_relation?: boolean
          created_at?: string
          description?: string | null
          id?: string
          inverse_key?: string | null
          is_symmetric?: boolean
          key: string
          metadata?: Json
          name: string
          status?: Database["public"]["Enums"]["knowledge_status"]
          updated_at?: string
        }
        Update: {
          allows_self_relation?: boolean
          created_at?: string
          description?: string | null
          id?: string
          inverse_key?: string | null
          is_symmetric?: boolean
          key?: string
          metadata?: Json
          name?: string
          status?: Database["public"]["Enums"]["knowledge_status"]
          updated_at?: string
        }
        Relationships: []
      }
      research_findings: {
        Row: {
          confidence: number | null
          created_at: string
          evidence_excerpt: string | null
          finding_type: string
          id: string
          metadata: Json | null
          related_entity_refs: Json | null
          research_run_id: string | null
          source_id: string | null
          source_title: string | null
          source_url: string | null
          statement: string
          status: string
          user_id: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          evidence_excerpt?: string | null
          finding_type: string
          id?: string
          metadata?: Json | null
          related_entity_refs?: Json | null
          research_run_id?: string | null
          source_id?: string | null
          source_title?: string | null
          source_url?: string | null
          statement: string
          status?: string
          user_id?: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          evidence_excerpt?: string | null
          finding_type?: string
          id?: string
          metadata?: Json | null
          related_entity_refs?: Json | null
          research_run_id?: string | null
          source_id?: string | null
          source_title?: string | null
          source_url?: string | null
          statement?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_findings_research_run_id_fkey"
            columns: ["research_run_id"]
            isOneToOne: false
            referencedRelation: "research_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_findings_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      research_runs: {
        Row: {
          budget_used: Json | null
          completed_at: string | null
          created_at: string
          error: string | null
          findings_summary: string | null
          id: string
          metadata: Json | null
          mission_id: string | null
          research_question: string
          search_plan: Json | null
          sources_checked: Json | null
          started_at: string
          status: string
          user_id: string
        }
        Insert: {
          budget_used?: Json | null
          completed_at?: string | null
          created_at?: string
          error?: string | null
          findings_summary?: string | null
          id?: string
          metadata?: Json | null
          mission_id?: string | null
          research_question: string
          search_plan?: Json | null
          sources_checked?: Json | null
          started_at?: string
          status?: string
          user_id?: string
        }
        Update: {
          budget_used?: Json | null
          completed_at?: string | null
          created_at?: string
          error?: string | null
          findings_summary?: string | null
          id?: string
          metadata?: Json | null
          mission_id?: string | null
          research_question?: string
          search_plan?: Json | null
          sources_checked?: Json | null
          started_at?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_runs_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "brain_missions"
            referencedColumns: ["id"]
          },
        ]
      }
      retrieval_feedback: {
        Row: {
          assistant_message_id: string | null
          created_at: string
          feedback_type: string | null
          id: string
          notes: string | null
          rating: string
          retrieval_run_id: string
          user_id: string | null
        }
        Insert: {
          assistant_message_id?: string | null
          created_at?: string
          feedback_type?: string | null
          id?: string
          notes?: string | null
          rating: string
          retrieval_run_id: string
          user_id?: string | null
        }
        Update: {
          assistant_message_id?: string | null
          created_at?: string
          feedback_type?: string | null
          id?: string
          notes?: string | null
          rating?: string
          retrieval_run_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retrieval_feedback_assistant_message_id_fkey"
            columns: ["assistant_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retrieval_feedback_retrieval_run_id_fkey"
            columns: ["retrieval_run_id"]
            isOneToOne: false
            referencedRelation: "retrieval_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      retrieval_items: {
        Row: {
          created_at: string
          id: string
          object_id: string
          object_type: string
          rank: number
          retrieval_method: string
          retrieval_run_id: string
          score: number
          score_breakdown: Json
          selected_for_context: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          object_id: string
          object_type: string
          rank?: number
          retrieval_method: string
          retrieval_run_id: string
          score?: number
          score_breakdown?: Json
          selected_for_context?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          object_id?: string
          object_type?: string
          rank?: number
          retrieval_method?: string
          retrieval_run_id?: string
          score?: number
          score_breakdown?: Json
          selected_for_context?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "retrieval_items_retrieval_run_id_fkey"
            columns: ["retrieval_run_id"]
            isOneToOne: false
            referencedRelation: "retrieval_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      retrieval_runs: {
        Row: {
          answer_mode: string
          assistant_message_id: string | null
          completed_at: string | null
          conversation_id: string | null
          created_at: string
          duration_ms: number | null
          grounding_state: string
          id: string
          metadata: Json
          normalized_query: string | null
          query: string
          query_type: string
          started_at: string
          status: string
          user_message_id: string | null
        }
        Insert: {
          answer_mode?: string
          assistant_message_id?: string | null
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          duration_ms?: number | null
          grounding_state?: string
          id?: string
          metadata?: Json
          normalized_query?: string | null
          query: string
          query_type?: string
          started_at?: string
          status?: string
          user_message_id?: string | null
        }
        Update: {
          answer_mode?: string
          assistant_message_id?: string | null
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          duration_ms?: number | null
          grounding_state?: string
          id?: string
          metadata?: Json
          normalized_query?: string | null
          query?: string
          query_type?: string
          started_at?: string
          status?: string
          user_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retrieval_runs_assistant_message_id_fkey"
            columns: ["assistant_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retrieval_runs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retrieval_runs_user_message_id_fkey"
            columns: ["user_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_graph_views: {
        Row: {
          created_at: string
          depth: number
          filters: Json
          id: string
          layout: string
          name: string
          root_node_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          depth?: number
          filters?: Json
          id?: string
          layout?: string
          name: string
          root_node_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          depth?: number
          filters?: Json
          id?: string
          layout?: string
          name?: string
          root_node_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_graph_views_root_node_id_fkey"
            columns: ["root_node_id"]
            isOneToOne: false
            referencedRelation: "knowledge_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          accessed_at: string | null
          author: string | null
          availability: string
          content_hash: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          id: string
          last_checked_at: string | null
          metadata: Json
          published_at: string | null
          publisher: string | null
          reliability: number | null
          source_kind: Database["public"]["Enums"]["source_kind"]
          source_quality: string
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          accessed_at?: string | null
          author?: string | null
          availability?: string
          content_hash?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          id?: string
          last_checked_at?: string | null
          metadata?: Json
          published_at?: string | null
          publisher?: string | null
          reliability?: number | null
          source_kind?: Database["public"]["Enums"]["source_kind"]
          source_quality?: string
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          accessed_at?: string | null
          author?: string | null
          availability?: string
          content_hash?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          id?: string
          last_checked_at?: string | null
          metadata?: Json
          published_at?: string | null
          publisher?: string | null
          reliability?: number | null
          source_kind?: Database["public"]["Enums"]["source_kind"]
          source_quality?: string
          title?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      archive_conversation: {
        Args: { p_conversation_id: string }
        Returns: Json
      }
      check_brain_data_integrity: { Args: never; Returns: Json }
      commit_knowledge_plan: {
        Args: { p_approved_operation_ids?: string[]; p_plan_id: string }
        Returns: Json
      }
      explain_claim_knowledge: { Args: { p_claim_id: string }; Returns: Json }
      find_graph_paths: {
        Args: {
          p_max_depth?: number
          p_source_node_id: string
          p_target_node_id: string
        }
        Returns: {
          path_edges: string[]
          path_length: number
          path_nodes: string[]
          path_relations: string[]
        }[]
      }
      get_brain_context_for_query: {
        Args: {
          p_max_claims?: number
          p_max_edges?: number
          p_max_nodes?: number
          p_query: string
        }
        Returns: Json
      }
      get_brain_dashboard_stats: { Args: never; Returns: Json }
      get_brain_health_report: { Args: never; Returns: Json }
      get_brain_maintenance_summary: { Args: never; Returns: Json }
      get_brain_stats: { Args: never; Returns: Json }
      get_brain_system_status: { Args: never; Returns: Json }
      get_conversation_extraction_summary: {
        Args: { p_conversation_id: string }
        Returns: Json
      }
      get_domain_dashboard_stats: { Args: { p_node_id: string }; Returns: Json }
      get_graph_neighborhood: {
        Args: { p_depth?: number; p_node_id: string }
        Returns: Json
      }
      get_knowledge_hotspots: {
        Args: { p_limit?: number }
        Returns: {
          canonical_name: string
          claim_count: number
          in_degree: number
          name: string
          node_id: string
          node_type: Database["public"]["Enums"]["node_type"]
          out_degree: number
          slug: string
          total_degree: number
        }[]
      }
      get_node_ancestors: {
        Args: { p_node_id: string }
        Returns: {
          depth: number
          id: string
          name: string
          slug: string
        }[]
      }
      get_node_descendants: {
        Args: { target_node_id: string }
        Returns: {
          depth: number
          id: string
          name: string
          node_type: Database["public"]["Enums"]["node_type"]
          parent_id: string
          slug: string
          status: Database["public"]["Enums"]["knowledge_status"]
        }[]
      }
      get_node_path: { Args: { target_node_id: string }; Returns: Json }
      get_node_relations: { Args: { p_node_id: string }; Returns: Json }
      get_node_subtree: {
        Args: { p_node_id: string }
        Returns: {
          depth: number
          id: string
          name: string
          node_type: Database["public"]["Enums"]["node_type"]
          parent_id: string
          slug: string
        }[]
      }
      get_orphan_nodes: {
        Args: { p_limit?: number }
        Returns: {
          canonical_name: string
          created_at: string
          name: string
          node_id: string
          node_type: Database["public"]["Enums"]["node_type"]
          orphan_reason: string
          parent_id: string
          slug: string
        }[]
      }
      get_user_highest_role: { Args: { p_user_id?: string }; Returns: string }
      match_knowledge_nodes: {
        Args: {
          match_count?: number
          match_threshold?: number
          p_node_type?: Database["public"]["Enums"]["node_type"]
          query_embedding: string
        }
        Returns: {
          canonical_name: string
          description: string
          id: string
          metadata: Json
          name: string
          node_type: Database["public"]["Enums"]["node_type"]
          similarity: number
        }[]
      }
      normalize_knowledge_name: { Args: { raw_name: string }; Returns: string }
      record_brain_observation: {
        Args: {
          p_confidence?: number
          p_detected_by?: string
          p_metadata?: Json
          p_observation_type: string
          p_severity?: string
          p_signals?: Json
          p_summary: string
          p_target_id: string
          p_target_type: string
        }
        Returns: Json
      }
      resolve_knowledge_node: {
        Args: {
          p_name: string
          p_node_type?: Database["public"]["Enums"]["node_type"]
          p_parent_id?: string
        }
        Returns: Json
      }
      rollback_entity_to_version: {
        Args: {
          p_subject_id: string
          p_subject_table: string
          p_target_version: number
        }
        Returns: Json
      }
      safe_attach_evidence: {
        Args: {
          p_claim_id: string
          p_confidence?: number
          p_evidence_type?: string
          p_excerpt?: string
          p_locator?: string
          p_metadata?: Json
          p_source_id: string
          p_stance?: Database["public"]["Enums"]["verification_status"]
        }
        Returns: Json
      }
      safe_create_claim: {
        Args: {
          p_claim_type?: string
          p_confidence?: number
          p_metadata?: Json
          p_node_id: string
          p_statement: string
          p_status?: Database["public"]["Enums"]["knowledge_status"]
        }
        Returns: Json
      }
      safe_create_knowledge_node: {
        Args: {
          p_description?: string
          p_force?: boolean
          p_metadata?: Json
          p_name: string
          p_node_type?: Database["public"]["Enums"]["node_type"]
          p_parent_id?: string
        }
        Returns: Json
      }
      safe_create_relation: {
        Args: {
          p_confidence?: number
          p_description?: string
          p_metadata?: Json
          p_relation_type: string
          p_source_node_id: string
          p_status?: Database["public"]["Enums"]["knowledge_status"]
          p_target_node_id: string
        }
        Returns: Json
      }
      safe_move_knowledge_node: {
        Args: { p_new_parent_id: string; p_node_id: string }
        Returns: Json
      }
      search_knowledge_nodes_lexical: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          alias_match: boolean
          canonical_name: string
          description: string
          exact_match: boolean
          matched_alias: string
          name: string
          node_id: string
          node_type: Database["public"]["Enums"]["node_type"]
          parent_id: string
          slug: string
          text_similarity: number
        }[]
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      validate_node_move: {
        Args: { p_new_parent_id: string; p_node_id: string }
        Returns: Json
      }
    }
    Enums: {
      knowledge_status:
        | "draft"
        | "active"
        | "proposed"
        | "review"
        | "archived"
        | "deprecated"
      message_role: "user" | "assistant" | "system" | "tool"
      node_type:
        | "category"
        | "topic"
        | "concept"
        | "technology"
        | "person"
        | "organization"
        | "event"
        | "method"
        | "tool"
        | "framework"
        | "theory"
        | "resource"
      operation_status:
        | "proposed"
        | "approved"
        | "rejected"
        | "executed"
        | "failed"
      provenance_origin:
        | "conversation"
        | "message"
        | "source"
        | "manual"
        | "ai_research"
        | "import"
      source_kind:
        | "ai_research"
        | "website"
        | "documentation"
        | "pdf"
        | "book"
        | "user"
        | "conversation"
        | "api"
        | "manual"
      verification_status:
        | "unverified"
        | "supported"
        | "contradicted"
        | "verified"
        | "rejected"
        | "qualifies"
        | "mentions"
        | "disputed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      knowledge_status: [
        "draft",
        "active",
        "proposed",
        "review",
        "archived",
        "deprecated",
      ],
      message_role: ["user", "assistant", "system", "tool"],
      node_type: [
        "category",
        "topic",
        "concept",
        "technology",
        "person",
        "organization",
        "event",
        "method",
        "tool",
        "framework",
        "theory",
        "resource",
      ],
      operation_status: [
        "proposed",
        "approved",
        "rejected",
        "executed",
        "failed",
      ],
      provenance_origin: [
        "conversation",
        "message",
        "source",
        "manual",
        "ai_research",
        "import",
      ],
      source_kind: [
        "ai_research",
        "website",
        "documentation",
        "pdf",
        "book",
        "user",
        "conversation",
        "api",
        "manual",
      ],
      verification_status: [
        "unverified",
        "supported",
        "contradicted",
        "verified",
        "rejected",
        "qualifies",
        "mentions",
        "disputed",
      ],
    },
  },
} as const

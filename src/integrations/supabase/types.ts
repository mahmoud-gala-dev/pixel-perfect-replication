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
            foreignKeyName: "knowledge_changes_source_id_fkey"
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
          knowledge_state: string | null
          last_verified_at: string | null
          metadata: Json
          node_id: string | null
          normalized_statement: string | null
          observed_at: string | null
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
          knowledge_state?: string | null
          last_verified_at?: string | null
          metadata?: Json
          node_id?: string | null
          normalized_statement?: string | null
          observed_at?: string | null
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
          knowledge_state?: string | null
          last_verified_at?: string | null
          metadata?: Json
          node_id?: string | null
          normalized_statement?: string | null
          observed_at?: string | null
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
        ]
      }
      knowledge_conflicts: {
        Row: {
          claim_a_id: string
          claim_b_id: string
          conflict_type: string
          created_at: string
          detected_by: string
          id: string
          metadata: Json
          reason_summary: string
          resolution_notes: string | null
          resolution_type: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          status: string
        }
        Insert: {
          claim_a_id: string
          claim_b_id: string
          conflict_type: string
          created_at?: string
          detected_by?: string
          id?: string
          metadata?: Json
          reason_summary: string
          resolution_notes?: string | null
          resolution_type?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
        }
        Update: {
          claim_a_id?: string
          claim_b_id?: string
          conflict_type?: string
          created_at?: string
          detected_by?: string
          id?: string
          metadata?: Json
          reason_summary?: string
          resolution_notes?: string | null
          resolution_type?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
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
      knowledge_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
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
          chunk_index: number
          content: string
          created_at?: string
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
          embedding_model?: string | null
          entry_id?: string | null
          id?: string
          metadata?: Json
          node_id?: string | null
          section?: string | null
          source_id?: string | null
          updated_at?: string
        }
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
      }
      retrieval_feedback: {
        Row: {
          assistant_message_id: string
          created_at: string
          feedback_type: string | null
          id: string
          notes: string | null
          rating: string
          retrieval_run_id: string
          user_id: string | null
        }
        Insert: {
          assistant_message_id: string
          created_at?: string
          feedback_type?: string | null
          id?: string
          notes?: string | null
          rating: string
          retrieval_run_id: string
          user_id?: string | null
        }
        Update: {
          assistant_message_id?: string
          created_at?: string
          feedback_type?: string | null
          id?: string
          notes?: string | null
          rating?: string
          retrieval_run_id?: string
          user_id?: string | null
        }
        Relationships: []
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
        Relationships: []
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
        Relationships: []
      }
      knowledge_nodes: {
        Row: {
          canonical_name: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          description: string | null
          embedding_status: string | null
          embedded_at: string | null
          id: string
          metadata: Json
          name: string
          node_type: Database["public"]["Enums"]["node_type"]
          parent_id: string | null
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
          embedding_status?: string | null
          embedded_at?: string | null
          id?: string
          metadata?: Json
          name: string
          node_type?: Database["public"]["Enums"]["node_type"]
          parent_id?: string | null
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
          embedding_status?: string | null
          embedded_at?: string | null
          id?: string
          metadata?: Json
          name?: string
          node_type?: Database["public"]["Enums"]["node_type"]
          parent_id?: string | null
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
      knowledge_extraction_runs: {
        Row: {
          id: string
          user_id: string
          conversation_id: string
          trigger_message_id: string | null
          status: string
          relevance: string
          model: string | null
          provider: string | null
          metrics: Json
          error: string | null
          started_at: string
          completed_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string
          conversation_id: string
          trigger_message_id?: string | null
          status?: string
          relevance?: string
          model?: string | null
          provider?: string | null
          metrics?: Json
          error?: string | null
          started_at?: string
          completed_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          conversation_id?: string
          trigger_message_id?: string | null
          status?: string
          relevance?: string
          model?: string | null
          provider?: string | null
          metrics?: Json
          error?: string | null
          started_at?: string
          completed_at?: string | null
          created_at?: string
          updated_at?: string
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
      knowledge_proposals: {
        Row: {
          id: string
          extraction_run_id: string | null
          user_id: string
          conversation_id: string
          source_message_id: string | null
          proposal_type: string
          status: string
          payload: Json
          original_payload: Json | null
          rejection_reason: string | null
          extraction_confidence: number | null
          validation_status: string
          model: string | null
          provider: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          extraction_run_id?: string | null
          user_id?: string
          conversation_id: string
          source_message_id?: string | null
          proposal_type: string
          status?: string
          payload?: Json
          original_payload?: Json | null
          rejection_reason?: string | null
          extraction_confidence?: number | null
          validation_status?: string
          model?: string | null
          provider?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          extraction_run_id?: string | null
          user_id?: string
          conversation_id?: string
          source_message_id?: string | null
          proposal_type?: string
          status?: string
          payload?: Json
          original_payload?: Json | null
          rejection_reason?: string | null
          extraction_confidence?: number | null
          validation_status?: string
          model?: string | null
          provider?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_proposals_extraction_run_id_fkey"
            columns: ["extraction_run_id"]
            isOneToOne: false
            referencedRelation: "knowledge_extraction_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_proposals_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
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
          user_id?: string
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
      knowledge_plans: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          committed_at: string | null
          conversation_id: string | null
          created_at: string
          created_by: string
          diff_summary: Json
          extraction_run_id: string | null
          id: string
          learning_mode: string
          metadata: Json
          overall_confidence: number | null
          plan_version: number
          risk_level: string
          status: string
          summary: Json
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          committed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string
          diff_summary?: Json
          extraction_run_id?: string | null
          id?: string
          learning_mode?: string
          metadata?: Json
          overall_confidence?: number | null
          plan_version?: number
          risk_level?: string
          status?: string
          summary?: Json
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          committed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string
          diff_summary?: Json
          extraction_run_id?: string | null
          id?: string
          learning_mode?: string
          metadata?: Json
          overall_confidence?: number | null
          plan_version?: number
          risk_level?: string
          status?: string
          summary?: Json
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
      knowledge_transactions: {
        Row: {
          approved_by: string | null
          completed_at: string | null
          conversation_id: string | null
          id: string
          initiated_by: string
          metadata: Json
          operation_count: number
          plan_id: string
          started_at: string
          status: string
          summary: Json
        }
        Insert: {
          approved_by?: string | null
          completed_at?: string | null
          conversation_id?: string | null
          id?: string
          initiated_by?: string
          metadata?: Json
          operation_count?: number
          plan_id: string
          started_at?: string
          status?: string
          summary?: Json
        }
        Update: {
          approved_by?: string | null
          completed_at?: string | null
          conversation_id?: string | null
          id?: string
          initiated_by?: string
          metadata?: Json
          operation_count?: number
          plan_id?: string
          started_at?: string
          status?: string
          summary?: Json
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
      knowledge_settings: {
        Row: {
          auto_add_aliases: boolean
          auto_add_claims: boolean
          auto_add_relations: boolean
          auto_create_nodes: boolean
          learning_mode: string
          min_claim_confidence: number
          min_node_confidence: number
          min_relation_confidence: number
          require_evidence_for_claims: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_add_aliases?: boolean
          auto_add_claims?: boolean
          auto_add_relations?: boolean
          auto_create_nodes?: boolean
          learning_mode?: string
          min_claim_confidence?: number
          min_node_confidence?: number
          min_relation_confidence?: number
          require_evidence_for_claims?: boolean
          updated_at?: string
          user_id?: string
        }
        Update: {
          auto_add_aliases?: boolean
          auto_add_claims?: boolean
          auto_add_relations?: boolean
          auto_create_nodes?: boolean
          learning_mode?: string
          min_claim_confidence?: number
          min_node_confidence?: number
          min_relation_confidence?: number
          require_evidence_for_claims?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      knowledge_versions: {
        Row: {
          change_type: string
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
          change_type?: string
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
          change_type?: string
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
        Relationships: []
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
      sources: {
        Row: {
          accessed_at: string | null
          author: string | null
          availability: string | null
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
          source_quality: string | null
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          accessed_at?: string | null
          author?: string | null
          availability?: string | null
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
          source_quality?: string | null
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          accessed_at?: string | null
          author?: string | null
          availability?: string | null
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
          source_quality?: string | null
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
      rollback_entity_to_version: {
        Args: {
          p_subject_table: string
          p_subject_id: string
          p_target_version: number
          p_reason?: string
        }
        Returns: Json
      }
      explain_claim_knowledge: {
        Args: {
          p_claim_id: string
        }
        Returns: Json
      }
      commit_knowledge_plan: {
        Args: {
          p_plan_id: string
          p_approved_operation_ids?: string[] | null
        }
        Returns: Json
      }
      archive_conversation: {
        Args: { p_conversation_id: string }
        Returns: Json
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
      get_brain_stats: { Args: never; Returns: Json }
      get_graph_neighborhood: {
        Args: { p_depth?: number; p_node_id: string }
        Returns: Json
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
      normalize_knowledge_name: { Args: { raw_name: string }; Returns: string }
      resolve_knowledge_node: {
        Args: {
          p_name: string
          p_node_type?: Database["public"]["Enums"]["node_type"]
          p_parent_id?: string | null
        }
        Returns: Json
      }
      safe_attach_evidence: {
        Args: {
          p_claim_id: string
          p_confidence?: number | null
          p_evidence_type?: string
          p_excerpt?: string | null
          p_locator?: string | null
          p_metadata?: Json
          p_source_id: string
          p_stance?: Database["public"]["Enums"]["verification_status"]
        }
        Returns: Json
      }
      safe_create_claim: {
        Args: {
          p_claim_type?: string
          p_confidence?: number | null
          p_metadata?: Json
          p_node_id?: string | null
          p_statement: string
          p_status?: Database["public"]["Enums"]["knowledge_status"]
        }
        Returns: Json
      }
      safe_create_knowledge_node: {
        Args: {
          p_description?: string | null
          p_force?: boolean
          p_metadata?: Json
          p_name: string
          p_node_type?: Database["public"]["Enums"]["node_type"]
          p_parent_id?: string | null
          p_status?: Database["public"]["Enums"]["knowledge_status"]
          p_summary?: string | null
        }
        Returns: Json
      }
      safe_create_relation: {
        Args: {
          p_confidence?: number | null
          p_description?: string | null
          p_metadata?: Json
          p_relation_type: string
          p_source_node_id: string
          p_status?: Database["public"]["Enums"]["knowledge_status"]
          p_target_node_id: string
        }
        Returns: Json
      }
      safe_move_knowledge_node: {
        Args: { p_new_parent_id: string | null; p_node_id: string }
        Returns: Json
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      validate_node_move: {
        Args: { p_new_parent_id: string | null; p_node_id: string }
        Returns: Json
      }
      get_conversation_extraction_summary: {
        Args: { p_conversation_id: string }
        Returns: Json
      }
      match_knowledge_nodes: {
        Args: {
          query_embedding: string
          match_threshold?: number
          match_count?: number
          p_node_type?: Database["public"]["Enums"]["node_type"]
        }
        Returns: {
          id: string
          name: string
          canonical_name: string | null
          slug: string
          node_type: Database["public"]["Enums"]["node_type"]
          description: string | null
          parent_id: string | null
          similarity: number
        }[]
      }
      search_knowledge_nodes_lexical: {
        Args: {
          p_query: string
          p_limit?: number
        }
        Returns: {
          id: string
          name: string
          canonical_name: string | null
          slug: string
          node_type: Database["public"]["Enums"]["node_type"]
          description: string | null
          parent_id: string | null
          match_source: string
          similarity: number
        }[]
      }
      find_graph_paths: {
        Args: {
          p_max_depth?: number
          p_source_node_id: string
          p_target_node_id: string
        }
        Returns: {
          path_nodes: string[]
          path_edges: string[]
          path_relations: string[]
          path_length: number
        }[]
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

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
          created_at: string
          created_by: string
          entry_id: string | null
          evidence_type: string
          excerpt: string | null
          id: string
          locator: string | null
          metadata: Json
          node_id: string | null
          source_id: string
          stance: Database["public"]["Enums"]["verification_status"]
          strength: number | null
        }
        Insert: {
          claim_id?: string | null
          confidence?: number | null
          created_at?: string
          created_by?: string
          entry_id?: string | null
          evidence_type?: string
          excerpt?: string | null
          id?: string
          locator?: string | null
          metadata?: Json
          node_id?: string | null
          source_id: string
          stance?: Database["public"]["Enums"]["verification_status"]
          strength?: number | null
        }
        Update: {
          claim_id?: string | null
          confidence?: number | null
          created_at?: string
          created_by?: string
          entry_id?: string | null
          evidence_type?: string
          excerpt?: string | null
          id?: string
          locator?: string | null
          metadata?: Json
          node_id?: string | null
          source_id?: string
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
          id: string
          new_state: Json | null
          previous_state: Json | null
          reason: string | null
          source_id: string | null
          subject_id: string
          subject_table: string
        }
        Insert: {
          change_type: string
          changed_by?: string
          confidence?: number | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          new_state?: Json | null
          previous_state?: Json | null
          reason?: string | null
          source_id?: string | null
          subject_id: string
          subject_table: string
        }
        Update: {
          change_type?: string
          changed_by?: string
          confidence?: number | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          new_state?: Json | null
          previous_state?: Json | null
          reason?: string | null
          source_id?: string | null
          subject_id?: string
          subject_table?: string
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
          entry_id: string | null
          id: string
          metadata: Json
          node_id: string | null
          normalized_statement: string | null
          source_id: string | null
          status: Database["public"]["Enums"]["knowledge_status"]
          updated_at: string
          verification: Database["public"]["Enums"]["verification_status"]
        }
        Insert: {
          claim_text: string
          claim_type?: string
          confidence?: number | null
          created_at?: string
          created_by?: string
          entry_id?: string | null
          id?: string
          metadata?: Json
          node_id?: string | null
          normalized_statement?: string | null
          source_id?: string | null
          status?: Database["public"]["Enums"]["knowledge_status"]
          updated_at?: string
          verification?: Database["public"]["Enums"]["verification_status"]
        }
        Update: {
          claim_text?: string
          claim_type?: string
          confidence?: number | null
          created_at?: string
          created_by?: string
          entry_id?: string | null
          id?: string
          metadata?: Json
          node_id?: string | null
          normalized_statement?: string | null
          source_id?: string | null
          status?: Database["public"]["Enums"]["knowledge_status"]
          updated_at?: string
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
      knowledge_nodes: {
        Row: {
          canonical_name: string | null
          created_at: string
          created_by: string
          deleted_at: string | null
          description: string | null
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
          confidence: number | null
          conversation_id: string | null
          created_at: string
          error: string | null
          executed_at: string | null
          id: string
          message_id: string | null
          operation_type: string
          payload: Json
          reason: string | null
          requested_by: string
          result: Json | null
          status: Database["public"]["Enums"]["operation_status"]
          updated_at: string
        }
        Insert: {
          confidence?: number | null
          conversation_id?: string | null
          created_at?: string
          error?: string | null
          executed_at?: string | null
          id?: string
          message_id?: string | null
          operation_type: string
          payload?: Json
          reason?: string | null
          requested_by?: string
          result?: Json | null
          status?: Database["public"]["Enums"]["operation_status"]
          updated_at?: string
        }
        Update: {
          confidence?: number | null
          conversation_id?: string | null
          created_at?: string
          error?: string | null
          executed_at?: string | null
          id?: string
          message_id?: string | null
          operation_type?: string
          payload?: Json
          reason?: string | null
          requested_by?: string
          result?: Json | null
          status?: Database["public"]["Enums"]["operation_status"]
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
      knowledge_versions: {
        Row: {
          created_at: string
          created_by: string
          id: string
          snapshot: Json
          subject_id: string
          subject_table: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string
          id?: string
          snapshot: Json
          subject_id: string
          subject_table: string
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
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
          created_at: string
          created_by: string
          deleted_at: string | null
          id: string
          metadata: Json
          published_at: string | null
          publisher: string | null
          reliability: number | null
          source_kind: Database["public"]["Enums"]["source_kind"]
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          accessed_at?: string | null
          author?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          id?: string
          metadata?: Json
          published_at?: string | null
          publisher?: string | null
          reliability?: number | null
          source_kind?: Database["public"]["Enums"]["source_kind"]
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          accessed_at?: string | null
          author?: string | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          id?: string
          metadata?: Json
          published_at?: string | null
          publisher?: string | null
          reliability?: number | null
          source_kind?: Database["public"]["Enums"]["source_kind"]
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
          p_parent_id?: string
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

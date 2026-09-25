// =====================================================================
// KNOWLEDGE BRAIN — PHASE 4: CLIENT CHAT SERVICE
// Connects React UI to Supabase Edge Function & Server Gateway
// =====================================================================

import { supabase } from "@/integrations/supabase/client";
import { AIGateway } from "./gateway";
import type { ChatRequestContract, ChatResponseContract } from "./types";

export class ChatService {
  /**
   * Sends a message to the AI Gateway.
   * Attempts Supabase Edge Function first; falls back to AIGateway in local/offline modes.
   */
  static async sendMessage(request: ChatRequestContract): Promise<ChatResponseContract> {
    const trimmed = request.message.trim();
    if (!trimmed) {
      throw new Error("Message cannot be empty.");
    }

    // Try Supabase Edge Function first
    try {
      const { data, error } = await supabase.functions.invoke<ChatResponseContract>("chat", {
        body: request,
      });

      if (!error && data && data.status === "completed") {
        return data;
      }
    } catch {
      // Edge Function not deployed or network error; fall back to local gateway
    }

    // Fall back to server/client gateway
    return await AIGateway.executeChat(request);
  }

  /**
   * Creates a new conversation.
   */
  static async createConversation(title?: string): Promise<{ id: string; title: string }> {
    const { data, error } = await supabase
      .from("conversations")
      .insert({
        title: title ?? "New conversation",
        status: "active",
      })
      .select("id, title")
      .single();

    if (error) throw error;
    return { id: data.id, title: data.title ?? "New conversation" };
  }

  /**
   * Renames an existing conversation.
   */
  static async renameConversation(conversationId: string, newTitle: string): Promise<void> {
    const trimmed = newTitle.trim();
    if (!trimmed) throw new Error("Title cannot be empty.");

    const { error } = await supabase
      .from("conversations")
      .update({ title: trimmed, updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    if (error) throw error;
  }

  /**
   * Archives a conversation safely without deleting historical messages.
   */
  static async archiveConversation(conversationId: string): Promise<void> {
    // Try RPC first
    try {
      const { data, error } = await supabase.rpc("archive_conversation", {
        p_conversation_id: conversationId,
      });
      if (!error && (data as { success?: boolean })?.success) {
        return;
      }
    } catch {
      // Fallback to direct update
    }

    const { error } = await supabase
      .from("conversations")
      .update({ status: "archived", updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    if (error) throw error;
  }

  /**
   * Soft-deletes a conversation.
   */
  static async deleteConversation(conversationId: string): Promise<void> {
    const { error } = await supabase
      .from("conversations")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", conversationId);

    if (error) throw error;
  }
}

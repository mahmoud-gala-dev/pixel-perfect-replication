// =====================================================================
// KNOWLEDGE BRAIN — PHASE 4: SUPABASE EDGE FUNCTION (/chat)
// Secure LLM Gateway, Brain Context Retrieval & Message Persistence
// =====================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CANONICAL_SYSTEM_PROMPT = `You are the conversational interface to a structured Knowledge Brain.

CORE OPERATIONAL RULES:
1. Use available verified Brain context when provided to answer user queries.
2. Clearly distinguish known, verified information from uncertainty or speculation.
3. Do not claim that information exists in the Knowledge Brain unless it was actually retrieved in your context.
4. Do not attempt or claim to modify the Brain directly. Knowledge modifications must go through the structured Knowledge Operations pipeline.
5. Do not invent sources, citations, or evidence. Only cite sources explicitly present in the provided Brain context.
6. Format technical explanations clearly using clean Markdown, concise bullet points, and syntax-highlighted code blocks where appropriate.
7. If the user asks about a topic not in the Brain, you may answer helpfully based on general knowledge, but clearly state that this knowledge is not currently stored or indexed in the Knowledge Brain.`;

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY") ?? "";

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // 1. Authenticate user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized user" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { conversation_id, message, options } = body;

    if (!conversation_id || !message || typeof message !== "string" || !message.trim()) {
      return new Response(
        JSON.stringify({ error: "conversation_id and message are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const trimmedMessage = message.trim();
    const useBrainContext = options?.use_brain_context !== false;

    // 2. Persist user message
    const { data: userMsg, error: userMsgErr } = await supabase
      .from("messages")
      .insert({
        conversation_id,
        role: "user",
        content: trimmedMessage,
        user_id: user.id,
      })
      .select("id")
      .single();

    if (userMsgErr) {
      return new Response(
        JSON.stringify({ error: `Failed to persist user message: ${userMsgErr.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Retrieve Brain Context (READ ONLY via RPC)
    let brainContextText = "";
    let references: Record<string, unknown> = { nodes: [], claims: [], relations: [] };
    let hasBrainContext = false;

    if (useBrainContext) {
      const { data: contextData } = await supabase.rpc("get_brain_context_for_query", {
        p_query: trimmedMessage,
        p_max_nodes: 5,
        p_max_claims: 8,
        p_max_edges: 8,
      });

      if (contextData && typeof contextData === "object") {
        const payload = contextData as {
          nodes?: Array<{ name: string; node_type: string; status: string; description?: string }>;
          claims?: Array<{ statement: string; claim_type: string; verification: string }>;
          relations?: Array<{ relation_type: string; source: { name: string }; target: { name: string } }>;
        };

        const nodes = payload.nodes ?? [];
        const claims = payload.claims ?? [];
        const relations = payload.relations ?? [];

        if (nodes.length > 0 || claims.length > 0 || relations.length > 0) {
          hasBrainContext = true;
          references = { nodes, claims, relations };

          const lines: string[] = [];
          if (nodes.length > 0) {
            lines.push("TOPICS & CONCEPTS:\n" + nodes.map((n) => `• ${n.name} (${n.node_type})`).join("\n"));
          }
          if (relations.length > 0) {
            lines.push("\nGRAPH RELATIONS:\n" + relations.map((r) => `• ${r.source.name} -[${r.relation_type}]-> ${r.target.name}`).join("\n"));
          }
          if (claims.length > 0) {
            lines.push("\nVERIFIED CLAIMS:\n" + claims.map((c) => `• "${c.statement}" [${c.verification}]`).join("\n"));
          }
          brainContextText = lines.join("\n");
        }
      }
    }

    // 4. Load recent message history (last 10 messages)
    const { data: history } = await supabase
      .from("messages")
      .select("role, content")
      .eq("conversation_id", conversation_id)
      .order("created_at", { ascending: false })
      .limit(10);

    const chronological = (history ?? []).reverse();

    // 5. Construct prompt
    let systemPrompt = CANONICAL_SYSTEM_PROMPT;
    if (hasBrainContext) {
      systemPrompt += `\n\n=======================================================\nSTRUCTURED BRAIN CONTEXT (READ-ONLY):\n${brainContextText}\n=======================================================\nPlease ground your answer in this verified Brain context where relevant.`;
    }

    const messagesToSend = [
      { role: "system", content: systemPrompt },
      ...chronological.map((m) => ({ role: m.role, content: m.content })),
    ];

    // 6. Call LLM
    let assistantReply = "";
    let modelName = options?.model ?? "gpt-4o-mini";
    const startTime = Date.now();

    if (openaiApiKey && openaiApiKey.trim()) {
      const openAiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiApiKey}`,
        },
        body: JSON.stringify({
          model: modelName,
          messages: messagesToSend,
          temperature: options?.temperature ?? 0.3,
          max_tokens: 2000,
        }),
      });

      if (!openAiRes.ok) {
        const err = await openAiRes.text();
        throw new Error(`OpenAI error: ${err}`);
      }
      const openAiJson = await openAiRes.json();
      assistantReply = openAiJson.choices?.[0]?.message?.content ?? "";
    } else {
      // Deterministic fallback when OpenAI API key is not configured
      modelName = "brain-local-1.0";
      if (hasBrainContext) {
        assistantReply = `Based on the verified knowledge currently recorded in your Knowledge Brain:\n\n${brainContextText}\n\nThis information represents the active canonical record in your knowledge graph.`;
      } else {
        assistantReply = `Regarding **${trimmedMessage}**:\n\nThis topic is not currently indexed in your Knowledge Brain. While I can discuss it based on general knowledge, no verified canonical concepts, atomic claims, or graph relations exist for it in your database yet.\n\n*(In Phase 5, you will be able to review and extract structured claims from our conversations directly into the Brain).*`;
      }
    }

    const latencyMs = Date.now() - startTime;

    // 7. Persist assistant message
    const { data: assistantMsg, error: asstErr } = await supabase
      .from("messages")
      .insert({
        conversation_id,
        role: "assistant",
        content: assistantReply,
        model: modelName,
        user_id: user.id,
        metadata: {
          status: "completed",
          latency_ms: latencyMs,
          brain_context_used: hasBrainContext,
          references,
        },
      })
      .select("id")
      .single();

    if (asstErr) {
      return new Response(
        JSON.stringify({ error: `Failed to persist assistant reply: ${asstErr.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 8. Auto-update conversation title if new
    const { data: conv } = await supabase
      .from("conversations")
      .select("title")
      .eq("id", conversation_id)
      .single();

    if (!conv?.title || conv.title === "New conversation" || conv.title === "Untitled") {
      const autoTitle = trimmedMessage.slice(0, 36).trim() + (trimmedMessage.length > 36 ? "…" : "");
      await supabase
        .from("conversations")
        .update({ title: autoTitle, updated_at: new Date().toISOString() })
        .eq("id", conversation_id);
    }

    return new Response(
      JSON.stringify({
        message_id: assistantMsg?.id ?? userMsg?.id,
        conversation_id,
        content: assistantReply,
        status: "completed",
        brain_context_used: hasBrainContext,
        references,
        metadata: {
          model: modelName,
          latency_ms: latencyMs,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Edge Function Error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

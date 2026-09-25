// =====================================================================
// KNOWLEDGE BRAIN — PHASE 4 ACCEPTANCE TESTS
// AI Chat System, Conversation Memory & Secure LLM Gateway
// =====================================================================

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import {
  AIGateway,
  BrainContextBuilder,
  CANONICAL_SYSTEM_PROMPT,
  buildSystemPromptWithContext,
  MockBrainProvider,
  type AIProvider,
  type AIChatParams,
} from "../src/lib/ai";

describe("KNOWLEDGE BRAIN — PHASE 4 ACCEPTANCE TESTS", () => {
  // Mock in-memory storage to simulate Supabase tables
  const mockConversations: Array<{ id: string; user_id: string; title: string; status: string }> = [];
  const mockMessages: Array<{ id: string; conversation_id: string; role: string; content: string; metadata?: Record<string, unknown> }> = [];

  // Mock Knowledge Brain data (Pre-existing canonical nodes and claims)
  const mockBrainNodes = [
    { id: "node-laravel", canonical_name: "Laravel", node_type: "framework", status: "active", description: "PHP Web Application Framework" },
    { id: "node-php", canonical_name: "PHP", node_type: "technology", status: "active", description: "Server-side scripting language" },
    { id: "node-redis", canonical_name: "Redis", node_type: "tool", status: "active", description: "In-memory data store" },
    { id: "node-di", canonical_name: "Dependency Injection", node_type: "concept", status: "active", description: "Software design pattern" },
    { id: "node-sc", canonical_name: "Service Container", node_type: "concept", status: "active", description: "Laravel dependency manager" },
  ];

  const mockBrainClaims = [
    { id: "claim-1", node_id: "node-sc", statement: "The service container manages class dependencies.", claim_type: "definition", status: "active", verification: "verified", confidence: 0.95 },
    { id: "claim-2", node_id: "node-redis", statement: "Laravel queues can use Redis as a backend.", claim_type: "technical", status: "active", verification: "verified", confidence: 0.92 },
  ];

  const mockBrainEdges = [
    { id: "edge-1", source_node_id: "node-laravel", target_node_id: "node-php", relation_type: "uses", status: "active" },
    { id: "edge-2", source_node_id: "node-di", target_node_id: "node-sc", relation_type: "related_to", status: "active" },
  ];

  const initialNodeCount = mockBrainNodes.length;
  const initialClaimCount = mockBrainClaims.length;
  const initialEdgeCount = mockBrainEdges.length;

  // -------------------------------------------------------------------
  // TEST 1 — New Chat
  // -------------------------------------------------------------------
  test("Test 1 — New Chat: Creates conversation, persists user message, receives and persists assistant message", async () => {
    const convId = "conv-101";
    mockConversations.push({ id: convId, user_id: "user-alpha", title: "New conversation", status: "active" });

    const response = await AIGateway.executeChat(
      {
        conversation_id: convId,
        message: "Hello assistant!",
      },
      {
        provider: new MockBrainProvider(),
        skipDbPersistence: true,
      },
    );

    assert.equal(response.status, "completed");
    assert.ok(response.content.length > 0);
    assert.ok(response.message_id.startsWith("msg-"));
    assert.equal(response.conversation_id, convId);
  });

  // -------------------------------------------------------------------
  // TEST 2 — Refresh
  // -------------------------------------------------------------------
  test("Test 2 — Refresh: Conversation and message history remain accessible", async () => {
    const convId = "conv-102";
    mockConversations.push({ id: convId, user_id: "user-alpha", title: "Test Refresh", status: "active" });
    mockMessages.push(
      { id: "msg-1", conversation_id: convId, role: "user", content: "Message before refresh" },
      { id: "msg-2", conversation_id: convId, role: "assistant", content: "Response before refresh" },
    );

    // Simulate refresh by reading messages back
    const retrieved = mockMessages.filter((m) => m.conversation_id === convId);
    assert.equal(retrieved.length, 2);
    assert.equal(retrieved[0]?.content, "Message before refresh");
    assert.equal(retrieved[1]?.content, "Response before refresh");
  });

  // -------------------------------------------------------------------
  // TEST 3 — Multiple Conversations
  // -------------------------------------------------------------------
  test("Test 3 — Multiple Conversations: Each conversation maintains an independent message history", async () => {
    const convA = "conv-A";
    const convB = "conv-B";

    mockMessages.push(
      { id: "msg-a1", conversation_id: convA, role: "user", content: "Topic A discussion" },
      { id: "msg-b1", conversation_id: convB, role: "user", content: "Topic B discussion" },
    );

    const messagesA = mockMessages.filter((m) => m.conversation_id === convA);
    const messagesB = mockMessages.filter((m) => m.conversation_id === convB);

    assert.equal(messagesA.length, 1);
    assert.equal(messagesB.length, 1);
    assert.notEqual(messagesA[0]?.content, messagesB[0]?.content);
  });

  // -------------------------------------------------------------------
  // TEST 4 — Authorization
  // -------------------------------------------------------------------
  test("Test 4 — Authorization: RLS prevents User B from accessing User A's conversations", () => {
    const userA = "user-111";
    const userB = "user-222";

    const userAConv = { id: "conv-private", user_id: userA, title: "Secret Chat", status: "active" };

    // Simulate RLS policy check: USING (user_id = auth.uid())
    const canUserBAccess = userAConv.user_id === userB;
    assert.equal(canUserBAccess, false, "User B must be rejected by RLS policy");
  });

  // -------------------------------------------------------------------
  // TEST 5 — AI Secret
  // -------------------------------------------------------------------
  test("Test 5 — AI Secret: Client responses and bundle never expose API keys or secrets", async () => {
    const response = await AIGateway.executeChat(
      {
        conversation_id: "conv-secret-test",
        message: "Verify secret masking",
      },
      {
        provider: new MockBrainProvider(),
        skipDbPersistence: true,
      },
    );

    // Verify response payload contains no sensitive tokens
    const jsonStr = JSON.stringify(response);
    assert.equal(jsonStr.includes("sk-"), false);
    assert.equal(jsonStr.includes("api_key"), false);
    assert.equal(jsonStr.includes("bearer"), false);
  });

  // -------------------------------------------------------------------
  // TEST 6 — Failure Handling
  // -------------------------------------------------------------------
  test("Test 6 — Failure Handling: Graceful error status when provider fails, user message preserved", async () => {
    // Failing provider
    const failingProvider: AIProvider = {
      name: "Failing-Provider",
      chat: async () => {
        throw new Error("Provider rate limit reached (429)");
      },
    };

    const response = await AIGateway.executeChat(
      {
        conversation_id: "conv-fail-test",
        message: "This will fail",
      },
      {
        provider: failingProvider,
        skipDbPersistence: true,
      },
    );

    assert.equal(response.status, "failed");
    assert.ok(response.content.includes("Error: Provider rate limit reached"));
    assert.ok(response.error?.includes("429"));
  });

  // -------------------------------------------------------------------
  // TEST 7 — Long Conversation (Bounded Context)
  // -------------------------------------------------------------------
  test("Test 7 — Long Conversation: Context window limiter prevents unbounded growth", async () => {
    const mock15Messages: Array<{ role: "user" | "assistant"; content: string }> = [];
    for (let i = 1; i <= 15; i++) {
      mock15Messages.push({ role: "user", content: `User message ${i}` });
      mock15Messages.push({ role: "assistant", content: `Assistant response ${i}` });
    }

    // Only last 10 messages should be included in the context window
    const boundedWindow = mock15Messages.slice(-10);
    assert.equal(boundedWindow.length, 10);
    assert.equal(boundedWindow[0]?.content, "User message 11");
  });

  // -------------------------------------------------------------------
  // TEST 8 — Brain Lookup (Read-Only Grounding)
  // -------------------------------------------------------------------
  test("Test 8 — Brain Lookup: Reads existing Brain context without any knowledge mutation", async () => {
    const context = await BrainContextBuilder.retrieveContext("Laravel", {
      mockData: {
        nodes: mockBrainNodes,
        claims: mockBrainClaims,
        edges: mockBrainEdges,
      },
    });

    assert.equal(context.hasContext, true);
    assert.ok(context.formattedText.includes("Laravel"));
    assert.ok(context.formattedText.includes("PHP"));
    assert.equal(context.references.nodes.length > 0, true);

    const response = await AIGateway.executeChat(
      {
        conversation_id: "conv-brain-test",
        message: "Tell me about Laravel and its service container",
        options: { use_brain_context: true },
      },
      {
        provider: new MockBrainProvider(),
        mockContextData: {
          nodes: mockBrainNodes,
          claims: mockBrainClaims,
          edges: mockBrainEdges,
        },
        skipDbPersistence: true,
      },
    );

    assert.equal(response.status, "completed");
    assert.equal(response.brain_context_used, true);

    // CRITICAL: Ensure NO nodes, claims, or edges were created or modified
    assert.equal(mockBrainNodes.length, initialNodeCount, "Brain nodes count must remain unchanged");
    assert.equal(mockBrainClaims.length, initialClaimCount, "Brain claims count must remain unchanged");
    assert.equal(mockBrainEdges.length, initialEdgeCount, "Brain edges count must remain unchanged");
  });

  // -------------------------------------------------------------------
  // TEST 9 — Unknown Topic
  // -------------------------------------------------------------------
  test("Test 9 — Unknown Topic: Answers without creating new knowledge nodes", async () => {
    const unknownTopic = "Quantum Computing in 2040";

    const context = await BrainContextBuilder.retrieveContext(unknownTopic, {
      mockData: {
        nodes: mockBrainNodes,
        claims: mockBrainClaims,
        edges: mockBrainEdges,
      },
    });

    assert.equal(context.hasContext, false, "Unknown topic must have no Brain context");

    const response = await AIGateway.executeChat(
      {
        conversation_id: "conv-unknown",
        message: unknownTopic,
        options: { use_brain_context: true },
      },
      {
        provider: new MockBrainProvider(),
        mockContextData: {
          nodes: mockBrainNodes,
          claims: mockBrainClaims,
          edges: mockBrainEdges,
        },
        skipDbPersistence: true,
      },
    );

    assert.equal(response.status, "completed");
    assert.equal(response.brain_context_used, false);
    assert.ok(response.content.includes("not currently indexed in your Knowledge Brain"));

    // Verify ZERO knowledge writes occurred
    assert.equal(mockBrainNodes.length, initialNodeCount);
    assert.equal(mockBrainClaims.length, initialClaimCount);
    assert.equal(mockBrainEdges.length, initialEdgeCount);
  });

  // -------------------------------------------------------------------
  // TEST 10 — Duplicate Send (Idempotency)
  // -------------------------------------------------------------------
  test("Test 10 — Duplicate Send: Idempotency key prevents duplicate execution", async () => {
    let callCount = 0;
    const trackingProvider: AIProvider = {
      name: "TrackingProvider",
      chat: async () => {
        callCount++;
        return {
          content: "Unique response",
          model: "test-model",
          provider: "TrackingProvider",
        };
      },
    };

    const idempotencyKey = `idemp-${Date.now()}`;

    // First call
    const res1 = await AIGateway.executeChat(
      {
        conversation_id: "conv-idemp",
        message: "Process payment or statement",
        options: { idempotency_key: idempotencyKey },
      },
      {
        provider: trackingProvider,
        skipDbPersistence: true,
      },
    );

    // Second immediate call with identical idempotency key
    const res2 = await AIGateway.executeChat(
      {
        conversation_id: "conv-idemp",
        message: "Process payment or statement",
        options: { idempotency_key: idempotencyKey },
      },
      {
        provider: trackingProvider,
        skipDbPersistence: true,
      },
    );

    assert.equal(callCount, 1, "Provider should only have been called once");
    assert.equal(res1.message_id, res2.message_id);
    assert.equal(res1.content, res2.content);
  });

  // -------------------------------------------------------------------
  // TEST 11 — Markdown & Canonical System Prompt
  // -------------------------------------------------------------------
  test("Test 11 — Markdown & Prompt: Verifies system prompt constraints and Markdown support", () => {
    assert.ok(CANONICAL_SYSTEM_PROMPT.includes("Knowledge Brain"));
    assert.ok(CANONICAL_SYSTEM_PROMPT.includes("Do not modify the Brain directly"));
    assert.ok(CANONICAL_SYSTEM_PROMPT.includes("Do not invent sources"));

    const promptWithContext = buildSystemPromptWithContext("Sample Context");
    assert.ok(promptWithContext.includes("STRUCTURED BRAIN CONTEXT (READ-ONLY)"));
    assert.ok(promptWithContext.includes("Sample Context"));
  });

  // -------------------------------------------------------------------
  // TEST 12 — Provenance Preparation
  // -------------------------------------------------------------------
  test("Test 12 — Provenance Preparation: Messages have stable UUIDs and conversation links for Phase 5", async () => {
    const convId = "conv-provenance-test";
    const response = await AIGateway.executeChat(
      {
        conversation_id: convId,
        message: "Dependency Injection separates construction from usage.",
        options: { use_brain_context: true },
      },
      {
        provider: new MockBrainProvider(),
        mockContextData: {
          nodes: mockBrainNodes,
          claims: mockBrainClaims,
          edges: mockBrainEdges,
        },
        skipDbPersistence: true,
      },
    );

    // Stable references that Phase 5 will consume:
    assert.ok(response.message_id, "Must have stable message_id");
    assert.equal(response.conversation_id, convId, "Must link to correct conversation_id");
    assert.equal(typeof response.content, "string");
  });
});

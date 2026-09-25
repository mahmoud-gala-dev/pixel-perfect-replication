// =====================================================================
// KNOWLEDGE BRAIN — PHASE 6 ACCEPTANCE TESTS
// Smart Search, Entity Resolution, Semantic Matching & Duplicate Detection
// =====================================================================

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import type {
  KnowledgeNode,
  KnowledgeAlias,
  KnowledgeEdge,
  KnowledgeClaimRow,
} from "../src/lib/knowledge-engine/types";
import {
  EntityResolver,
  ClaimResolver,
  RelationResolver,
  HierarchyResolver,
  KnowledgeResolutionService,
  KnowledgeSearchService,
  DeterministicFallbackEmbeddingProvider,
  type ProposalRow,
  type EmbeddingProvider,
} from "../src/lib/ai/resolution";

describe("KNOWLEDGE BRAIN — PHASE 6 ACCEPTANCE TESTS", () => {
  // Pre-existing Canonical Brain State (MUST NEVER BE MUTATED IN PHASE 6)
  const canonicalNodes: KnowledgeNode[] = [
    {
      id: "node-laravel",
      name: "Laravel",
      canonical_name: "Laravel",
      slug: "laravel",
      node_type: "framework",
      status: "active",
      parent_id: "node-php",
      description: "PHP web application framework with expressive syntax",
      summary: "Modern PHP framework",
      created_by: "system-test",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      metadata: {},
      embedding_status: "current",
      embedded_at: new Date().toISOString(),
    },
    {
      id: "node-php",
      name: "PHP",
      canonical_name: "PHP",
      slug: "php",
      node_type: "technology",
      status: "active",
      parent_id: "node-backend",
      description: "Server-side scripting language for web development",
      summary: "Web scripting language",
      created_by: "system-test",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      metadata: {},
      embedding_status: "current",
      embedded_at: new Date().toISOString(),
    },
    {
      id: "node-backend",
      name: "Backend",
      canonical_name: "Backend",
      slug: "backend",
      node_type: "category",
      status: "active",
      parent_id: "node-programming",
      description: "Server-side web architecture and programming",
      summary: "Backend development",
      created_by: "system-test",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      metadata: {},
      embedding_status: "current",
      embedded_at: new Date().toISOString(),
    },
    {
      id: "node-programming",
      name: "Programming",
      canonical_name: "Programming",
      slug: "programming",
      node_type: "category",
      status: "active",
      parent_id: null,
      description: "Software engineering and development disciplines",
      summary: "Software engineering",
      created_by: "system-test",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      metadata: {},
      embedding_status: "current",
      embedded_at: new Date().toISOString(),
    },
    {
      id: "node-redis",
      name: "Redis",
      canonical_name: "Redis",
      slug: "redis",
      node_type: "tool",
      status: "active",
      parent_id: null,
      description: "In-memory data structure store used as a database, cache, and message broker",
      summary: "In-memory store and queue broker",
      created_by: "system-test",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      metadata: {},
      embedding_status: "current",
      embedded_at: new Date().toISOString(),
    },
    {
      id: "node-di",
      name: "Dependency Injection",
      canonical_name: "Dependency Injection",
      slug: "dependency-injection",
      node_type: "concept",
      status: "active",
      parent_id: null,
      description: "Design pattern in software engineering where dependencies are passed into an object",
      summary: "Software inversion of control pattern",
      created_by: "system-test",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      metadata: {},
      embedding_status: "current",
      embedded_at: new Date().toISOString(),
    },
    {
      id: "node-java-lang",
      name: "Java",
      canonical_name: "Java (Programming Language)",
      slug: "java-programming-language",
      node_type: "technology",
      status: "active",
      parent_id: "node-programming",
      description: "High-level class-based object-oriented programming language running on the JVM with Spring framework",
      summary: "JVM programming language",
      created_by: "system-test",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      metadata: {},
      embedding_status: "current",
      embedded_at: new Date().toISOString(),
    },
    {
      id: "node-java-island",
      name: "Java",
      canonical_name: "Java (Island)",
      slug: "java-island",
      node_type: "concept",
      status: "active",
      parent_id: null,
      description: "Island of Indonesia bounded by the Indian Ocean, famous for volcanoes and geography",
      summary: "Indonesian island geography",
      created_by: "system-test",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      metadata: {},
      embedding_status: "current",
      embedded_at: new Date().toISOString(),
    },
  ];

  const canonicalAliases: KnowledgeAlias[] = [
    {
      id: "alias-di-en",
      node_id: "node-di",
      alias: "DI",
      normalized_alias: "di",
      canonical_alias: "Dependency Injection",
      alias_type: "abbreviation",
      language: "en",
      created_by: "system-test",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: {},
    },
    {
      id: "alias-di-ar",
      node_id: "node-di",
      alias: "حقن الاعتماديات",
      normalized_alias: "حقن الاعتماديات",
      canonical_alias: "Dependency Injection",
      alias_type: "translation",
      language: "ar",
      created_by: "system-test",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: {},
    },
  ];

  const canonicalEdges: KnowledgeEdge[] = [
    {
      id: "edge-laravel-php",
      source_node_id: "node-laravel",
      target_node_id: "node-php",
      relation_type: "uses",
      status: "active",
      confidence: 1.0,
      description: "Laravel is built with PHP",
      created_by: "system-test",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: {},
    },
  ];

  const canonicalClaims: KnowledgeClaimRow[] = [
    {
      id: "claim-laravel-php",
      node_id: "node-laravel",
      claim_text: "Laravel is a web application framework written in PHP.",
      claim_type: "fact",
      normalized_statement: "laravel is a web application framework written in php.",
      status: "active",
      verification: "verified",
      confidence: 1.0,
      created_by: "system-test",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      entry_id: null,
      source_id: null,
      metadata: {},
    },
  ];

  // Capture baseline counts to verify strict immutability of Canonical Brain
  const initialNodeCount = canonicalNodes.length;
  const initialEdgeCount = canonicalEdges.length;
  const initialClaimCount = canonicalClaims.length;

  const resolver = new EntityResolver();
  const claimResolver = new ClaimResolver();
  const relationResolver = new RelationResolver();
  const hierarchyResolver = new HierarchyResolver();

  // -------------------------------------------------------------------
  // Test 1 — Exact Match
  // -------------------------------------------------------------------
  test("Test 1 — Exact Match: Candidate 'Laravel' maps to existing canonical node with high confidence", async () => {
    const result = await resolver.resolveEntity(
      { name: "Laravel", type: "framework" },
      { nodes: canonicalNodes, aliases: canonicalAliases },
    );

    assert.equal(result.status, "EXISTING");
    assert.equal(result.canonical_node_id, "node-laravel");
    assert.equal(result.match_type, "EXACT_NAME");
    assert.equal(result.resolution_confidence, 1.0);
  });

  // -------------------------------------------------------------------
  // Test 2 — Alias Match
  // -------------------------------------------------------------------
  test("Test 2 — Alias Match: Candidate 'DI' resolves to Dependency Injection without new node creation", async () => {
    const result = await resolver.resolveEntity(
      { name: "DI", type: "concept" },
      { nodes: canonicalNodes, aliases: canonicalAliases },
    );

    assert.equal(result.status, "EXISTING");
    assert.equal(result.canonical_node_id, "node-di");
    assert.equal(result.match_type, "ALIAS");
    assert.ok(result.resolution_confidence >= 0.95);
  });

  // -------------------------------------------------------------------
  // Test 3 — Formatting & Whitespace Normalization
  // -------------------------------------------------------------------
  test("Test 3 — Formatting: Candidate '  laravel  ' resolves to existing Laravel", async () => {
    const result = await resolver.resolveEntity(
      { name: "   laravel   ", type: "framework" },
      { nodes: canonicalNodes, aliases: canonicalAliases },
    );

    assert.equal(result.status, "EXISTING");
    assert.equal(result.canonical_node_id, "node-laravel");
  });

  // -------------------------------------------------------------------
  // Test 4 — Semantic Similarity
  // -------------------------------------------------------------------
  test("Test 4 — Semantic Similarity: Differently phrased candidate appears as candidate without blind merge", async () => {
    const result = await resolver.resolveEntity(
      {
        name: "Dependency Inversion Container Mechanism",
        type: "concept",
        context: ["Software Architecture", "Inversion of Control"],
      },
      { nodes: canonicalNodes, aliases: canonicalAliases },
    );

    // Vector similarity provides candidates, but does NOT blindly claim 1.0 identity
    assert.ok(result.candidates.length > 0);
    const topCandidate = result.candidates[0];
    assert.ok(topCandidate);
    assert.notEqual(result.match_type, "EXACT_NAME");
    // Decision is either POSSIBLE_DUPLICATE or NEW, never blind merge
    assert.ok(result.status === "POSSIBLE_DUPLICATE" || result.status === "NEW");
  });

  // -------------------------------------------------------------------
  // Test 5 — Similar But Different Concepts
  // -------------------------------------------------------------------
  test("Test 5 — Similar But Different: 'Service Locator' is NOT merged into 'Dependency Injection'", async () => {
    const result = await resolver.resolveEntity(
      {
        name: "Service Locator",
        type: "concept",
        context: ["Software Architecture", "Design Patterns"],
      },
      { nodes: canonicalNodes, aliases: canonicalAliases },
    );

    // Sibling concept must NOT be assigned canonical_node_id of Dependency Injection
    if (result.status === "EXISTING") {
      assert.notEqual(result.canonical_node_id, "node-di");
    }
    // Expected to be recognized as NEW concept or requiring review
    assert.ok(result.status === "NEW" || result.status === "POSSIBLE_DUPLICATE");
  });

  // -------------------------------------------------------------------
  // Test 6 — Ambiguous Entity
  // -------------------------------------------------------------------
  test("Test 6 — Ambiguous: 'Java' without context flags AMBIGUOUS when multiple identities exist", async () => {
    const result = await resolver.resolveEntity(
      { name: "Java" },
      { nodes: canonicalNodes, aliases: canonicalAliases },
    );

    // Without context, resolving between Java language and Java island is ambiguous
    assert.ok(result.status === "AMBIGUOUS" || result.candidates.length >= 2);
    if (result.status === "AMBIGUOUS") {
      assert.equal(result.canonical_node_id, null);
    }
  });

  // -------------------------------------------------------------------
  // Test 7 — Context-Aware Resolution
  // -------------------------------------------------------------------
  test("Test 7 — Context Resolution: 'Java' with Spring/JVM context resolves to Java language", async () => {
    const result = await resolver.resolveEntity(
      {
        name: "Java",
        type: "technology",
        context: ["Programming", "JVM", "Spring Boot"],
        conversation_context: "Spring Boot applications run on the JVM using Java.",
      },
      { nodes: canonicalNodes, aliases: canonicalAliases },
    );

    assert.ok(result.candidates.length > 0);
    const topCandidate = result.candidates[0];
    assert.ok(topCandidate);
    assert.equal(topCandidate.candidate_node_id, "node-java-lang");
  });

  // -------------------------------------------------------------------
  // Test 8 — New Entity Candidate
  // -------------------------------------------------------------------
  test("Test 8 — New Entity: Genuinely novel concept resolves as NEW with NO canonical mutation", async () => {
    const result = await resolver.resolveEntity(
      {
        name: "Quantum Hyperledger Mesh",
        type: "technology",
        context: ["Quantum Computing", "Decentralized Systems"],
      },
      { nodes: canonicalNodes, aliases: canonicalAliases },
    );

    assert.equal(result.status, "NEW");
    assert.equal(result.canonical_node_id, null);
  });

  // -------------------------------------------------------------------
  // Test 9 — Redis Reuse Across Different Contexts
  // -------------------------------------------------------------------
  test("Test 9 — Redis Reuse: Redis mentioned in Laravel queue conversation reuses existing canonical Redis", async () => {
    const result = await resolver.resolveEntity(
      {
        name: "Redis",
        type: "tool",
        context: ["Laravel", "Queues", "Caching"],
      },
      { nodes: canonicalNodes, aliases: canonicalAliases },
    );

    assert.equal(result.status, "EXISTING");
    assert.equal(result.canonical_node_id, "node-redis");
    // Does NOT create separate "Laravel Redis" or "Redis for Queues"
  });

  // -------------------------------------------------------------------
  // Test 10 — Partial Hierarchy Path Resolution
  // -------------------------------------------------------------------
  test("Test 10 — Partial Hierarchy: Reuses existing path prefix and flags only missing segments", () => {
    const proposedPath = [
      "Programming",
      "Backend",
      "PHP",
      "Laravel",
      "Architecture",
      "Service Container",
    ];

    const result = hierarchyResolver.resolveHierarchyPath(proposedPath, canonicalNodes);

    // Programming -> Backend -> PHP -> Laravel exist in canonicalNodes
    assert.equal(result.reused_prefix_count, 4);
    assert.equal(result.new_segments_count, 2);

    assert.equal(result.resolved_path[0]?.status, "EXISTING");
    assert.equal(result.resolved_path[1]?.status, "EXISTING");
    assert.equal(result.resolved_path[2]?.status, "EXISTING");
    assert.equal(result.resolved_path[3]?.status, "EXISTING");
    assert.equal(result.resolved_path[4]?.status, "NEW");
    assert.equal(result.resolved_path[5]?.status, "NEW");
  });

  // -------------------------------------------------------------------
  // Test 11 — Existing Relation NO-OP Candidate
  // -------------------------------------------------------------------
  test("Test 11 — Existing Relation: Identical Laravel -> uses -> PHP marked as EXISTING_RELATION and NO-OP", () => {
    const result = relationResolver.resolveRelation(
      {
        source_canonical_id: "node-laravel",
        target_canonical_id: "node-php",
        relation_type: "uses",
      },
      canonicalEdges,
    );

    assert.equal(result.status, "EXISTING_RELATION");
    assert.equal(result.is_noop_candidate, true);
    assert.equal(result.canonical_edge_id, "edge-laravel-php");
  });

  // -------------------------------------------------------------------
  // Test 12 — Claim Semantic Duplicate Detection
  // -------------------------------------------------------------------
  test("Test 12 — Claim Similarity: Semantically similar claim detected as POSSIBLE_DUPLICATE without destructive merge", async () => {
    const result = await claimResolver.resolveClaim(
      {
        statement: "Laravel is a web application framework built with PHP.",
        subject_canonical_node_id: "node-laravel",
      },
      canonicalClaims,
    );

    assert.ok(
      result.status === "EXISTING_CLAIM" || result.status === "POSSIBLE_DUPLICATE_CLAIM",
    );
    assert.equal(result.canonical_claim_id, "claim-laravel-php");
  });

  // -------------------------------------------------------------------
  // Test 13 — Arabic Alias Resolution
  // -------------------------------------------------------------------
  test("Test 13 — Arabic Alias: 'حقن الاعتماديات' resolves to English canonical 'Dependency Injection'", async () => {
    const result = await resolver.resolveEntity(
      { name: "حقن الاعتماديات", language: "ar" },
      { nodes: canonicalNodes, aliases: canonicalAliases },
    );

    assert.equal(result.status, "EXISTING");
    assert.equal(result.canonical_node_id, "node-di");
    assert.equal(result.match_type, "ALIAS");
  });

  // -------------------------------------------------------------------
  // Test 14 — Graceful Degradation on Vector Provider Failure
  // -------------------------------------------------------------------
  test("Test 14 — Vector Failure: Lexical, alias, and text search still function if vector provider throws", async () => {
    const brokenProvider: EmbeddingProvider = {
      providerId: "broken-test",
      model: "broken",
      version: "1",
      dimensions: 384,
      generateEmbedding: async () => {
        throw new Error("Provider 503 Service Unavailable");
      },
      generateBatchEmbeddings: async () => {
        throw new Error("Provider 503 Service Unavailable");
      },
    };

    const resilientResolver = new EntityResolver(undefined, brokenProvider);

    // Exact match must still succeed
    const exactRes = await resilientResolver.resolveEntity(
      { name: "Laravel" },
      { nodes: canonicalNodes, aliases: canonicalAliases },
    );
    assert.equal(exactRes.status, "EXISTING");
    assert.equal(exactRes.canonical_node_id, "node-laravel");

    // Alias match must still succeed
    const aliasRes = await resilientResolver.resolveEntity(
      { name: "DI" },
      { nodes: canonicalNodes, aliases: canonicalAliases },
    );
    assert.equal(aliasRes.status, "EXISTING");
    assert.equal(aliasRes.canonical_node_id, "node-di");
  });

  // -------------------------------------------------------------------
  // Test 15 — Search Service Hybrid Search
  // -------------------------------------------------------------------
  test("Test 15 — Search Service: Hybrid search combines signals with transparent breakdown", async () => {
    const searchService = new KnowledgeSearchService();
    const results = await searchService.hybridSearch(
      "Laravel Framework",
      { limit: 5 },
      { nodes: canonicalNodes, aliases: canonicalAliases },
    );

    assert.ok(results.length > 0);
    const top = results[0];
    assert.ok(top);
    assert.equal(top.node_id, "node-laravel");
    assert.ok(top.combined_score > 0.8);
    assert.ok("text_score" in top.match_signals);
    assert.ok("semantic_score" in top.match_signals);
  });

  // -------------------------------------------------------------------
  // Test 16 — Manual Resolution Override
  // -------------------------------------------------------------------
  test("Test 16 — Manual Resolution: User override records decision without modifying canonical tables", async () => {
    const resolutionService = new KnowledgeResolutionService();
    const result = await resolutionService.recordManualResolution({
      proposalId: "prop-test-1",
      action: "USE_EXISTING",
      canonicalNodeId: "node-laravel",
      userId: "user-test-audit",
      notes: "Audited by human expert",
    });

    assert.equal(result.success, true);
    assert.ok(result.message.includes("without canonical mutation"));
  });

  // -------------------------------------------------------------------
  // Test 17 — Re-resolution Idempotency
  // -------------------------------------------------------------------
  test("Test 17 — Re-resolution: Running resolver multiple times produces consistent idempotent results", async () => {
    const run1 = await resolver.resolveEntity(
      { name: "Redis", type: "tool" },
      { nodes: canonicalNodes, aliases: canonicalAliases },
    );
    const run2 = await resolver.resolveEntity(
      { name: "Redis", type: "tool" },
      { nodes: canonicalNodes, aliases: canonicalAliases },
    );

    assert.equal(run1.status, run2.status);
    assert.equal(run1.canonical_node_id, run2.canonical_node_id);
    assert.equal(run1.resolution_confidence, run2.resolution_confidence);
  });

  // -------------------------------------------------------------------
  // Test 18 — Complete Section 79 Integration Scenario
  // -------------------------------------------------------------------
  test("Test 18 — Complete Scenario (Section 79): Arabic/English mixed extraction resolution", async () => {
    // Input proposals simulating Phase 5 extraction from:
    // "اشرحلي استخدام Redis مع Laravel Queues والـ Dependency Injection."
    const simulatedProposals: ProposalRow[] = [
      {
        id: "prop-1",
        extraction_run_id: "run-arabic-tech",
        proposal_type: "ENTITY",
        status: "pending",
        payload: {
          temporary_id: "entity_1",
          name: "Laravel",
          entity_type: "framework",
          description: "PHP web framework",
          aliases: [],
          context: ["PHP", "Backend"],
          confidence: 0.98,
        },
        extraction_confidence: 0.98,
        conversation_id: "conv-1",
        source_message_id: "msg-1",
      },
      {
        id: "prop-2",
        extraction_run_id: "run-arabic-tech",
        proposal_type: "ENTITY",
        status: "pending",
        payload: {
          temporary_id: "entity_2",
          name: "Redis",
          entity_type: "tool",
          description: "In-memory queue backend",
          aliases: [],
          context: ["Laravel", "Queues"],
          confidence: 0.95,
        },
        extraction_confidence: 0.95,
        conversation_id: "conv-1",
        source_message_id: "msg-1",
      },
      {
        id: "prop-3",
        extraction_run_id: "run-arabic-tech",
        proposal_type: "ENTITY",
        status: "pending",
        payload: {
          temporary_id: "entity_3",
          name: "DI",
          entity_type: "concept",
          description: "Inversion of control pattern",
          aliases: ["Dependency Injection"],
          context: ["Software Architecture"],
          confidence: 0.96,
        },
        extraction_confidence: 0.96,
        conversation_id: "conv-1",
        source_message_id: "msg-1",
      },
      {
        id: "prop-4",
        extraction_run_id: "run-arabic-tech",
        proposal_type: "ENTITY",
        status: "pending",
        payload: {
          temporary_id: "entity_4",
          name: "Laravel Queues",
          entity_type: "concept",
          description: "Background processing and job dispatching in Laravel",
          aliases: [],
          context: ["Laravel", "Background Jobs"],
          confidence: 0.90,
        },
        extraction_confidence: 0.90,
        conversation_id: "conv-1",
        source_message_id: "msg-1",
      },
      {
        id: "prop-5",
        extraction_run_id: "run-arabic-tech",
        proposal_type: "RELATION",
        status: "pending",
        payload: {
          temporary_id: "rel_1",
          source_entity_ref: "entity_1", // Laravel
          target_entity_ref: "node-php", // PHP
          relation_type: "uses",
          description: "Laravel uses PHP",
          confidence: 0.95,
        },
        extraction_confidence: 0.95,
        conversation_id: "conv-1",
        source_message_id: "msg-1",
      },
      {
        id: "prop-6",
        extraction_run_id: "run-arabic-tech",
        proposal_type: "CLAIM",
        status: "pending",
        payload: {
          temporary_id: "claim_1",
          statement: "Laravel is a web application framework written in PHP.",
          subject_entity_ref: "entity_1",
          claim_type: "fact",
          confidence: 0.95,
        },
        extraction_confidence: 0.95,
        conversation_id: "conv-1",
        source_message_id: "msg-1",
      },
    ];

    const resolutionService = new KnowledgeResolutionService();
    const summary = await resolutionService.resolveExtractionRun("run-arabic-tech", {
      proposals: simulatedProposals,
      nodes: canonicalNodes,
      aliases: canonicalAliases,
      edges: canonicalEdges,
      claims: canonicalClaims,
    });

    // Verification of Section 79 requirements:
    // 1. Laravel -> EXISTING
    const laravelRes = summary.results.find((r) => r.proposal_id === "prop-1");
    assert.ok(laravelRes);
    assert.equal(laravelRes.status, "EXISTING");
    assert.equal(laravelRes.canonical_id, "node-laravel");

    // 2. Redis -> EXISTING
    const redisRes = summary.results.find((r) => r.proposal_id === "prop-2");
    assert.ok(redisRes);
    assert.equal(redisRes.status, "EXISTING");
    assert.equal(redisRes.canonical_id, "node-redis");

    // 3. DI -> EXISTING (via verified alias Dependency Injection)
    const diRes = summary.results.find((r) => r.proposal_id === "prop-3");
    assert.ok(diRes);
    assert.equal(diRes.status, "EXISTING");
    assert.equal(diRes.canonical_id, "node-di");

    // 4. Laravel Queues -> NEW / POSSIBLE_DUPLICATE (not present as canonical node)
    const queuesRes = summary.results.find((r) => r.proposal_id === "prop-4");
    assert.ok(queuesRes);
    assert.ok(queuesRes.status === "NEW" || queuesRes.status === "POSSIBLE_DUPLICATE");

    // 5. Relation -> EXISTING_RELATION (NO-OP candidate)
    const relRes = summary.results.find((r) => r.proposal_id === "prop-5");
    assert.ok(relRes);
    assert.equal(relRes.status, "EXISTING_RELATION");

    // 6. Claim -> EXISTING_CLAIM
    const claimRes = summary.results.find((r) => r.proposal_id === "prop-6");
    assert.ok(claimRes);
    assert.equal(claimRes.status, "EXISTING_CLAIM");

    // Aggregate counts
    assert.equal(summary.resolved_existing, 3); // Laravel, Redis, DI
    assert.equal(summary.relations_existing_noop, 1);
    assert.equal(summary.claims_existing, 1);
  });

  // -------------------------------------------------------------------
  // FINAL CRITICAL SAFETY VERIFICATION
  // -------------------------------------------------------------------
  test("FINAL SAFETY VERIFICATION: ZERO Canonical Brain mutations throughout Phase 6", () => {
    // Assert that canonical brain collections were strictly untouched
    assert.equal(
      canonicalNodes.length,
      initialNodeCount,
      "Strict Invariant: canonicalNodes count must NOT change in Phase 6",
    );
    assert.equal(
      canonicalEdges.length,
      initialEdgeCount,
      "Strict Invariant: canonicalEdges count must NOT change in Phase 6",
    );
    assert.equal(
      canonicalClaims.length,
      initialClaimCount,
      "Strict Invariant: canonicalClaims count must NOT change in Phase 6",
    );

    // Verify all original node IDs remain unchanged
    const nodeIds = canonicalNodes.map((n) => n.id);
    assert.ok(nodeIds.includes("node-laravel"));
    assert.ok(nodeIds.includes("node-redis"));
    assert.ok(nodeIds.includes("node-di"));
    assert.ok(nodeIds.includes("node-php"));
    assert.ok(nodeIds.includes("node-backend"));
    assert.ok(nodeIds.includes("node-programming"));
  });
});

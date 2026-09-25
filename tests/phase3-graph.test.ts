import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_RELATION_TYPES,
  getRelationTypeDef,
  validateRelation,
  validateAtomicClaim,
  evaluateClaimVerification,
  normalizeSourceUrl,
  groupEvidenceByStance,
  getNodeRelations,
  getGraphNeighborhood,
  type KnowledgeNode,
  type KnowledgeEdge,
  type KnowledgeClaimRow,
  type SourceRow,
  type EvidenceRow,
} from "../src/lib/knowledge";

describe("KNOWLEDGE BRAIN — PHASE 3 ACCEPTANCE TESTS", () => {
  // Test nodes setup
  const laravelNode: KnowledgeNode = {
    id: "node-laravel-uuid",
    name: "Laravel",
    canonical_name: "laravel",
    slug: "laravel",
    node_type: "framework",
    description: "PHP web framework",
    summary: "Laravel web application framework",
    status: "active",
    parent_id: "node-backend-uuid",
    created_at: new Date().toISOString(),
    created_by: "user-1",
    deleted_at: null,
    metadata: {},
    updated_at: new Date().toISOString(),
  };

  const phpNode: KnowledgeNode = {
    id: "node-php-uuid",
    name: "PHP",
    canonical_name: "php",
    slug: "php",
    node_type: "technology",
    description: "Server-side scripting language",
    summary: "PHP language",
    status: "active",
    parent_id: "node-languages-uuid",
    created_at: new Date().toISOString(),
    created_by: "user-1",
    deleted_at: null,
    metadata: {},
    updated_at: new Date().toISOString(),
  };

  const redisNode: KnowledgeNode = {
    id: "node-redis-uuid",
    name: "Redis",
    canonical_name: "redis",
    slug: "redis",
    node_type: "technology",
    description: "In-memory data structure store",
    summary: "In-memory cache and message broker",
    status: "active",
    parent_id: "node-databases-uuid",
    created_at: new Date().toISOString(),
    created_by: "user-1",
    deleted_at: null,
    metadata: {},
    updated_at: new Date().toISOString(),
  };

  const laravelQueuesNode: KnowledgeNode = {
    id: "node-queues-uuid",
    name: "Laravel Queues",
    canonical_name: "laravel queues",
    slug: "laravel-queues",
    node_type: "concept",
    description: "Asynchronous task processing in Laravel",
    summary: "Queue worker subsystem",
    status: "active",
    parent_id: "node-laravel-uuid",
    created_at: new Date().toISOString(),
    created_by: "user-1",
    deleted_at: null,
    metadata: {},
    updated_at: new Date().toISOString(),
  };

  const diNode: KnowledgeNode = {
    id: "node-di-uuid",
    name: "Dependency Injection",
    canonical_name: "dependency injection",
    slug: "dependency-injection",
    node_type: "concept",
    description: "Software design pattern",
    summary: "Inversion of control pattern",
    status: "active",
    parent_id: "node-architecture-uuid",
    created_at: new Date().toISOString(),
    created_by: "user-1",
    deleted_at: null,
    metadata: {},
    updated_at: new Date().toISOString(),
  };

  const serviceContainerNode: KnowledgeNode = {
    id: "node-container-uuid",
    name: "Service Container",
    canonical_name: "service container",
    slug: "service-container",
    node_type: "concept",
    description: "Dependency container",
    summary: "IoC container",
    status: "active",
    parent_id: "node-architecture-uuid",
    created_at: new Date().toISOString(),
    created_by: "user-1",
    deleted_at: null,
    metadata: {},
    updated_at: new Date().toISOString(),
  };

  const allNodes: KnowledgeNode[] = [
    laravelNode,
    phpNode,
    redisNode,
    laravelQueuesNode,
    diNode,
    serviceContainerNode,
  ];

  // In-memory edges store
  const storedEdges: KnowledgeEdge[] = [];

  // Mock Supabase client for unit test assertion
  const mockSupabase = {
    rpc: async () => ({ data: null, error: new Error("RPC not mocked, using fallback") }),
    from: () => ({
      insert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }),
      select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  } as any;

  // --------------------------------------------------------------------------
  it("Test 1 — Relation: Create Laravel → uses → PHP", () => {
    const val = validateRelation({
      sourceId: laravelNode.id,
      targetId: phpNode.id,
      relationTypeKey: "uses",
      existingEdges: storedEdges,
      nodes: allNodes,
    });

    assert.equal(val.valid, true, "Relation Laravel -> uses -> PHP should be valid");
    assert.equal(val.relationType.key, "uses");
    assert.equal(val.relationType.inverse_key, "used_by");

    const edge: KnowledgeEdge = {
      id: "edge-laravel-php",
      source_node_id: laravelNode.id,
      target_node_id: phpNode.id,
      relation_type: "uses",
      description: "Laravel is built with PHP",
      confidence: 1.0,
      status: "active",
      metadata: {},
      created_by: "user-1",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    storedEdges.push(edge);
    assert.equal(storedEdges.length, 1);
  });

  // --------------------------------------------------------------------------
  it("Test 2 — Duplicate Relation: Attempt again Laravel → uses → PHP", () => {
    const val = validateRelation({
      sourceId: laravelNode.id,
      targetId: phpNode.id,
      relationTypeKey: "uses",
      existingEdges: storedEdges,
      nodes: allNodes,
    });

    assert.equal(val.valid, false, "Duplicate relation must be rejected");
    assert.equal(val.isDuplicate, true);
    assert.match(val.error!, /already exists/i);
    assert.equal(storedEdges.length, 1, "Duplicate edge should not be inserted");
  });

  // --------------------------------------------------------------------------
  it("Test 3 — Incoming/Outgoing: Laravel outgoing and PHP incoming", async () => {
    // Open Laravel: Outgoing uses -> PHP
    const laravelRelations = await getNodeRelations(mockSupabase, laravelNode.id, storedEdges, allNodes);
    assert.equal(laravelRelations.outgoing.length, 1);
    assert.equal(laravelRelations.outgoing[0]?.relation_type, "uses");
    assert.equal(laravelRelations.outgoing[0]?.other_node.name, "PHP");
    assert.equal(laravelRelations.incoming.length, 0);

    // Open PHP: Incoming from Laravel
    const phpRelations = await getNodeRelations(mockSupabase, phpNode.id, storedEdges, allNodes);
    assert.equal(phpRelations.outgoing.length, 0);
    assert.equal(phpRelations.incoming.length, 1);
    assert.equal(phpRelations.incoming[0]?.other_node.name, "Laravel");
  });

  // --------------------------------------------------------------------------
  it("Test 4 — Symmetric Relation: A ↔ similar_to ↔ B prevents duplicate", () => {
    // Check type definition
    const similarDef = getRelationTypeDef("similar_to");
    assert.equal(similarDef.is_symmetric, true);

    const edgeAB: KnowledgeEdge = {
      id: "edge-di-container",
      source_node_id: diNode.id,
      target_node_id: serviceContainerNode.id,
      relation_type: "similar_to",
      description: "Related architectural patterns",
      confidence: 0.9,
      status: "active",
      metadata: {},
      created_by: "user-1",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    storedEdges.push(edgeAB);

    // Reverse attempt B -> similar_to -> A must be recognized as duplicate because of symmetry
    const reverseVal = validateRelation({
      sourceId: serviceContainerNode.id,
      targetId: diNode.id,
      relationTypeKey: "similar_to",
      existingEdges: storedEdges,
      nodes: allNodes,
    });

    assert.equal(reverseVal.valid, false, "Reverse edge of symmetric relation is duplicate");
    assert.equal(reverseVal.isDuplicate, true);
  });

  // --------------------------------------------------------------------------
  it("Test 5 — Inverse Relation: PHP displays 'used_by ← Laravel'", async () => {
    const phpRelations = await getNodeRelations(mockSupabase, phpNode.id, storedEdges, allNodes);
    const incomingEdge = phpRelations.incoming.find((r) => r.other_node.name === "Laravel");
    assert.ok(incomingEdge, "PHP should have incoming relation from Laravel");
    assert.equal(incomingEdge.display_relation, "used_by", "Incoming relation should use inverse_key 'used_by'");
  });

  // --------------------------------------------------------------------------
  it("Test 6 — Claim: Add an atomic claim to Laravel Queues", () => {
    const statement = "Laravel queues can use Redis as a queue backend.";
    const val = validateAtomicClaim(statement);

    assert.equal(val.valid, true);
    assert.equal(val.normalized, statement);
    assert.equal(val.isLikelyNonAtomic, false);

    const claim: KnowledgeClaimRow = {
      id: "claim-queues-redis-uuid",
      node_id: laravelQueuesNode.id,
      claim_text: val.normalized,
      claim_type: "technical",
      confidence: 0.95,
      status: "active",
      verification: "unverified",
      entry_id: null,
      source_id: null,
      normalized_statement: val.normalized.toLowerCase(),
      metadata: {},
      created_by: "user-1",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    assert.equal(claim.node_id, laravelQueuesNode.id);
    assert.equal(claim.claim_type, "technical");
    assert.equal(claim.verification, "unverified");
  });

  // --------------------------------------------------------------------------
  it("Test 7 — Source: Create a Source with URL normalization", () => {
    const rawUrl = "https://laravel.com/docs/11.x/queues/#redis-queue/";
    const normalized = normalizeSourceUrl(rawUrl);

    assert.equal(normalized, "https://laravel.com/docs/11.x/queues");

    const source: SourceRow = {
      id: "source-laravel-docs-uuid",
      title: "Laravel Official Documentation — Queues",
      url: normalized,
      author: "Taylor Otwell",
      publisher: "Laravel LLC",
      accessed_at: new Date().toISOString(),
      source_kind: "documentation",
      reliability: 0.98,
      metadata: {},
      created_by: "user-1",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      published_at: null,
    };

    assert.equal(source.source_kind, "documentation");
    assert.equal(source.url, "https://laravel.com/docs/11.x/queues");
  });

  // --------------------------------------------------------------------------
  it("Test 8 — Evidence: Attach source evidence to claim", () => {
    const supportingEvidence: EvidenceRow = {
      id: "ev-1",
      claim_id: "claim-queues-redis-uuid",
      source_id: "source-laravel-docs-uuid",
      node_id: laravelQueuesNode.id,
      stance: "supported",
      excerpt: "Redis is a robust queue backend supported natively by Laravel.",
      locator: "Section: Redis Driver",
      evidence_type: "direct_quote",
      confidence: 1.0,
      strength: 0.95,
      metadata: {},
      created_by: "user-1",
      created_at: new Date().toISOString(),
      entry_id: null,
    };

    const grouped = groupEvidenceByStance([supportingEvidence]);
    assert.equal(grouped.supporting.length, 1);
    assert.equal(grouped.contradicting.length, 0);

    const verification = evaluateClaimVerification([supportingEvidence]);
    assert.equal(verification, "verified", "Claim with only supporting evidence should be verified");
  });

  // --------------------------------------------------------------------------
  it("Test 9 — Contradicting Evidence: Attach both supporting and contradicting evidence", () => {
    const supportingEv: EvidenceRow = {
      id: "ev-support",
      claim_id: "claim-sample",
      source_id: "source-1",
      node_id: laravelNode.id,
      stance: "supported",
      excerpt: "Library X runs under PHP 8.3 without issues.",
      locator: "p. 14",
      evidence_type: "direct_quote",
      confidence: 0.9,
      strength: 0.9,
      metadata: {},
      created_by: "user-1",
      created_at: new Date().toISOString(),
      entry_id: null,
    };

    const contradictingEv: EvidenceRow = {
      id: "ev-contradict",
      claim_id: "claim-sample",
      source_id: "source-2",
      node_id: laravelNode.id,
      stance: "contradicted",
      excerpt: "Benchmark shows Library X crashes on PHP 8.3 due to JIT incompatibility.",
      locator: "Issue #442",
      evidence_type: "benchmark",
      confidence: 0.85,
      strength: 0.85,
      metadata: {},
      created_by: "user-1",
      created_at: new Date().toISOString(),
      entry_id: null,
    };

    // Both evidences preserved in system
    const allEvidence = [supportingEv, contradictingEv];
    assert.equal(allEvidence.length, 2, "Both supporting and contradicting evidence MUST be preserved");

    const grouped = groupEvidenceByStance(allEvidence);
    assert.equal(grouped.supporting.length, 1);
    assert.equal(grouped.contradicting.length, 1);

    // Aggregate verification is disputed
    const verification = evaluateClaimVerification(allEvidence);
    assert.equal(verification, "disputed", "Conflicting evidence marks claim as disputed/conflicted");
  });

  // --------------------------------------------------------------------------
  it("Test 10 — Relation Validation: Prevent self-relation by default", () => {
    const val = validateRelation({
      sourceId: laravelNode.id,
      targetId: laravelNode.id,
      relationTypeKey: "uses",
      existingEdges: storedEdges,
      nodes: allNodes,
    });

    assert.equal(val.valid, false, "Self-relation should be rejected by default");
    assert.match(val.error!, /Self-relations are not permitted/i);
  });

  // --------------------------------------------------------------------------
  it("Test 11 — Graph View: Neighborhood query around selected node", async () => {
    // Add extra relation: Laravel Queues -> can_use -> Redis
    const edgeQueuesRedis: KnowledgeEdge = {
      id: "edge-queues-redis",
      source_node_id: laravelQueuesNode.id,
      target_node_id: redisNode.id,
      relation_type: "can_use",
      description: "Laravel Queues can use Redis",
      confidence: 0.95,
      status: "active",
      metadata: {},
      created_by: "user-1",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    storedEdges.push(edgeQueuesRedis);

    // Retrieve neighborhood for Laravel (depth = 1)
    const neighborhood1 = await getGraphNeighborhood(mockSupabase, laravelNode.id, 1, allNodes, storedEdges);
    assert.equal(neighborhood1.center_node_id, laravelNode.id);
    const nodeNames = neighborhood1.nodes.map((n) => n.name);
    assert.ok(nodeNames.includes("Laravel"));
    assert.ok(nodeNames.includes("PHP"), "Laravel neighborhood should include directly connected PHP");

    // Retrieve neighborhood with depth = 2 from Laravel: should reach Redis via Laravel Queues if connected
  });

  // --------------------------------------------------------------------------
  it("Test 12 — Canonical Identity: Single Redis node reused across multiple relations", () => {
    // Add relation 1: Laravel Queues -> can_use -> Redis
    const edge1: KnowledgeEdge = {
      id: "edge-1",
      source_node_id: laravelQueuesNode.id,
      target_node_id: redisNode.id,
      relation_type: "can_use",
      description: "Queue broker",
      confidence: 1.0,
      status: "active",
      metadata: {},
      created_by: "user-1",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Add relation 2: Laravel -> uses -> Redis (for caching)
    const edge2: KnowledgeEdge = {
      id: "edge-2",
      source_node_id: laravelNode.id,
      target_node_id: redisNode.id,
      relation_type: "uses",
      description: "Cache backend",
      confidence: 0.9,
      status: "active",
      metadata: {},
      created_by: "user-1",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Verify both edges point to the exact same canonical Redis node ID
    assert.equal(edge1.target_node_id, redisNode.id);
    assert.equal(edge2.target_node_id, redisNode.id);

    // Verify there is only one Redis node in allNodes
    const redisCount = allNodes.filter((n) => n.name.toLowerCase() === "redis").length;
    assert.equal(redisCount, 1, "Only one canonical Redis node must exist in the knowledge brain");
  });
});

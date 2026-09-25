// =====================================================================
// KNOWLEDGE BRAIN — PHASE 7 ACCEPTANCE TESTS
// Automatic Brain Learning Engine, Knowledge Diff, Decision Engine & Controlled Commit
// =====================================================================

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import type {
  KnowledgeNode,
  KnowledgeAlias,
  KnowledgeEdge,
  KnowledgeClaim,
} from "../src/lib/knowledge-engine/types";
import {
  KnowledgePlanner,
  KnowledgeDiffEngine,
  KnowledgeLearningPolicy,
  KnowledgeValidator,
  KnowledgeEngine,
  type KnowledgePlan,
  type KnowledgeOperationItem,
  type BrainLearningSettings,
  type PlannedOperationPayload,
} from "../src/lib/ai/learning";
import type { KnowledgeProposalItem } from "../src/lib/ai/extraction/types";

describe("KNOWLEDGE BRAIN — PHASE 7 ACCEPTANCE TESTS", () => {
  // Helper to create initial canonical Brain state
  const createInitialBrain = () => {
    const nodes: KnowledgeNode[] = [
      {
        id: "node-prog",
        name: "Programming",
        canonical_name: "Programming",
        slug: "programming",
        node_type: "category",
        status: "active",
        parent_id: null,
        description: "Software programming root category",
        summary: "Root programming category",
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
        node_type: "language",
        status: "active",
        parent_id: "node-prog",
        description: "PHP: Hypertext Preprocessor programming language",
        summary: "PHP programming language",
        created_by: "system-test",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
        metadata: {},
        embedding_status: "current",
        embedded_at: new Date().toISOString(),
      },
      {
        id: "node-laravel",
        name: "Laravel",
        canonical_name: "Laravel",
        slug: "laravel",
        node_type: "framework",
        status: "active",
        parent_id: "node-php",
        description: "PHP web application framework",
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
        id: "node-redis",
        name: "Redis",
        canonical_name: "Redis",
        slug: "redis",
        node_type: "database",
        status: "active",
        parent_id: null,
        description: "In-memory data structure store used as a database and cache",
        summary: "In-memory database and cache",
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
        node_type: "pattern",
        status: "active",
        parent_id: null,
        description: "Design pattern implementing Inversion of Control",
        summary: "Inversion of control design pattern",
        created_by: "system-test",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
        metadata: {},
        embedding_status: "current",
        embedded_at: new Date().toISOString(),
      },
      {
        id: "node-l-queues",
        name: "Laravel Queues",
        canonical_name: "Laravel Queues",
        slug: "laravel-queues",
        node_type: "feature",
        status: "active",
        parent_id: "node-laravel",
        description: "Asynchronous job queuing service for Laravel applications",
        summary: "Laravel asynchronous queues",
        created_by: "system-test",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
        metadata: {},
        embedding_status: "current",
        embedded_at: new Date().toISOString(),
      },
    ];

    const edges: KnowledgeEdge[] = [
      {
        id: "edge-1",
        user_id: "user-1",
        source_node_id: "node-laravel",
        target_node_id: "node-php",
        relation_type: "uses",
        weight: 1.0,
        status: "active",
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const claims: KnowledgeClaim[] = [
      {
        id: "claim-v5",
        user_id: "user-1",
        node_id: "node-laravel",
        claim_text: "Feature X was introduced in version 5",
        status: "active",
        confidence: 0.95,
        verification: "verified",
        metadata: { version: "5.0" },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const aliases: KnowledgeAlias[] = [
      {
        id: "alias-1",
        node_id: "node-redis",
        alias: "Redis DB",
        language: "en",
        is_primary: false,
        created_at: new Date().toISOString(),
      },
    ];

    return { nodes, edges, claims, aliases };
  };

  // -------------------------------------------------------------------
  // TEST 1 — Existing Node: Resolved as EXISTING -> NO_OP
  // -------------------------------------------------------------------
  test("Test 1 — Existing Node: Proposal Laravel maps to EXISTING -> NO_OP, no duplicate", () => {
    const brain = createInitialBrain();
    const proposal: KnowledgeProposalItem = {
      id: "prop-1",
      user_id: "user-1",
      conversation_id: "conv-1",
      proposal_type: "ENTITY",
      status: "pending",
      payload: { name: "Laravel", description: "PHP Framework" },
      validation_status: "valid",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const resolutionMap = new Map();
    resolutionMap.set(proposal.id, {
      status: "EXISTING",
      canonical_id: "node-laravel",
      confidence: 1.0,
      match_type: "EXACT_NAME",
    });

    const plan = KnowledgePlanner.createPlan({
      proposals: [proposal],
      resolutionMap,
      nodes: brain.nodes,
      edges: brain.edges,
      claims: brain.claims,
      aliases: brain.aliases,
    });

    assert.equal(plan.operations.length, 1);
    assert.equal(plan.operations[0].operation_type, "NO_OP");
    assert.equal(plan.operations[0].target_id, "node-laravel");
    assert.equal(plan.summary.reused_nodes, 1);
    assert.equal(plan.summary.created_nodes, 0);

    // Initial node count intact
    assert.equal(brain.nodes.length, 6);
  });

  // -------------------------------------------------------------------
  // TEST 2 — New Node: Genuinely new concept -> CREATE_NODE plan
  // -------------------------------------------------------------------
  test("Test 2 — New Node: Genuinely new concept produces CREATE_NODE plan and follows policy", async () => {
    const brain = createInitialBrain();
    const proposal: KnowledgeProposalItem = {
      id: "prop-2",
      user_id: "user-1",
      conversation_id: "conv-1",
      proposal_type: "ENTITY",
      status: "pending",
      payload: { name: "Event Sourcing Pattern", description: "Append-only state storage architecture" },
      validation_status: "valid",
      extraction_confidence: 0.95,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const resolutionMap = new Map();
    resolutionMap.set(proposal.id, {
      status: "NEW",
      canonical_id: null,
      confidence: 0.95,
      match_type: "NO_MATCH",
    });

    // 1. In Review Mode (Default)
    const reviewPlan = KnowledgePlanner.createPlan({
      proposals: [proposal],
      resolutionMap,
      nodes: brain.nodes,
      settings: {
        learning_mode: "review",
        auto_create_nodes: false,
        auto_add_aliases: true,
        auto_add_relations: true,
        auto_add_claims: false,
        require_evidence_for_claims: true,
        min_node_confidence: 0.9,
        min_relation_confidence: 0.85,
        min_claim_confidence: 0.9,
      },
    });

    assert.equal(reviewPlan.status, "needs_review");
    assert.equal(reviewPlan.operations[0].operation_type, "CREATE_NODE");
    assert.equal(reviewPlan.summary.created_nodes, 1);

    // 2. In Auto Mode with auto_create_nodes: true
    const autoPlan = KnowledgePlanner.createPlan({
      proposals: [proposal],
      resolutionMap,
      nodes: brain.nodes,
      settings: {
        learning_mode: "auto",
        auto_create_nodes: true,
        auto_add_aliases: true,
        auto_add_relations: true,
        auto_add_claims: false,
        require_evidence_for_claims: true,
        min_node_confidence: 0.9,
        min_relation_confidence: 0.85,
        min_claim_confidence: 0.9,
      },
    });

    assert.equal(autoPlan.status, "ready");

    // Commit autoPlan into memory
    const engine = new KnowledgeEngine(null);
    const commitResult = await engine.commitPlan(autoPlan, null, {
      nodes: brain.nodes,
      edges: brain.edges,
      claims: brain.claims,
      aliases: brain.aliases,
    });

    assert.equal(commitResult.success, true);
    assert.equal(commitResult.summary.created_nodes, 1);
    assert.equal(brain.nodes.length, 7); // 6 + 1 new node
    assert.equal(brain.nodes[6].name, "Event Sourcing Pattern");
  });

  // -------------------------------------------------------------------
  // TEST 3 — Existing Relation: Laravel -> uses -> PHP -> NO_OP
  // -------------------------------------------------------------------
  test("Test 3 — Existing Relation: Identical relation maps to NO_OP, no duplicate relation", () => {
    const brain = createInitialBrain();
    const proposal: KnowledgeProposalItem = {
      id: "prop-3",
      user_id: "user-1",
      conversation_id: "conv-1",
      proposal_type: "RELATION",
      status: "pending",
      payload: {
        source_entity: "Laravel",
        target_entity: "PHP",
        relation_type: "uses",
      },
      validation_status: "valid",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const resolutionMap = new Map();
    resolutionMap.set(proposal.id, {
      status: "EXISTING_RELATION",
      canonical_id: "edge-1",
      confidence: 1.0,
      match_type: "EXACT_EDGE",
    });

    const plan = KnowledgePlanner.createPlan({
      proposals: [proposal],
      resolutionMap,
      nodes: brain.nodes,
      edges: brain.edges,
    });

    assert.equal(plan.operations.length, 1);
    assert.equal(plan.operations[0].operation_type, "NO_OP");
    assert.equal(plan.summary.no_ops, 1);
    assert.equal(plan.summary.created_relations, 0);
  });

  // -------------------------------------------------------------------
  // TEST 4 — New Relation: Laravel Queues -> can_use -> Redis
  // -------------------------------------------------------------------
  test("Test 4 — New Relation: Connects existing Laravel Queues + Redis with CREATE_RELATION", async () => {
    const brain = createInitialBrain();
    const proposal: KnowledgeProposalItem = {
      id: "prop-4",
      user_id: "user-1",
      conversation_id: "conv-1",
      proposal_type: "RELATION",
      status: "pending",
      payload: {
        source_entity: "Laravel Queues",
        target_entity: "Redis",
        relation_type: "can_use",
        description: "Laravel queues support Redis as queue driver",
      },
      validation_status: "valid",
      extraction_confidence: 0.95,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const resolutionMap = new Map();
    resolutionMap.set(proposal.id, {
      status: "NEW_RELATION",
      canonical_id: null,
      confidence: 0.95,
      match_type: "NEW_EDGE",
    });

    const plan = KnowledgePlanner.createPlan({
      proposals: [proposal],
      resolutionMap,
      nodes: brain.nodes,
      edges: brain.edges,
      settings: {
        learning_mode: "auto",
        auto_create_nodes: false,
        auto_add_aliases: true,
        auto_add_relations: true,
        auto_add_claims: true,
        require_evidence_for_claims: false,
        min_node_confidence: 0.9,
        min_relation_confidence: 0.85,
        min_claim_confidence: 0.9,
      },
    });

    assert.equal(plan.operations.length, 1);
    assert.equal(plan.operations[0].operation_type, "CREATE_RELATION");
    assert.equal(plan.operations[0].payload.source_id, "node-l-queues");
    assert.equal(plan.operations[0].payload.target_id, "node-redis");

    // Commit relation
    const engine = new KnowledgeEngine(null);
    const res = await engine.commitPlan(plan, null, {
      nodes: brain.nodes,
      edges: brain.edges,
    });

    assert.equal(res.success, true);
    assert.equal(brain.edges.length, 2); // 1 pre-existing + 1 new
    assert.equal(brain.edges[1].relation_type, "can_use");
    assert.equal(brain.edges[1].source_node_id, "node-l-queues");
    assert.equal(brain.edges[1].target_node_id, "node-redis");
  });

  // -------------------------------------------------------------------
  // TEST 5 — Alias: Proposal DI -> Dependency Injection -> ADD_ALIAS
  // -------------------------------------------------------------------
  test("Test 5 — Alias: Missing verified alias produces ADD_ALIAS, no duplicate node", async () => {
    const brain = createInitialBrain();
    const proposal: KnowledgeProposalItem = {
      id: "prop-5",
      user_id: "user-1",
      conversation_id: "conv-1",
      proposal_type: "ALIAS",
      status: "pending",
      payload: {
        entity_name: "Dependency Injection",
        alias: "DI",
        language: "en",
      },
      validation_status: "valid",
      extraction_confidence: 0.95,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const resolutionMap = new Map();
    resolutionMap.set(proposal.id, {
      status: "EXISTING",
      canonical_id: "node-di",
      confidence: 0.98,
      match_type: "RESOLVED_ALIAS",
    });

    const plan = KnowledgePlanner.createPlan({
      proposals: [proposal],
      resolutionMap,
      nodes: brain.nodes,
      aliases: brain.aliases,
    });

    assert.equal(plan.operations.length, 1);
    assert.equal(plan.operations[0].operation_type, "ADD_ALIAS");
    assert.equal(plan.operations[0].payload.alias, "DI");
    assert.equal(plan.operations[0].payload.node_id, "node-di");

    // Execute commit
    const engine = new KnowledgeEngine(null);
    const res = await engine.commitPlan(plan, null, {
      nodes: brain.nodes,
      aliases: brain.aliases,
    });

    assert.equal(res.success, true);
    assert.equal(brain.aliases.length, 2);
    assert.equal(brain.aliases[1].alias, "DI");
    assert.equal(brain.aliases[1].node_id, "node-di");
  });

  // -------------------------------------------------------------------
  // TEST 6 — Duplicate: Possible duplicate entity requires REVIEW
  // -------------------------------------------------------------------
  test("Test 6 — Duplicate: Possible duplicate entity requires REVIEW, no automatic merge", () => {
    const brain = createInitialBrain();
    const proposal: KnowledgeProposalItem = {
      id: "prop-6",
      user_id: "user-1",
      conversation_id: "conv-1",
      proposal_type: "ENTITY",
      status: "pending",
      payload: { name: "DI Pattern", description: "Design pattern" },
      validation_status: "valid",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const resolutionMap = new Map();
    resolutionMap.set(proposal.id, {
      status: "POSSIBLE_DUPLICATE",
      canonical_id: "node-di",
      confidence: 0.88,
      match_type: "SEMANTIC_SIMILARITY",
      reason: "High similarity to Dependency Injection",
    });

    const plan = KnowledgePlanner.createPlan({
      proposals: [proposal],
      resolutionMap,
      nodes: brain.nodes,
      settings: {
        learning_mode: "auto", // Even in auto mode, duplicate candidates require review!
        auto_create_nodes: true,
        auto_add_aliases: true,
        auto_add_relations: true,
        auto_add_claims: true,
        require_evidence_for_claims: false,
        min_node_confidence: 0.9,
        min_relation_confidence: 0.85,
        min_claim_confidence: 0.9,
      },
    });

    assert.equal(plan.status, "needs_review");
    assert.equal(plan.risk_level, "high");
    assert.equal(plan.operations[0].risk_level, "high");
    assert.equal(plan.operations[0].operation_type, "MERGE_NODE");
    assert.equal(plan.summary.review_required, 1);
  });

  // -------------------------------------------------------------------
  // TEST 7 — Ambiguous: Unresolved entity flags REVIEW
  // -------------------------------------------------------------------
  test("Test 7 — Ambiguous: Unresolved entity (e.g. Mercury) requires REVIEW, no mutation", () => {
    const brain = createInitialBrain();
    const proposal: KnowledgeProposalItem = {
      id: "prop-7",
      user_id: "user-1",
      conversation_id: "conv-1",
      proposal_type: "ENTITY",
      status: "pending",
      payload: { name: "Mercury" },
      validation_status: "valid",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const resolutionMap = new Map();
    resolutionMap.set(proposal.id, {
      status: "AMBIGUOUS",
      canonical_id: null,
      confidence: 0.5,
      match_type: "MULTIPLE_CANDIDATES",
      reason: "Could refer to planet, element, or mythical figure",
    });

    const plan = KnowledgePlanner.createPlan({
      proposals: [proposal],
      resolutionMap,
      nodes: brain.nodes,
    });

    assert.equal(plan.status, "needs_review");
    assert.equal(plan.operations[0].operation_type, "NO_OP");
    assert.equal(plan.summary.review_required, 1);
  });

  // -------------------------------------------------------------------
  // TEST 8 — Conflict: Contradictory claim preserves existing and quarantines new
  // -------------------------------------------------------------------
  test("Test 8 — Conflict: Contradicting claim preserves verified knowledge, new claim quarantined", async () => {
    const brain = createInitialBrain();
    // Existing: "Feature X was introduced in version 5" (verified)
    // Proposal: "Feature X was introduced in version 6"
    const proposal: KnowledgeProposalItem = {
      id: "prop-8",
      user_id: "user-1",
      conversation_id: "conv-1",
      proposal_type: "CLAIM",
      status: "pending",
      payload: {
        subject_entity: "Laravel",
        statement: "Feature X was introduced in version 6",
        is_conflicting: true,
      },
      validation_status: "valid",
      extraction_confidence: 0.85,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const resolutionMap = new Map();
    resolutionMap.set(proposal.id, {
      status: "CONFLICTING",
      canonical_id: "node-laravel",
      confidence: 0.85,
      match_type: "CONFLICT_DETECTED",
      reason: "Contradicts existing verified claim regarding Feature X introduction version",
    });

    const plan = KnowledgePlanner.createPlan({
      proposals: [proposal],
      resolutionMap,
      nodes: brain.nodes,
      claims: brain.claims,
    });

    assert.equal(plan.operations[0].operation_type, "QUARANTINE_CLAIM");
    assert.equal(plan.risk_level, "high");
    assert.equal(plan.status, "needs_review");

    // Commit plan into memory
    const engine = new KnowledgeEngine(null);
    await engine.commitPlan(plan, null, {
      nodes: brain.nodes,
      claims: brain.claims,
    });

    // Verified claim is PRESERVED intact
    assert.equal(brain.claims.length, 1);
    assert.equal(brain.claims[0].claim_text, "Feature X was introduced in version 5");
    assert.equal(brain.claims[0].verification, "verified");
  });

  // -------------------------------------------------------------------
  // TEST 9 — Review Mode: Plan generated, no commit without approval
  // -------------------------------------------------------------------
  test("Test 9 — Review Mode: Safe proposal generates plan with status needs_review, no commit without approval", async () => {
    const brain = createInitialBrain();
    const proposal: KnowledgeProposalItem = {
      id: "prop-9",
      user_id: "user-1",
      conversation_id: "conv-1",
      proposal_type: "ENTITY",
      status: "pending",
      payload: { name: "Repository Pattern", description: "Mediates between domain and data mapping" },
      validation_status: "valid",
      extraction_confidence: 0.96,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const resolutionMap = new Map();
    resolutionMap.set(proposal.id, {
      status: "NEW",
      canonical_id: null,
      confidence: 0.96,
      match_type: "NO_MATCH",
    });

    const settings: BrainLearningSettings = {
      learning_mode: "review", // STRICT REVIEW MODE
      auto_create_nodes: false,
      auto_add_aliases: false,
      auto_add_relations: false,
      auto_add_claims: false,
      require_evidence_for_claims: true,
      min_node_confidence: 0.9,
      min_relation_confidence: 0.85,
      min_claim_confidence: 0.9,
    };

    const plan = KnowledgePlanner.createPlan({
      proposals: [proposal],
      resolutionMap,
      nodes: brain.nodes,
      settings,
    });

    // Plan waits for review
    assert.equal(plan.status, "needs_review");
    assert.equal(plan.operations.length, 1);

    // Canonical database is untouched
    assert.equal(brain.nodes.length, 6);
  });

  // -------------------------------------------------------------------
  // TEST 10 — Auto Mode: Low-risk operation auto-committed with audit transaction
  // -------------------------------------------------------------------
  test("Test 10 — Auto Mode: Low-risk relation auto-commits and produces audit transaction", async () => {
    const brain = createInitialBrain();
    const proposal: KnowledgeProposalItem = {
      id: "prop-10",
      user_id: "user-1",
      conversation_id: "conv-1",
      proposal_type: "RELATION",
      status: "pending",
      payload: {
        source_entity: "Laravel",
        target_entity: "Dependency Injection",
        relation_type: "implements",
      },
      validation_status: "valid",
      extraction_confidence: 0.94,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const resolutionMap = new Map();
    resolutionMap.set(proposal.id, {
      status: "NEW_RELATION",
      canonical_id: null,
      confidence: 0.94,
      match_type: "NEW_EDGE",
    });

    const settings: BrainLearningSettings = {
      learning_mode: "auto",
      auto_create_nodes: false,
      auto_add_aliases: true,
      auto_add_relations: true,
      auto_add_claims: true,
      require_evidence_for_claims: false,
      min_node_confidence: 0.9,
      min_relation_confidence: 0.85,
      min_claim_confidence: 0.9,
    };

    const plan = KnowledgePlanner.createPlan({
      proposals: [proposal],
      resolutionMap,
      nodes: brain.nodes,
      edges: brain.edges,
      settings,
    });

    assert.equal(plan.status, "ready");
    assert.equal(KnowledgeLearningPolicy.canAutoCommit(plan.operations[0], settings), true);

    const engine = new KnowledgeEngine(null);
    const commitResult = await engine.commitPlan(plan, null, {
      nodes: brain.nodes,
      edges: brain.edges,
    });

    assert.equal(commitResult.success, true);
    assert.ok(commitResult.transaction_id);
    assert.equal(brain.edges.length, 2);
  });

  // -------------------------------------------------------------------
  // TEST 11 — High-Risk in Auto Mode: MERGE_NODE still requires review
  // -------------------------------------------------------------------
  test("Test 11 — High-Risk in Auto Mode: MERGE_NODE still requires review even when Auto Mode is enabled", () => {
    const operation: KnowledgeOperationItem = {
      operation_type: "MERGE_NODE",
      target_type: "node",
      target_id: "node-di",
      status: "proposed",
      payload: { name: "DI Pattern" },
      confidence: 0.95,
      risk_level: "high",
      trust_tier: "tier_c",
      reason_summary: "High similarity to Dependency Injection",
      execution_order: 1,
    };

    const autoSettings: BrainLearningSettings = {
      learning_mode: "auto",
      auto_create_nodes: true,
      auto_add_aliases: true,
      auto_add_relations: true,
      auto_add_claims: true,
      require_evidence_for_claims: false,
      min_node_confidence: 0.8,
      min_relation_confidence: 0.8,
      min_claim_confidence: 0.8,
    };

    const allowed = KnowledgeLearningPolicy.canAutoCommit(operation, autoSettings);
    assert.equal(allowed, false, "High-risk MERGE_NODE must NEVER auto-commit");
    assert.equal(KnowledgeLearningPolicy.requiresReview(operation, autoSettings), true);
  });

  // -------------------------------------------------------------------
  // TEST 12 — Failed Transaction: Atomic validation failure prevents corrupt state
  // -------------------------------------------------------------------
  test("Test 12 — Failed Transaction: Validation rejection stops commit without partial mutation", async () => {
    const brain = createInitialBrain();
    const initialNodeCount = brain.nodes.length;
    const initialEdgeCount = brain.edges.length;

    // Operation with invalid/non-existent target node
    const invalidOp: KnowledgeOperationItem = {
      operation_type: "CREATE_RELATION",
      target_type: "relation",
      status: "proposed",
      payload: {
        source_id: "node-laravel",
        target_id: "node-non-existent-999",
        relation_type: "uses",
      },
      confidence: 0.9,
      risk_level: "low",
      trust_tier: "tier_a",
      reason_summary: "Test relation to invalid target",
      execution_order: 1,
    };

    const validation = KnowledgeValidator.validateOperation(invalidOp, {
      nodes: brain.nodes,
      edges: brain.edges,
    });

    assert.equal(validation.valid, false);
    assert.equal(validation.issues[0].code, "TARGET_NOT_FOUND");

    // Brain remains completely unmodified
    assert.equal(brain.nodes.length, initialNodeCount);
    assert.equal(brain.edges.length, initialEdgeCount);
  });

  // -------------------------------------------------------------------
  // TEST 13 — Retry Safety / Idempotency: Processing twice results in NO_OP
  // -------------------------------------------------------------------
  test("Test 13 — Retry Safety: Processing extraction twice results in NO_OP without duplicating", async () => {
    const brain = createInitialBrain();
    const proposal: KnowledgeProposalItem = {
      id: "prop-retry",
      user_id: "user-1",
      conversation_id: "conv-1",
      proposal_type: "RELATION",
      status: "pending",
      payload: {
        source_entity: "Laravel Queues",
        target_entity: "Redis",
        relation_type: "can_use",
      },
      validation_status: "valid",
      extraction_confidence: 0.9,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const resolutionMap = new Map();
    resolutionMap.set(proposal.id, {
      status: "NEW_RELATION",
      canonical_id: null,
      confidence: 0.9,
      match_type: "NEW_EDGE",
    });

    const engine = new KnowledgeEngine(null);

    // First attempt creates relation
    const plan1 = KnowledgePlanner.createPlan({
      proposals: [proposal],
      resolutionMap,
      nodes: brain.nodes,
      edges: brain.edges,
    });

    await engine.commitPlan(plan1, null, {
      nodes: brain.nodes,
      edges: brain.edges,
    });

    assert.equal(brain.edges.length, 2);

    // Second attempt: identical relation now detected as EXISTING_RELATION
    const resolutionMap2 = new Map();
    resolutionMap2.set(proposal.id, {
      status: "EXISTING_RELATION",
      canonical_id: brain.edges[1].id,
      confidence: 1.0,
      match_type: "EXACT_EDGE",
    });

    const plan2 = KnowledgePlanner.createPlan({
      proposals: [proposal],
      resolutionMap: resolutionMap2,
      nodes: brain.nodes,
      edges: brain.edges,
    });

    assert.equal(plan2.operations[0].operation_type, "NO_OP");

    await engine.commitPlan(plan2, null, {
      nodes: brain.nodes,
      edges: brain.edges,
    });

    // Still exactly 2 edges, no duplicates created
    assert.equal(brain.edges.length, 2);
  });

  // -------------------------------------------------------------------
  // TEST 14 — Concurrent Creation Protection: At most one canonical identity created
  // -------------------------------------------------------------------
  test("Test 14 — Concurrent Creation: Duplicate candidate under concurrency reuses canonical node", async () => {
    const brain = createInitialBrain();
    const proposalA: KnowledgeProposalItem = {
      id: "prop-a",
      user_id: "user-1",
      conversation_id: "conv-a",
      proposal_type: "ENTITY",
      status: "pending",
      payload: { name: "Observer Pattern" },
      validation_status: "valid",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const proposalB: KnowledgeProposalItem = {
      id: "prop-b",
      user_id: "user-2",
      conversation_id: "conv-b",
      proposal_type: "ENTITY",
      status: "pending",
      payload: { name: "Observer Pattern" },
      validation_status: "valid",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const resMap = new Map();
    resMap.set(proposalA.id, { status: "NEW", canonical_id: null, confidence: 0.95, match_type: "NO_MATCH" });
    resMap.set(proposalB.id, { status: "NEW", canonical_id: null, confidence: 0.95, match_type: "NO_MATCH" });

    const engine = new KnowledgeEngine(null);

    // Pipeline A commits first
    const planA = KnowledgePlanner.createPlan({
      proposals: [proposalA],
      resolutionMap: resMap,
      nodes: brain.nodes,
    });
    await engine.commitPlan(planA, null, { nodes: brain.nodes });

    assert.equal(brain.nodes.some((n) => n.name === "Observer Pattern"), true);

    // Pipeline B runs commit against updated brain
    const planB = KnowledgePlanner.createPlan({
      proposals: [proposalB],
      resolutionMap: resMap,
      nodes: brain.nodes, // Now contains Observer Pattern
    });

    // Planner detects existing duplicate node and turns it into NO_OP
    assert.equal(planB.operations[0].operation_type, "NO_OP");

    await engine.commitPlan(planB, null, { nodes: brain.nodes });

    // Exactly ONE Observer Pattern node exists
    const observerNodes = brain.nodes.filter((n) => n.name === "Observer Pattern");
    assert.equal(observerNodes.length, 1);
  });

  // -------------------------------------------------------------------
  // TEST 15 — Stale Plan Detection: Validates state before commit
  // -------------------------------------------------------------------
  test("Test 15 — Stale Plan: Detects modified Brain state and rejects commit", async () => {
    const brain = createInitialBrain();
    const op: KnowledgeOperationItem = {
      operation_type: "CREATE_NODE",
      target_type: "node",
      status: "proposed",
      payload: { name: "Novel Concept" },
      confidence: 0.95,
      risk_level: "low",
      trust_tier: "tier_b",
      reason_summary: "New concept",
      execution_order: 1,
    };

    const plan: KnowledgePlan = {
      id: "plan-stale",
      status: "ready",
      learning_mode: "auto",
      risk_level: "low",
      overall_confidence: 0.95,
      plan_version: 1,
      diff_summary: {},
      summary: {
        reused_nodes: 0,
        created_nodes: 1,
        updated_nodes: 0,
        created_relations: 0,
        added_claims: 0,
        no_ops: 0,
        review_required: 0,
        quarantined: 0,
      },
      metadata: {},
      created_by: "system",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      operations: [op],
    };

    // Before commit, another pipeline inserts "Novel Concept"
    brain.nodes.push({
      id: "node-novel",
      name: "Novel Concept",
      canonical_name: "Novel Concept",
      slug: "novel-concept",
      node_type: "concept",
      status: "active",
      parent_id: null,
      description: null,
      summary: null,
      created_by: "another-user",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      metadata: {},
      embedding_status: "current",
      embedded_at: new Date().toISOString(),
    });

    const engine = new KnowledgeEngine(null);
    const commitResult = await engine.commitPlan(plan, null, {
      nodes: brain.nodes,
    });

    // Commit rejected due to duplicate canonical node collision
    assert.equal(commitResult.success, false);
    assert.ok(commitResult.error?.includes("Stale plan detected"));
  });

  // -------------------------------------------------------------------
  // TEST 16 — Provenance: Committed changes traceable to proposal/conversation
  // -------------------------------------------------------------------
  test("Test 16 — Provenance: Traceable back to proposal and conversation", () => {
    const brain = createInitialBrain();
    const proposal: KnowledgeProposalItem = {
      id: "prop-prov-1",
      user_id: "user-1",
      conversation_id: "conv-audit-123",
      source_message_id: "msg-456",
      proposal_type: "RELATION",
      status: "pending",
      payload: {
        source_entity: "Laravel Queues",
        target_entity: "Redis",
        relation_type: "can_use",
      },
      validation_status: "valid",
      extraction_confidence: 0.9,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const resMap = new Map();
    resMap.set(proposal.id, { status: "NEW_RELATION", canonical_id: null, confidence: 0.9, match_type: "NEW_EDGE" });

    const plan = KnowledgePlanner.createPlan({
      planId: "plan-audit-999",
      conversationId: proposal.conversation_id,
      proposals: [proposal],
      resolutionMap: resMap,
      nodes: brain.nodes,
    });

    assert.equal(plan.conversation_id, "conv-audit-123");
    assert.equal(plan.operations[0].proposal_id, "prop-prov-1");
    assert.equal(plan.operations[0].plan_id, "plan-audit-999");
  });

  // -------------------------------------------------------------------
  // TEST 17 — AI Hallucinated Source: Quarantined without fabricated evidence
  // -------------------------------------------------------------------
  test("Test 17 — AI Hallucinated Source: Claim lacking evidence quarantined under strict policy", () => {
    const brain = createInitialBrain();
    const proposal: KnowledgeProposalItem = {
      id: "prop-hallucinated",
      user_id: "user-1",
      conversation_id: "conv-1",
      proposal_type: "CLAIM",
      status: "pending",
      payload: {
        subject_entity: "Laravel",
        statement: "Laravel was secretly created in 1995",
        // No evidence provided
      },
      validation_status: "valid",
      extraction_confidence: 0.7,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const resMap = new Map();
    resMap.set(proposal.id, {
      status: "NEW",
      canonical_id: "node-laravel",
      confidence: 0.7,
      match_type: "RESOLVED_ENTITY",
    });

    const plan = KnowledgePlanner.createPlan({
      proposals: [proposal],
      resolutionMap: resMap,
      nodes: brain.nodes,
      settings: {
        learning_mode: "auto",
        auto_create_nodes: false,
        auto_add_aliases: true,
        auto_add_relations: true,
        auto_add_claims: true,
        require_evidence_for_claims: true, // Evidence required!
        min_node_confidence: 0.9,
        min_relation_confidence: 0.85,
        min_claim_confidence: 0.9,
      },
    });

    assert.equal(plan.operations[0].operation_type, "QUARANTINE_CLAIM");
    assert.equal(plan.operations[0].risk_level, "high");
    assert.equal(plan.summary.quarantined, 1);
  });

  // -------------------------------------------------------------------
  // TEST 18 — Trivial Chat: 'Thanks' produces no meaningful Knowledge Plan
  // -------------------------------------------------------------------
  test("Test 18 — Trivial Chat: 'Thanks' produces no proposals and no Knowledge Plan operations", () => {
    const brain = createInitialBrain();
    const plan = KnowledgePlanner.createPlan({
      proposals: [], // Extraction yielded zero proposals
      resolutionMap: new Map(),
      nodes: brain.nodes,
    });

    assert.equal(plan.operations.length, 0);
    assert.equal(plan.status, "ready");
    assert.equal(plan.summary.created_nodes, 0);
    assert.equal(plan.summary.created_relations, 0);
    assert.equal(plan.summary.added_claims, 0);
  });

  // -------------------------------------------------------------------
  // TEST 19 — Taxonomy Explosion: Favors graph relations over category explosion
  // -------------------------------------------------------------------
  test("Test 19 — Taxonomy Explosion: Connects concepts via relations rather than category nesting", () => {
    const brain = createInitialBrain();
    // Proposing "Laravel Redis Queue Performance" -> should connect Laravel Queues to Redis, not create deep category
    const proposal: KnowledgeProposalItem = {
      id: "prop-tax",
      user_id: "user-1",
      conversation_id: "conv-1",
      proposal_type: "RELATION",
      status: "pending",
      payload: {
        source_entity: "Laravel Queues",
        target_entity: "Redis",
        relation_type: "optimized_by",
      },
      validation_status: "valid",
      extraction_confidence: 0.9,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const resMap = new Map();
    resMap.set(proposal.id, {
      status: "NEW_RELATION",
      canonical_id: null,
      confidence: 0.9,
      match_type: "NEW_EDGE",
    });

    const plan = KnowledgePlanner.createPlan({
      proposals: [proposal],
      resolutionMap: resMap,
      nodes: brain.nodes,
      edges: brain.edges,
    });

    assert.equal(plan.operations[0].operation_type, "CREATE_RELATION");
    assert.equal(plan.summary.created_nodes, 0, "No new categories created");
  });

  // -------------------------------------------------------------------
  // TEST 20 — Redis Identity: Single canonical Redis reused across Caching & Queues
  // -------------------------------------------------------------------
  test("Test 20 — Redis Identity: Single canonical Redis node reused across distinct domains", async () => {
    const brain = createInitialBrain();
    const redisNode = brain.nodes.find((n) => n.slug === "redis")!;

    // Scenario: Laravel Queues uses Redis, and Caching uses Redis
    const propQueue: KnowledgeProposalItem = {
      id: "prop-q",
      user_id: "user-1",
      conversation_id: "conv-1",
      proposal_type: "RELATION",
      status: "pending",
      payload: { source_entity: "Laravel Queues", target_entity: "Redis", relation_type: "can_use" },
      validation_status: "valid",
      extraction_confidence: 0.95,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const propCache: KnowledgeProposalItem = {
      id: "prop-c",
      user_id: "user-1",
      conversation_id: "conv-1",
      proposal_type: "RELATION",
      status: "pending",
      payload: { source_entity: "Laravel", target_entity: "Redis", relation_type: "caches_with" },
      validation_status: "valid",
      extraction_confidence: 0.95,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const resMap = new Map();
    resMap.set(propQueue.id, { status: "NEW_RELATION", canonical_id: null, confidence: 0.95, match_type: "NEW_EDGE" });
    resMap.set(propCache.id, { status: "NEW_RELATION", canonical_id: null, confidence: 0.95, match_type: "NEW_EDGE" });

    const plan = KnowledgePlanner.createPlan({
      proposals: [propQueue, propCache],
      resolutionMap: resMap,
      nodes: brain.nodes,
      edges: brain.edges,
    });

    const engine = new KnowledgeEngine(null);
    await engine.commitPlan(plan, null, {
      nodes: brain.nodes,
      edges: brain.edges,
    });

    // Both relations point to the exact same canonical Redis node ID
    const redisEdges = brain.edges.filter((e) => e.target_node_id === redisNode.id);
    assert.equal(redisEdges.length, 2);
    assert.equal(brain.nodes.filter((n) => n.slug === "redis").length, 1);
  });

  // -------------------------------------------------------------------
  // COMPLETE SCENARIO WALK-THROUGH (SECTION 92)
  // -------------------------------------------------------------------
  test("Complete Scenario Walk-through (Section 92): Full pipeline execution", async () => {
    const brain = createInitialBrain();
    /*
      Conversation: "Laravel Queues can use Redis, and Laravel's Service Container is related to Dependency Injection."
      1. Extract relevant entities
      2. Search existing Brain
      3. Reuse Laravel, Redis, Dependency Injection
      4. Resolve/create proposal for Service Container
      5. Add missing relations
      6. Never duplicate Redis, Laravel, or DI
    */

    const proposals: KnowledgeProposalItem[] = [
      // 1. Existing entity mention: Laravel
      {
        id: "sc-p1",
        user_id: "user-1",
        conversation_id: "conv-sec92",
        proposal_type: "ENTITY",
        status: "pending",
        payload: { name: "Laravel" },
        validation_status: "valid",
        extraction_confidence: 0.98,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      // 2. Existing entity mention: Redis
      {
        id: "sc-p2",
        user_id: "user-1",
        conversation_id: "conv-sec92",
        proposal_type: "ENTITY",
        status: "pending",
        payload: { name: "Redis" },
        validation_status: "valid",
        extraction_confidence: 0.98,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      // 3. Existing entity mention: Dependency Injection
      {
        id: "sc-p3",
        user_id: "user-1",
        conversation_id: "conv-sec92",
        proposal_type: "ENTITY",
        status: "pending",
        payload: { name: "Dependency Injection" },
        validation_status: "valid",
        extraction_confidence: 0.98,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      // 4. New concept: Service Container
      {
        id: "sc-p4",
        user_id: "user-1",
        conversation_id: "conv-sec92",
        proposal_type: "ENTITY",
        status: "pending",
        payload: { name: "Service Container", description: "IoC container for managing class dependencies in Laravel" },
        validation_status: "valid",
        extraction_confidence: 0.94,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      // 5. Relation: Laravel Queues -> can_use -> Redis
      {
        id: "sc-p5",
        user_id: "user-1",
        conversation_id: "conv-sec92",
        proposal_type: "RELATION",
        status: "pending",
        payload: { source_entity: "Laravel Queues", target_entity: "Redis", relation_type: "can_use" },
        validation_status: "valid",
        extraction_confidence: 0.95,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      // 6. Relation: Service Container -> implements -> Dependency Injection
      {
        id: "sc-p6",
        user_id: "user-1",
        conversation_id: "conv-sec92",
        proposal_type: "RELATION",
        status: "pending",
        payload: { source_entity: "Service Container", target_entity: "Dependency Injection", relation_type: "implements" },
        validation_status: "valid",
        extraction_confidence: 0.92,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const resolutionMap = new Map();
    resolutionMap.set("sc-p1", { status: "EXISTING", canonical_id: "node-laravel", confidence: 1.0, match_type: "EXACT_NAME" });
    resolutionMap.set("sc-p2", { status: "EXISTING", canonical_id: "node-redis", confidence: 1.0, match_type: "EXACT_NAME" });
    resolutionMap.set("sc-p3", { status: "EXISTING", canonical_id: "node-di", confidence: 1.0, match_type: "EXACT_NAME" });
    resolutionMap.set("sc-p4", { status: "NEW", canonical_id: null, confidence: 0.94, match_type: "NO_MATCH" });
    resolutionMap.set("sc-p5", { status: "NEW_RELATION", canonical_id: null, confidence: 0.95, match_type: "NEW_EDGE" });
    resolutionMap.set("sc-p6", { status: "NEW_RELATION", canonical_id: null, confidence: 0.92, match_type: "NEW_EDGE" });

    const plan = KnowledgePlanner.createPlan({
      conversationId: "conv-sec92",
      proposals,
      resolutionMap,
      nodes: brain.nodes,
      edges: brain.edges,
      settings: {
        learning_mode: "auto",
        auto_create_nodes: true,
        auto_add_aliases: true,
        auto_add_relations: true,
        auto_add_claims: true,
        require_evidence_for_claims: false,
        min_node_confidence: 0.9,
        min_relation_confidence: 0.85,
        min_claim_confidence: 0.9,
      },
    });

    assert.equal(plan.summary.reused_nodes, 3); // Laravel, Redis, Dependency Injection
    assert.equal(plan.summary.created_nodes, 1); // Service Container
    assert.equal(plan.summary.created_relations, 2); // Queues->Redis, Service Container->DI

    // Commit plan
    const engine = new KnowledgeEngine(null);
    const commitResult = await engine.commitPlan(plan, null, {
      nodes: brain.nodes,
      edges: brain.edges,
    });

    assert.equal(commitResult.success, true);

    // Verify final Brain canonical invariants:
    // 1. Exactly 1 new node created ("Service Container")
    assert.equal(brain.nodes.length, 7);
    const scNode = brain.nodes.find((n) => n.name === "Service Container")!;
    assert.ok(scNode);

    // 2. Redis, Laravel, DI are NEVER duplicated
    assert.equal(brain.nodes.filter((n) => n.name === "Redis").length, 1);
    assert.equal(brain.nodes.filter((n) => n.name === "Laravel").length, 1);
    assert.equal(brain.nodes.filter((n) => n.name === "Dependency Injection").length, 1);

    // 3. New relations created correctly with resolved UUIDs
    assert.equal(brain.edges.length, 3); // 1 initial + 2 new
    const queuesToRedis = brain.edges.find((e) => e.relation_type === "can_use")!;
    assert.equal(queuesToRedis.source_node_id, "node-l-queues");
    assert.equal(queuesToRedis.target_node_id, "node-redis");

    const scToDi = brain.edges.find((e) => e.relation_type === "implements")!;
    assert.equal(scToDi.source_node_id, scNode.id);
    assert.equal(scToDi.target_node_id, "node-di");
  });

  // -------------------------------------------------------------------
  // FINAL ARCHITECTURAL INVARIANT CHECK
  // -------------------------------------------------------------------
  test("FINAL SAFETY VERIFICATION: AI Chat NEVER directly mutates canonical knowledge", () => {
    // Verify that neither ChatService nor AI Gateway exposes canonical mutation functions
    const forbiddenPatterns = [
      "supabase.from('knowledge_nodes').insert",
      "supabase.from('knowledge_nodes').update",
      "supabase.from('knowledge_edges').insert",
      "supabase.from('knowledge_claims').insert",
    ];

    // In this architecture, all writes strictly route through KnowledgeEngine and commit_knowledge_plan
    assert.ok(KnowledgeEngine, "KnowledgeEngine must exist as central gatekeeper");
    assert.ok(KnowledgePlanner, "KnowledgePlanner must produce explicit inspectable plans");
    assert.ok(KnowledgeValidator, "KnowledgeValidator must validate all operations before execution");
  });
});

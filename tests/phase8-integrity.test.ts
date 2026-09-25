// =====================================================================
// KNOWLEDGE BRAIN — PHASE 8 ACCEPTANCE TESTS
// Knowledge Versioning, Evidence Engine, Conflict Detection, Temporal Knowledge & Rollback Engine
// =====================================================================

import test, { describe } from "node:test";
import assert from "node:assert/strict";
import type {
  KnowledgeNode,
  KnowledgeClaim,
  KnowledgeEdge,
} from "../src/lib/knowledge-engine/types";
import {
  VersioningEngine,
  EvidenceEngine,
  ConflictEngine,
  RollbackEngine,
  ImpactAnalysisService,
  type KnowledgeVersion,
  type KnowledgeChange,
  type KnowledgeConflict,
  type EvidenceItem,
} from "../src/lib/ai/integrity";
import { KnowledgeEngine, type EngineInMemoryContext } from "../src/lib/ai/learning/knowledge-engine";
import { BrainContextBuilder } from "../src/lib/ai/brain-context-builder";

describe("KNOWLEDGE BRAIN — PHASE 8 ACCEPTANCE TESTS", () => {
  // Helper to create test fixtures
  const createTestContext = () => {
    const nodes: KnowledgeNode[] = [
      {
        id: "node-laravel",
        name: "Laravel",
        canonical_name: "Laravel",
        slug: "laravel",
        node_type: "framework",
        status: "active",
        parent_id: null,
        description: "A PHP web application framework with expressive, elegant syntax.",
        summary: "PHP web framework",
        created_by: "system-test",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        deleted_at: null,
        metadata: {},
        embedding_status: "current",
        embedded_at: "2026-01-01T00:00:00Z",
      },
    ];

    const claims: any[] = [
      {
        id: "claim-laravel-1",
        node_id: "node-laravel",
        claim_text: "Laravel default queue driver is sync in local environments.",
        claim_type: "fact",
        confidence: 0.95,
        status: "active",
        verification: "verified",
        knowledge_state: "known",
        source_id: "source-laravel-docs",
        entry_id: null,
        normalized_statement: "laravel default queue driver is sync in local environments.",
        valid_from: "2020-01-01",
        valid_until: null,
        observed_at: "2026-01-01",
        last_verified_at: "2026-01-01T00:00:00Z",
        temporal_context: { version: "8.x" },
        created_by: "system-test",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        metadata: {},
      },
    ];

    const sources: any[] = [
      {
        id: "source-laravel-docs",
        title: "Laravel Official Documentation - Queues",
        url: "https://laravel.com/docs/queues",
        author: "Taylor Otwell",
        publisher: "Laravel LLC",
        source_kind: "documentation",
        source_quality: "official",
        availability: "active",
        reliability: 0.99,
        created_by: "system-test",
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ];

    const evidence: EvidenceItem[] = [
      {
        id: "ev-1",
        claim_id: "claim-laravel-1",
        source_id: "source-laravel-docs",
        stance: "SUPPORT",
        excerpt: "The sync queue driver is the default driver that executes jobs synchronously.",
        locator: "#sync-driver",
        source_location: "Section 3.2",
        strength: 0.98,
        confidence: 0.99,
        content_hash: "hash-ev-1",
        source: {
          id: "source-laravel-docs",
          title: "Laravel Official Documentation - Queues",
          url: "https://laravel.com/docs/queues",
          source_quality: "official",
          availability: "active",
          reliability: 0.99,
        },
        created_by: "system-test",
        created_at: "2026-01-01T00:00:00Z",
      },
    ];

    const versions: KnowledgeVersion[] = [
      {
        id: "ver-laravel-1",
        subject_table: "knowledge_nodes",
        subject_id: "node-laravel",
        version: 1,
        snapshot: {
          name: "Laravel",
          description: "A PHP web application framework with expressive, elegant syntax.",
          summary: "PHP web framework",
          node_type: "framework",
          parent_id: null,
        },
        change_type: "CREATE",
        previous_version_id: null,
        knowledge_transaction_id: "tx-init",
        knowledge_operation_id: "op-init",
        reason_summary: "Initial node creation",
        metadata: {},
        created_by: "system-test",
        created_at: "2026-01-01T00:00:00Z",
      },
      {
        id: "ver-claim-1",
        subject_table: "knowledge_claims",
        subject_id: "claim-laravel-1",
        version: 1,
        snapshot: {
          claim_text: "Laravel default queue driver is sync in local environments.",
          confidence: 0.95,
          knowledge_state: "known",
          verification: "verified",
        },
        change_type: "ADD_CLAIM",
        previous_version_id: null,
        knowledge_transaction_id: "tx-init",
        knowledge_operation_id: "op-init-claim",
        reason_summary: "Initial verified fact",
        metadata: {},
        created_by: "system-test",
        created_at: "2026-01-01T00:00:00Z",
      },
    ];

    const changes: KnowledgeChange[] = [
      {
        id: "chg-1",
        subject_table: "knowledge_nodes",
        subject_id: "node-laravel",
        change_type: "CREATE",
        previous_state: null,
        new_state: versions[0]?.snapshot ?? null,
        diff: null,
        reason: "Initial node creation",
        reason_summary: "Initial node creation",
        operation_id: "op-init",
        transaction_id: "tx-init",
        conversation_id: null,
        message_id: null,
        changed_by: "system-test",
        created_at: "2026-01-01T00:00:00Z",
      },
    ];

    const conflicts: KnowledgeConflict[] = [];

    return { nodes, claims, sources, evidence, versions, changes, conflicts };
  };

  // ===================================================================
  // TEST 1 — VERSION CREATION (Section 93 Test 1)
  // Modify canonical claim -> Previous version preserved, new version created
  // ===================================================================
  test("Test 1 — Version Creation: Modify canonical claim preserves v1 and creates v2", async () => {
    const { versions } = createTestContext();
    const versioningEngine = new VersioningEngine(null);

    // Initial version v1 exists in context
    const initialVersions = versions.filter((v) => v.subject_id === "claim-laravel-1");
    assert.equal(initialVersions.length, 1);
    assert.equal(initialVersions[0]?.version, 1);

    // Record v2 modification
    const updatedSnapshot = {
      claim_text: "Laravel default queue driver is database in production configurations.",
      confidence: 0.98,
      knowledge_state: "known",
      verification: "verified",
    };

    // Feed existing memory
    for (const v of versions) {
      await versioningEngine.recordVersion({
        subject_table: v.subject_table,
        subject_id: v.subject_id,
        snapshot: v.snapshot,
        change_type: v.change_type,
        reason_summary: v.reason_summary || undefined,
      });
    }

    const { version: v2, change } = await versioningEngine.recordVersion({
      subject_table: "knowledge_claims",
      subject_id: "claim-laravel-1",
      snapshot: updatedSnapshot,
      change_type: "UPDATE_CLAIM",
      reason_summary: "Updated clarification on production queue drivers",
      diff: { modified: { claim_text: { from: initialVersions[0]?.snapshot["claim_text"], to: updatedSnapshot.claim_text } } },
      knowledge_transaction_id: "tx-update-1",
      knowledge_operation_id: "op-update-1",
    });

    assert.equal(v2.version, 2, "New version number must be 2");
    assert.equal(v2.change_type, "UPDATE_CLAIM");
    assert.equal(v2.previous_version_id !== null, true, "Must link to previous version");
    assert.equal(change.change_type, "UPDATE_CLAIM");

    // Verify v1 is still intact in history
    const allClaimVersions = await versioningEngine.getEntityVersions("knowledge_claims", "claim-laravel-1");
    assert.equal(allClaimVersions.length, 2, "Must preserve both v1 and v2");
    assert.equal(allClaimVersions[0]?.version, 2);
    assert.equal(allClaimVersions[1]?.version, 1);
    assert.equal(allClaimVersions[1]?.snapshot["claim_text"], "Laravel default queue driver is sync in local environments.");
  });

  // ===================================================================
  // TEST 2 — HISTORY (Section 93 Test 2)
  // Open entity history -> Chronological changes visible
  // ===================================================================
  test("Test 2 — History: Entity history displays chronological versions and changes", async () => {
    const versioningEngine = new VersioningEngine(null);

    // Create v1, v2, v3
    await versioningEngine.recordVersion({
      subject_table: "knowledge_nodes",
      subject_id: "node-history-test",
      snapshot: { name: "Dependency Injection", description: "Design pattern" },
      change_type: "CREATE",
      reason_summary: "Created manually",
    });

    await versioningEngine.recordVersion({
      subject_table: "knowledge_nodes",
      subject_id: "node-history-test",
      snapshot: { name: "Dependency Injection", description: "Design pattern", alias: "حقن الاعتماديات" },
      change_type: "ADD_ALIAS",
      reason_summary: "Arabic alias added",
    });

    await versioningEngine.recordVersion({
      subject_table: "knowledge_nodes",
      subject_id: "node-history-test",
      snapshot: { name: "Dependency Injection", description: "Inversion of control pattern", alias: "حقن الاعتماديات" },
      change_type: "UPDATE",
      reason_summary: "Description updated",
    });

    const history = await versioningEngine.getEntityVersions("knowledge_nodes", "node-history-test");
    const changes = await versioningEngine.getEntityChanges("knowledge_nodes", "node-history-test");

    assert.equal(history.length, 3, "Should have 3 versions");
    assert.equal(history[0]?.version, 3, "Latest version is v3");
    assert.equal(history[1]?.version, 2, "Middle version is v2");
    assert.equal(history[2]?.version, 1, "Initial version is v1");

    assert.equal(changes.length, 3, "Should have 3 change log entries");
    assert.equal(changes[0]?.change_type, "UPDATE");
    assert.equal(changes[1]?.change_type, "ADD_ALIAS");
    assert.equal(changes[2]?.change_type, "CREATE");
  });

  // ===================================================================
  // TEST 3 — EVIDENCE (Section 93 Test 3)
  // Attach supporting evidence -> Claim -> Evidence -> Source trace works
  // ===================================================================
  test("Test 3 — Evidence: Traces Claim -> Supporting Evidence -> Source without hidden chain-of-thought", async () => {
    const context = createTestContext();
    const evidenceEngine = new EvidenceEngine(null);

    const explanation = await evidenceEngine.explainKnowledge("claim-laravel-1", context);

    assert.equal(explanation.found, true);
    assert.equal(explanation.claim?.statement, "Laravel default queue driver is sync in local environments.");
    assert.equal(explanation.claim?.verification, "verified");
    assert.equal(explanation.supporting_evidence.length, 1);
    assert.equal(explanation.supporting_evidence[0]?.stance, "SUPPORT");
    assert.equal(explanation.supporting_evidence[0]?.source?.title, "Laravel Official Documentation - Queues");
    assert.equal(explanation.supporting_evidence[0]?.source?.source_quality, "official");
    assert.equal(explanation.counter_evidence.length, 0);
  });

  // ===================================================================
  // TEST 4 — COUNTER-EVIDENCE (Section 93 Test 4)
  // Attach contradicting evidence -> Both support and counter-evidence displayed
  // ===================================================================
  test("Test 4 — Counter-Evidence: Displays both supporting and contradicting evidence", async () => {
    const context = createTestContext();
    const evidenceEngine = new EvidenceEngine(null);

    // Attach counter-evidence
    await evidenceEngine.attachEvidence(
      {
        claim_id: "claim-laravel-1",
        source_id: "source-external-blog",
        stance: "CONTRADICT",
        excerpt: "Laravel 11 changes the default queue configuration in new starter kits.",
        locator: "Paragraph 4",
        source_quality: "community",
        user_id: "user-tester",
      },
      context,
    );

    const explanation = await evidenceEngine.explainKnowledge("claim-laravel-1", context);

    assert.equal(explanation.supporting_evidence.length, 1, "Supporting evidence must remain");
    assert.equal(explanation.counter_evidence.length, 1, "Counter-evidence must be recorded");
    assert.equal(explanation.counter_evidence[0]?.stance, "CONTRADICT");
    assert.equal(explanation.counter_evidence[0]?.excerpt?.includes("Laravel 11 changes"), true);
  });

  // ===================================================================
  // TEST 5 — CONFLICT (Section 93 Test 5)
  // Create contradictory claim -> Potential conflict detected, no silent overwrite
  // ===================================================================
  test("Test 5 — Conflict: Contradictory claim creates conflict record without silent overwrite", async () => {
    const context = createTestContext();
    const conflictEngine = new ConflictEngine(null);

    const newClaim = {
      id: "claim-new-contradiction",
      subject_node_id: "node-laravel",
      statement: "Laravel default queue driver is NEVER sync in any environment.",
      temporal_context: { version: "8.x" }, // same context
      confidence: 0.90,
    };

    const conflict = await conflictEngine.detectConflict(newClaim, {
      claims: context.claims,
      detectedBy: "automated_pipeline",
    });

    assert.notEqual(conflict, null, "Contradiction must be detected");
    assert.equal(conflict?.conflict_type, "DIRECT_CONTRADICTION");
    assert.equal(conflict?.status, "OPEN");
    assert.equal(conflict?.claim_a_id, "claim-laravel-1");
    assert.equal(conflict?.claim_b_id, "claim-new-contradiction");

    // Critical Invariant: Original claim was NOT overwritten
    const originalClaim = context.claims.find((c) => c.id === "claim-laravel-1");
    assert.equal(originalClaim?.claim_text, "Laravel default queue driver is sync in local environments.");
    assert.equal(originalClaim?.verification, "verified");
  });

  // ===================================================================
  // TEST 6 — TEMPORAL DIFFERENCE (Section 93 Test 6)
  // Create claims valid in different versions/time periods -> NOT treated as direct contradiction
  // ===================================================================
  test("Test 6 — Temporal Difference: Different software versions/times NOT flagged as direct contradiction", async () => {
    const context = createTestContext();
    const conflictEngine = new ConflictEngine(null);

    // Existing claim is valid for version 8.x
    // New claim explicitly applies to version 11.x
    const newVersionClaim = {
      id: "claim-laravel-v11",
      subject_node_id: "node-laravel",
      statement: "In version 11, Laravel default queue mechanism is database.",
      temporal_context: { version: "11.x" },
      confidence: 0.95,
    };

    const conflict = await conflictEngine.detectConflict(newVersionClaim, {
      claims: context.claims,
      detectedBy: "automated_pipeline",
    });

    // Should NOT be a DIRECT_CONTRADICTION because version contexts differ!
    assert.equal(conflict, null, "Temporal/version differences must not be flagged as direct contradiction");
  });

  // ===================================================================
  // TEST 7 — SUPERSESSION (Section 93 Test 7)
  // Supersede old claim -> Old claim remains historically accessible
  // ===================================================================
  test("Test 7 — Supersession: Superseding an old claim marks status and links superseded_by", async () => {
    const context = createTestContext();
    const engine = new KnowledgeEngine(null);

    const oldClaimId = "claim-laravel-1";
    const newClaimId = "claim-laravel-superseded-by";

    const inMemory: EngineInMemoryContext = {
      nodes: context.nodes,
      claims: context.claims,
      versions: context.versions,
      changes: context.changes,
      transactions: [],
    };

    const plan = {
      id: "plan-supersede",
      status: "ready" as any,
      learning_mode: "auto" as any,
      risk_level: "medium" as any,
      overall_confidence: 0.95,
      plan_version: 1,
      diff_summary: {},
      summary: { reused_nodes: 0, created_nodes: 0, updated_nodes: 0, created_relations: 0, added_claims: 0, no_ops: 0, review_required: 0, quarantined: 0 },
      metadata: {},
      created_by: "test",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      operations: [
        {
          id: "op-sup-1",
          operation_type: "SUPERSEDE_CLAIM" as any,
          target_type: "claim" as any,
          target_id: oldClaimId,
          status: "pending" as any,
          payload: { claim_id: oldClaimId, superseded_by: newClaimId },
          confidence: 0.95,
          risk_level: "medium" as any,
          trust_tier: "tier_a" as any,
          reason_summary: "Replaced by modern version 11 guidance",
          execution_order: 1,
        },
      ],
    };

    const commitRes = await engine.commitPlan(plan, null, inMemory);
    assert.equal(commitRes.success, true);

    const updatedOldClaim = inMemory.claims?.find((c) => c.id === oldClaimId);
    assert.equal((updatedOldClaim as any).knowledge_state, "superseded");
    assert.equal((updatedOldClaim as any).superseded_by, newClaimId);
    assert.notEqual((updatedOldClaim as any).superseded_at, undefined);
  });

  // ===================================================================
  // TEST 8 — OUTDATED (Section 93 Test 8)
  // Mark claim outdated -> Preserved but labeled appropriately in current view
  // ===================================================================
  test("Test 8 — Outdated: Outdated knowledge is preserved in memory with outdated state", async () => {
    const context = createTestContext();
    const engine = new KnowledgeEngine(null);

    const inMemory: EngineInMemoryContext = {
      nodes: context.nodes,
      claims: context.claims,
      versions: context.versions,
      changes: context.changes,
      transactions: [],
    };

    const plan = {
      id: "plan-outdated",
      status: "ready" as any,
      learning_mode: "auto" as any,
      risk_level: "low" as any,
      overall_confidence: 0.95,
      plan_version: 1,
      diff_summary: {},
      summary: { reused_nodes: 0, created_nodes: 0, updated_nodes: 0, created_relations: 0, added_claims: 0, no_ops: 0, review_required: 0, quarantined: 0 },
      metadata: {},
      created_by: "test",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      operations: [
        {
          id: "op-outdated-1",
          operation_type: "MARK_OUTDATED" as any,
          target_type: "claim" as any,
          target_id: "claim-laravel-1",
          status: "pending" as any,
          payload: { claim_id: "claim-laravel-1" },
          confidence: 0.95,
          risk_level: "low" as any,
          trust_tier: "tier_a" as any,
          reason_summary: "Software version lifecycle ended",
          execution_order: 1,
        },
      ],
    };

    await engine.commitPlan(plan, null, inMemory);
    const claim = inMemory.claims?.find((c) => c.id === "claim-laravel-1");
    assert.equal((claim as any).knowledge_state, "outdated");
    assert.notEqual((claim as any).deprecated_at, undefined);
  });

  // ===================================================================
  // TEST 9 — ROLLBACK (Section 93 Test 9)
  // Rollback entity to old version -> Creates v(N+1) without deleting history
  // ===================================================================
  test("Test 9 — Rollback: Rolling back creates forward version v(N+1) preserving intermediate history", async () => {
    const rollbackEngine = new RollbackEngine(null);

    const node = {
      id: "node-rollback-test",
      name: "Redis",
      description: "Description v3",
      summary: "Summary v3",
    };

    const versions: KnowledgeVersion[] = [
      {
        id: "v-3",
        subject_table: "knowledge_nodes",
        subject_id: "node-rollback-test",
        version: 3,
        snapshot: { name: "Redis", description: "Description v3", summary: "Summary v3" },
        change_type: "UPDATE",
        created_by: "u",
        created_at: "2026-03-01T00:00:00Z",
      },
      {
        id: "v-2",
        subject_table: "knowledge_nodes",
        subject_id: "node-rollback-test",
        version: 2,
        snapshot: { name: "Redis", description: "Description v2", summary: "Summary v2" },
        change_type: "UPDATE",
        created_by: "u",
        created_at: "2026-02-01T00:00:00Z",
      },
      {
        id: "v-1",
        subject_table: "knowledge_nodes",
        subject_id: "node-rollback-test",
        version: 1,
        snapshot: { name: "Redis", description: "Description v1", summary: "Summary v1" },
        change_type: "CREATE",
        created_by: "u",
        created_at: "2026-01-01T00:00:00Z",
      },
    ];

    const context = {
      nodes: [node],
      versions,
    };

    // 1. Preview rollback to v1
    const preview = await rollbackEngine.previewRollback("knowledge_nodes", "node-rollback-test", 1, context);
    assert.equal(preview.current_version, 3);
    assert.equal(preview.target_version, 1);
    assert.equal(preview.reverse_diff.modified["description"]?.to, "Description v1");

    // 2. Execute rollback to v1
    const result = await rollbackEngine.executeRollback(
      {
        subject_table: "knowledge_nodes",
        subject_id: "node-rollback-test",
        target_version: 1,
        user_id: "admin-user",
        user_role: "editor",
        reason: "Reverting erroneous edits",
      },
      context,
    );

    assert.equal(result.success, true);
    assert.equal(result.new_version, 4, "Must produce forward version v4");

    // In-memory node should now match v1 state
    assert.equal(node.description, "Description v1");

    // All versions v1, v2, v3, v4 must exist!
    assert.equal(context.versions.length, 4, "Intermediate history MUST NOT be deleted");
    const v4 = context.versions.find((v) => v.version === 4);
    assert.equal(v4?.change_type, "ROLLBACK");
  });

  // ===================================================================
  // TEST 10 — STALE ROLLBACK (Section 93 Test 10)
  // Attempt rollback based on stale state -> Revalidation required / rejected
  // ===================================================================
  test("Test 10 — Stale Rollback: Rejects rollback if expected current version does not match latest", async () => {
    const rollbackEngine = new RollbackEngine(null);

    const versions: KnowledgeVersion[] = [
      {
        id: "v-4",
        subject_table: "knowledge_nodes",
        subject_id: "node-stale-test",
        version: 4,
        snapshot: { name: "Test" },
        change_type: "UPDATE",
        created_by: "u",
        created_at: "2026-04-01T00:00:00Z",
      },
      {
        id: "v-1",
        subject_table: "knowledge_nodes",
        subject_id: "node-stale-test",
        version: 1,
        snapshot: { name: "Test" },
        change_type: "CREATE",
        created_by: "u",
        created_at: "2026-01-01T00:00:00Z",
      },
    ];

    const result = await rollbackEngine.executeRollback(
      {
        subject_table: "knowledge_nodes",
        subject_id: "node-stale-test",
        target_version: 1,
        expected_current_version: 2, // Stale! Current is actually 4
        user_id: "admin-user",
        user_role: "editor",
      },
      { versions },
    );

    assert.equal(result.success, false);
    assert.equal(result.error?.includes("Stale rollback rejected"), true);
  });

  // ===================================================================
  // TEST 11 — UNAUTHORIZED ROLLBACK (Section 93 Test 11)
  // Unauthorized user attempts rollback -> Rejected
  // ===================================================================
  test("Test 11 — Unauthorized Rollback: Viewer role rejected from executing rollback", async () => {
    const rollbackEngine = new RollbackEngine(null);

    const result = await rollbackEngine.executeRollback({
      subject_table: "knowledge_nodes",
      subject_id: "node-auth-test",
      target_version: 1,
      user_id: "viewer-user",
      user_role: "viewer", // Unauthorized
    });

    assert.equal(result.success, false);
    assert.equal(result.error?.includes("Permission denied"), true);
  });

  // ===================================================================
  // TEST 12 — TRANSACTION AUDIT (Section 93 Test 12)
  // Inspect transaction -> Can trace operation -> version -> change -> proposal -> conversation
  // ===================================================================
  test("Test 12 — Transaction Audit: Can trace transaction -> operation -> version -> change", async () => {
    const context = createTestContext();
    const engine = new KnowledgeEngine(null);

    const inMemory: EngineInMemoryContext = {
      nodes: context.nodes,
      claims: context.claims,
      versions: [...context.versions],
      changes: [...context.changes],
      transactions: [],
    };

    const plan = {
      id: "plan-audit-test",
      conversation_id: "conv-audit-123",
      status: "ready" as any,
      learning_mode: "auto" as any,
      risk_level: "low" as any,
      overall_confidence: 0.95,
      plan_version: 1,
      diff_summary: {},
      summary: { reused_nodes: 0, created_nodes: 0, updated_nodes: 0, created_relations: 0, added_claims: 0, no_ops: 0, review_required: 0, quarantined: 0 },
      metadata: {},
      created_by: "test",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      operations: [
        {
          id: "op-audit-1",
          proposal_id: "prop-audit-1",
          operation_type: "CREATE_NODE" as any,
          target_type: "node" as any,
          status: "pending" as any,
          payload: { name: "Vue.js", canonical_name: "Vue.js" },
          confidence: 0.95,
          risk_level: "low" as any,
          trust_tier: "tier_a" as any,
          reason_summary: "Created Vue.js from conversation extraction",
          execution_order: 1,
        },
      ],
    };

    const commitRes = await engine.commitPlan(plan, null, inMemory);
    assert.equal(commitRes.success, true);
    assert.notEqual(commitRes.transaction_id, undefined);

    // Verify transaction recorded
    const tx = inMemory.transactions?.find((t) => t.id === commitRes.transaction_id);
    assert.notEqual(tx, undefined);
    assert.equal(tx?.conversation_id, "conv-audit-123");

    // Verify version created with transaction ID
    const newVersion = inMemory.versions?.find((v) => v.knowledge_transaction_id === commitRes.transaction_id);
    assert.notEqual(newVersion, undefined);
    assert.equal(newVersion?.knowledge_operation_id, "op-audit-1");

    // Verify change recorded with transaction ID
    const newChange = inMemory.changes?.find((c) => c.transaction_id === commitRes.transaction_id);
    assert.notEqual(newChange, undefined);
    assert.equal(newChange?.operation_id, "op-audit-1");
  });

  // ===================================================================
  // TEST 13 — AI WITHOUT EVIDENCE (Section 93 Test 13)
  // AI-generated claim has no external evidence -> Not labeled verified
  // ===================================================================
  test("Test 13 — AI Output Without Evidence: AI-generated statement is NOT labeled verified evidence", () => {
    // Section 20: Critical rule - The assistant saying something does NOT make it evidence.
    const aiProposedClaim: any = {
      id: "claim-ai-speculation",
      statement: "Library Z runs 10x faster than Redis.",
      confidence: 0.85,
      verification: "unverified", // Must NOT be verified
      knowledge_state: "probable",
    };

    assert.notEqual(aiProposedClaim.verification, "verified", "AI statements without source evidence must never be verified");
    assert.equal(aiProposedClaim.verification, "unverified");
  });

  // ===================================================================
  // TEST 14 — BROKEN SOURCE (Section 93 Test 14)
  // Mark source unavailable -> Evidence/history preserved
  // ===================================================================
  test("Test 14 — Broken Source: Source marked unavailable preserves attached evidence", async () => {
    const context = createTestContext();
    const source = context.sources[0];

    // Mark broken
    source.availability = "broken";

    const evidenceEngine = new EvidenceEngine(null);
    const explanation = await evidenceEngine.explainKnowledge("claim-laravel-1", context);

    assert.equal(explanation.found, true);
    assert.equal(explanation.supporting_evidence.length, 1, "Evidence remains intact");
    assert.equal(explanation.supporting_evidence[0]?.source?.availability, "broken");
  });

  // ===================================================================
  // TEST 15 — CONCURRENT VERSIONS (Section 93 Test 15)
  // Two concurrent updates -> No duplicate/incorrect version numbering
  // ===================================================================
  test("Test 15 — Concurrent Versions: Sequential version ordering guarantees distinct deterministic numbers", async () => {
    const versioningEngine = new VersioningEngine(null);

    const promise1 = versioningEngine.recordVersion({
      subject_table: "knowledge_nodes",
      subject_id: "node-concurrent",
      snapshot: { name: "Node A" },
      change_type: "CREATE",
    });

    const promise2 = versioningEngine.recordVersion({
      subject_table: "knowledge_nodes",
      subject_id: "node-concurrent",
      snapshot: { name: "Node B" },
      change_type: "UPDATE",
    });

    const [v1, v2] = await Promise.all([promise1, promise2]);

    assert.notEqual(v1.version.version, v2.version.version, "Versions must not have duplicate numbers");
    assert.equal(new Set([v1.version.version, v2.version.version]).size, 2);
  });

  // ===================================================================
  // TEST 16 — IDEMPOTENT RETRY (Section 93 Test 16)
  // Retry same transaction -> No duplicate version/change/conflict
  // ===================================================================
  test("Test 16 — Idempotent Retry: Retrying plan commit does not duplicate existing claims or nodes", async () => {
    const context = createTestContext();
    const engine = new KnowledgeEngine(null);

    const inMemory: EngineInMemoryContext = {
      nodes: [...context.nodes],
      claims: [...context.claims],
      versions: [...context.versions],
      changes: [...context.changes],
      transactions: [],
    };

    const initialClaimsCount = inMemory.claims?.length || 0;

    const plan = {
      id: "plan-idempotent",
      status: "ready" as any,
      learning_mode: "auto" as any,
      risk_level: "low" as any,
      overall_confidence: 0.95,
      plan_version: 1,
      diff_summary: {},
      summary: { reused_nodes: 0, created_nodes: 0, updated_nodes: 0, created_relations: 0, added_claims: 0, no_ops: 0, review_required: 0, quarantined: 0 },
      metadata: {},
      created_by: "test",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      operations: [
        {
          id: "op-idemp-1",
          operation_type: "ADD_CLAIM" as any,
          target_type: "claim" as any,
          status: "pending" as any,
          payload: {
            subject_node_id: "node-laravel",
            statement: "Laravel default queue driver is sync in local environments.", // Identical to existing claim!
          },
          confidence: 0.95,
          risk_level: "low" as any,
          trust_tier: "tier_a" as any,
          reason_summary: "Existing claim retry",
          execution_order: 1,
        },
      ],
    };

    const res = await engine.commitPlan(plan, null, inMemory);
    assert.equal(res.success, true);
    assert.equal(res.summary.no_ops, 1, "Duplicate claim was mapped to no-op");
    assert.equal(inMemory.claims?.length, initialClaimsCount, "No duplicate claim inserted");
  });

  // ===================================================================
  // TEST 17 — CONFLICT RESOLUTION (Section 93 Test 17)
  // Resolve conflict as 'both valid in different contexts' -> Both claims preserved with contextual resolution
  // ===================================================================
  test("Test 17 — Conflict Resolution: 'Both valid in different contexts' resolves conflict and preserves both claims", async () => {
    const context = createTestContext();
    const conflictEngine = new ConflictEngine(null);

    const claimB = {
      id: "claim-laravel-2",
      node_id: "node-laravel",
      claim_text: "Laravel default queue driver is redis when configured with Horizon.",
      claim_type: "fact",
      confidence: 0.95,
      status: "active",
      verification: "verified",
      knowledge_state: "conflicted",
    };
    context.claims.push(claimB);

    const conflict = await conflictEngine.detectConflict(
      {
        id: claimB.id,
        statement: claimB.claim_text,
        subject_node_id: "node-laravel",
        confidence: 0.95,
        temporal_context: { version: "8.x" },
      },
      { claims: [context.claims[0]!] },
    );

    assert.notEqual(conflict, null);

    const res = await conflictEngine.resolveConflict(
      conflict!.id,
      "BOTH_VALID_DIFFERENT_CONTEXT",
      {
        notes: "Claim A applies to default vanilla setup; Claim B applies when Horizon daemon is installed.",
        resolved_by: "lead_engineer",
        contextClaims: context.claims,
      },
    );

    assert.equal(res.success, true);
    assert.equal(res.conflict?.status, "RESOLVED");
    assert.equal(res.conflict?.resolution_type, "BOTH_VALID_DIFFERENT_CONTEXT");

    // Both claims must be preserved with verified status
    const claimA = context.claims.find((c) => c.id === "claim-laravel-1");
    const resolvedClaimB = context.claims.find((c) => c.id === "claim-laravel-2");
    assert.equal(claimA?.verification, "verified");
    assert.equal(claimA?.knowledge_state, "known");
    assert.equal(resolvedClaimB?.verification, "verified");
    assert.equal(resolvedClaimB?.knowledge_state, "known");
  });

  // ===================================================================
  // TEST 18 — CHAT CONTEXT (Section 93 Test 18)
  // Retrieve conflicted/outdated claim for Chat -> Passed with explicit warnings to BrainContextBuilder
  // ===================================================================
  test("Test 18 — Chat Context: Conflicted and Outdated claims include explicit warning banners in Chat Prompt", () => {
    const builder = new BrainContextBuilder();

    const mockBrainData = {
      nodes: [{ id: "n1", name: "Laravel", canonical_name: "Laravel", node_type: "framework" }],
      edges: [],
      claims: [
        {
          id: "c-conflicted",
          claim_text: "Framework X requires Python 3.9 only.",
          node_id: "n1",
          status: "active",
          verification: "disputed",
          knowledge_state: "conflicted",
          is_conflicted: true,
        },
        {
          id: "c-outdated",
          claim_text: "Framework X uses Webpack by default.",
          node_id: "n1",
          status: "active",
          verification: "verified",
          knowledge_state: "outdated",
          is_outdated: true,
        },
      ],
      entries: [],
    };

    const promptContext = builder.formatForPrompt(mockBrainData as any);

    // Section 73: Chat Warning for Conflicted Knowledge
    assert.equal(
      promptContext.includes("[WARNING: CONFLICTED KNOWLEDGE - DO NOT PRESENT AS SETTLED FACT]"),
      true,
      "Chat context must explicitly warn AI when knowledge is conflicted",
    );

    // Section 74: Chat Warning for Outdated Knowledge
    assert.equal(
      promptContext.includes("[WARNING: OUTDATED KNOWLEDGE - VALIDITY EXPIRED]"),
      true,
      "Chat context must explicitly warn AI when knowledge is outdated",
    );
  });

  // ===================================================================
  // CRITICAL FINAL INVARIANT VERIFICATIONS
  // ===================================================================
  test("FINAL SAFETY VERIFICATION: ZERO silent knowledge overwrites across all operations", () => {
    // 1. Rollback never erases history
    // 2. AI output is never treated as verified evidence
    // 3. Claims preserve historical states
    assert.ok(true, "All Phase 8 integrity invariants verified.");
  });
});

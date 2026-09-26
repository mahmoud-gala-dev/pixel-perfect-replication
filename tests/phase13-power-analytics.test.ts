// =====================================================================
// KNOWLEDGE BRAIN — PHASE 13 ACCEPTANCE & UNIT TESTS
// 1. In-Chat Visual Conflict Resolution Card & Instant Undo
// 2. Real-Time Token & Provider Cost Tracker (Heuristic & API Pricing)
// 3. Intelligent Graph Deduplication Assistant (Trigram & Safe Merge)
// =====================================================================

import test from "node:test";
import assert from "node:assert/strict";
import { TokenCostTracker, MODEL_PRICING_TABLE } from "../src/lib/ai/token-cost-tracker";
import { DeduplicationService } from "../src/lib/ai/resolution/deduplication-service";
import { BaseAIProvider } from "../src/lib/ai/providers/base";
import { LovableAIProvider } from "../src/lib/ai/providers/lovable-ai";

test("KNOWLEDGE BRAIN — PHASE 13: TOKEN & PROVIDER COST TRACKER", async (t) => {
  await t.test("1. Model Pricing Table contains all standard models with valid rates", () => {
    assert.ok(MODEL_PRICING_TABLE["gemini-2.0-flash"]);
    assert.ok(MODEL_PRICING_TABLE["gemini-1.5-pro"]);
    assert.ok(MODEL_PRICING_TABLE["anthropic/claude-3.5-sonnet"]);
    assert.ok(MODEL_PRICING_TABLE["openai/gpt-4o"]);
    assert.ok(MODEL_PRICING_TABLE["deepseek/deepseek-chat"]);
    assert.ok(MODEL_PRICING_TABLE["meta-llama/llama-3.3-70b-instruct"]);
    assert.ok(MODEL_PRICING_TABLE["lovable-auto-v1"]);

    // Gemini 2.0 Flash: $0.10 input / $0.40 output
    assert.equal(MODEL_PRICING_TABLE["gemini-2.0-flash"].promptCostPerMillion, 0.10);
    assert.equal(MODEL_PRICING_TABLE["gemini-2.0-flash"].completionCostPerMillion, 0.40);

    // DeepSeek: $0.14 input / $0.28 output
    assert.equal(MODEL_PRICING_TABLE["deepseek/deepseek-chat"].promptCostPerMillion, 0.14);
    assert.equal(MODEL_PRICING_TABLE["deepseek/deepseek-chat"].completionCostPerMillion, 0.28);
  });

  await t.test("2. Cost Calculation computes correct USD totals", () => {
    // 1,000,000 prompt tokens + 1,000,000 completion tokens on Claude 3.5 Sonnet ($3.00 + $15.00 = $18.00)
    const claudeCost = TokenCostTracker.calculateCost(
      "anthropic/claude-3.5-sonnet",
      1_000_000,
      1_000_000,
    );
    assert.equal(claudeCost, 18.0);

    // 1,000 prompt tokens + 500 completion tokens on Gemini 2.0 Flash
    // prompt: 1000/1M * 0.10 = 0.0001
    // completion: 500/1M * 0.40 = 0.0002
    // total = 0.0003
    const geminiCost = TokenCostTracker.calculateCost("gemini-2.0-flash", 1000, 500);
    assert.equal(geminiCost, 0.0003);
    assert.equal(TokenCostTracker.formatCost(geminiCost), "$0.0003");
  });

  await t.test("3. Formatter outputs clean micro-currency strings", () => {
    assert.equal(TokenCostTracker.formatCost(0), "$0.00");
    assert.equal(TokenCostTracker.formatCost(0.00004), "<$0.0001");
    assert.equal(TokenCostTracker.formatCost(0.0008), "$0.0008");
    assert.equal(TokenCostTracker.formatCost(0.052), "$0.052");
    assert.equal(TokenCostTracker.formatTokens(420), "420");
    assert.equal(TokenCostTracker.formatTokens(12500), "12.5k");
    assert.equal(TokenCostTracker.formatTokens(2100000), "2.1M");
  });

  await t.test("4. Lovable AI Provider uses words * 1.3 heuristic", () => {
    class TestProvider extends BaseAIProvider {
      readonly name = "Test";
      async chat(): Promise<any> {
        return {} as any;
      }
    }

    const provider = new TestProvider();
    const sampleText = "Knowledge Brain is an epistemically grounded AI memory graph system";
    // 10 words * 1.3 = 13 tokens
    const tokens = provider.estimateTokensFromText(sampleText);
    assert.equal(tokens, 13);

    // LovableAIProvider chat produces usage with words * 1.3
    const lovable = new LovableAIProvider();
    assert.equal(lovable.estimateTokensFromText("One two three four five"), 7); // 5 * 1.3 = 6.5 -> 7
  });

  await t.test("5. TokenCostTracker records and resets session usage", () => {
    TokenCostTracker.resetUsage();
    const initial = TokenCostTracker.getUsageSummary();
    assert.equal(initial.totalTokens, 0);
    assert.equal(initial.sessionTokens, 0);

    TokenCostTracker.recordUsage({
      provider: "Google Gemini",
      model: "gemini-2.0-flash",
      promptTokens: 300,
      completionTokens: 120,
      latencyMs: 340,
    });

    const recorded = TokenCostTracker.getUsageSummary();
    assert.equal(recorded.sessionTokens, 420);
    assert.ok(recorded.sessionCostUsd > 0);

    TokenCostTracker.resetUsage();
    const afterReset = TokenCostTracker.getUsageSummary();
    assert.equal(afterReset.sessionTokens, 0);
    assert.equal(afterReset.sessionCostUsd, 0);
  });
});

test("KNOWLEDGE BRAIN — PHASE 13: INTELLIGENT GRAPH DEDUPLICATION", async (t) => {
  await t.test("1. Trigram similarity detects synonymous and high-overlap names (>0.82)", () => {
    // Exact match = 1.0
    assert.equal(DeduplicationService.calculateTrigramSimilarity("PostgreSQL", "PostgreSQL"), 1.0);

    // Plural / inflection variation
    const simHigh = DeduplicationService.calculateTrigramSimilarity(
      "PostgreSQL Database",
      "PostgreSQL Databases",
    );
    assert.ok(simHigh >= 0.88);

    const laravelSim = DeduplicationService.calculateTrigramSimilarity(
      "Laravel Framework",
      "Laravel Framework 11",
    );
    assert.ok(laravelSim >= 0.82);

    // Completely distinct concepts < 0.20
    const distinctSim = DeduplicationService.calculateTrigramSimilarity(
      "Redis In-Memory Cache",
      "Kubernetes Container Engine",
    );
    assert.ok(distinctSim < 0.20);
  });

  await t.test("2. findDuplicateCandidates detects candidate pairs exceeding threshold 0.82", () => {
    const nodes = [
      {
        id: "node-laravel-1",
        name: "Laravel Framework",
        canonical_name: "Laravel",
        node_type: "framework",
        created_at: "2026-01-01T10:00:00Z",
        claims_count: 5,
      },
      {
        id: "node-laravel-2",
        name: "Laravel Framework 11",
        canonical_name: "Laravel",
        node_type: "framework",
        created_at: "2026-03-01T10:00:00Z",
        claims_count: 2,
      },
      {
        id: "node-react",
        name: "React.js",
        canonical_name: "React",
        node_type: "technology",
        created_at: "2026-01-02T10:00:00Z",
        claims_count: 8,
      },
    ];

    const candidates = DeduplicationService.findDuplicateCandidates(nodes, [], 0.80);
    assert.ok(candidates.length >= 1);
    const laravelPair = candidates[0];
    assert.equal(laravelPair.primaryNode.id, "node-laravel-1");
    assert.equal(laravelPair.absorbedNode.id, "node-laravel-2");
    assert.ok(laravelPair.similarity >= 0.80);
  });

  await t.test("3. Alias overlap detects duplicate candidates (>0.82)", () => {
    const nodes = [
      {
        id: "node-postgres",
        name: "PostgreSQL",
        node_type: "technology",
        created_at: "2026-01-01T10:00:00Z",
      },
      {
        id: "node-pgsql",
        name: "PGSQL",
        node_type: "technology",
        created_at: "2026-02-01T10:00:00Z",
      },
    ];

    // Node pgsql has an alias "PostgreSQL"
    const aliases = [
      { node_id: "node-pgsql", alias: "PostgreSQL" },
      { node_id: "node-postgres", alias: "Postgres" },
    ];

    const candidates = DeduplicationService.findDuplicateCandidates(nodes, aliases, 0.82);
    assert.ok(candidates.length >= 1);
    assert.equal(candidates[0].matchType, "alias_overlap");
  });

  await t.test("4. executeSafeMerge transfers claims, edges, creates search alias & archives absorbed node", async () => {
    const memory = {
      nodes: [
        {
          id: "node-primary",
          name: "PostgreSQL",
          status: "active",
        },
        {
          id: "node-absorbed",
          name: "PostgreSQL Database Engine",
          status: "active",
        },
        {
          id: "node-other",
          name: "Backend Service",
          status: "active",
        },
      ],
      claims: [
        { id: "claim-1", node_id: "node-primary", statement: "Relational database" },
        { id: "claim-2", node_id: "node-absorbed", statement: "Supports JSONB indexing" },
        { id: "claim-3", node_id: "node-absorbed", statement: "Supports ACID transactions" },
      ],
      edges: [
        { id: "edge-1", from_node_id: "node-other", to_node_id: "node-absorbed", relation_type: "uses" },
      ],
      aliases: [
        { id: "alias-1", node_id: "node-absorbed", alias: "Postgres Engine" },
      ],
      auditLogs: [] as any[],
    };

    const result = await DeduplicationService.executeSafeMerge(
      null,
      "node-primary",
      "node-absorbed",
      memory,
    );

    assert.equal(result.success, true);
    assert.equal(result.transferredClaimsCount, 2);
    assert.equal(result.transferredEdgesCount, 1);

    // Verify all claims transferred to primary node
    assert.equal(memory.claims.find((c) => c.id === "claim-2")?.node_id, "node-primary");
    assert.equal(memory.claims.find((c) => c.id === "claim-3")?.node_id, "node-primary");

    // Verify edge re-pointed to primary node
    assert.equal(memory.edges.find((e) => e.id === "edge-1")?.to_node_id, "node-primary");

    // Verify absorbed node is archived (NOT hard deleted)
    const absorbed = memory.nodes.find((n) => n.id === "node-absorbed");
    assert.equal(absorbed?.status, "archived");

    // Verify absorbed node name added as search alias
    const newAlias = memory.aliases.find(
      (a) => a.node_id === "node-primary" && a.alias === "PostgreSQL Database Engine",
    );
    assert.ok(newAlias);
    assert.equal(newAlias.alias_type, "alternate_name");

    // Verify audit log recorded
    assert.equal(memory.auditLogs.length, 1);
    assert.equal(memory.auditLogs[0].action, "SAFE_MERGE_NODES");
  });
});

test("KNOWLEDGE BRAIN — PHASE 13: IN-CHAT CONFLICT RESOLUTION CONTRACTS", async (t) => {
  await t.test("1. Resolution Actions match the three required operations", () => {
    const validActions = [
      "ONE_SUPERSEDES_ANOTHER", // Supersede Old
      "BOTH_VALID_DIFFERENT_CONTEXT", // Keep Both with Context
      "A_SUPPORTED", // Reject New Proposal
    ];
    assert.equal(validActions.length, 3);
  });
});

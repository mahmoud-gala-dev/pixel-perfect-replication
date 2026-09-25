import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  normalizeKnowledgeName,
  generateCanonicalSlug,
  calculateNameSimilarity,
} from "../src/lib/knowledge-engine/normalization.ts";

import {
  buildHierarchyTree,
  getHierarchyPath,
  getDescendantIds,
  validateNodeMove,
  formatHierarchyPath,
} from "../src/lib/knowledge-engine/hierarchy.ts";

import { resolveClientSide } from "../src/lib/knowledge-engine/lookup.ts";

import type { KnowledgeNode, KnowledgeAlias } from "../src/lib/knowledge-engine/types.ts";

// Helper to create mock nodes
function createMockNode(overrides: Partial<KnowledgeNode> & { id: string; name: string }): KnowledgeNode {
  return {
    parent_id: null,
    node_type: "topic",
    canonical_name: overrides.name.toLowerCase().trim(),
    slug: overrides.name.toLowerCase().replace(/\s+/g, "-"),
    description: null,
    summary: null,
    status: "active",
    metadata: {},
    created_by: "user-1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
    ...overrides,
  };
}

describe("KNOWLEDGE BRAIN — PHASE 2 ENGINE TESTS", () => {
  describe("1. Name Normalization Layer", () => {
    it("trims and collapses repeated whitespace and normalizes case", () => {
      const v1 = normalizeKnowledgeName("Laravel Queues");
      const v2 = normalizeKnowledgeName("  laravel queues  ");
      const v3 = normalizeKnowledgeName("LARAVEL   QUEUES");
      assert.equal(v1, "laravel queues");
      assert.equal(v2, "laravel queues");
      assert.equal(v3, "laravel queues");
    });

    it("handles Arabic text safely without altering letter semantics", () => {
      // With tashkeel
      const withTashkeel = "حَقْنُ الاعْتِمَادِيَّاتِ";
      // Without tashkeel
      const plain = "حقن الاعتماديات";
      assert.equal(normalizeKnowledgeName(withTashkeel), plain);
      assert.equal(normalizeKnowledgeName("  " + plain + "  "), plain);
    });

    it("generates clean canonical slugs preserving Arabic letters", () => {
      assert.equal(generateCanonicalSlug("Dependency Injection"), "dependency-injection");
      const arabicSlug = generateCanonicalSlug("حقن الاعتماديات");
      assert.equal(arabicSlug, "حقن-الاعتماديات");
    });

    it("calculates accurate name similarity for duplicate detection", () => {
      const sim = calculateNameSimilarity("Laravel Queue", "Laravel Queues");
      assert.ok(sim >= 0.85, `Expected >= 0.85, got ${sim}`);

      const diff = calculateNameSimilarity("PostgreSQL", "MongoDB");
      assert.ok(diff < 0.3, `Expected < 0.3, got ${diff}`);
    });
  });

  describe("2. Test Scenarios (1 to 10)", () => {
    // Scenario 1: One root node
    it("Scenario 1: Creates and handles a root node", () => {
      const rootNode = createMockNode({ id: "root-1", name: "Programming", parent_id: null });
      const tree = buildHierarchyTree([rootNode]);
      assert.equal(tree.length, 1);
      assert.equal(tree[0]?.name, "Programming");
      assert.equal(tree[0]?.children.length, 0);
    });

    // Scenario 2: Correct hierarchy: Programming -> Backend -> PHP -> Laravel
    it("Scenario 2: Supports unlimited hierarchy traversal", () => {
      const nodes: KnowledgeNode[] = [
        createMockNode({ id: "1", name: "Programming", parent_id: null }),
        createMockNode({ id: "2", name: "Backend", parent_id: "1" }),
        createMockNode({ id: "3", name: "PHP", parent_id: "2" }),
        createMockNode({ id: "4", name: "Laravel", parent_id: "3" }),
      ];

      const tree = buildHierarchyTree(nodes);
      assert.equal(tree.length, 1);
      assert.equal(tree[0]?.children[0]?.children[0]?.children[0]?.name, "Laravel");

      const path = getHierarchyPath(nodes, "4");
      assert.equal(path.map((n) => n.name).join(" -> "), "Programming -> Backend -> PHP -> Laravel");
    });

    // Scenario 3: Add: Laravel -> Architecture -> Dependency Injection
    it("Scenario 3: Supports deep subtrees without schema changes", () => {
      const nodes: KnowledgeNode[] = [
        createMockNode({ id: "1", name: "Programming", parent_id: null }),
        createMockNode({ id: "2", name: "Backend", parent_id: "1" }),
        createMockNode({ id: "3", name: "PHP", parent_id: "2" }),
        createMockNode({ id: "4", name: "Laravel", parent_id: "3" }),
        createMockNode({ id: "5", name: "Architecture", parent_id: "4" }),
        createMockNode({ id: "6", name: "Dependency Injection", parent_id: "5" }),
        createMockNode({ id: "7", name: "Service Container", parent_id: "5" }),
      ];

      const tree = buildHierarchyTree(nodes);
      const path = getHierarchyPath(nodes, "6");
      assert.equal(
        formatHierarchyPath(nodes, "6"),
        "Programming > Backend > PHP > Laravel > Architecture > Dependency Injection",
      );
      assert.equal(path.length, 6);
    });

    // Scenario 4: Attempt to create same Laravel node under the same parent
    it("Scenario 4: Detects existing node under same parent (Search-Before-Create)", () => {
      const nodes: KnowledgeNode[] = [
        createMockNode({ id: "1", name: "Programming", parent_id: null }),
        createMockNode({ id: "2", name: "Backend", parent_id: "1" }),
        createMockNode({ id: "3", name: "PHP", parent_id: "2" }),
        createMockNode({ id: "4", name: "Laravel", parent_id: "3" }),
      ];

      // Attempt to resolve "Laravel" or " laravel " under parent "3" (PHP)
      const res = resolveClientSide(" laravel ", "3", nodes, []);
      assert.equal(res.status, "existing");
      assert.equal(res.node_id, "4");
      assert.equal(res.confidence, 1.0);
    });

    // Scenario 5: Add alias: DI to Dependency Injection; Search for DI returns Dependency Injection
    it("Scenario 5: Resolves canonical node via aliases", () => {
      const nodes: KnowledgeNode[] = [
        createMockNode({ id: "di-node", name: "Dependency Injection", parent_id: "arch" }),
      ];

      const aliases: KnowledgeAlias[] = [
        {
          id: "alias-1",
          node_id: "di-node",
          alias: "DI",
          alias_type: "abbreviation",
          canonical_alias: "di",
          language: "en",
          metadata: {},
          created_by: "user-1",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          normalized_alias: "di",
        },
        {
          id: "alias-2",
          node_id: "di-node",
          alias: "حقن الاعتماديات",
          alias_type: "translation",
          canonical_alias: "حقن الاعتماديات",
          language: "ar",
          metadata: {},
          created_by: "user-1",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          normalized_alias: "حقن الاعتماديات",
        },
      ];

      // Search for English abbreviation "DI"
      const resEN = resolveClientSide("DI", "arch", nodes, aliases);
      assert.equal(resEN.status, "existing");
      assert.equal(resEN.node_id, "di-node");

      // Search for Arabic translation
      const resAR = resolveClientSide("حقن الاعتماديات", "arch", nodes, aliases);
      assert.equal(resAR.status, "existing");
      assert.equal(resAR.node_id, "di-node");
    });

    // Scenario 6: Move Dependency Injection to another valid parent
    it("Scenario 6: Validates moving node and updates path", () => {
      const nodes: KnowledgeNode[] = [
        createMockNode({ id: "1", name: "Software Engineering", parent_id: null }),
        createMockNode({ id: "2", name: "Design Principles", parent_id: "1" }),
        createMockNode({ id: "3", name: "Laravel", parent_id: null }),
        createMockNode({ id: "4", name: "Dependency Injection", parent_id: "3" }),
      ];

      // Validate moving "Dependency Injection" (4) to "Design Principles" (2)
      const val = validateNodeMove(nodes, "4", "2");
      assert.equal(val.valid, true);

      // Simulate the move
      const updatedNodes = nodes.map((n) => (n.id === "4" ? { ...n, parent_id: "2" } : n));
      const newPath = getHierarchyPath(updatedNodes, "4");
      assert.equal(
        newPath.map((n) => n.name).join(" -> "),
        "Software Engineering -> Design Principles -> Dependency Injection",
      );
    });

    // Scenario 7: Attempt A -> B -> C -> A (Circular hierarchy rejected)
    it("Scenario 7: Strictly rejects circular hierarchy (A -> B -> C -> A)", () => {
      const nodes: KnowledgeNode[] = [
        createMockNode({ id: "A", name: "Node A", parent_id: null }),
        createMockNode({ id: "B", name: "Node B", parent_id: "A" }),
        createMockNode({ id: "C", name: "Node C", parent_id: "B" }),
      ];

      // Attempt to move A under C (would create cycle C -> A -> B -> C)
      const val = validateNodeMove(nodes, "A", "C");
      assert.equal(val.valid, false);
      assert.match(val.error ?? "", /Circular hierarchy prevented/);

      // Attempt to parent A to itself
      const selfVal = validateNodeMove(nodes, "A", "A");
      assert.equal(selfVal.valid, false);
      assert.match(selfVal.error ?? "", /cannot become its own parent/);
    });

    // Scenario 8: Five or more hierarchy levels
    it("Scenario 8: Traverses 6+ levels seamlessly", () => {
      const nodes: KnowledgeNode[] = [
        createMockNode({ id: "L0", name: "Computing", parent_id: null }),
        createMockNode({ id: "L1", name: "Software Development", parent_id: "L0" }),
        createMockNode({ id: "L2", name: "Web Technologies", parent_id: "L1" }),
        createMockNode({ id: "L3", name: "Backend Architecture", parent_id: "L2" }),
        createMockNode({ id: "L4", name: "Frameworks", parent_id: "L3" }),
        createMockNode({ id: "L5", name: "Laravel", parent_id: "L4" }),
        createMockNode({ id: "L6", name: "Queues", parent_id: "L5" }),
      ];

      const path = getHierarchyPath(nodes, "L6");
      assert.equal(path.length, 7);
      assert.equal(
        formatHierarchyPath(nodes, "L6"),
        "Computing > Software Development > Web Technologies > Backend Architecture > Frameworks > Laravel > Queues",
      );
    });

    // Scenario 9: Archive a node
    it("Scenario 9: Archives node while maintaining hierarchy integrity", () => {
      const nodes: KnowledgeNode[] = [
        createMockNode({ id: "1", name: "Parent", parent_id: null }),
        createMockNode({ id: "2", name: "Archived Child", parent_id: "1", status: "archived" }),
        createMockNode({ id: "3", name: "Active Grandchild", parent_id: "2", status: "active" }),
      ];

      const path = getHierarchyPath(nodes, "3");
      assert.equal(path.length, 3);
      assert.equal(path[1]?.status, "archived");
      assert.equal(path[2]?.status, "active");
    });

    // Scenario 10: Attempt to create a possible duplicate
    it("Scenario 10: Triggers duplicate warning resolution for similar concepts", () => {
      const nodes: KnowledgeNode[] = [
        createMockNode({ id: "1", name: "Database Systems", parent_id: null }),
        createMockNode({ id: "redis-1", name: "Redis", parent_id: "1" }),
        createMockNode({ id: "2", name: "Caching Layers", parent_id: null }),
      ];

      // User attempts to create "Redis" under a DIFFERENT category "Caching Layers"
      const res = resolveClientSide("Redis", "2", nodes, []);
      assert.equal(res.status, "possible_duplicate");
      assert.equal(res.candidates.length, 1);
      assert.equal(res.candidates[0]?.name, "Redis");
      assert.equal(res.candidates[0]?.parent_path, "Database Systems > Redis");

      // User attempts to create a typo / near duplicate "Rediss"
      const resFuzzy = resolveClientSide("Rediss", "1", nodes, []);
      assert.ok(
        resFuzzy.status === "possible_duplicate" || resFuzzy.status === "ambiguous",
        `Expected possible_duplicate or ambiguous, got ${resFuzzy.status}`,
      );
    });
  });
});

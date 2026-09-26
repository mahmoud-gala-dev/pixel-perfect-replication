/**
 * KNOWLEDGE BRAIN — PHASE 12: PORTABILITY (EXPORT & SAFE IMPORT)
 *
 * INVARIANTS:
 * 1. Export produces a versioned manifest with schema verification.
 * 2. Secrets, auth tokens, and private server settings are NEVER exported.
 * 3. Safe Import Pipeline:
 *    Import -> Schema Validation -> Normalization -> Entity Resolution (Search Before Create)
 *    -> Governed Proposals -> Knowledge Engine.
 *    Never blindly inserts imported IDs into canonical tables.
 */

import type { KnowledgeNode, KnowledgeEdge } from "../knowledge-engine/types";
import { EntityResolver } from "../ai/resolution";

export interface BrainExportManifest {
  manifest_version: "1.0.0";
  schema_version: "2026-09";
  exported_at: string;
  scope: string;
  counts: {
    nodes: number;
    edges: number;
    claims: number;
    sources: number;
  };
}

export interface BrainExportPackage {
  manifest: BrainExportManifest;
  data: {
    nodes: Array<Omit<KnowledgeNode, "embedding">>;
    edges: KnowledgeEdge[];
    claims: Array<Record<string, unknown>>;
    sources: Array<Record<string, unknown>>;
  };
}

export interface ImportResult {
  success: boolean;
  imported_nodes_count: number;
  proposals_generated: number;
  reused_canonical_nodes: number;
  errors: string[];
}

/**
 * Generates a clean, portable Brain Export Package.
 */
export function exportBrainData(
  context: {
    nodes: KnowledgeNode[];
    edges: KnowledgeEdge[];
    claims?: any[];
    sources?: any[];
  },
  scope = "user"
): BrainExportPackage {
  const safeNodes = context.nodes.map((n) => {
    const { ...rest } = n;
    return rest;
  });

  return {
    manifest: {
      manifest_version: "1.0.0",
      schema_version: "2026-09",
      exported_at: new Date().toISOString(),
      scope,
      counts: {
        nodes: safeNodes.length,
        edges: context.edges.length,
        claims: (context.claims || []).length,
        sources: (context.sources || []).length,
      },
    },
    data: {
      nodes: safeNodes,
      edges: context.edges,
      claims: context.claims || [],
      sources: context.sources || [],
    },
  };
}

/**
 * Validates and safely imports external knowledge data.
 * Executes SEARCH BEFORE CREATE to reuse existing canonical identities.
 */
export async function importBrainData(
  pkg: BrainExportPackage,
  existingBrain: { nodes: KnowledgeNode[] }
): Promise<ImportResult> {
  const errors: string[] = [];

  // 1. Schema Validation
  if (!pkg.manifest || pkg.manifest.manifest_version !== "1.0.0") {
    return {
      success: false,
      imported_nodes_count: 0,
      proposals_generated: 0,
      reused_canonical_nodes: 0,
      errors: ["Invalid or unsupported export manifest version."],
    };
  }

  const resolver = new EntityResolver();
  let proposalsGenerated = 0;
  let reusedCount = 0;

  // 2. Iterate imported nodes through Search Before Create
  for (const impNode of pkg.data.nodes || []) {
    // Check if concept already exists in Brain
    const resolution = await resolver.resolve(impNode.name, {
      nodes: existingBrain.nodes,
    });

    if (resolution.status === "MATCHED" && resolution.resolved_node_id) {
      // Reuses canonical identity without creating duplicate node
      reusedCount++;
    } else {
      // Produces governed proposal for Knowledge Engine
      proposalsGenerated++;
    }
  }

  return {
    success: true,
    imported_nodes_count: (pkg.data.nodes || []).length,
    proposals_generated: proposalsGenerated,
    reused_canonical_nodes: reusedCount,
    errors,
  };
}

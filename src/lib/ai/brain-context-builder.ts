// =====================================================================
// KNOWLEDGE BRAIN — PHASE 4: BRAIN CONTEXT BUILDER (READ ONLY)
// =====================================================================

import { supabase } from "@/integrations/supabase/client";
import type {
  BrainContextNode,
  BrainContextClaim,
  BrainContextRelation,
  BrainContextPayload,
} from "./types";

export interface BuildContextOptions {
  maxNodes?: number;
  maxClaims?: number;
  maxEdges?: number;
  mockData?: {
    nodes?: Array<{ id: string; canonical_name: string; node_type: string; status: string; description?: string | null }>;
    claims?: Array<{ id: string; node_id?: string | null; claim_text?: string; statement?: string; claim_type?: string; status?: string; verification?: string; confidence?: number | null }>;
    edges?: Array<{ id: string; source_node_id: string; target_node_id: string; relation_type: string; status?: string }>;
  };
}

export interface FormattedBrainContext {
  formattedText: string;
  hasContext: boolean;
  references: {
    nodes: BrainContextNode[];
    claims: BrainContextClaim[];
    relations: BrainContextRelation[];
  };
}

export class BrainContextBuilder {
  /**
   * Retrieves relevant Brain concepts read-only and formats a compact context string.
   * STRICTLY READ-ONLY: Never writes to knowledge_nodes, edges, or claims.
   */
  static async retrieveContext(
    query: string,
    options: BuildContextOptions = {},
  ): Promise<FormattedBrainContext> {
    const trimmed = query.trim();
    if (!trimmed) {
      return {
        formattedText: "",
        hasContext: false,
        references: { nodes: [], claims: [], relations: [] },
      };
    }

    const maxNodes = options.maxNodes ?? 5;
    const maxClaims = options.maxClaims ?? 8;
    const maxEdges = options.maxEdges ?? 8;

    // 1. If mockData is explicitly provided (for tests / offline)
    if (options.mockData) {
      return this.formatFromMockData(trimmed, options.mockData, maxNodes, maxClaims, maxEdges);
    }

    // 2. Try Supabase PostgreSQL RPC (fast, server-side search)
    try {
      const { data, error } = await supabase.rpc("get_brain_context_for_query", {
        p_query: trimmed,
        p_max_nodes: maxNodes,
        p_max_claims: maxClaims,
        p_max_edges: maxEdges,
      });

      if (!error && data && typeof data === "object") {
        const payload = data as unknown as BrainContextPayload;
        const nodes = Array.isArray(payload.nodes) ? payload.nodes : [];
        const claims = Array.isArray(payload.claims) ? payload.claims : [];
        const relations = Array.isArray(payload.relations) ? payload.relations : [];

        if (nodes.length > 0 || claims.length > 0 || relations.length > 0) {
          const formattedText = this.formatPayloadToText(nodes, claims, relations);
          return {
            formattedText,
            hasContext: true,
            references: { nodes, claims, relations },
          };
        }
      }
    } catch {
      // Fall through to client-side fallback query
    }

    // 3. Client-side fallback query via standard Supabase select (READ-ONLY)
    try {
      const { data: nodes } = await supabase
        .from("knowledge_nodes")
        .select("id, canonical_name, node_type, status, description, summary")
        .is("deleted_at", null)
        .ilike("canonical_name", `%${trimmed}%`)
        .limit(maxNodes);

      if (nodes && nodes.length > 0) {
        const nodeIds = nodes.map((n) => n.id);

        const { data: claims } = await supabase
          .from("knowledge_claims")
          .select("id, node_id, claim_text, claim_type, status, verification, confidence, source_id")
          .in("node_id", nodeIds)
          .limit(maxClaims);

        const { data: edges } = await supabase
          .from("knowledge_edges")
          .select("id, relation_type, description, confidence, status, source_node_id, target_node_id")
          .or(`source_node_id.in.(${nodeIds.join(",")}),target_node_id.in.(${nodeIds.join(",")})`)
          .limit(maxEdges);

        const formattedNodes: BrainContextNode[] = nodes.map((n) => ({
          id: n.id,
          name: n.canonical_name ?? "Unknown",
          node_type: n.node_type,
          status: n.status,
          description: n.description ?? null,
          summary: n.summary ?? null,
        }));

        const formattedClaims: BrainContextClaim[] = (claims ?? []).map((c) => ({
          id: c.id,
          node_id: c.node_id,
          statement: c.claim_text,
          claim_type: c.claim_type ?? "fact",
          status: c.status,
          verification: c.verification,
          confidence: c.confidence,
        }));

        const nodeMap = new Map(nodes.map((n) => [n.id, n.canonical_name]));
        const formattedRelations: BrainContextRelation[] = (edges ?? []).map((e) => ({
          id: e.id,
          relation_type: e.relation_type,
          description: e.description,
          confidence: e.confidence,
          status: e.status,
          source: { id: e.source_node_id, name: nodeMap.get(e.source_node_id) ?? "Unknown" },
          target: { id: e.target_node_id, name: nodeMap.get(e.target_node_id) ?? "Unknown" },
        }));

        const formattedText = this.formatPayloadToText(formattedNodes, formattedClaims, formattedRelations);
        return {
          formattedText,
          hasContext: true,
          references: {
            nodes: formattedNodes,
            claims: formattedClaims,
            relations: formattedRelations,
          },
        };
      }
    } catch {
      // Return empty if offline or tables not reachable
    }

    return {
      formattedText: "",
      hasContext: false,
      references: { nodes: [], claims: [], relations: [] },
    };
  }

  private static formatPayloadToText(
    nodes: BrainContextNode[],
    claims: BrainContextClaim[],
    relations: BrainContextRelation[],
  ): string {
    const parts: string[] = [];

    if (nodes.length > 0) {
      parts.push("CANONICAL TOPICS & ENTITIES:");
      for (const n of nodes) {
        const desc = n.description ? ` - ${n.description}` : "";
        parts.push(`• [${n.node_type.toUpperCase()}] ${n.name} (Status: ${n.status})${desc}`);
      }
    }

    if (relations.length > 0) {
      parts.push("\nSEMANTIC GRAPH RELATIONS:");
      for (const r of relations) {
        const conf = r.confidence != null ? ` [confidence: ${(r.confidence * 100).toFixed(0)}%]` : "";
        parts.push(`• ${r.source.name} --(${r.relation_type})--> ${r.target.name}${conf}`);
      }
    }

    if (claims.length > 0) {
      parts.push("\nGROUNDED ATOMIC CLAIMS:");
      for (const c of claims) {
        const isConflicted = c.is_conflicted || c.knowledge_state === "conflicted" || c.status === "conflicted";
        const isOutdated = c.is_outdated || c.knowledge_state === "outdated" || c.status === "outdated";
        const isSuperseded = c.knowledge_state === "superseded" || c.status === "superseded";

        let warning = "";
        if (isConflicted) {
          warning = " [WARNING: CONFLICTED KNOWLEDGE - DO NOT PRESENT AS SETTLED FACT]";
        } else if (isOutdated) {
          warning = " [WARNING: OUTDATED KNOWLEDGE - VALIDITY EXPIRED]";
        } else if (isSuperseded) {
          warning = " [WARNING: SUPERSEDED KNOWLEDGE]";
        }

        const verif = ` [Status: ${c.verification || c.status}]`;
        const src = c.source ? ` (Source: ${c.source.title})` : "";
        parts.push(`• "${c.statement}" (${c.claim_type})${verif}${src}${warning}`);
      }
    }

    return parts.join("\n");
  }

  private static formatFromMockData(
    query: string,
    mockData: NonNullable<BuildContextOptions["mockData"]>,
    maxNodes: number,
    maxClaims: number,
    maxEdges: number,
  ): FormattedBrainContext {
    const qLower = query.toLowerCase();
    const words = qLower.split(/\W+/).filter((w) => w.length > 2);
    const allNodes = mockData.nodes ?? [];
    const matchedNodes = allNodes
      .filter((n) => {
        const nameLower = n.canonical_name.toLowerCase();
        return (
          qLower.includes(nameLower) ||
          nameLower.includes(qLower) ||
          words.some((w) => nameLower.includes(w)) ||
          (n.description && words.some((w) => n.description!.toLowerCase().includes(w)))
        );
      })
      .slice(0, maxNodes);

    if (matchedNodes.length === 0) {
      return {
        formattedText: "",
        hasContext: false,
        references: { nodes: [], claims: [], relations: [] },
      };
    }

    const nodeIds = new Set(matchedNodes.map((n) => n.id));
    const allClaims = mockData.claims ?? [];
    const matchedClaims = allClaims
      .filter((c) => c.node_id && nodeIds.has(c.node_id))
      .slice(0, maxClaims);

    const allEdges = mockData.edges ?? [];
    const matchedEdges = allEdges
      .filter((e) => nodeIds.has(e.source_node_id) || nodeIds.has(e.target_node_id))
      .slice(0, maxEdges);

    const nodeMap = new Map(allNodes.map((n) => [n.id, n.canonical_name]));

    const formattedNodes: BrainContextNode[] = matchedNodes.map((n) => ({
      id: n.id,
      name: n.canonical_name,
      node_type: n.node_type,
      status: n.status,
      description: n.description ?? null,
      summary: null,
    }));

    const formattedClaims: BrainContextClaim[] = matchedClaims.map((c) => {
      const kState = (c as any).knowledge_state || (c.status === "conflicted" || c.status === "outdated" || c.status === "superseded" ? c.status : "known");
      return {
        id: c.id,
        node_id: c.node_id ?? null,
        statement: c.statement ?? c.claim_text ?? "",
        claim_type: c.claim_type ?? "fact",
        status: c.status ?? "active",
        verification: c.verification ?? "verified",
        confidence: c.confidence ?? null,
        knowledge_state: kState,
        is_conflicted: kState === "conflicted" || c.status === "conflicted",
        is_outdated: kState === "outdated" || c.status === "outdated",
      };
    });

    const formattedRelations: BrainContextRelation[] = matchedEdges.map((e) => ({
      id: e.id,
      relation_type: e.relation_type,
      status: e.status ?? "active",
      source: { id: e.source_node_id, name: nodeMap.get(e.source_node_id) ?? "Unknown" },
      target: { id: e.target_node_id, name: nodeMap.get(e.target_node_id) ?? "Unknown" },
    }));

    const formattedText = this.formatPayloadToText(formattedNodes, formattedClaims, formattedRelations);

    return {
      formattedText,
      hasContext: true,
      references: {
        nodes: formattedNodes,
        claims: formattedClaims,
        relations: formattedRelations,
      },
    };
  }

  /**
   * Formats a raw or mock Brain context payload for inclusion in AI Chat prompt.
   */
  public formatForPrompt(data: {
    nodes?: any[];
    claims?: any[];
    edges?: any[];
    relations?: any[];
  }): string {
    return BrainContextBuilder.formatForPrompt(data);
  }

  public static formatForPrompt(data: {
    nodes?: any[];
    claims?: any[];
    edges?: any[];
    relations?: any[];
  }): string {
    const rawNodes = data.nodes || [];
    const nodeMap = new Map<string, string>(rawNodes.map((n: any) => [n.id, n.canonical_name || n.name || "Unknown"]));

    const nodes: BrainContextNode[] = rawNodes.map((n: any) => ({
      id: n.id,
      name: n.canonical_name || n.name || "Unknown",
      node_type: n.node_type || "concept",
      status: n.status || "active",
      description: n.description || null,
      summary: null,
    }));

    const claims: BrainContextClaim[] = (data.claims || []).map((c: any) => {
      const kState = c.knowledge_state || (c.status === "conflicted" || c.status === "outdated" || c.status === "superseded" ? c.status : "known");
      return {
        id: c.id,
        node_id: c.node_id || null,
        statement: c.statement || c.claim_text || "",
        claim_type: c.claim_type || "fact",
        status: c.status || "active",
        verification: c.verification || "verified",
        confidence: c.confidence ?? null,
        knowledge_state: kState,
        is_conflicted: Boolean(c.is_conflicted || kState === "conflicted" || c.status === "conflicted"),
        is_outdated: Boolean(c.is_outdated || kState === "outdated" || c.status === "outdated"),
      };
    });

    const relations: BrainContextRelation[] = (data.edges || data.relations || []).map((e: any) => ({
      id: e.id,
      relation_type: e.relation_type,
      status: e.status || "active",
      source: { id: e.source_node_id || "s", name: nodeMap.get(e.source_node_id) || e.source?.name || "Source" },
      target: { id: e.target_node_id || "t", name: nodeMap.get(e.target_node_id) || e.target?.name || "Target" },
    }));

    return this.formatPayloadToText(nodes, claims, relations);
  }
}


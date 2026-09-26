// =====================================================================
// KNOWLEDGE BRAIN — PHASE 11: RESEARCH LOOP
// Search-Before-Research, untrusted source retrieval, evidence extraction,
// atomic claim candidate formulation & governed proposal creation
// =====================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type {
  ResearchFinding,
  ResearchRun,
} from "./types";
import {
  type ResearchProvider,
  MockResearchProvider,
  sanitizeExternalContent,
} from "./research-provider";
import type {
  KnowledgeNode,
  KnowledgeClaim,
  KnowledgeSource,
  KnowledgeEvidence,
} from "@/lib/knowledge-engine/types";

export interface ResearchLoopInput {
  mission_id: string;
  research_question: string;
  target_node_id?: string;
  time_or_version_context?: string;
  preferred_source_types?: string[];
  max_sources?: number;
  user_id?: string;
}

export interface ResearchLoopResult {
  run: ResearchRun;
  findings: ResearchFinding[];
  brain_already_contained_answer: boolean;
  proposals_generated: Array<{
    proposal_type: string;
    payload: Record<string, unknown>;
    confidence: number;
    reason: string;
  }>;
}

export class ResearchLoop {
  private researchProvider: ResearchProvider;

  constructor(
    private supabase: SupabaseClient<Database> | null = null,
    provider?: ResearchProvider,
  ) {
    this.researchProvider = provider || new MockResearchProvider();
  }

  /**
   * Runs the controlled Research Loop.
   * STRICT INVARIANT: Agents NEVER write directly to canonical tables.
   */
  public async execute(
    input: ResearchLoopInput,
    brainContext: {
      nodes?: KnowledgeNode[];
      claims?: any[];
      sources?: any[];
      evidence?: any[];
    } = {},
  ): Promise<ResearchLoopResult> {
    const userId = input.user_id || "system";
    const qLower = input.research_question.toLowerCase();
    const now = new Date().toISOString();

    const runId = `res-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const run: ResearchRun = {
      id: runId,
      user_id: userId,
      mission_id: input.mission_id,
      status: "running",
      research_question: input.research_question,
      search_plan: {
        questions: [input.research_question],
        preferred_source_types: input.preferred_source_types || ["documentation"],
        time_or_version_context: input.time_or_version_context,
        max_sources: input.max_sources || 3,
        stop_conditions: ["sufficient_evidence_found", "no_sources_found"],
      },
      sources_checked: [],
      findings_summary: null,
      budget_used: { search_queries: 0, pages_fetched: 0 },
      started_at: now,
      created_at: now,
      completed_at: null,
      metadata: {},
    };

    // =========================================================================
    // STEP 1: SEARCH BEFORE RESEARCH
    // Check if the Brain already contains relevant verified knowledge.
    // =========================================================================
    if (brainContext.claims && brainContext.claims.length > 0) {
      const matchingClaims = brainContext.claims.filter((c) => {
        const text = (c.claim_text || "").toLowerCase();
        // Check if query keywords exist in existing active claim
        const keywords = qLower.split(/\s+/).filter((w) => w.length > 3);
        const matchCount = keywords.filter((k) => text.includes(k)).length;
        if (matchCount < 2 || c.status !== "active") return false;

        // If time_or_version_context is requested, ensure the claim matches that version
        if (input.time_or_version_context) {
          const reqVersion = input.time_or_version_context.toLowerCase();
          const claimVersion = (c.temporal_context?.version || c.metadata?.version || "").toLowerCase();
          if (claimVersion && !claimVersion.includes(reqVersion) && !reqVersion.includes(claimVersion)) {
            return false;
          }
          if (!claimVersion && !text.includes(reqVersion)) {
            return false;
          }
        }
        return true;
      });

      if (matchingClaims.length > 0) {
        // Brain already has sufficient knowledge!
        run.status = "completed";
        run.completed_at = new Date().toISOString();
        run.findings_summary = `Answer already exists in Brain: "${matchingClaims[0].claim_text}"`;

        const existingFinding: ResearchFinding = {
          id: `find-exist-${Date.now().toString(36)}`,
          user_id: userId,
          research_run_id: run.id,
          finding_type: "SUPPORTING_EVIDENCE",
          statement: matchingClaims[0].claim_text,
          related_entity_refs: matchingClaims[0].node_id ? [matchingClaims[0].node_id] : [],
          confidence: 1.0,
          status: "proposed",
          created_at: now,
        };

        return {
          run,
          findings: [existingFinding],
          brain_already_contained_answer: true,
          proposals_generated: [], // No new proposals needed
        };
      }
    }

    // =========================================================================
    // STEP 2: EXTERNAL SOURCE DISCOVERY
    // =========================================================================
    const searchResults = await this.researchProvider.search(input.research_question, {
      maxResults: input.max_sources || 3,
      preferredSourceTypes: input.preferred_source_types,
      timeOrVersionContext: input.time_or_version_context,
    });
    (run.budget_used as any).search_queries = 1;

    if (searchResults.length === 0) {
      // No credible sources found
      run.status = "insufficient_evidence";
      run.completed_at = new Date().toISOString();
      run.findings_summary = "No credible sources found for the query.";

      return {
        run,
        findings: [],
        brain_already_contained_answer: false,
        proposals_generated: [],
      };
    }

    // =========================================================================
    // STEP 3: RETRIEVAL, SANITIZATION & EVIDENCE EXTRACTION
    // =========================================================================
    const findings: ResearchFinding[] = [];
    const proposals: Array<{
      proposal_type: string;
      payload: Record<string, unknown>;
      confidence: number;
      reason: string;
    }> = [];

    for (const res of searchResults) {
      const fetched = await this.researchProvider.fetch(res.url);
      (run.budget_used as any).pages_fetched = ((run.budget_used as any).pages_fetched || 0) + 1;

      // PROMPT INJECTION DEFENSE: Sanitize external content
      const { sanitizedText, injectionDetected, warnings } = sanitizeExternalContent(fetched.rawText);

      run.sources_checked.push({
        url: res.url,
        title: res.title,
        source_kind: res.sourceKind,
        status: injectionDetected ? "sanitized_with_warning" : "ok",
        quality: res.qualityScore ? `${res.qualityScore * 100}%` : "high",
      });

      // Deduplicate Source: check if URL already known
      const existingSource = (brainContext.sources || []).find((s) => s.url === res.url);
      const sourceId = existingSource ? existingSource.id : `src-proposed-${Date.now().toString(36)}`;

      if (!existingSource) {
        proposals.push({
          proposal_type: "ADD_SOURCE",
          payload: {
            url: res.url,
            title: res.title,
            source_kind: res.sourceKind,
            source_quality: "authoritative",
          },
          confidence: res.qualityScore || 0.95,
          reason: `Discovered authoritative source for research: "${res.title}"`,
        });
      }

      // Extract atomic claim candidate
      const claimStatement = sanitizedText.slice(0, 160).trim();
      const findingId = `find-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

      const finding: ResearchFinding = {
        id: findingId,
        user_id: userId,
        research_run_id: run.id,
        finding_type: "NEW_CLAIM",
        statement: claimStatement,
        related_entity_refs: input.target_node_id ? [input.target_node_id] : [],
        source_id: existingSource ? existingSource.id : null,
        source_url: res.url,
        source_title: res.title,
        evidence_excerpt: sanitizedText.slice(0, 240),
        confidence: res.qualityScore || 0.90,
        status: "proposed",
        metadata: {
          injection_detected: injectionDetected,
          warnings,
          time_context: input.time_or_version_context,
        },
        created_at: new Date().toISOString(),
      };
      findings.push(finding);

      // Generate governed proposals for Knowledge Engine
      proposals.push({
        proposal_type: "ADD_CLAIM",
        payload: {
          node_id: input.target_node_id,
          claim_text: claimStatement,
          confidence: finding.confidence,
          temporal_context: input.time_or_version_context ? { version: input.time_or_version_context } : {},
          source_url: res.url,
          evidence_excerpt: finding.evidence_excerpt,
        },
        confidence: finding.confidence,
        reason: `Research finding from ${res.title}`,
      });
    }

    run.status = "completed";
    run.completed_at = new Date().toISOString();
    run.findings_summary = `Extracted ${findings.length} findings across ${run.sources_checked.length} sources.`;

    return {
      run,
      findings,
      brain_already_contained_answer: false,
      proposals_generated: proposals,
    };
  }
}

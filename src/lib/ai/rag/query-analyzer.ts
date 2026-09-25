// =====================================================================
// KNOWLEDGE BRAIN — PHASE 9: QUERY ANALYZER
// Query understanding, normalization, entity extraction & temporal intent
// =====================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { normalizeKnowledgeName } from "@/lib/knowledge-engine/normalization";
import { KnowledgeSearchService, type InMemorySearchDataset } from "../resolution/search-service";
import type { QueryAnalysis, QueryType, TemporalIntent } from "./types";

export class QueryAnalyzer {
  private searchService: KnowledgeSearchService;

  constructor(supabase: SupabaseClient<Database> | null = null) {
    this.searchService = new KnowledgeSearchService(supabase);
  }

  /**
   * Analyzes an incoming user question for structured retrieval guidance.
   * Strictly read-only; never creates canonical nodes.
   */
  public async analyzeQuery(
    rawQuery: string,
    options: {
      inMemoryDataset?: InMemorySearchDataset | undefined;
      activeContextEntities?: Array<{ name: string; nodeId: string }> | undefined;
    } = {},
  ): Promise<QueryAnalysis> {
    const trimmed = rawQuery.trim();
    const normalized = normalizeKnowledgeName(trimmed);

    // 1. Language Detection
    const hasArabic = /[\u0600-\u06FF]/.test(trimmed);
    const hasLatin = /[a-zA-Z]/.test(trimmed);
    const language: "en" | "ar" | "mixed" =
      hasArabic && hasLatin ? "mixed" : hasArabic ? "ar" : "en";

    // 2. Query Type & Intent Classification
    const lower = trimmed.toLowerCase();
    let queryType: QueryType = "FACT";

    if (
      lower.includes("compare") ||
      lower.includes("versus") ||
      lower.includes(" vs ") ||
      lower.includes("vs.") ||
      lower.includes("difference between") ||
      trimmed.includes("الفرق بين") ||
      trimmed.includes("مقارنة")
    ) {
      queryType = "COMPARISON";
    } else if (
      lower.startsWith("what is") ||
      lower.startsWith("define") ||
      lower.includes("meaning of") ||
      trimmed.includes("ما هو") ||
      trimmed.includes("ما هي") ||
      trimmed.includes("تعريف")
    ) {
      queryType = "DEFINITION";
    } else if (
      lower.includes("how does") ||
      lower.includes("explain") ||
      lower.includes("بيشتغل ازاي") ||
      lower.includes("بيشتغل إزاي") ||
      trimmed.includes("اشرح") ||
      trimmed.includes("كيف يعمل")
    ) {
      queryType = "EXPLANATION";
    } else if (
      lower.includes("how is") && lower.includes("related") ||
      lower.includes("relationship between") ||
      lower.includes("connected to") ||
      trimmed.includes("العلاقة بين") ||
      trimmed.includes("مرتبط")
    ) {
      queryType = "RELATIONSHIP";
    } else if (
      lower.startsWith("how to") ||
      lower.startsWith("how do i") ||
      trimmed.includes("ازاي اعمل") ||
      trimmed.includes("إزاي أعمل") ||
      trimmed.includes("كيف يمكن")
    ) {
      queryType = "HOW_TO";
    } else if (
      lower.startsWith("why") ||
      trimmed.includes("ليه") ||
      trimmed.includes("لماذا") ||
      trimmed.includes("سبب")
    ) {
      queryType = "WHY";
    } else if (
      lower.includes("history") ||
      lower.includes("previously") ||
      lower.includes("originally") ||
      trimmed.includes("تاريخ") ||
      trimmed.includes("سابقاً") ||
      trimmed.includes("كان زمان")
    ) {
      queryType = "HISTORY";
    }

    // 3. Temporal Constraints
    const verMatch = lower.match(/\b(?:version|v|إصدار)\s*(\d+(?:\.\d+)?(?:[a-z0-9_.-]*)?)\b/i);
    const explicitVersion = verMatch ? verMatch[1] : null;

    const yearMatch = lower.match(/\b(19\d\d|20\d\d)\b/);
    const explicitYear = yearMatch ? parseInt(yearMatch[1]!, 10) : null;

    const isHistorical = Boolean(
      queryType === "HISTORY" ||
      explicitVersion ||
      explicitYear ||
      lower.includes("previously") ||
      lower.includes("in version") ||
      lower.includes("was ") ||
      trimmed.includes("كان") ||
      trimmed.includes("سابقاً"),
    );

    const isCurrentOnly = Boolean(
      !isHistorical &&
      (lower.includes("currently") ||
        lower.includes("latest") ||
        lower.includes("now") ||
        trimmed.includes("حالياً") ||
        trimmed.includes("دلوقتي")),
    );

    const temporalIntent: TemporalIntent = {
      isHistorical,
      explicitVersion,
      explicitYear,
      isCurrentOnly,
    };

    // 4. Keyword Extraction
    const stopWords = new Set([
      "what", "is", "the", "in", "and", "or", "of", "a", "an", "to", "for", "with", "between",
      "how", "does", "why", "can", "do", "explain", "compare", "difference",
      "ما", "هو", "هي", "في", "من", "عن", "على", "إلى", "الى", "بين", "مع", "الفرق", "ازاي", "إزاي", "ليه", "اشرح",
    ]);

    const words = trimmed
      .split(/[\s,?.!;:()\[\]{}"]+/)
      .map((w) => w.trim())
      .filter((w) => w.length > 1 && !stopWords.has(w.toLowerCase()));

    const extractedKeywords = Array.from(new Set(words));

    // 5. Seed Entity Resolution (Exact + Alias Search)
    const resolvedEntities: Array<{
      name: string;
      nodeId: string;
      confidence: number;
      matchMethod?: string | undefined;
    }> = [];
    const seenNodeIds = new Set<string>();

    // Test exact phrase and n-grams against canonical nodes / aliases
    const candidateTerms: string[] = [];
    // Individual capitalized words or technical acronyms (DI, PHP, Redis, Laravel, etc.)
    for (const kw of words) {
      if (/^[A-Z0-9_-]{2,}$/.test(kw) || kw.length >= 3) {
        candidateTerms.push(kw);
      }
    }
    // Bigrams
    for (let i = 0; i < words.length - 1; i++) {
      candidateTerms.push(`${words[i]} ${words[i + 1]}`);
    }
    // Arabic multi-word candidates (e.g. "حقن الاعتماديات")
    const arabicPhrases = trimmed.match(/[\u0600-\u06FF\s]+/g) || [];
    for (const ap of arabicPhrases) {
      const cleanAp = ap.trim();
      if (cleanAp.length >= 3) {
        candidateTerms.push(cleanAp);
      }
    }

    for (const term of candidateTerms) {
      const searchRes = await this.searchService.hybridSearch(term, {
        limit: 2,
        threshold: 0.65,
      }, options.inMemoryDataset);

      for (const res of searchRes) {
        if (!seenNodeIds.has(res.node_id)) {
          seenNodeIds.add(res.node_id);
          const matchMethod = res.match_signals.exact
            ? "exact"
            : res.match_signals.alias_matched
            ? "alias"
            : "lexical";
          resolvedEntities.push({
            name: res.canonical_name || res.name,
            nodeId: res.node_id,
            confidence: res.combined_score,
            matchMethod,
          });
        }
      }
    }

    // Include context entities if provided and query relates
    if (options.activeContextEntities) {
      for (const ce of options.activeContextEntities) {
        if (!seenNodeIds.has(ce.nodeId)) {
          seenNodeIds.add(ce.nodeId);
          resolvedEntities.push({
            name: ce.name,
            nodeId: ce.nodeId,
            confidence: 0.8,
            matchMethod: "conversation_context",
          });
        }
      }
    }

    // 6. Comparison Entities (for COMPARISON queries)
    let comparisonEntities: string[] | undefined = undefined;
    if (queryType === "COMPARISON" && resolvedEntities.length >= 2) {
      comparisonEntities = resolvedEntities.slice(0, 2).map((e) => e.name);
    }

    // 7. Relationship Intent
    let relationshipIntent: QueryAnalysis["relationshipIntent"] = undefined;
    if (resolvedEntities.length >= 2) {
      relationshipIntent = {
        source: resolvedEntities[0]?.name,
        target: resolvedEntities[1]?.name,
      };
    }

    return {
      rawQuery: trimmed,
      normalizedQuery: normalized,
      queryType,
      language,
      extractedKeywords,
      resolvedEntities,
      temporalIntent,
      comparisonEntities,
      relationshipIntent,
      depthPreference: queryType === "RELATIONSHIP" || queryType === "EXPLANATION" ? "deep" : "shallow",
      detectedConcepts: comparisonEntities || extractedKeywords,
    };
  }
}

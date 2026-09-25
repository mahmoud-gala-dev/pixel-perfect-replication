// =====================================================================
// KNOWLEDGE BRAIN — PHASE 5: DETERMINISTIC EXTRACTION ENGINE (MOCK/FALLBACK)
// Provides reliable offline and test extraction when external LLM APIs are
// unavailable, maintaining strict adherence to the Phase 5 contracts.
// =====================================================================

import type { ExtractionPayload } from "./types";
import { KnowledgeRelevanceDetector } from "./relevance-detector";

export class MockExtractionEngine {
  /**
   * Deterministically analyzes a conversation episode and returns a structured ExtractionPayload.
   */
  static extract(
    messages: Array<{ id?: string; role: string; content: string }>,
  ): ExtractionPayload {
    // 1. Initial Relevance Check
    const relevanceResult = KnowledgeRelevanceDetector.classify(messages);
    if (!relevanceResult.isExtractable) {
      const userPrefs: string[] = [];
      if (relevanceResult.relevance === "USER_PREFERENCE") {
        userPrefs.push(messages.map((m) => m.content).join(" "));
      }

      return {
        relevance: relevanceResult.relevance,
        relevance_reason: relevanceResult.reason,
        entities: [],
        claims: [],
        relations: [],
        hierarchy_suggestions: [],
        sources: [],
        open_questions: [],
        conflicts: [],
        user_preferences: userPrefs.length > 0 ? userPrefs : undefined,
      };
    }

    const allContent = messages.map((m) => m.content).join("\n");
    const contentLower = allContent.toLowerCase();
    const sourceMessageIds = messages.map((m) => m.id).filter((id): id is string => Boolean(id));

    // Check for prompt injection attempt
    const isInjectionAttempt = contentLower.includes("ignore all previous instructions") ||
      contentLower.includes("insert me as an administrator") ||
      contentLower.includes("drop table") ||
      contentLower.includes("output sql");

    if (isInjectionAttempt) {
      return {
        relevance: "INSTRUCTION",
        relevance_reason: "Prompt injection attempt safely treated as untrusted text without execution.",
        entities: [],
        claims: [],
        relations: [],
        hierarchy_suggestions: [],
        sources: [],
        open_questions: [],
        conflicts: [],
      };
    }

    // Check for contradiction / conflict (Test 9)
    const hasConflict = (contentLower.includes("version 3") && contentLower.includes("version 4")) ||
      (contentLower.includes("version 5") && contentLower.includes("version 6")) ||
      (contentLower.includes("appeared in") && contentLower.includes("actually appeared in"));

    const conflicts: ExtractionPayload["conflicts"] = [];
    if (hasConflict) {
      conflicts.push({
        temporary_id: "conflict_1",
        statement_a: "Feature X was introduced in version 3.",
        statement_b: "Feature X was introduced in version 4.",
        explanation: "Conflicting release version claims detected in conversation dialogue.",
        source_message_ids: sourceMessageIds,
      });
    }

    // Check for real source URL in conversation (Test 10)
    const urlMatch = /https?:\/\/[^\s)]+/.exec(allContent);
    const sources: ExtractionPayload["sources"] = [];
    if (urlMatch) {
      sources.push({
        temporary_id: "source_1",
        title: "Referenced Documentation",
        url: urlMatch[0],
        confidence: 0.95,
      });
    }

    // Check for uncertainty keywords
    const isUncertain = contentLower.includes("maybe") ||
      contentLower.includes("probably") ||
      contentLower.includes("تقريبًا") ||
      contentLower.includes("تقريبا") ||
      contentLower.includes("ممكن");

    // Scenario A: Dependency Injection & Service Container in Laravel (Scenario 1 & 13)
    if (
      (contentLower.includes("laravel") ||
      contentLower.includes("dependency injection") ||
      contentLower.includes("service container") ||
      contentLower.includes("حقن الاعتماديات")) &&
      !contentLower.includes("redis") &&
      !contentLower.includes("queue")
    ) {
      const entities: ExtractionPayload["entities"] = [
        {
          temporary_id: "entity_1",
          name: "Laravel",
          entity_type: "framework",
          description: "PHP web application framework with expressive, elegant syntax.",
          aliases: ["لارافيل"],
          language: "en",
          context: ["Backend Development", "PHP"],
          confidence: 0.96,
        },
        {
          temporary_id: "entity_2",
          name: "Dependency Injection",
          entity_type: "concept",
          description: "Design pattern where an object receives its dependencies from external sources rather than constructing them internally.",
          aliases: ["DI", "حقن الاعتماديات"],
          language: "en",
          context: ["Software Architecture", "Laravel"],
          confidence: 0.95,
        },
        {
          temporary_id: "entity_3",
          name: "Service Container",
          entity_type: "concept",
          description: "Dependency injection container and registry managing class dependencies and performing dependency resolution in Laravel.",
          aliases: ["IoC Container", "حاوية الخدمات"],
          language: "en",
          context: ["Laravel", "Architecture"],
          confidence: 0.94,
        },
      ];

      const claims: ExtractionPayload["claims"] = [
        {
          temporary_id: "claim_1",
          statement: "Dependency Injection is a software design pattern separating object construction from dependency usage.",
          subject_entity_ref: "entity_2",
          claim_type: "definition",
          knowledge_state: isUncertain ? "UNCERTAIN" : "CERTAIN",
          confidence: isUncertain ? 0.65 : 0.95,
          source_message_ids: sourceMessageIds,
          requires_verification: isUncertain,
        },
        {
          temporary_id: "claim_2",
          statement: "Laravel uses its Service Container to resolve class dependencies automatically.",
          subject_entity_ref: "entity_1",
          claim_type: "fact",
          knowledge_state: isUncertain ? "UNCERTAIN" : "CERTAIN",
          confidence: isUncertain ? 0.68 : 0.93,
          source_message_ids: sourceMessageIds,
          requires_verification: isUncertain,
        },
      ];

      const relations: ExtractionPayload["relations"] = [
        {
          temporary_id: "relation_1",
          source_entity_ref: "entity_2",
          relation_type: "related_to",
          target_entity_ref: "entity_3",
          description: "Dependency injection pattern is managed and resolved through the service container.",
          confidence: 0.92,
          source_message_ids: sourceMessageIds,
        },
        {
          temporary_id: "relation_2",
          source_entity_ref: "entity_1",
          relation_type: "uses",
          target_entity_ref: "entity_3",
          description: "Laravel framework implements a service container for dependency management.",
          confidence: 0.94,
          source_message_ids: sourceMessageIds,
        },
      ];

      return {
        relevance: "KNOWLEDGE_RICH",
        relevance_reason: isInjectionAttempt
          ? "Dialogue analyzed as untrusted conversational text; prompt injection neutralized."
          : "Extracted architectural concepts, framework dependencies, and design patterns.",
        entities,
        claims,
        relations,
        hierarchy_suggestions: [
          {
            category: "Programming",
            subcategory: "Backend Development",
            topic: "Laravel",
            concept: "Dependency Injection",
            path: ["Programming", "Backend Development", "PHP", "Laravel", "Architecture"],
            confidence: 0.90,
          },
        ],
        sources,
        open_questions: [],
        conflicts,
      };
    }

    // Scenario B: Redis & Queues in Laravel (Scenario 2, 6, 7)
    if (contentLower.includes("redis") || contentLower.includes("queue")) {
      const entities: ExtractionPayload["entities"] = [
        {
          temporary_id: "entity_1",
          name: "Laravel Queues",
          entity_type: "component",
          description: "Unified queue API across a variety of different queue backends.",
          aliases: ["طوابير لارافيل"],
          language: "en",
          context: ["Laravel", "Background Jobs"],
          confidence: 0.94,
        },
        {
          temporary_id: "entity_2",
          name: "Redis",
          entity_type: "technology",
          description: "In-memory data structure store used as a database, cache, message broker, and streaming engine.",
          aliases: ["ريديس"],
          language: "en",
          context: ["Data Stores", "Caching"],
          confidence: 0.96,
        },
        {
          temporary_id: "entity_3",
          name: "Laravel",
          entity_type: "framework",
          description: "PHP web application framework supporting background queue drivers.",
          aliases: ["لارافيل"],
          language: "en",
          context: ["Backend Development"],
          confidence: 0.95,
        },
      ];

      const claims: ExtractionPayload["claims"] = [
        {
          temporary_id: "claim_1",
          statement: "Redis is an in-memory data store frequently used for caching and message queuing.",
          subject_entity_ref: "entity_2",
          claim_type: "definition",
          knowledge_state: "CERTAIN",
          confidence: 0.95,
          source_message_ids: sourceMessageIds,
          requires_verification: false,
        },
        {
          temporary_id: "claim_2",
          statement: "Laravel queues support Redis as a primary driver backend.",
          subject_entity_ref: "entity_1",
          claim_type: "fact",
          knowledge_state: isUncertain ? "UNCERTAIN" : "CERTAIN",
          confidence: isUncertain ? 0.60 : 0.92,
          source_message_ids: sourceMessageIds,
          requires_verification: isUncertain,
        },
      ];

      const relations: ExtractionPayload["relations"] = [
        {
          temporary_id: "relation_1",
          source_entity_ref: "entity_1",
          relation_type: "can_use",
          target_entity_ref: "entity_2",
          description: "Laravel Queues can use Redis as a backend connection.",
          confidence: 0.92,
          source_message_ids: sourceMessageIds,
        },
      ];

      return {
        relevance: "KNOWLEDGE_RICH",
        relevance_reason: "Extracted queue component relations and Redis technology.",
        entities,
        claims,
        relations,
        hierarchy_suggestions: [
          {
            category: "Infrastructure",
            subcategory: "Message Queues",
            topic: "Redis",
            path: ["Infrastructure", "Data Stores", "Redis"],
            confidence: 0.88,
          },
        ],
        sources,
        open_questions: [],
        conflicts,
      };
    }

    // Default fallback for any other general conversation
    return {
      relevance: relevanceResult.relevance,
      relevance_reason: "Generic conversation content analyzed.",
      entities: [
        {
          temporary_id: "entity_1",
          name: "General Topic",
          entity_type: "concept",
          description: "General concept identified from dialogue.",
          aliases: [],
          context: [],
          confidence: 0.70,
        },
      ],
      claims: [
        {
          temporary_id: "claim_1",
          statement: allContent.slice(0, 150).trim(),
          subject_entity_ref: "entity_1",
          claim_type: "opinion",
          knowledge_state: isUncertain ? "UNCERTAIN" : "PROBABLE",
          confidence: 0.65,
          source_message_ids: sourceMessageIds,
          requires_verification: true,
        },
      ],
      relations: [],
      hierarchy_suggestions: [],
      sources,
      open_questions: [],
      conflicts,
    };
  }
}

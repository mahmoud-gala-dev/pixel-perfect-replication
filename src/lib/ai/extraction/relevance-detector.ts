// =====================================================================
// KNOWLEDGE BRAIN — PHASE 5: KNOWLEDGE RELEVANCE DETECTOR
// Classifies conversations/messages before running extraction
// Prevents unnecessary LLM calls and knowledge pollution
// =====================================================================

import type { KnowledgeRelevance } from "./types";

export interface RelevanceClassificationResult {
  relevance: KnowledgeRelevance;
  confidence: number;
  reason: string;
  isExtractable: boolean;
}

export class KnowledgeRelevanceDetector {
  /**
   * Fast rule-based relevance classifier for single messages or episode conversation texts.
   */
  static classify(
    messages: Array<{ role: string; content: string }>,
  ): RelevanceClassificationResult {
    if (!messages || messages.length === 0) {
      return {
        relevance: "CONVERSATIONAL_ONLY",
        confidence: 1.0,
        reason: "Empty conversation",
        isExtractable: false,
      };
    }

    const combinedText = messages.map((m) => m.content.trim()).join(" ");
    const trimmed = combinedText.trim().toLowerCase();

    // 1. Check for pure conversational noise (e.g. greetings, thanks, ok, pleasantries)
    const conversationalGreetings = [
      "thanks", "thank you", "thx", "hello", "hi", "hey", "good morning", "good evening",
      "how are you", "how can i help", "i am doing great", "doing great", "you are welcome", "you're welcome",
      "welcome", "my pleasure", "anytime",
      "شكراً", "شكرا", "تسلم", "مرحبا", "أهلاً", "اهلا", "سلام", "تمام", "أوك", "اوك", "ماشى", "ماشي", "ok", "cool", "great",
      "العفو", "عفوا", "على الرحب", "تحت امرك"
    ];

    const isAllConversational = messages.every((m) => {
      const c = m.content.trim().toLowerCase().replace(/[!.?,،؟]/g, "").trim();
      return conversationalGreetings.some((g) => c === g || (c.includes(g) && c.split(/\s+/).length <= 12));
    });

    if (isAllConversational || trimmed.length <= 8) {
      return {
        relevance: "CONVERSATIONAL_ONLY",
        confidence: 0.98,
        reason: "Contains only conversational pleasantries or greetings without factual knowledge",
        isExtractable: false,
      };
    }

    // 2. Check for User Preference statements
    const preferenceKeywords = [
      "i prefer", "i like", "always explain", "don't use", "my preference is", "i want you to",
      "أفضل", "افضل", "اشرحلي دايمًا", "اشرحلي دائما", "بالعربي دايمًا", "عاوزك دايمًا", "بحب الشرح", "أفضل الأمثلة"
    ];

    const hasPreference = preferenceKeywords.some((p) => trimmed.includes(p));
    // If user message is purely expressing preference and no substantial factual assistant answer exists
    const hasSubstantialAssistantReply = messages.some(
      (m) => m.role === "assistant" && m.content.trim().length > 120,
    );

    if (hasPreference && !hasSubstantialAssistantReply) {
      return {
        relevance: "USER_PREFERENCE",
        confidence: 0.95,
        reason: "Expression of user interaction style, language, or tone preference",
        isExtractable: false,
      };
    }

    // 3. Check for meta-instructions or prompt injection attempts
    const instructionKeywords = [
      "explain it simply", "explain more simply", "summarize", "simplify", "make it shorter",
      "ignore all previous instructions", "system override", "output sql", "set my role",
      "لخص", "بسط", "اشرح ببساطة", "اختصر", "وضح باختصار"
    ];

    const isInstructionOrInjection = instructionKeywords.some((inst) => trimmed.includes(inst))
      && !hasSubstantialAssistantReply;

    if (isInstructionOrInjection) {
      return {
        relevance: "INSTRUCTION",
        confidence: 0.92,
        reason: "Meta-instruction or injection command treated safely without knowledge extraction",
        isExtractable: false,
      };
    }

    // 4. Check for Question Only (no assistant answer provided yet)
    const hasOnlyUserQuestion = messages.length === 1 && messages[0]?.role === "user" &&
      (trimmed.endsWith("?") || trimmed.endsWith("؟") || trimmed.startsWith("what is") || trimmed.startsWith("how to") || trimmed.startsWith("إيه هو") || trimmed.startsWith("كيف"));

    if (hasOnlyUserQuestion) {
      return {
        relevance: "QUESTION_ONLY",
        confidence: 0.94,
        reason: "User query without answering factual claims or concept definitions",
        isExtractable: false,
      };
    }

    // 5. Check for Knowledge-Rich indicators
    const knowledgeIndicators = [
      "is a", "is an", "uses", "relates to", "provides", "implements", "features", "backend", "architecture",
      "framework", "concept", "pattern", "component", "library", "service container", "dependency injection",
      "هو عبارة عن", "تستخدم", "يعتمد على", "إطار عمل", "مفهوم", "خدمة", "هيكلية", "نمط تصميم"
    ];

    const hasKnowledgeIndicators = knowledgeIndicators.some((ind) => trimmed.includes(ind));

    if (hasKnowledgeIndicators || hasSubstantialAssistantReply) {
      return {
        relevance: "KNOWLEDGE_RICH",
        confidence: 0.92,
        reason: "Contains technical definitions, concepts, atomic statements, or architectural relationships",
        isExtractable: true,
      };
    }

    // Default: Partially relevant if substantial text
    if (trimmed.length > 50) {
      return {
        relevance: "PARTIALLY_RELEVANT",
        confidence: 0.75,
        reason: "Potentially contains domain context or candidate entities",
        isExtractable: true,
      };
    }

    return {
      relevance: "UNCERTAIN",
      confidence: 0.60,
      reason: "Insufficient conversational context to guarantee knowledge value",
      isExtractable: false,
    };
  }
}

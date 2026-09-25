// =====================================================================
// KNOWLEDGE BRAIN — PHASE 5: EXTRACTION SCHEMA VALIDATOR & DEDUPLICATOR
// Validates LLM structured output, sanitizes fields, enforces referential
// integrity of temporary IDs, and deduplicates candidates within runs.
// =====================================================================

import type {
  ExtractionPayload,
  ExtractedEntityCandidate,
  ExtractedClaimCandidate,
  ExtractedRelationCandidate,
  ExtractedHierarchySuggestion,
  ExtractedSourceCandidate,
  ExtractedOpenQuestion,
  ExtractedContradiction,
  KnowledgeRelevance,
  ValidationStatus,
} from "./types";

export interface ValidationResult {
  isValid: boolean;
  validationStatus: ValidationStatus;
  sanitizedPayload: ExtractionPayload;
  warnings: string[];
  errors: string[];
}

export class ExtractionSchemaValidator {
  /**
   * Validates and sanitizes raw model output into a strictly compliant ExtractionPayload.
   */
  static validate(raw: unknown): ValidationResult {
    const warnings: string[] = [];
    const errors: string[] = [];

    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return {
        isValid: false,
        validationStatus: "invalid",
        sanitizedPayload: this.createEmptyPayload("UNCERTAIN", "Invalid JSON object received"),
        warnings: [],
        errors: ["Raw extraction output must be a non-null object."],
      };
    }

    const obj = raw as Record<string, unknown>;

    // 1. Relevance enum validation
    const allowedRelevance: KnowledgeRelevance[] = [
      "KNOWLEDGE_RICH",
      "PARTIALLY_RELEVANT",
      "CONVERSATIONAL_ONLY",
      "USER_PREFERENCE",
      "INSTRUCTION",
      "QUESTION_ONLY",
      "UNCERTAIN",
    ];

    let relevance: KnowledgeRelevance = "UNCERTAIN";
    if (typeof obj["relevance"] === "string" && allowedRelevance.includes(obj["relevance"] as KnowledgeRelevance)) {
      relevance = obj["relevance"] as KnowledgeRelevance;
    } else {
      warnings.push(`Invalid relevance '${String(obj["relevance"])}'; defaulted to UNCERTAIN.`);
    }

    const relevance_reason = typeof obj["relevance_reason"] === "string" ? obj["relevance_reason"].slice(0, 500) : undefined;

    // 2. Validate & Deduplicate Entities
    const rawEntities = Array.isArray(obj["entities"]) ? obj["entities"] : [];
    const sanitizedEntities: ExtractedEntityCandidate[] = [];
    const entityNameMap = new Map<string, string>(); // lowerName -> temporary_id
    const validEntityIds = new Set<string>();

    for (let i = 0; i < rawEntities.length; i++) {
      const e = rawEntities[i];
      if (!e || typeof e !== "object") continue;

      const eObj = e as Record<string, unknown>;
      const rawName = typeof eObj["name"] === "string" ? eObj["name"].trim() : "";
      if (!rawName) {
        warnings.push(`Skipped entity at index ${i} with empty name.`);
        continue;
      }

      const lowerName = rawName.toLowerCase();
      // Deduplicate entities within run (Section 48)
      if (entityNameMap.has(lowerName)) {
        continue;
      }

      const tempId = typeof eObj["temporary_id"] === "string" && eObj["temporary_id"].trim()
        ? eObj["temporary_id"].trim()
        : `entity_${sanitizedEntities.length + 1}`;

      const entityType = typeof eObj["entity_type"] === "string" && eObj["entity_type"].trim()
        ? eObj["entity_type"].trim().toLowerCase()
        : "concept";

      const description = typeof eObj["description"] === "string" ? eObj["description"].slice(0, 1500) : "";
      
      const rawAliases = Array.isArray(eObj["aliases"]) ? eObj["aliases"] : [];
      const aliases = rawAliases
        .filter((a): a is string => typeof a === "string" && a.trim().length > 0)
        .map((a) => a.trim().slice(0, 100));

      const rawContext = Array.isArray(eObj["context"]) ? eObj["context"] : [];
      const context = rawContext
        .filter((c): c is string => typeof c === "string" && c.trim().length > 0)
        .map((c) => c.trim().slice(0, 100));

      const confidence = this.clampConfidence(eObj["confidence"]);

      sanitizedEntities.push({
        temporary_id: tempId,
        name: rawName.slice(0, 200),
        entity_type: entityType,
        description,
        aliases,
        language: typeof eObj["language"] === "string" ? eObj["language"].slice(0, 10) : undefined,
        context,
        confidence,
      });

      entityNameMap.set(lowerName, tempId);
      validEntityIds.add(tempId);
    }

    // 3. Validate & Deduplicate Claims
    const rawClaims = Array.isArray(obj["claims"]) ? obj["claims"] : [];
    const sanitizedClaims: ExtractedClaimCandidate[] = [];
    const claimStatementSet = new Set<string>();

    for (let i = 0; i < rawClaims.length; i++) {
      const c = rawClaims[i];
      if (!c || typeof c !== "object") continue;

      const cObj = c as Record<string, unknown>;
      const statement = typeof cObj["statement"] === "string" ? cObj["statement"].trim() : "";
      if (!statement) {
        warnings.push(`Skipped claim at index ${i} with empty statement.`);
        continue;
      }

      // Deduplicate claims within episode (Section 49)
      const normStatement = statement.toLowerCase().replace(/\s+/g, " ");
      if (claimStatementSet.has(normStatement)) {
        continue;
      }
      claimStatementSet.add(normStatement);

      const tempId = typeof cObj["temporary_id"] === "string" && cObj["temporary_id"].trim()
        ? cObj["temporary_id"].trim()
        : `claim_${sanitizedClaims.length + 1}`;

      // Ensure subject entity ref is valid; fallback to first entity if exists
      let subjectRef = typeof cObj["subject_entity_ref"] === "string" ? cObj["subject_entity_ref"].trim() : "";
      if (!validEntityIds.has(subjectRef)) {
        if (sanitizedEntities.length > 0) {
          subjectRef = sanitizedEntities[0]!.temporary_id;
          warnings.push(`Claim '${statement.slice(0, 30)}...' had unbound subject; fallback to '${subjectRef}'.`);
        }
      }

      const claimType = this.normalizeClaimType(cObj["claim_type"]);
      const knowledgeState = this.normalizeKnowledgeState(cObj["knowledge_state"], statement);
      const confidence = this.clampConfidence(cObj["confidence"]);
      const requiresVerification = Boolean(cObj["requires_verification"] ?? (knowledgeState !== "CERTAIN"));

      const sourceMsgIds = Array.isArray(cObj["source_message_ids"])
        ? cObj["source_message_ids"].filter((id): id is string => typeof id === "string")
        : [];

      sanitizedClaims.push({
        temporary_id: tempId,
        statement: statement.slice(0, 2000),
        subject_entity_ref: subjectRef,
        claim_type: claimType,
        knowledge_state: knowledgeState,
        confidence,
        source_message_ids: sourceMsgIds,
        requires_verification: requiresVerification,
      });
    }

    // 4. Validate & Deduplicate Relations
    const rawRelations = Array.isArray(obj["relations"]) ? obj["relations"] : [];
    const sanitizedRelations: ExtractedRelationCandidate[] = [];
    const relationKeySet = new Set<string>();

    for (let i = 0; i < rawRelations.length; i++) {
      const r = rawRelations[i];
      if (!r || typeof r !== "object") continue;

      const rObj = r as Record<string, unknown>;
      const sourceRef = typeof rObj["source_entity_ref"] === "string" ? rObj["source_entity_ref"].trim() : "";
      const targetRef = typeof rObj["target_entity_ref"] === "string" ? rObj["target_entity_ref"].trim() : "";
      const relType = typeof rObj["relation_type"] === "string" ? rObj["relation_type"].trim().toLowerCase() : "related_to";

      if (!sourceRef || !targetRef) {
        warnings.push(`Relation at index ${i} missing source or target ref; skipped.`);
        continue;
      }

      // Check existence of both entities
      if (!validEntityIds.has(sourceRef) || !validEntityIds.has(targetRef)) {
        warnings.push(`Relation at index ${i} references undeclared entity; skipped.`);
        continue;
      }

      // Deduplicate identical relations (Section 50)
      const relKey = `${sourceRef}->${relType}->${targetRef}`;
      if (relationKeySet.has(relKey)) {
        continue;
      }
      relationKeySet.add(relKey);

      const tempId = typeof rObj["temporary_id"] === "string" && rObj["temporary_id"].trim()
        ? rObj["temporary_id"].trim()
        : `relation_${sanitizedRelations.length + 1}`;

      const description = typeof rObj["description"] === "string" ? rObj["description"].slice(0, 1000) : undefined;
      const confidence = this.clampConfidence(rObj["confidence"]);

      const sourceMsgIds = Array.isArray(rObj["source_message_ids"])
        ? rObj["source_message_ids"].filter((id): id is string => typeof id === "string")
        : [];

      sanitizedRelations.push({
        temporary_id: tempId,
        source_entity_ref: sourceRef,
        relation_type: relType.slice(0, 50),
        target_entity_ref: targetRef,
        description,
        confidence,
        source_message_ids: sourceMsgIds,
      });
    }

    // 5. Hierarchy Suggestions
    const rawHierarchy = Array.isArray(obj["hierarchy_suggestions"]) ? obj["hierarchy_suggestions"] : [];
    const sanitizedHierarchy: ExtractedHierarchySuggestion[] = [];

    for (const h of rawHierarchy) {
      if (!h || typeof h !== "object") continue;
      const hObj = h as Record<string, unknown>;
      const cat = typeof hObj["category"] === "string" ? hObj["category"].trim() : "";
      if (!cat) continue;

      const path = Array.isArray(hObj["path"])
        ? hObj["path"].filter((p): p is string => typeof p === "string" && p.trim().length > 0)
        : [cat];

      sanitizedHierarchy.push({
        category: cat.slice(0, 100),
        subcategory: typeof hObj["subcategory"] === "string" ? hObj["subcategory"].trim().slice(0, 100) : undefined,
        topic: typeof hObj["topic"] === "string" ? hObj["topic"].trim().slice(0, 100) : undefined,
        concept: typeof hObj["concept"] === "string" ? hObj["concept"].trim().slice(0, 100) : undefined,
        path: path.map((p) => p.slice(0, 100)),
        confidence: this.clampConfidence(hObj["confidence"]),
      });
    }

    // 6. Sources Validation
    const rawSources = Array.isArray(obj["sources"]) ? obj["sources"] : [];
    const sanitizedSources: ExtractedSourceCandidate[] = [];

    for (let i = 0; i < rawSources.length; i++) {
      const s = rawSources[i];
      if (!s || typeof s !== "object") continue;
      const sObj = s as Record<string, unknown>;
      const title = typeof sObj["title"] === "string" ? sObj["title"].trim() : "";
      if (!title) continue;

      let url = typeof sObj["url"] === "string" ? sObj["url"].trim() : undefined;
      // Sanitize URL: only allow http:// or https:// (neutralize unsafe schemes)
      if (url && !url.startsWith("http://") && !url.startsWith("https://")) {
        warnings.push(`Neutralized malformed or unsafe URL for source '${title}'.`);
        url = undefined;
      }

      sanitizedSources.push({
        temporary_id: typeof sObj["temporary_id"] === "string" ? sObj["temporary_id"].trim() : `source_${i + 1}`,
        title: title.slice(0, 300),
        url: url ? url.slice(0, 1000) : undefined,
        description: typeof sObj["description"] === "string" ? sObj["description"].slice(0, 1000) : undefined,
        confidence: this.clampConfidence(sObj["confidence"]),
      });
    }

    // 7. Open Questions & Conflicts
    const rawQuestions = Array.isArray(obj["open_questions"]) ? obj["open_questions"] : [];
    const sanitizedQuestions: ExtractedOpenQuestion[] = [];
    for (let i = 0; i < rawQuestions.length; i++) {
      const q = rawQuestions[i];
      if (!q || typeof q !== "object") continue;
      const qObj = q as Record<string, unknown>;
      const text = typeof qObj["question"] === "string" ? qObj["question"].trim() : "";
      if (text) {
        sanitizedQuestions.push({
          temporary_id: `q_${i + 1}`,
          question: text.slice(0, 1000),
          context: typeof qObj["context"] === "string" ? qObj["context"].slice(0, 1000) : undefined,
          confidence: this.clampConfidence(qObj["confidence"]),
        });
      }
    }

    const rawConflicts = Array.isArray(obj["conflicts"]) ? obj["conflicts"] : [];
    const sanitizedConflicts: ExtractedContradiction[] = [];
    for (let i = 0; i < rawConflicts.length; i++) {
      const c = rawConflicts[i];
      if (!c || typeof c !== "object") continue;
      const cObj = c as Record<string, unknown>;
      const stmtA = typeof cObj["statement_a"] === "string" ? cObj["statement_a"].trim() : "";
      const stmtB = typeof cObj["statement_b"] === "string" ? cObj["statement_b"].trim() : "";
      if (stmtA && stmtB) {
        sanitizedConflicts.push({
          temporary_id: `conflict_${i + 1}`,
          statement_a: stmtA.slice(0, 1000),
          statement_b: stmtB.slice(0, 1000),
          explanation: typeof cObj["explanation"] === "string" ? cObj["explanation"].slice(0, 1000) : "",
          source_message_ids: Array.isArray(cObj["source_message_ids"])
            ? cObj["source_message_ids"].filter((id): id is string => typeof id === "string")
            : [],
        });
      }
    }

    const user_preferences = Array.isArray(obj["user_preferences"])
      ? obj["user_preferences"].filter((p): p is string => typeof p === "string" && p.trim().length > 0)
      : undefined;

    const payload: ExtractionPayload = {
      relevance,
      relevance_reason,
      entities: sanitizedEntities,
      claims: sanitizedClaims,
      relations: sanitizedRelations,
      hierarchy_suggestions: sanitizedHierarchy,
      sources: sanitizedSources,
      open_questions: sanitizedQuestions,
      conflicts: sanitizedConflicts,
      user_preferences,
    };

    return {
      isValid: errors.length === 0,
      validationStatus: errors.length > 0 ? "invalid" : warnings.length > 0 ? "warning" : "valid",
      sanitizedPayload: payload,
      warnings,
      errors,
    };
  }

  private static clampConfidence(val: unknown): number {
    if (typeof val === "number" && !isNaN(val)) {
      return Math.min(Math.max(val, 0), 1);
    }
    return 0.85;
  }

  private static normalizeClaimType(val: unknown): ExtractedClaimCandidate["claim_type"] {
    const validTypes = ["fact", "definition", "procedural", "opinion", "interpretation", "preference", "example", "hypothesis", "unknown"];
    if (typeof val === "string" && validTypes.includes(val.toLowerCase())) {
      return val.toLowerCase() as ExtractedClaimCandidate["claim_type"];
    }
    return "fact";
  }

  private static normalizeKnowledgeState(val: unknown, statement: string): ExtractedClaimCandidate["knowledge_state"] {
    const sLower = statement.toLowerCase();
    // Detect uncertainty keywords in text if model marked it certain
    if (
      sLower.includes("maybe") ||
      sLower.includes("probably") ||
      sLower.includes("possibly") ||
      sLower.includes("might") ||
      sLower.includes("تقريبًا") ||
      sLower.includes("تقريبا") ||
      sLower.includes("ممكن") ||
      sLower.includes("غالباً") ||
      sLower.includes("غالبا")
    ) {
      return "UNCERTAIN";
    }

    const validStates = ["CERTAIN", "PROBABLE", "UNCERTAIN", "DISPUTED"];
    if (typeof val === "string" && validStates.includes(val.toUpperCase())) {
      return val.toUpperCase() as ExtractedClaimCandidate["knowledge_state"];
    }
    return "PROBABLE";
  }

  private static createEmptyPayload(relevance: KnowledgeRelevance, reason: string): ExtractionPayload {
    return {
      relevance,
      relevance_reason: reason,
      entities: [],
      claims: [],
      relations: [],
      hierarchy_suggestions: [],
      sources: [],
      open_questions: [],
      conflicts: [],
    };
  }
}

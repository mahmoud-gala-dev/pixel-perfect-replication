// =====================================================================
// KNOWLEDGE BRAIN — PHASE 11: ACTIVE LEARNING & FEEDBACK INTEGRATION
// Feedback loop from Chat corrections, retrieval failures & usage signals
// into governed observations and improvement missions
// =====================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { BrainObserver } from "./observer";
import { BrainMissionEngine } from "./mission-engine";
import type { BrainObservation, BrainMission } from "./types";

export interface UserCorrectionInput {
  conversation_id: string;
  message_id: string;
  assistant_message_id: string;
  claim_id?: string;
  concept_name?: string;
  correction_text: string;
  correction_type: "OUTDATED" | "FACTUAL_ERROR" | "WRONG_SOURCE" | "MISSING_DETAIL";
  user_id?: string;
}

export interface RetrievalFeedbackSignal {
  retrieval_run_id: string;
  query: string;
  feedback_type: string;
  rating: "positive" | "negative";
  notes?: string;
  user_id?: string;
}

export class ActiveLearningService {
  constructor(
    private observer: BrainObserver,
    private missionEngine: BrainMissionEngine,
    private supabase: SupabaseClient<Database> | null = null,
  ) {}

  /**
   * Processes a user correction in chat.
   * INVARIANT: Never overwrites verified knowledge immediately based on a single user statement.
   * Instead, surfaces an observation and schedules a revalidation / conflict investigation.
   */
  public async handleUserCorrection(
    input: UserCorrectionInput,
  ): Promise<{ observation: BrainObservation; suggested_mission?: BrainMission }> {
    const userId = input.user_id || "system";
    const targetId = input.claim_id || input.assistant_message_id;

    // 1. Record Observation
    const obs = await this.observer.recordObservation({
      user_id: userId,
      observation_type:
        input.correction_type === "OUTDATED" ? "OUTDATED_KNOWLEDGE" : "NEEDS_REVALIDATION",
      target_type: input.claim_id ? "claim" : "retrieval",
      target_id: targetId,
      severity: "medium",
      confidence: 0.85,
      status: "open",
      summary: `User flagged output as ${input.correction_type}: "${input.correction_text}"`,
      signals: {
        correction_text: input.correction_text,
        correction_type: input.correction_type,
        conversation_id: input.conversation_id,
        concept: input.concept_name,
      },
      detected_by: "user_chat_correction",
    });

    // 2. Suggest revalidation mission
    let mission: BrainMission | undefined;
    try {
      mission = await this.missionEngine.createMission(
        {
          mission_type: "REVALIDATE_CLAIM",
          title: `Revalidate ${input.concept_name || "Claim"} following user correction`,
          goal: `Investigate whether "${input.correction_text}" reflects updated documentation.`,
          target_type: input.claim_id ? "claim" : "retrieval",
          target_id: targetId,
          trigger_observation_id: obs.id,
          priority: "HIGH",
          risk_level: "LOW",
          user_id: userId,
        },
        "SUGGEST", // Suggests for review or controlled queue
      );
    } catch {
      // Autonomy mode may be OFF
    }

    return { observation: obs, suggested_mission: mission };
  }

  /**
   * Aggregates retrieval feedback signals.
   * Repeated feedback on a query creates a mission to investigate coverage.
   */
  public async handleRetrievalFeedback(
    signal: RetrievalFeedbackSignal,
  ): Promise<BrainObservation | null> {
    if (signal.rating === "positive") return null;

    const obs = await this.observer.recordObservation({
      user_id: signal.user_id || "system",
      observation_type: "RETRIEVAL_FAILURE",
      target_type: "retrieval",
      target_id: signal.retrieval_run_id,
      severity: "medium",
      confidence: 0.90,
      status: "open",
      summary: `Negative feedback on retrieval for "${signal.query}": ${signal.feedback_type}`,
      signals: {
        query: signal.query,
        feedback_type: signal.feedback_type,
        notes: signal.notes,
      },
      detected_by: "retrieval_feedback_monitor",
    });

    // If observation has repeated 3 or more times for similar queries, suggest investigation mission
    if (obs.occurrence_count >= 3) {
      await this.missionEngine.createMission(
        {
          mission_type: "ANSWER_QUALITY_INVESTIGATION",
          title: `Investigate recurring retrieval weakness for: "${signal.query}"`,
          goal: `Identify missing claims, relations, or aliases causing poor retrieval results.`,
          target_type: "retrieval",
          target_id: signal.retrieval_run_id,
          trigger_observation_id: obs.id,
          priority: "HIGH",
          risk_level: "LOW",
          user_id: signal.user_id,
        },
        "SUGGEST",
      );
    }

    return obs;
  }
}

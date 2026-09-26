// =====================================================================
// KNOWLEDGE BRAIN — PHASE 11: MISSION ENGINE
// Mission lifecycle, queueing, budget enforcement, loop detection,
// agent execution & outcome evaluation
// =====================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type {
  AgentRun,
  AutonomyMode,
  AutonomySettings,
  BrainMission,
  MissionBudget,
  MissionBudgetUsed,
  MissionOutcome,
  MissionPriority,
  MissionRiskLevel,
  MissionStatus,
  MissionType,
} from "./types";

export interface CreateMissionInput {
  mission_type: MissionType;
  title: string;
  goal: string;
  description?: string;
  target_type?: string;
  target_id?: string;
  trigger_observation_id?: string;
  priority?: MissionPriority;
  risk_level?: MissionRiskLevel;
  budget?: Partial<MissionBudget>;
  constraints?: Record<string, unknown>;
  user_id?: string;
}

export const DEFAULT_MISSION_BUDGET: MissionBudget = {
  max_steps: 10,
  max_ai_calls: 5,
  max_research_queries: 5,
  max_sources: 5,
};

export const DEFAULT_AUTONOMY_SETTINGS: AutonomySettings = {
  autonomy_mode: "SUGGEST",
  daily_mission_budget: 20,
  max_concurrent_missions: 3,
  max_research_calls_per_mission: 5,
  max_ai_calls_per_mission: 5,
  max_sources_per_mission: 5,
  allowed_domains: [],
  blocked_domains: [],
};

export class BrainMissionEngine {
  private inMemoryMissions: Map<string, BrainMission> = new Map();
  private inMemoryAgentRuns: AgentRun[] = [];

  constructor(private supabase: SupabaseClient<Database> | null = null) {}

  /**
   * Creates a new mission or reuses an existing active one for the same target and type.
   */
  public async createMission(
    input: CreateMissionInput,
    autonomyMode: AutonomyMode = "SUGGEST",
  ): Promise<BrainMission> {
    const userId = input.user_id || "system";

    // 1. Check if autonomy mode allows mission creation
    if (autonomyMode === "OFF") {
      throw new Error("Autonomy is currently OFF. Mission creation is disabled.");
    }

    // 2. Deduplication check: Is there already an active mission for this target & type?
    if (input.target_id) {
      const existingActive = Array.from(this.inMemoryMissions.values()).find(
        (m) =>
          m.target_id === input.target_id &&
          m.mission_type === input.mission_type &&
          (m.status === "QUEUED" || m.status === "RUNNING"),
      );
      if (existingActive) {
        return existingActive;
      }
    }

    const budget: MissionBudget = {
      ...DEFAULT_MISSION_BUDGET,
      ...input.budget,
    };

    const initialStatus: MissionStatus =
      autonomyMode === "OBSERVE_ONLY"
        ? "PROPOSED"
        : autonomyMode === "SUGGEST"
        ? "PROPOSED"
        : "QUEUED";

    const missionId = `mis-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const mission: BrainMission = {
      id: missionId,
      user_id: userId,
      mission_type: input.mission_type,
      title: input.title,
      description: input.description || null,
      status: initialStatus,
      priority: input.priority || "MEDIUM",
      risk_level: input.risk_level || "LOW",
      target_type: input.target_type || null,
      target_id: input.target_id || null,
      trigger_observation_id: input.trigger_observation_id || null,
      goal: input.goal,
      constraints: input.constraints || {},
      budget,
      budget_used: { steps: 0, ai_calls: 0, research_queries: 0, sources: 0 },
      assigned_agent: this.resolveAgentForType(input.mission_type),
      outcome: null,
      outcome_summary: null,
      started_at: null,
      completed_at: null,
      reviewed_at: null,
      created_at: new Date().toISOString(),
      metadata: {},
    };

    this.inMemoryMissions.set(mission.id, mission);

    if (this.supabase) {
      try {
        await this.supabase.from("brain_missions").insert({
          id: mission.id,
          user_id: mission.user_id,
          mission_type: mission.mission_type,
          title: mission.title,
          description: mission.description,
          status: mission.status,
          priority: mission.priority,
          risk_level: mission.risk_level,
          target_type: mission.target_type,
          target_id: mission.target_id,
          trigger_observation_id: mission.trigger_observation_id,
          goal: mission.goal,
          constraints: mission.constraints as any,
          budget: mission.budget as any,
          budget_used: mission.budget_used as any,
          assigned_agent: mission.assigned_agent,
        });
      } catch (err) {
        console.warn("Failed to persist mission to database, stored in memory", err);
      }
    }

    return mission;
  }

  /**
   * Records step execution, budget tracking, and loop protection.
   */
  public async executeStep(
    missionId: string,
    action: {
      agent_type: string;
      step_name: string;
      query_or_input: Record<string, unknown>;
      is_ai_call?: boolean;
      is_research_query?: boolean;
      sources_count?: number;
    },
  ): Promise<{ proceed: boolean; stopReason?: string }> {
    const mission = this.inMemoryMissions.get(missionId);
    if (!mission) {
      return { proceed: false, stopReason: "Mission not found." };
    }

    if (mission.status === "CANCELLED" || mission.status === "PAUSED") {
      return { proceed: false, stopReason: `Mission is ${mission.status}.` };
    }

    // 1. Budget Checks
    const nextSteps = mission.budget_used.steps + 1;
    const nextAiCalls = mission.budget_used.ai_calls + (action.is_ai_call ? 1 : 0);
    const nextQueries = mission.budget_used.research_queries + (action.is_research_query ? 1 : 0);
    const nextSources = mission.budget_used.sources + (action.sources_count || 0);

    if (nextSteps > mission.budget.max_steps) {
      await this.completeMission(missionId, "BLOCKED", "Mission stopped: step budget exhausted.");
      return { proceed: false, stopReason: "Step budget exhausted." };
    }

    if (nextAiCalls > mission.budget.max_ai_calls) {
      await this.completeMission(missionId, "BLOCKED", "Mission stopped: AI call budget exhausted.");
      return { proceed: false, stopReason: "AI call budget exhausted." };
    }

    if (nextQueries > mission.budget.max_research_queries) {
      await this.completeMission(missionId, "BLOCKED", "Mission stopped: research query budget exhausted.");
      return { proceed: false, stopReason: "Research query budget exhausted." };
    }

    // 2. Loop Detection: Check if the exact query was repeated more than twice
    const existingRuns = this.inMemoryAgentRuns.filter((r) => r.mission_id === missionId);
    const serializedInput = JSON.stringify(action.query_or_input);
    const identicalSteps = existingRuns.filter((r) => JSON.stringify(r.input) === serializedInput);

    if (identicalSteps.length >= 2) {
      await this.completeMission(missionId, "BLOCKED", "Loop detected: repeated identical action.");
      return { proceed: false, stopReason: "Loop detected: repeated identical action." };
    }

    // Update budget usage
    mission.budget_used = {
      steps: nextSteps,
      ai_calls: nextAiCalls,
      research_queries: nextQueries,
      sources: nextSources,
    };
    mission.status = "RUNNING";
    if (!mission.started_at) {
      mission.started_at = new Date().toISOString();
    }

    // Record agent run
    const run: AgentRun = {
      id: `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      user_id: mission.user_id,
      mission_id: mission.id,
      agent_type: action.agent_type,
      status: "completed",
      input: action.query_or_input,
      structured_output: { step: action.step_name },
      reason_summary: `Executed step: ${action.step_name}`,
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
    this.inMemoryAgentRuns.push(run);

    return { proceed: true };
  }

  /**
   * Completes a mission with explicit outcome and reason summary.
   */
  public async completeMission(
    missionId: string,
    outcome: MissionOutcome,
    summary: string,
  ): Promise<BrainMission | null> {
    const mission = this.inMemoryMissions.get(missionId);
    if (!mission) return null;

    mission.status = outcome === "FAILED" || outcome === "BLOCKED" ? outcome : "COMPLETED";
    mission.outcome = outcome;
    mission.outcome_summary = summary;
    mission.completed_at = new Date().toISOString();

    if (this.supabase) {
      try {
        await this.supabase
          .from("brain_missions")
          .update({
            status: mission.status,
            outcome: mission.outcome,
            outcome_summary: mission.outcome_summary,
            completed_at: mission.completed_at,
            budget_used: mission.budget_used as any,
          })
          .eq("id", mission.id);
      } catch (err) {
        console.warn("Failed to update mission in database", err);
      }
    }

    return mission;
  }

  /**
   * Cancels a running or queued mission safely.
   */
  public async cancelMission(missionId: string): Promise<boolean> {
    const mission = this.inMemoryMissions.get(missionId);
    if (!mission) return false;

    mission.status = "CANCELLED";
    mission.outcome = "BLOCKED";
    mission.outcome_summary = "Mission cancelled by user.";
    mission.completed_at = new Date().toISOString();

    if (this.supabase) {
      try {
        await this.supabase
          .from("brain_missions")
          .update({
            status: "CANCELLED",
            outcome: "BLOCKED",
            outcome_summary: "Mission cancelled by user.",
            completed_at: mission.completed_at,
          })
          .eq("id", mission.id);
      } catch (err) {
        console.warn("Failed to cancel mission in database", err);
      }
    }

    return true;
  }

  public getMission(id: string): BrainMission | undefined {
    return this.inMemoryMissions.get(id);
  }

  public listMissions(filter?: { status?: string; type?: MissionType }): BrainMission[] {
    let list = Array.from(this.inMemoryMissions.values());
    if (filter?.status) {
      list = list.filter((m) => m.status === filter.status);
    }
    if (filter?.type) {
      list = list.filter((m) => m.mission_type === filter.type);
    }
    return list;
  }

  private resolveAgentForType(type: MissionType): string {
    switch (type) {
      case "RESEARCH_GAP":
        return "ResearchAgent";
      case "FIND_EVIDENCE":
        return "EvidenceAgent";
      case "REVALIDATE_CLAIM":
        return "RevalidationEngine";
      case "RESOLVE_CONFLICT":
        return "ConflictAnalyst";
      case "CHECK_SOURCE":
      case "REPAIR_SOURCE":
        return "MaintenanceAgent";
      case "INVESTIGATE_DUPLICATE":
        return "EntityResolver";
      case "COMPRESS_KNOWLEDGE":
        return "CompressionAgent";
      case "REVIEW_TAXONOMY":
        return "TaxonomyAgent";
      default:
        return "QualityAgent";
    }
  }
}

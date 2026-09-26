/**
 * KNOWLEDGE BRAIN — PHASE 12: EMERGENCY KILL SWITCHES
 * Centralized governance control to instantly halt expensive or autonomous subsystems
 * without disrupting basic read and search access.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { assertPermission, type BrainRole } from "./roles";
import { recordAuditEvent } from "./audit";

export type KillSwitchType =
  | "auto_learning"
  | "missions"
  | "research"
  | "connectors"
  | "embeddings";

export interface KillSwitchesState {
  auto_learning: boolean;
  missions: boolean;
  research: boolean;
  connectors: boolean;
  embeddings: boolean;
}

const DEFAULT_KILL_SWITCHES: KillSwitchesState = {
  auto_learning: false,
  missions: false,
  research: false,
  connectors: false,
  embeddings: false,
};

// Global in-memory cache for fast checks
let cachedKillSwitches: KillSwitchesState = { ...DEFAULT_KILL_SWITCHES };

/**
 * Checks if a specific subsystem is blocked by an active kill switch.
 */
export function isKillSwitchActive(type: KillSwitchType): boolean {
  return cachedKillSwitches[type] ?? false;
}

/**
 * Throws an actionable error if the target subsystem is halted by a kill switch.
 */
export function assertSubsystemAllowed(type: KillSwitchType): void {
  if (isKillSwitchActive(type)) {
    throw new Error(
      `Operation Blocked by Kill Switch: The '${type}' subsystem has been halted by administrative governance. Basic Brain search and read operations remain operational.`
    );
  }
}

/**
 * Toggles a kill switch. Strictly restricted to users with ADMIN permission.
 */
export async function toggleKillSwitch(
  supabase: SupabaseClient<Database> | null,
  actor: { id: string; role: BrainRole },
  type: KillSwitchType,
  enabled: boolean
): Promise<KillSwitchesState> {
  // Enforce server-side role permission check
  assertPermission(actor.role, "canUseKillSwitches");

  cachedKillSwitches[type] = enabled;

  // Record immutable audit event
  await recordAuditEvent(supabase, {
    actor_id: actor.id,
    actor_role: actor.role,
    action: "KILL_SWITCH_TOGGLED",
    target_type: "kill_switch",
    target_id: type,
    result: "SUCCESS",
    diff: { subsystem: type, prior_state: !enabled, new_state: enabled },
  });

  if (supabase) {
    try {
      const colName = `kill_switch_${type}` as const;
      await supabase
        .from("knowledge_settings")
        .update({ [colName]: enabled } as any)
        .eq("user_id", actor.id);
    } catch {
      // Offline fallback: state preserved in memory
    }
  }

  return { ...cachedKillSwitches };
}

/**
 * Returns the current state of all kill switches.
 */
export function getKillSwitchesState(): KillSwitchesState {
  return { ...cachedKillSwitches };
}

/**
 * Resets kill switches (useful for tests).
 */
export function resetKillSwitches(): void {
  cachedKillSwitches = { ...DEFAULT_KILL_SWITCHES };
}

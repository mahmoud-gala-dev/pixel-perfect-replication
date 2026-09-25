// =====================================================================
// KNOWLEDGE BRAIN — PHASE 7: SETTINGS PAGE
// Account, Profile & Brain Learning Engine Governance Settings
// =====================================================================

import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Brain, Shield, Sliders, CheckCircle2, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  DEFAULT_BRAIN_SETTINGS,
  type BrainLearningSettings,
  type LearningMode,
} from "@/lib/ai/learning/types";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Knowledge Brain" },
      { name: "description", content: "Manage your Knowledge Brain profile and learning engine settings." },
      { property: "og:title", content: "Settings — Knowledge Brain" },
      { property: "og:description", content: "Manage your Knowledge Brain profile and learning engine settings." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { session, user, signOut } = useAuth();
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState("");

  // Profile Query
  const { data: profile } = useQuery({
    queryKey: ["profile"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (profile?.display_name) setDisplayName(profile.display_name);
  }, [profile?.display_name]);

  // Save Profile Mutation
  const saveProfile = useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { error } = await supabase
        .from("profiles")
        .upsert({ id: user.id, display_name: displayName.trim() || null });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Profile saved");
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Brain Learning Settings Query
  const { data: brainSettingsData } = useQuery({
    queryKey: ["brain-learning-settings"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_settings")
        .select("*")
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return data;
    },
  });

  const [learningSettings, setLearningSettings] = useState<BrainLearningSettings>(DEFAULT_BRAIN_SETTINGS);

  useEffect(() => {
    if (brainSettingsData) {
      setLearningSettings({
        learning_mode: brainSettingsData.learning_mode as LearningMode,
        auto_create_nodes: brainSettingsData.auto_create_nodes ?? false,
        auto_add_aliases: brainSettingsData.auto_add_aliases ?? true,
        auto_add_relations: brainSettingsData.auto_add_relations ?? true,
        auto_add_claims: brainSettingsData.auto_add_claims ?? false,
        require_evidence_for_claims: brainSettingsData.require_evidence_for_claims ?? true,
        min_node_confidence: Number(brainSettingsData.min_node_confidence ?? 0.9),
        min_relation_confidence: Number(brainSettingsData.min_relation_confidence ?? 0.85),
        min_claim_confidence: Number(brainSettingsData.min_claim_confidence ?? 0.9),
      });
    }
  }, [brainSettingsData]);

  // Save Brain Learning Settings Mutation
  const saveBrainSettings = useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { error } = await supabase.from("knowledge_settings").upsert({
        user_id: user.id,
        learning_mode: learningSettings.learning_mode,
        auto_create_nodes: learningSettings.auto_create_nodes,
        auto_add_aliases: learningSettings.auto_add_aliases,
        auto_add_relations: learningSettings.auto_add_relations,
        auto_add_claims: learningSettings.auto_add_claims,
        require_evidence_for_claims: learningSettings.require_evidence_for_claims,
        min_node_confidence: learningSettings.min_node_confidence,
        min_relation_confidence: learningSettings.min_relation_confidence,
        min_claim_confidence: learningSettings.min_claim_confidence,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Brain learning settings updated");
      void queryClient.invalidateQueries({ queryKey: ["brain-learning-settings"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <AppShell title="Settings" description="Manage account profile and Brain learning governance.">
      <div className="space-y-6 max-w-2xl">
        {/* Profile Panel */}
        <div className="panel space-y-4 p-6">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <span>Profile & Account</span>
          </h2>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input value={user?.email ?? ""} readOnly />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="display-name">Display name</Label>
            <Input
              id="display-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="How should the brain address you?"
            />
          </div>
          <div className="flex gap-2">
            <Button disabled={saveProfile.isPending} onClick={() => saveProfile.mutate()}>
              Save changes
            </Button>
            <Button variant="secondary" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </div>

        {/* Phase 7: Brain Learning Governance Panel */}
        <div className="panel space-y-5 p-6">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="space-y-0.5">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Brain className="size-4 text-primary" />
                <span>Brain Learning Governance (Phase 7)</span>
              </h2>
              <p className="text-xs text-muted-foreground">
                Control how the Brain learns from chat episodes. AI Chat never mutates tables directly.
              </p>
            </div>
            <Badge
              variant="outline"
              className={
                learningSettings.learning_mode === "auto"
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                  : "border-blue-500/40 bg-blue-500/10 text-blue-400"
              }
            >
              {learningSettings.learning_mode === "auto" ? "AUTO MODE (GOVERNED)" : "REVIEW MODE (DEFAULT)"}
            </Badge>
          </div>

          {/* Mode Switcher */}
          <div className="rounded-lg border border-border/80 bg-muted/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">Automatic Learning Mode</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  When enabled, allowed low-risk operations auto-commit. High-risk operations (merges, overwrites) always require review.
                </p>
              </div>
              <Switch
                checked={learningSettings.learning_mode === "auto"}
                onCheckedChange={(checked) =>
                  setLearningSettings((prev) => ({
                    ...prev,
                    learning_mode: checked ? "auto" : "review",
                  }))
                }
              />
            </div>
          </div>

          {/* Specific Automation Toggles */}
          <div className="space-y-3 pt-1">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Auto-Commit Permissions (Auto Mode Only)
            </h3>

            <div className="flex items-center justify-between py-1">
              <div>
                <Label className="text-xs font-medium">Auto-create high-confidence new concepts</Label>
                <p className="text-[11px] text-muted-foreground">
                  Allow creation of non-conflicting new nodes when identity is resolved as genuinely new.
                </p>
              </div>
              <Switch
                checked={learningSettings.auto_create_nodes}
                onCheckedChange={(checked) =>
                  setLearningSettings((prev) => ({ ...prev, auto_create_nodes: checked }))
                }
              />
            </div>

            <div className="flex items-center justify-between py-1">
              <div>
                <Label className="text-xs font-medium">Auto-add safe aliases</Label>
                <p className="text-[11px] text-muted-foreground">
                  Attach newly encountered alternative names to verified canonical identities.
                </p>
              </div>
              <Switch
                checked={learningSettings.auto_add_aliases}
                onCheckedChange={(checked) =>
                  setLearningSettings((prev) => ({ ...prev, auto_add_aliases: checked }))
                }
              />
            </div>

            <div className="flex items-center justify-between py-1">
              <div>
                <Label className="text-xs font-medium">Auto-add safe graph relations</Label>
                <p className="text-[11px] text-muted-foreground">
                  Connect existing canonical entities when a valid relationship is discovered.
                </p>
              </div>
              <Switch
                checked={learningSettings.auto_add_relations}
                onCheckedChange={(checked) =>
                  setLearningSettings((prev) => ({ ...prev, auto_add_relations: checked }))
                }
              />
            </div>

            <div className="flex items-center justify-between py-1">
              <div>
                <Label className="text-xs font-medium">Auto-add verified atomic claims</Label>
                <p className="text-[11px] text-muted-foreground">
                  Add non-conflicting claims to existing nodes without rewriting descriptions.
                </p>
              </div>
              <Switch
                checked={learningSettings.auto_add_claims}
                onCheckedChange={(checked) =>
                  setLearningSettings((prev) => ({ ...prev, auto_add_claims: checked }))
                }
              />
            </div>

            <div className="flex items-center justify-between py-1">
              <div>
                <Label className="text-xs font-medium">Require evidence for claims</Label>
                <p className="text-[11px] text-muted-foreground">
                  Quarantine claims that lack external source evidence (AI-generated conversation claims).
                </p>
              </div>
              <Switch
                checked={learningSettings.require_evidence_for_claims}
                onCheckedChange={(checked) =>
                  setLearningSettings((prev) => ({ ...prev, require_evidence_for_claims: checked }))
                }
              />
            </div>
          </div>

          {/* Confidence Thresholds */}
          <div className="space-y-3 border-t border-border pt-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Minimum Confidence Thresholds
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px]">Concept Threshold</Label>
                <Input
                  type="number"
                  step="0.05"
                  min="0.5"
                  max="1.0"
                  value={learningSettings.min_node_confidence}
                  onChange={(e) =>
                    setLearningSettings((prev) => ({
                      ...prev,
                      min_node_confidence: parseFloat(e.target.value) || 0.9,
                    }))
                  }
                  className="h-8 text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px]">Relation Threshold</Label>
                <Input
                  type="number"
                  step="0.05"
                  min="0.5"
                  max="1.0"
                  value={learningSettings.min_relation_confidence}
                  onChange={(e) =>
                    setLearningSettings((prev) => ({
                      ...prev,
                      min_relation_confidence: parseFloat(e.target.value) || 0.85,
                    }))
                  }
                  className="h-8 text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[11px]">Claim Threshold</Label>
                <Input
                  type="number"
                  step="0.05"
                  min="0.5"
                  max="1.0"
                  value={learningSettings.min_claim_confidence}
                  onChange={(e) =>
                    setLearningSettings((prev) => ({
                      ...prev,
                      min_claim_confidence: parseFloat(e.target.value) || 0.9,
                    }))
                  }
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              disabled={saveBrainSettings.isPending}
              onClick={() => saveBrainSettings.mutate()}
              className="gap-1.5"
            >
              <CheckCircle2 className="size-4" /> Save Governance Settings
            </Button>
          </div>
        </div>

        {/* Privacy Note */}
        <div className="panel p-6">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Lock className="size-4 text-muted-foreground" />
            <span>Privacy & Multi-tenant Isolation</span>
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            All knowledge, conversations, proposals, plans, and learning transactions in this app are private
            to your account and strictly enforced at the database level with Supabase RLS.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
export default SettingsPage;

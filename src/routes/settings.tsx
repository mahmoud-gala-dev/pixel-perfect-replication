// =====================================================================
// KNOWLEDGE BRAIN — PHASE 7: SETTINGS PAGE
// Account, Profile & Brain Learning Engine Governance Settings
// =====================================================================

import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Brain, Shield, Sliders, CheckCircle2, Lock, Sparkles, Activity, Target, PowerOff, Download, RefreshCw, KeyRound, Wrench, Zap } from "lucide-react";
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
import { AIProviderSettingsCard } from "@/components/settings/AIProviderSettingsCard";
import { AIProviderManager } from "@/lib/ai/provider-manager";

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
        solo_direct_commit: (brainSettingsData as any).solo_direct_commit ?? false,
      });
      if ((brainSettingsData as any).solo_direct_commit !== undefined) {
        AIProviderManager.updateSettings({ solo_direct_commit: (brainSettingsData as any).solo_direct_commit });
      }
      if ((brainSettingsData as any).autonomy_mode) {
        setAutonomyMode((brainSettingsData as any).autonomy_mode);
      }
      if ((brainSettingsData as any).daily_mission_budget) {
        setDailyBudget(Number((brainSettingsData as any).daily_mission_budget));
      }
      setKillSwitches({
        auto_learning: !!(brainSettingsData as any).kill_switch_auto_learning,
        missions: !!(brainSettingsData as any).kill_switch_missions,
        research: !!(brainSettingsData as any).kill_switch_research,
        connectors: !!(brainSettingsData as any).kill_switch_connectors,
        embeddings: !!(brainSettingsData as any).kill_switch_embeddings,
      });
    }
  }, [brainSettingsData]);

  const [autonomyMode, setAutonomyMode] = useState<string>("SUGGEST");
  const [dailyBudget, setDailyBudget] = useState<number>(20);
  const [killSwitches, setKillSwitches] = useState({
    auto_learning: false,
    missions: false,
    research: false,
    connectors: false,
    embeddings: false,
  });

  // Save Brain Learning & Governance Settings Mutation
  const saveBrainSettings = useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { error } = await (supabase.from("knowledge_settings") as any).upsert({
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
        solo_direct_commit: learningSettings.solo_direct_commit ?? false,
        autonomy_mode: autonomyMode,
        daily_mission_budget: dailyBudget,
        kill_switch_auto_learning: killSwitches.auto_learning,
        kill_switch_missions: killSwitches.missions,
        kill_switch_research: killSwitches.research,
        kill_switch_connectors: killSwitches.connectors,
        kill_switch_embeddings: killSwitches.embeddings,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      AIProviderManager.updateSettings({ solo_direct_commit: learningSettings.solo_direct_commit ?? false });
      toast.success("Brain learning, solo fast-track & governance settings updated");
      void queryClient.invalidateQueries({ queryKey: ["brain-learning-settings"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Data Integrity state & trigger
  const [integrityReport, setIntegrityReport] = useState<any>(null);
  const [isAuditing, setIsAuditing] = useState(false);

  const runIntegrityAudit = async () => {
    setIsAuditing(true);
    try {
      const { data, error } = await supabase.rpc("check_brain_data_integrity" as any);
      if (error) throw error;
      setIntegrityReport(data);
      toast.success("Brain Data Integrity Audit completed!");
    } catch (e: any) {
      toast.error(e.message || "Failed to run integrity audit");
    } finally {
      setIsAuditing(false);
    }
  };

  const exportBrain = async () => {
    try {
      const { data: nodes } = await supabase.from("knowledge_nodes").select("*").limit(1000);
      const { data: edges } = await supabase.from("knowledge_edges").select("*").limit(2000);
      const { data: claims } = await supabase.from("knowledge_claims").select("*").limit(3000);
      const { data: sources } = await supabase.from("sources").select("*").limit(500);

      const pkg = {
        manifest: {
          manifest_version: "1.0.0",
          schema_version: "2026-09",
          exported_at: new Date().toISOString(),
          scope: "user",
          counts: {
            nodes: nodes?.length || 0,
            edges: edges?.length || 0,
            claims: claims?.length || 0,
            sources: sources?.length || 0,
          },
        },
        data: {
          nodes: nodes || [],
          edges: edges || [],
          claims: claims || [],
          sources: sources || [],
        },
      };

      const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `brain-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Brain Export Package downloaded successfully.");
    } catch (err: any) {
      toast.error("Export failed: " + err.message);
    }
  };

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

        {/* Multi-AI Provider Switcher & Model Engine */}
        <AIProviderSettingsCard />

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

          {/* Solo Fast-Track Mode (P0 Solo Auto-Catalog) */}
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Zap className="size-4 text-primary animate-pulse" />
                  <Label className="text-sm font-semibold text-primary">
                    Solo Fast-Track Mode (التسجيل الفوري المباشر)
                  </Label>
                  <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/20">
                    Solo Power User
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  High-confidence proposals (&gt;90% confidence, zero ambiguity) commit directly to canonical nodes and claims without manual approval in /proposals.
                </p>
                <p className="text-[11px] text-amber-500 font-medium">
                  🛡️ Zero-Corruption Safety Gate: Any conflict, ambiguity, or duplicate risk automatically diverts to /proposals.
                </p>
              </div>
              <Switch
                checked={learningSettings.solo_direct_commit ?? false}
                onCheckedChange={(checked) => {
                  setLearningSettings((prev) => ({ ...prev, solo_direct_commit: checked }));
                  AIProviderManager.updateSettings({ solo_direct_commit: checked });
                }}
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

        {/* Phase 11: Brain Autonomy & Self-Improvement Governance */}
        <div className="panel space-y-5 p-6">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="space-y-0.5">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                <span>Brain Autonomy & Missions Governance (Phase 11)</span>
              </h2>
              <p className="text-xs text-muted-foreground">
                Govern continuous self-improvement, research missions, and budget boundaries. No unrestricted mode exists.
              </p>
            </div>
            <Badge
              variant="outline"
              className={
                autonomyMode === "SAFE_AUTO"
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 font-mono text-[10px]"
                  : autonomyMode === "RESEARCH"
                  ? "border-purple-500/40 bg-purple-500/10 text-purple-400 font-mono text-[10px]"
                  : autonomyMode === "SUGGEST"
                  ? "border-blue-500/40 bg-blue-500/10 text-blue-400 font-mono text-[10px]"
                  : "border-muted-foreground/40 bg-muted/20 text-muted-foreground font-mono text-[10px]"
              }
            >
              MODE: {autonomyMode}
            </Badge>
          </div>

          {/* Autonomy Level Selection */}
          <div className="space-y-3">
            <Label className="text-xs font-medium">Autonomy Operating Level</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                {
                  id: "OFF",
                  name: "OFF",
                  desc: "No autonomous observations or missions. Completely manual.",
                },
                {
                  id: "OBSERVE_ONLY",
                  name: "OBSERVE_ONLY",
                  desc: "Detect weaknesses, gaps, and conflicts. Create observations only.",
                },
                {
                  id: "SUGGEST",
                  name: "SUGGEST (Recommended)",
                  desc: "Propose improvement missions. External research requires manual start.",
                },
                {
                  id: "RESEARCH",
                  name: "RESEARCH",
                  desc: "Allowed missions may research external sources. Writes remain governed.",
                },
                {
                  id: "SAFE_AUTO",
                  name: "SAFE_AUTO",
                  desc: "Low-risk maintenance operations auto-commit according to policy.",
                },
              ].map((opt) => (
                <div
                  key={opt.id}
                  onClick={() => setAutonomyMode(opt.id)}
                  className={`p-3 rounded-lg border text-left cursor-pointer transition-colors ${
                    autonomyMode === opt.id
                      ? "border-primary bg-primary/10 shadow-sm"
                      : "border-border/70 bg-card hover:bg-muted/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">{opt.name}</span>
                    {autonomyMode === opt.id && <CheckCircle2 className="size-3.5 text-primary" />}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{opt.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Cost & Resource Limits */}
          <div className="space-y-3 border-t border-border pt-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Cost & Resource Safety Limits
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-[11px]">Daily Mission Budget</Label>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  value={dailyBudget}
                  onChange={(e) => setDailyBudget(parseInt(e.target.value) || 20)}
                  className="h-8 text-xs font-mono"
                />
                <p className="text-[10px] text-muted-foreground">Maximum missions allowed to run in a 24h window.</p>
              </div>
              <div className="space-y-1">
                <Label className="text-[11px]">Max Steps Per Mission</Label>
                <Input type="number" readOnly value="10" className="h-8 text-xs font-mono bg-muted/40" />
                <p className="text-[10px] text-muted-foreground">Hard stop limit preventing runaway loops.</p>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              disabled={saveBrainSettings.isPending}
              onClick={() => saveBrainSettings.mutate()}
              className="gap-1.5"
            >
              <CheckCircle2 className="size-4" /> Save Autonomy & Budget Settings
            </Button>
          </div>
        </div>

        {/* Phase 12: Emergency Kill Switches Panel */}
        <div className="panel space-y-5 p-6 border-destructive/20 bg-destructive/5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold flex items-center gap-2 text-destructive">
                <PowerOff className="size-4 text-destructive" />
                <span>Emergency Kill Switches (Administrative Governance)</span>
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Instantly halt expensive or autonomous subsystems without affecting basic read, search, and chat access.
              </p>
            </div>
            <Badge variant="outline" className="text-destructive border-destructive/30 text-[10px]">
              Admin Control
            </Badge>
          </div>

          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-xs font-medium">Halt Automatic Learning</Label>
                <p className="text-[11px] text-muted-foreground">Stops conversation extraction and automatic plan execution.</p>
              </div>
              <Switch
                checked={killSwitches.auto_learning}
                onCheckedChange={(checked) => setKillSwitches((prev) => ({ ...prev, auto_learning: checked }))}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-xs font-medium">Halt Autonomous Missions</Label>
                <p className="text-[11px] text-muted-foreground">Freezes mission queue and pauses background agent tasks.</p>
              </div>
              <Switch
                checked={killSwitches.missions}
                onCheckedChange={(checked) => setKillSwitches((prev) => ({ ...prev, missions: checked }))}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-xs font-medium">Halt External Web Research</Label>
                <p className="text-[11px] text-muted-foreground">Blocks all outbound web and provider search calls.</p>
              </div>
              <Switch
                checked={killSwitches.research}
                onCheckedChange={(checked) => setKillSwitches((prev) => ({ ...prev, research: checked }))}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-xs font-medium">Halt Connector Synchronization</Label>
                <p className="text-[11px] text-muted-foreground">Pauses external data source ingestion (GitHub, Web, Notion).</p>
              </div>
              <Switch
                checked={killSwitches.connectors}
                onCheckedChange={(checked) => setKillSwitches((prev) => ({ ...prev, connectors: checked }))}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-xs font-medium">Halt Vector Embedding Jobs</Label>
                <p className="text-[11px] text-muted-foreground">Degrades semantic search gracefully to exact & lexical fallback.</p>
              </div>
              <Switch
                checked={killSwitches.embeddings}
                onCheckedChange={(checked) => setKillSwitches((prev) => ({ ...prev, embeddings: checked }))}
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              variant="destructive"
              size="sm"
              disabled={saveBrainSettings.isPending}
              onClick={() => saveBrainSettings.mutate()}
              className="gap-1.5"
            >
              <PowerOff className="size-3.5" /> Apply Kill Switches
            </Button>
          </div>
        </div>

        {/* Phase 12: Governance & User Role Panel */}
        <div className="panel space-y-4 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <KeyRound className="size-4 text-primary" />
              <span>Governance & Authority Model</span>
            </h2>
            <Badge className="bg-primary/20 text-primary border-primary/30 text-[10px]">
              ROLE: ADMIN
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Server-enforced role-based access control (RBAC). Sensitive mutations, rollbacks, and merges require verified privileges.
          </p>
          <div className="grid grid-cols-2 gap-2 pt-2 text-[11px]">
            <div className="flex items-center gap-1.5 text-foreground/80">
              <CheckCircle2 className="size-3.5 text-emerald-500" /> Read & Hybrid Search
            </div>
            <div className="flex items-center gap-1.5 text-foreground/80">
              <CheckCircle2 className="size-3.5 text-emerald-500" /> Edit & Create Proposals
            </div>
            <div className="flex items-center gap-1.5 text-foreground/80">
              <CheckCircle2 className="size-3.5 text-emerald-500" /> Verify & Dispute Claims
            </div>
            <div className="flex items-center gap-1.5 text-foreground/80">
              <CheckCircle2 className="size-3.5 text-emerald-500" /> Resolve Conflicts & Rollback
            </div>
            <div className="flex items-center gap-1.5 text-foreground/80">
              <CheckCircle2 className="size-3.5 text-emerald-500" /> Node Merges & Restructuring
            </div>
            <div className="flex items-center gap-1.5 text-foreground/80">
              <CheckCircle2 className="size-3.5 text-emerald-500" /> Emergency Kill Switches
            </div>
          </div>
        </div>

        {/* Phase 12: Data Integrity & Disaster Recovery Panel */}
        <div className="panel space-y-4 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Wrench className="size-4 text-muted-foreground" />
              <span>Data Integrity & Portability</span>
            </h2>
            <Badge variant="outline" className="text-[10px]">
              PostgreSQL Ground Truth
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Audit graph hierarchy, verify foreign key consistency, and export portable structured knowledge packages.
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={exportBrain}
            >
              <Download className="size-3.5" /> Export Brain (JSON)
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={runIntegrityAudit}
              disabled={isAuditing}
            >
              <RefreshCw className={`size-3.5 ${isAuditing ? "animate-spin" : ""}`} />
              Verify Data Integrity
            </Button>
          </div>

          {integrityReport && (
            <div className="mt-3 p-3 rounded-lg border border-border/60 bg-muted/20 text-xs space-y-2">
              <div className="flex items-center justify-between font-medium">
                <span>Integrity Status:</span>
                <span className={integrityReport.is_healthy ? "text-emerald-500" : "text-amber-500"}>
                  {integrityReport.is_healthy ? "HEALTHY (Zero anomalies)" : `${integrityReport.issues_count} issues found`}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-[11px] text-muted-foreground">
                <div>Circular Parents: {integrityReport.metrics?.circular_parents ?? 0}</div>
                <div>Dangling Edges: {integrityReport.metrics?.dangling_edges ?? 0}</div>
                <div>Orphan Claims: {integrityReport.metrics?.orphan_claims ?? 0}</div>
                <div>Broken Sources: {integrityReport.metrics?.broken_sources ?? 0}</div>
              </div>
            </div>
          )}
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

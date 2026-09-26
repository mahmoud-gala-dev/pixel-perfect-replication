// =====================================================================
// KNOWLEDGE BRAIN — AI PROVIDER SETTINGS CARD
// Multi-AI provider configuration: Lovable AI, Gemini & OpenRouter
// =====================================================================

import { useState } from "react";
import { toast } from "sonner";
import {
  Cpu,
  Sparkles,
  Key,
  Eye,
  EyeOff,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useAIProvider,
} from "@/hooks/useAIProvider";
import {
  GEMINI_AVAILABLE_MODELS,
  OPENROUTER_AVAILABLE_MODELS,
  type AIProviderId,
} from "@/lib/ai/provider-manager";

export function AIProviderSettingsCard() {
  const {
    settings,
    activeProvider,
    isValidating,
    switchProvider,
    updateSettings,
    testKey,
  } = useAIProvider();

  const [geminiKeyInput, setGeminiKeyInput] = useState(settings.geminiApiKey || "");
  const [openrouterKeyInput, setOpenrouterKeyInput] = useState(settings.openrouterApiKey || "");

  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showOpenrouterKey, setShowOpenrouterKey] = useState(false);

  const [testingProvider, setTestingProvider] = useState<"gemini" | "openrouter" | null>(null);

  const handleSaveKeys = () => {
    updateSettings({
      geminiApiKey: geminiKeyInput.trim(),
      openrouterApiKey: openrouterKeyInput.trim(),
    });
    toast.success("AI Provider API keys securely saved");
  };

  const handleTest = async (provider: "gemini" | "openrouter") => {
    const key = provider === "gemini" ? geminiKeyInput.trim() : openrouterKeyInput.trim();
    if (!key) {
      toast.error(`Please enter an API key for ${provider === "gemini" ? "Google Gemini" : "OpenRouter"} first`);
      return;
    }

    setTestingProvider(provider);
    try {
      const result = await testKey(provider, key);
      if (result.success) {
        toast.success(
          `Connection verified! Response time: ${result.latencyMs}ms (${provider === "gemini" ? "Gemini" : "OpenRouter"})`,
        );
      } else {
        toast.error(`Connection failed: ${result.error || "Unknown error"}`);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Validation test failed");
    } finally {
      setTestingProvider(null);
    }
  };

  const geminiTestStatus = settings.testStatus?.["gemini"];
  const openrouterTestStatus = settings.testStatus?.["openrouter"];

  return (
    <div className="panel space-y-6 p-6 border-primary/20 bg-card/60 backdrop-blur-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Cpu className="size-4" />
            </span>
            <h2 className="text-base font-semibold tracking-tight">AI Provider & Multi-Model Engine</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Configure default intelligence provider for Chat, Graph Reasoning, and Autonomous Brain Missions.
          </p>
        </div>

        <Badge
          variant="outline"
          className="w-fit border-primary/40 bg-primary/10 text-primary font-mono text-[11px] px-2.5 py-1"
        >
          ACTIVE: {activeProvider.toUpperCase()}
        </Badge>
      </div>

      {/* Active Provider Selector Grid */}
      <div className="space-y-3">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Active Default Brain Provider
        </Label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Lovable AI */}
          <div
            onClick={() => {
              switchProvider("lovable");
              toast.success("Active AI provider switched to Lovable AI");
            }}
            className={`cursor-pointer rounded-xl border p-4 transition-all relative ${
              activeProvider === "lovable"
                ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/40"
                : "border-border/70 bg-card/40 hover:bg-muted/40"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                <span className="text-sm font-semibold">Lovable AI</span>
              </div>
              {activeProvider === "lovable" ? (
                <CheckCircle2 className="size-4 text-primary" />
              ) : (
                <Badge variant="secondary" className="text-[10px]">Built-in</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
              Zero configuration required. Natively integrated with intelligent knowledge synthesis.
            </p>
            <div className="mt-3 flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
              <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Ready Out-of-the-Box
            </div>
          </div>

          {/* Google Gemini */}
          <div
            onClick={() => {
              switchProvider("gemini");
              toast.success("Active AI provider switched to Google Gemini");
            }}
            className={`cursor-pointer rounded-xl border p-4 transition-all relative ${
              activeProvider === "gemini"
                ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/40"
                : "border-border/70 bg-card/40 hover:bg-muted/40"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="size-4 text-amber-400" />
                <span className="text-sm font-semibold">Google Gemini</span>
              </div>
              {activeProvider === "gemini" ? (
                <CheckCircle2 className="size-4 text-primary" />
              ) : (
                <Badge variant="outline" className="text-[10px] border-amber-400/30 text-amber-400">Direct API</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
              Gemini 2.0 Flash & 1.5 Pro. High speed, massive context window, and Google AI Studio keys.
            </p>
            <div className="mt-3 text-[11px]">
              {settings.geminiApiKey ? (
                <span className="text-emerald-400 font-medium">Key Configured</span>
              ) : (
                <span className="text-amber-400/80">Key Required</span>
              )}
            </div>
          </div>

          {/* OpenRouter */}
          <div
            onClick={() => {
              switchProvider("openrouter");
              toast.success("Active AI provider switched to OpenRouter");
            }}
            className={`cursor-pointer rounded-xl border p-4 transition-all relative ${
              activeProvider === "openrouter"
                ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/40"
                : "border-border/70 bg-card/40 hover:bg-muted/40"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="size-4 text-blue-400" />
                <span className="text-sm font-semibold">OpenRouter</span>
              </div>
              {activeProvider === "openrouter" ? (
                <CheckCircle2 className="size-4 text-primary" />
              ) : (
                <Badge variant="outline" className="text-[10px] border-blue-400/30 text-blue-400">Unified</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
              Claude 3.5 Sonnet, GPT-4o, DeepSeek V3, and Llama 3.3. Complete model freedom with unified billing.
            </p>
            <div className="mt-3 text-[11px]">
              {settings.openrouterApiKey ? (
                <span className="text-emerald-400 font-medium">Key Configured</span>
              ) : (
                <span className="text-blue-400/80">Key Required</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Provider Details & Key Configuration */}
      <div className="space-y-5 pt-2">
        {/* Google Gemini Configuration Section */}
        <div className="rounded-xl border border-border/80 bg-muted/10 p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Key className="size-4 text-amber-400" />
              <h3 className="text-sm font-semibold">Google Gemini Configuration</h3>
            </div>
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
            >
              <span>احصل على مفتاح Gemini (Google AI Studio)</span>
              <ExternalLink className="size-3" />
            </a>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">API Key</Label>
              <div className="relative">
                <Input
                  type={showGeminiKey ? "text" : "password"}
                  placeholder="AIzaSy..."
                  value={geminiKeyInput}
                  onChange={(e) => setGeminiKeyInput(e.target.value)}
                  className="pr-10 text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowGeminiKey(!showGeminiKey)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showGeminiKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Default Model</Label>
              <Select
                value={settings.geminiModel}
                onValueChange={(val) => updateSettings({ geminiModel: val })}
              >
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  {GEMINI_AVAILABLE_MODELS.map((m) => (
                    <SelectItem key={m.id} value={m.id} className="text-xs">
                      <div className="flex flex-col">
                        <span className="font-medium">{m.label}</span>
                        <span className="text-[10px] text-muted-foreground">{m.desc}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Test & Status */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/50">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                disabled={isValidating || !geminiKeyInput.trim()}
                onClick={() => handleTest("gemini")}
              >
                {testingProvider === "gemini" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Zap className="size-3.5 text-amber-400" />
                )}
                Test Connection
              </Button>
            </div>

            {geminiTestStatus && (
              <div className="flex items-center gap-2">
                {geminiTestStatus.success ? (
                  <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 gap-1 text-[11px]">
                    <CheckCircle2 className="size-3" />
                    {geminiTestStatus.latencyMs}ms — Valid
                  </Badge>
                ) : (
                  <Badge className="bg-destructive/10 text-destructive border-destructive/30 gap-1 text-[11px] max-w-xs truncate">
                    <AlertCircle className="size-3 shrink-0" />
                    {geminiTestStatus.error || "Rejected"}
                  </Badge>
                )}
              </div>
            )}
          </div>
        </div>

        {/* OpenRouter Configuration Section */}
        <div className="rounded-xl border border-border/80 bg-muted/10 p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Key className="size-4 text-blue-400" />
              <h3 className="text-sm font-semibold">OpenRouter Configuration</h3>
            </div>
            <a
              href="https://openrouter.ai/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-medium"
            >
              <span>احصل على مفتاح OpenRouter</span>
              <ExternalLink className="size-3" />
            </a>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">API Key</Label>
              <div className="relative">
                <Input
                  type={showOpenrouterKey ? "text" : "password"}
                  placeholder="sk-or-v1-..."
                  value={openrouterKeyInput}
                  onChange={(e) => setOpenrouterKeyInput(e.target.value)}
                  className="pr-10 text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowOpenrouterKey(!showOpenrouterKey)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showOpenrouterKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Default Model</Label>
              <Select
                value={settings.openrouterModel}
                onValueChange={(val) => updateSettings({ openrouterModel: val })}
              >
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  {OPENROUTER_AVAILABLE_MODELS.map((m) => (
                    <SelectItem key={m.id} value={m.id} className="text-xs">
                      <div className="flex flex-col">
                        <span className="font-medium">{m.label}</span>
                        <span className="text-[10px] text-muted-foreground">{m.desc}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Test & Status */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/50">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5"
                disabled={isValidating || !openrouterKeyInput.trim()}
                onClick={() => handleTest("openrouter")}
              >
                {testingProvider === "openrouter" ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Zap className="size-3.5 text-blue-400" />
                )}
                Test Connection
              </Button>
            </div>

            {openrouterTestStatus && (
              <div className="flex items-center gap-2">
                {openrouterTestStatus.success ? (
                  <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 gap-1 text-[11px]">
                    <CheckCircle2 className="size-3" />
                    {openrouterTestStatus.latencyMs}ms — Valid
                  </Badge>
                ) : (
                  <Badge className="bg-destructive/10 text-destructive border-destructive/30 gap-1 text-[11px] max-w-xs truncate">
                    <AlertCircle className="size-3 shrink-0" />
                    {openrouterTestStatus.error || "Rejected"}
                  </Badge>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <Button onClick={handleSaveKeys} className="gap-2">
          <CheckCircle2 className="size-4" />
          Save AI Preferences & Keys
        </Button>
      </div>
    </div>
  );
}

// =====================================================================
// KNOWLEDGE BRAIN — P1: GLOBAL FLOATING QUICK-CAPTURE ACTION
// Keyboard shortcut (Cmd+Shift+K / Ctrl+Shift+K / Cmd+Shift+N) & FAB
// Freeform text, note or code snippet with Voice Input & Live Extraction Preview
// =====================================================================

import React, { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Zap,
  Plus,
  Brain,
  Link as LinkIcon,
  ShieldCheck,
  HelpCircle,
  CheckCircle2,
  X,
  Search,
  Sparkles,
  Loader2,
  Mic,
  MicOff,
  Globe,
  Tag,
  Code,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  safeCreateClaim,
  safeAttachEvidence,
  safeCreateKnowledgeNode,
  normalizeSourceUrl,
} from "@/lib/knowledge-engine";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { MockExtractionEngine } from "@/lib/ai/extraction/mock-extractor";

interface QuickNodeItem {
  id: string;
  canonical_name: string;
  node_type?: string;
}

interface ExtractedPreview {
  entities: Array<{ name: string; node_type: string; confidence: number }>;
  claims: Array<{ statement: string; confidence: number }>;
}

export function QuickCaptureModal() {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form Fields
  const [statement, setStatement] = useState("");
  const [nodeQuery, setNodeQuery] = useState("");
  const [selectedNode, setSelectedNode] = useState<QuickNodeItem | null>(null);
  const [stance, setStance] = useState<"supported" | "hypothesis" | "verified">("supported");
  const [sourceUrl, setSourceUrl] = useState("");
  const [citationTitle, setCitationTitle] = useState("");

  // Autocomplete State
  const [nodeSuggestions, setNodeSuggestions] = useState<QuickNodeItem[]>([]);
  const [isSearchingNodes, setIsSearchingNodes] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Live Extraction Preview State
  const [extractedPreview, setExtractedPreview] = useState<ExtractedPreview | null>(null);
  const [isExtractingPreview, setIsExtractingPreview] = useState(false);
  const extractDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Voice Input Integration (Bilingual Arabic/English)
  const [voiceLanguage, setVoiceLanguage] = useState<"ar-SA" | "en-US">("ar-SA");
  const {
    isListening,
    toggleListening,
    setLanguage: setVoiceLang,
  } = useVoiceInput({
    lang: voiceLanguage,
    onResult: (spokenText) => {
      setStatement((prev) => (prev ? `${prev.trim()} ${spokenText.trim()}` : spokenText));
    },
  });

  // Global Keyboard shortcuts: Cmd+Shift+K / Ctrl+Shift+K & Cmd+Shift+N / Ctrl+Shift+N
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      if (
        isCmdOrCtrl &&
        e.shiftKey &&
        (e.key === "k" || e.key === "K" || e.key === "n" || e.key === "N")
      ) {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Background Lightweight Entity & Claim Extraction Pipeline
  useEffect(() => {
    const text = statement.trim();
    if (text.length < 12) {
      setExtractedPreview(null);
      return;
    }

    if (extractDebounceRef.current) clearTimeout(extractDebounceRef.current);

    extractDebounceRef.current = setTimeout(() => {
      setIsExtractingPreview(true);
      try {
        const raw = MockExtractionEngine.extract([{ role: "user", content: text }]);
        const entities = (raw.entities || []).map((e) => ({
          name: e.name,
          node_type: e.entity_type || "concept",
          confidence: e.confidence ?? 0.9,
        }));
        const claims = (raw.claims || []).map((c) => ({
          statement: c.statement,
          confidence: c.confidence ?? 0.88,
        }));

        if (entities.length > 0 || claims.length > 0) {
          setExtractedPreview({ entities, claims });
          // If no node selected yet, suggest the top extracted entity
          if (!selectedNode && !nodeQuery.trim() && entities[0]) {
            setNodeQuery(entities[0].name);
          }
        } else {
          // Heuristic extraction for code or notes (extract capitalized keywords or tech terms)
          const techTokens = text.match(
            /\b(?:React|Vue|Laravel|Python|Docker|Kubernetes|PostgreSQL|Redis|TypeScript|Node\.js|GraphQL|Next\.js|LLM|Transformer|Embedding|[A-Z][a-zA-Z0-9_\-\.]+)\b/g,
          );
          if (techTokens && techTokens.length > 0) {
            const unique = Array.from(new Set(techTokens)).slice(0, 3);
            setExtractedPreview({
              entities: unique.map((token) => ({
                name: token,
                node_type: "concept",
                confidence: 0.9,
              })),
              claims: [{ statement: text.slice(0, 160), confidence: 0.85 }],
            });
            if (!selectedNode && !nodeQuery.trim() && unique[0]) {
              setNodeQuery(unique[0]);
            }
          } else {
            setExtractedPreview(null);
          }
        }
      } catch {
        setExtractedPreview(null);
      } finally {
        setIsExtractingPreview(false);
      }
    }, 350);

    return () => {
      if (extractDebounceRef.current) clearTimeout(extractDebounceRef.current);
    };
  }, [statement, selectedNode, nodeQuery]);

  // Search Knowledge Nodes with lexical search and fuzzy fallback
  useEffect(() => {
    if (!nodeQuery.trim()) {
      setNodeSuggestions([]);
      setShowDropdown(false);
      return;
    }

    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);

    searchDebounceRef.current = setTimeout(async () => {
      setIsSearchingNodes(true);
      try {
        // 1. Try PostgreSQL RPC search_knowledge_nodes_lexical
        const { data: rpcData, error: rpcError } = await supabase.rpc(
          "search_knowledge_nodes_lexical" as any,
          {
            p_query: nodeQuery.trim(),
            p_limit: 5,
          },
        );

        if (!rpcError && Array.isArray(rpcData) && rpcData.length > 0) {
          setNodeSuggestions(
            rpcData.map((d: any) => ({
              id: d.id,
              canonical_name: d.canonical_name || d.title || d.name,
              node_type: d.node_type || "concept",
            })),
          );
          setShowDropdown(true);
          return;
        }

        // 2. Direct ILIKE fallback query
        const { data: directData } = await supabase
          .from("knowledge_nodes")
          .select("id, canonical_name, node_type")
          .ilike("canonical_name", `%${nodeQuery.trim()}%`)
          .limit(5);

        if (directData && directData.length > 0) {
          setNodeSuggestions(
            directData.map((d: any) => ({
              id: d.id,
              canonical_name: d.canonical_name,
              node_type: d.node_type,
            })),
          );
          setShowDropdown(true);
        } else {
          setNodeSuggestions([]);
          setShowDropdown(true);
        }
      } catch {
        setNodeSuggestions([]);
      } finally {
        setIsSearchingNodes(false);
      }
    }, 200);

    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [nodeQuery]);

  const handleSelectNode = (node: QuickNodeItem) => {
    setSelectedNode(node);
    setNodeQuery(node.canonical_name);
    setShowDropdown(false);
  };

  const handleClearNode = () => {
    setSelectedNode(null);
    setNodeQuery("");
    setShowDropdown(false);
  };

  const resetForm = () => {
    setStatement("");
    setNodeQuery("");
    setSelectedNode(null);
    setStance("supported");
    setSourceUrl("");
    setCitationTitle("");
    setExtractedPreview(null);
    setIsSubmitting(false);
  };

  const handleSaveToBrain = async () => {
    const trimmedStatement = statement.trim();
    if (!trimmedStatement) {
      toast.error("Please enter a fact, note, or claim statement.");
      return;
    }

    if (trimmedStatement.length < 5) {
      toast.error("Fact statement should be at least 5 characters long.");
      return;
    }

    setIsSubmitting(true);
    const loadingToast = toast.loading("Saving to Knowledge Brain...");

    try {
      let targetNodeId: string | null = selectedNode?.id ?? null;

      // 1. If user typed a node name that is not an existing node, create a new concept node safely
      if (!targetNodeId && nodeQuery.trim()) {
        try {
          const createNodeResult = await safeCreateKnowledgeNode(supabase, {
            name: nodeQuery.trim(),
            node_type: "concept",
            status: "active",
          });

          if (createNodeResult.node?.id) {
            targetNodeId = createNodeResult.node.id;
          }
        } catch (nodeErr) {
          console.warn("[QuickCapture] Failed to auto-create node:", nodeErr);
        }
      }

      // 2. Map stance to confidence and claim_type
      const confidence = stance === "verified" ? 1.0 : stance === "supported" ? 0.9 : 0.65;
      const claimType = stance === "hypothesis" ? "hypothesis" : "fact";

      // 3. Create verified claim
      const claimResult = await safeCreateClaim(supabase, {
        node_id: targetNodeId,
        statement: trimmedStatement,
        claim_type: claimType,
        confidence,
        status: "active",
      });

      if (!claimResult.created || !claimResult.claim) {
        throw new Error(claimResult.message || "Failed to create claim in Knowledge Brain.");
      }

      const createdClaim = claimResult.claim;

      // 4. Attach evidence if source URL or citation provided
      const trimmedUrl = sourceUrl.trim();
      const trimmedTitle = citationTitle.trim();

      if (trimmedUrl || trimmedTitle) {
        const normalized = trimmedUrl ? normalizeSourceUrl(trimmedUrl) : null;
        const title = trimmedTitle || trimmedUrl || "User Quick Capture Source";

        // Insert or find source
        const { data: newSource, error: sourceErr } = await supabase
          .from("sources")
          .insert({
            title,
            url: normalized,
            source_kind: normalized ? "website" : "user",
          })
          .select("id")
          .single();

        if (!sourceErr && newSource) {
          await safeAttachEvidence(supabase, {
            claim_id: createdClaim.id,
            source_id: newSource.id,
            stance: stance === "hypothesis" ? "mentions" : "supported",
            excerpt: trimmedStatement,
            locator: normalized ?? undefined,
            evidence_type: "user_note",
            confidence,
          });
        }
      }

      // 5. If verified stance was explicitly chosen, mark verification status
      if (stance === "verified") {
        await supabase
          .from("knowledge_claims")
          .update({
            verification: "verified",
            updated_at: new Date().toISOString(),
          })
          .eq("id", createdClaim.id);
      }

      // 6. Invalidate caches for instant reactivity
      void queryClient.invalidateQueries({ queryKey: ["knowledge_claims"] });
      void queryClient.invalidateQueries({ queryKey: ["knowledge_nodes"] });
      void queryClient.invalidateQueries({ queryKey: ["brain-stats"] });
      void queryClient.invalidateQueries({ queryKey: ["graph-stats"] });

      toast.success(
        `⚡ Quick Captured: Claim "${trimmedStatement.slice(0, 38)}..." saved to Brain!`,
        { id: loadingToast, duration: 4000 },
      );

      resetForm();
      setIsOpen(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to capture note", {
        id: loadingToast,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {/* Floating Action Button (FAB) positioned bottom-right */}
      <div className="fixed bottom-6 right-6 z-40 flex items-center group">
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 px-3.5 py-2.5 rounded-full bg-primary text-primary-foreground font-medium text-xs shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:scale-105 active:scale-95 transition-all duration-200 border border-primary/40"
          title="Quick Brain Capture (Ctrl+Shift+K / ⌘+Shift+K / ⌘⇧N)"
          aria-label="Quick Brain Capture"
        >
          <Zap className="size-4 animate-pulse fill-primary-foreground/30" />
          <span className="hidden sm:inline">Quick Capture</span>
          <span className="text-[10px] opacity-75 font-mono px-1 py-0.2 bg-primary-foreground/15 rounded hidden md:inline">
            ⌘⇧K
          </span>
        </button>
      </div>

      {/* Quick Capture Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-lg border-border/80 bg-card/95 backdrop-blur-md shadow-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary">
                <Zap className="size-4" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold">
                  Quick Brain Capture / تدوين فوري
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Capture facts, code snippets, and verified claims directly to the Knowledge Brain.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Note / Fact Content Input with Voice Dictation */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="quick-claim-statement" className="text-xs font-medium">
                  Note, Fact, or Code Snippet <span className="text-destructive">*</span>
                </Label>
                <div className="flex items-center gap-1.5">
                  {/* Language switch */}
                  <button
                    type="button"
                    onClick={() => {
                      const next = voiceLanguage === "ar-SA" ? "en-US" : "ar-SA";
                      setVoiceLanguage(next);
                      setVoiceLang(next);
                    }}
                    className="text-[10px] text-muted-foreground hover:text-foreground p-0.5 rounded"
                    title="Toggle Voice Language"
                  >
                    <Globe className="size-3 inline mr-0.5" />
                    <span className="font-mono text-[9px]">{voiceLanguage === "ar-SA" ? "AR" : "EN"}</span>
                  </button>

                  {/* Dictation button */}
                  <Button
                    type="button"
                    variant={isListening ? "destructive" : "ghost"}
                    size="sm"
                    onClick={() => toggleListening()}
                    className={`h-6 px-1.5 text-[10px] gap-1 ${
                      isListening ? "animate-pulse" : "text-muted-foreground hover:text-foreground"
                    }`}
                    title={isListening ? "Stop listening" : "Dictate with voice"}
                  >
                    {isListening ? <MicOff className="size-3" /> : <Mic className="size-3" />}
                    <span>{isListening ? "Listening..." : "Dictate"}</span>
                  </Button>
                </div>
              </div>
              <Textarea
                id="quick-claim-statement"
                placeholder="Write a factual note, hypothesis, or code snippet... (e.g. 'PostgreSQL indexes use B-Trees by default')"
                value={statement}
                onChange={(e) => setStatement(e.target.value)}
                rows={3}
                className="resize-none text-xs leading-relaxed"
                autoFocus
              />
            </div>

            {/* AI Lightweight Extraction Preview */}
            {isExtractingPreview ? (
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground py-1">
                <Loader2 className="size-3 animate-spin text-primary" />
                <span>Extracting candidate concepts and claims...</span>
              </div>
            ) : extractedPreview && (extractedPreview.entities.length > 0 || extractedPreview.claims.length > 0) ? (
              <div className="rounded-lg border border-primary/25 bg-primary/5 p-2.5 space-y-1.5 animate-in fade-in-50 text-xs">
                <div className="flex items-center justify-between text-[11px] font-medium text-primary">
                  <span className="flex items-center gap-1">
                    <Sparkles className="size-3" />
                    <span>AI Extracted Preview</span>
                  </span>
                  <span className="text-[10px] text-muted-foreground">Click concept to tag</span>
                </div>

                {extractedPreview.entities.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Tag className="size-2.5" /> Concepts:
                    </span>
                    {extractedPreview.entities.map((ent, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setNodeQuery(ent.name);
                        }}
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors border ${
                          nodeQuery.toLowerCase() === ent.name.toLowerCase()
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background text-foreground hover:bg-muted border-border"
                        }`}
                      >
                        <span>{ent.name}</span>
                        <span className="text-[9px] opacity-75 font-mono">
                          {Math.round(ent.confidence * 100)}%
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {/* Concept / Node Tag with Autocomplete */}
            <div className="space-y-1.5 relative">
              <Label htmlFor="quick-claim-node" className="text-xs font-medium flex items-center gap-1.5">
                <Brain className="size-3.5 text-primary" />
                <span>Concept / Topic Tag (Optional)</span>
              </Label>

              <div className="relative">
                <Input
                  id="quick-claim-node"
                  placeholder="Tag an existing concept or type a new one..."
                  value={nodeQuery}
                  onChange={(e) => {
                    setNodeQuery(e.target.value);
                    if (selectedNode) setSelectedNode(null);
                  }}
                  onFocus={() => {
                    if (nodeSuggestions.length > 0) setShowDropdown(true);
                  }}
                  className="text-xs pr-8"
                />

                {isSearchingNodes ? (
                  <Loader2 className="size-3.5 animate-spin text-muted-foreground absolute right-2.5 top-1/2 -translate-y-1/2" />
                ) : selectedNode ? (
                  <button
                    type="button"
                    onClick={handleClearNode}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                ) : (
                  <Search className="size-3.5 text-muted-foreground absolute right-2.5 top-1/2 -translate-y-1/2" />
                )}
              </div>

              {/* Suggestions Dropdown */}
              {showDropdown && nodeQuery.trim() && (
                <div className="absolute z-50 w-full mt-1 bg-popover text-popover-foreground border rounded-md shadow-lg overflow-hidden max-h-48 overflow-y-auto text-xs">
                  {nodeSuggestions.map((node) => (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => handleSelectNode(node)}
                      className="w-full text-left px-3 py-2 hover:bg-muted flex items-center justify-between transition-colors border-b border-border/40 last:border-b-0"
                    >
                      <span className="font-medium text-foreground">{node.canonical_name}</span>
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {node.node_type || "concept"}
                      </Badge>
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={() => setShowDropdown(false)}
                    className="w-full text-left px-3 py-2 hover:bg-muted/70 flex items-center gap-1.5 text-primary transition-colors font-medium text-[11px]"
                  >
                    <Plus className="size-3" />
                    <span>Create new concept "{nodeQuery.trim()}"</span>
                  </button>
                </div>
              )}
            </div>

            {/* Stance & Verification Level */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="quick-claim-stance" className="text-xs font-medium">
                  Stance / Confidence
                </Label>
                <Select
                  value={stance}
                  onValueChange={(val: any) => setStance(val)}
                >
                  <SelectTrigger id="quick-claim-stance" className="text-xs h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="verified">
                      <div className="flex items-center gap-1.5 text-xs">
                        <CheckCircle2 className="size-3.5 text-emerald-500" />
                        <span>Verified (100%)</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="supported">
                      <div className="flex items-center gap-1.5 text-xs">
                        <ShieldCheck className="size-3.5 text-cyan-500" />
                        <span>Supported (90%)</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="hypothesis">
                      <div className="flex items-center gap-1.5 text-xs">
                        <HelpCircle className="size-3.5 text-amber-500" />
                        <span>Hypothesis (65%)</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Source Title / Short Description */}
              <div className="space-y-1.5">
                <Label htmlFor="quick-citation-title" className="text-xs font-medium">
                  Source / Citation Title
                </Label>
                <Input
                  id="quick-citation-title"
                  placeholder="e.g. Official Documentation"
                  value={citationTitle}
                  onChange={(e) => setCitationTitle(e.target.value)}
                  className="text-xs h-8"
                />
              </div>
            </div>

            {/* Source URL (Optional) */}
            <div className="space-y-1.5">
              <Label htmlFor="quick-source-url" className="text-xs font-medium flex items-center gap-1.5">
                <LinkIcon className="size-3 text-muted-foreground" />
                <span>Source URL (Optional)</span>
              </Label>
              <Input
                id="quick-source-url"
                placeholder="https://docs.example.com/spec"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                className="text-xs h-8 font-mono"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsOpen(false)}
              disabled={isSubmitting}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveToBrain}
              disabled={!statement.trim() || isSubmitting}
              className="text-xs gap-1.5 bg-primary text-primary-foreground font-medium"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Zap className="size-3.5" />
                  <span>Save to Brain</span>
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// =====================================================================
// KNOWLEDGE BRAIN — PHASE 4: AI CHAT PAGE
// Conversation Memory, Secure LLM Gateway & Read-Only Brain Context
// =====================================================================

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MessagesSquare,
  Network,
  Plus,
  Send,
  Sparkles,
  Bot,
  User,
  RotateCcw,
  AlertCircle,
  MoreVertical,
  Archive,
  Edit2,
  Search,
  Check,
  Brain,
  Sliders,
  PanelLeftClose,
  PanelLeft,
  X,
  Trash2,
  Paperclip,
  HelpCircle,
  AlertTriangle,
  Mic,
  MicOff,
  Globe,
  WifiOff,
  Zap,
} from "lucide-react";
import { useState, useRef, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { OfflineChatStore } from "@/lib/offline/offline-chat-store";
import { AIProviderManager } from "@/lib/ai/provider-manager";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, EmptyState } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ChatMessageMarkdown } from "@/components/chat/ChatMessageMarkdown";
import { BrainContextInspector } from "@/components/chat/BrainContextInspector";
import { KnowledgeActivityDrawer } from "@/components/chat/KnowledgeActivityDrawer";
import { WhyThisAnswerModal } from "@/components/chat/WhyThisAnswerModal";
import { RetrievalInspectorModal } from "@/components/chat/RetrievalInspectorModal";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TokenCostTracker } from "@/lib/ai/token-cost-tracker";
import { ChatConflictResolutionCard } from "@/components/chat/ChatConflictResolutionCard";
import {
  ChatService,
  KnowledgeExtractionService,
  KnowledgeResolutionService,
  type ChatResponseContract,
} from "@/lib/ai";
import type { AnswerMode, GroundingState } from "@/lib/ai/rag";
import { KnowledgeEngine } from "@/lib/ai/learning";
import { BrainUpdateSummaryModal } from "@/components/knowledge/BrainUpdateSummaryModal";
import type { Tables } from "@/integrations/supabase/types";

type ConversationRow = Tables<"conversations">;
type MessageRow = Tables<"messages">;

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "AI Chat — Knowledge Brain" },
      { name: "description", content: "Conversational interface grounded in your verified Knowledge Brain concepts." },
      { property: "og:title", content: "AI Chat — Knowledge Brain" },
      { property: "og:description", content: "Conversational interface grounded in your verified Knowledge Brain concepts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChatPage,
});

export function ChatPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // State
  const initialDraft = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("q") || "";
  }, []);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState(initialDraft);
  const [searchQuery, setSearchQuery] = useState("");
  const [useBrainContext, setUseBrainContext] = useState(true);
  const [selectedModel, setSelectedModel] = useState("brain-assistant-fast");
  const [isGenerating, setIsGenerating] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Inspector modal state
  const [inspectModalOpen, setInspectModalOpen] = useState(false);
  const [inspectReferences, setInspectReferences] = useState<ChatResponseContract["references"] | null>(null);

  // Phase 9: RAG Answer Mode & Attribution Modals
  const [answerMode, setAnswerMode] = useState<AnswerMode>("BRAIN_PREFERRED");
  const [whyModalOpen, setWhyModalOpen] = useState(false);
  const [inspectorModalOpen, setInspectorModalOpen] = useState(false);
  const [selectedResponse, setSelectedResponse] = useState<ChatResponseContract | null>(null);

  // Knowledge Activity drawer state
  const [knowledgeActivityOpen, setKnowledgeActivityOpen] = useState(false);

  // Rename modal state
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameConvId, setRenameConvId] = useState<string | null>(null);
  const [renameTitleDraft, setRenameTitleDraft] = useState("");

  // Offline & Voice Recognition State
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== "undefined" ? !navigator.onLine : false,
  );
  const [speechLang, setSpeechLang] = useState<"ar-SA" | "en-US">("ar-SA");

  // Solo Fast-Capture Mode State (P0)
  const [soloDirectCommit, setSoloDirectCommit] = useState<boolean>(() => {
    return AIProviderManager.getSettings().solo_direct_commit ?? false;
  });

  const {
    isListening: isVoiceListening,
    setCurrentLang: setVoiceLang,
    toggleListening: toggleVoiceListening,
  } = useSpeechRecognition({
    lang: speechLang,
    onResult: (spokenText) => {
      setDraft((prev) => (prev ? `${prev.trim()} ${spokenText.trim()}` : spokenText));
    },
  });

  useEffect(() => {
    const handleOff = () => setIsOffline(true);
    const handleOn = () => {
      setIsOffline(false);
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      if (activeId) void queryClient.invalidateQueries({ queryKey: ["messages", activeId] });
    };
    window.addEventListener("offline", handleOff);
    window.addEventListener("online", handleOn);
    window.addEventListener("knowledge-brain:offline-synced", handleOn);
    return () => {
      window.removeEventListener("offline", handleOff);
      window.removeEventListener("online", handleOn);
      window.removeEventListener("knowledge-brain:offline-synced", handleOn);
    };
  }, [queryClient, activeId]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom when messages update
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // 1. Fetch Conversations (with IndexedDB offline cache fallback)
  const { data: conversations = [], isLoading: loadingConversations } = useQuery<ConversationRow[]>({
    queryKey: ["conversations"],
    enabled: !!session,
    queryFn: async (): Promise<ConversationRow[]> => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return (await OfflineChatStore.getCachedConversations()) as unknown as ConversationRow[];
      }
      try {
        const { data, error } = await supabase
          .from("conversations")
          .select("*")
          .is("deleted_at", null)
          .order("updated_at", { ascending: false });
        if (error) throw error;
        const convList = (data ?? []) as ConversationRow[];
        await OfflineChatStore.cacheConversations(convList as any);
        return convList;
      } catch (err) {
        const cached = await OfflineChatStore.getCachedConversations();
        if (cached && cached.length > 0) return cached as unknown as ConversationRow[];
        throw err;
      }
    },
  });

  // Auto-select latest active conversation on first load if available
  useEffect(() => {
    if (!activeId && conversations.length > 0) {
      const firstActive = conversations.find((c: ConversationRow) => c.status === "active") ?? conversations[0];
      if (firstActive) {
        setActiveId(firstActive.id);
      }
    }
  }, [conversations, activeId]);

  // 2. Fetch Messages for active conversation (with IndexedDB offline cache fallback)
  const { data: messages = [], isLoading: loadingMessages } = useQuery<MessageRow[]>({
    queryKey: ["messages", activeId],
    enabled: !!activeId,
    queryFn: async (): Promise<MessageRow[]> => {
      if (!activeId) return [];
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return (await OfflineChatStore.getCachedMessages(activeId)) as unknown as MessageRow[];
      }
      try {
        const { data, error } = await supabase
          .from("messages")
          .select("*")
          .eq("conversation_id", activeId)
          .order("created_at", { ascending: true });
        if (error) throw error;
        const msgList = (data ?? []) as MessageRow[];
        await OfflineChatStore.cacheMessages(activeId, msgList as any);
        return msgList;
      } catch (err) {
        const cached = await OfflineChatStore.getCachedMessages(activeId);
        if (cached && cached.length > 0) return cached as unknown as MessageRow[];
        throw err;
      }
    },
  });

  useEffect(() => {
    scrollToBottom();
  }, [messages, isGenerating]);

  const activeConversation = conversations.find((c: ConversationRow) => c.id === activeId);

  // 3. Create Conversation Mutation
  const createConversationMutation = useMutation({
    mutationFn: async (title?: string) => {
      return await ChatService.createConversation(title);
    },
    onSuccess: (newConv) => {
      setActiveId(newConv.id);
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Solo Fast-Capture Mode Auto-Commit Handler (P0)
  const triggerSoloAutoCommit = async (convId: string) => {
    try {
      const extractionResult = await KnowledgeExtractionService.extractFromConversation(convId);
      if (
        !extractionResult ||
        extractionResult.relevance === "CONVERSATIONAL_ONLY" ||
        extractionResult.relevance === "USER_PREFERENCE" ||
        extractionResult.counts.total_proposals === 0
      ) {
        return;
      }

      const resolutionService = new KnowledgeResolutionService(supabase);
      await resolutionService.resolveExtractionRun(extractionResult.extraction_run_id);

      const engine = new KnowledgeEngine(supabase);
      const plan = await engine.planExtractionRun(extractionResult.extraction_run_id, convId);

      const nonNoopOps = plan.operations.filter((op) => op.operation_type !== "NO_OP");
      const isSafeSolo =
        nonNoopOps.length > 0 &&
        nonNoopOps.every((op) => {
          const isAllowedType = ["CREATE_NODE", "CREATE_RELATION", "ADD_ALIAS", "ADD_CLAIM"].includes(
            op.operation_type,
          );
          const isHighConfidence = (op.confidence ?? 0) >= 0.85;
          const isNotConflicting =
            !op.payload?.is_conflicting &&
            op.risk_level !== "high" &&
            op.status !== "failed" &&
            op.status !== "rejected";
          return isAllowedType && isHighConfidence && isNotConflicting;
        });

      if (isSafeSolo && plan.status !== "needs_review") {
        await engine.approvePlan(plan.id);
        const commitRes = await engine.commitPlan(plan.id);

        void queryClient.invalidateQueries({ queryKey: ["nodes"] });
        void queryClient.invalidateQueries({ queryKey: ["knowledge-proposals", convId] });
        void queryClient.invalidateQueries({ queryKey: ["knowledge-plans"] });
        void queryClient.invalidateQueries({ queryKey: ["brain-stats"] });

        const conceptName =
          nonNoopOps.find((op) => op.operation_type === "CREATE_NODE")?.payload?.name ||
          nonNoopOps.find((op) => op.operation_type === "CREATE_NODE")?.payload?.canonical_name ||
          "Concept";
        const claimsCount =
          commitRes.summary.added_claims ||
          nonNoopOps.filter((o) => o.operation_type === "ADD_CLAIM").length;

        toast.success(`⚡ Knowledge Auto-Committed: Added ${conceptName} & ${claimsCount} verified claims.`, {
          duration: 9000,
          action: {
            label: "Undo",
            onClick: async () => {
              const undone = await engine.undoPlanCommit(plan.id);
              if (undone) {
                void queryClient.invalidateQueries({ queryKey: ["nodes"] });
                void queryClient.invalidateQueries({ queryKey: ["knowledge-plans"] });
                void queryClient.invalidateQueries({ queryKey: ["brain-stats"] });
                toast.success("Auto-committed knowledge reverted.");
              }
            },
          },
        });
      } else {
        toast.info("Knowledge proposals extracted — awaiting manual review in Proposals queue.", {
          description: "Plan contains conflicts, merges, or requires confirmation.",
        });
      }
    } catch (err) {
      console.warn("[SoloAutoCommit] Non-blocking auto-commit notice:", err);
    }
  };

  // 4. Send Message Mutation (AI Gateway & Offline Queue)
  const sendMessageMutation = useMutation({
    mutationFn: async ({
      messageText,
      isRetry,
      retryMsgId,
    }: {
      messageText: string;
      isRetry?: boolean;
      retryMsgId?: string;
    }) => {
      let targetConvId = activeId;

      // Create conversation if none active
      if (!targetConvId) {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          targetConvId = `offline-conv-${Date.now()}`;
          const newOfflineConv = {
            id: targetConvId,
            title: messageText.slice(0, 36),
            status: "active",
            updated_at: new Date().toISOString(),
          };
          await OfflineChatStore.cacheConversations([newOfflineConv as any]);
          setActiveId(targetConvId);
        } else {
          const newConv = await ChatService.createConversation(messageText.slice(0, 36));
          targetConvId = newConv.id;
          setActiveId(newConv.id);
        }
      }

      // Check if client is currently offline
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        const queuedId = `offline-msg-${Date.now()}`;
        await OfflineChatStore.enqueueOfflineMessage({
          conversationId: targetConvId,
          message: messageText,
          options: {
            use_brain_context: useBrainContext,
            model: selectedModel,
            answer_mode: answerMode,
          },
        });

        // Add optimistic offline message to local store
        const existing = await OfflineChatStore.getCachedMessages(targetConvId);
        const optimisticMsg = {
          id: queuedId,
          conversation_id: targetConvId,
          role: "user" as const,
          content: messageText,
          created_at: new Date().toISOString(),
          metadata: { status: "queued_offline", brain_context_used: false },
        };
        await OfflineChatStore.cacheMessages(targetConvId, [...existing, optimisticMsg as any]);
        queryClient.setQueryData(["messages", targetConvId], (old: any) => [...(old || []), optimisticMsg]);

        toast.info("أنت في وضع عدم الاتصال. تم حفظ رسالتك محلياً وستُرسل تلقائياً عند استعادة الاتصال.", {
          icon: "📡",
        });

        return { response: null, targetConvId, isOfflineQueued: true };
      }

      setIsGenerating(true);

      const idempotencyKey = `req-${targetConvId}-${Date.now()}`;

      try {
        const response = await ChatService.sendMessage({
          conversation_id: targetConvId,
          message: messageText,
          options: {
            use_brain_context: useBrainContext,
            model: selectedModel,
            idempotency_key: idempotencyKey,
            is_retry: isRetry,
            retry_user_message_id: retryMsgId,
            answer_mode: answerMode,
          },
        });
        return { response, targetConvId, isOfflineQueued: false };
      } finally {
        setIsGenerating(false);
      }
    },
    onSuccess: (result) => {
      setDraft("");
      if (!result.isOfflineQueued) {
        void queryClient.invalidateQueries({ queryKey: ["messages", result.targetConvId] });
        void queryClient.invalidateQueries({ queryKey: ["conversations"] });
        void queryClient.invalidateQueries({ queryKey: ["brain-stats"] });

        if (soloDirectCommit && result.response && result.targetConvId) {
          void triggerSoloAutoCommit(result.targetConvId);
        }
      }
    },
    onError: (err: Error) => {
      setIsGenerating(false);
      toast.error(`Message error: ${err.message}`);
    },
  });

  // 5. Rename Conversation Mutation
  const renameMutation = useMutation({
    mutationFn: async () => {
      if (!renameConvId || !renameTitleDraft.trim()) return;
      await ChatService.renameConversation(renameConvId, renameTitleDraft);
    },
    onSuccess: () => {
      setRenameDialogOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Conversation renamed.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // 6. Archive Conversation Mutation
  const archiveMutation = useMutation({
    mutationFn: async (convId: string) => {
      await ChatService.archiveConversation(convId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Conversation archived.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // 7. Delete Conversation Mutation (Soft-delete)
  const deleteMutation = useMutation({
    mutationFn: async (convId: string) => {
      await ChatService.deleteConversation(convId);
      if (activeId === convId) {
        setActiveId(null);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Conversation deleted.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // 8. Fetch Extracted Proposals for Active Conversation
  const { data: activeProposals = [] } = useQuery({
    queryKey: ["knowledge-proposals", activeId],
    enabled: !!activeId,
    queryFn: async () => {
      if (!activeId) return [];
      return await KnowledgeExtractionService.getProposals({ conversationId: activeId });
    },
  });

  // 9. Extract Knowledge Candidates Mutation
  const extractMutation = useMutation({
    mutationFn: async () => {
      if (!activeId) return;
      return await KnowledgeExtractionService.extractFromConversation(activeId);
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["knowledge-proposals", activeId] });
      void queryClient.invalidateQueries({ queryKey: ["knowledge-proposals"] });
      if (!result) return;
      if (result.relevance === "CONVERSATIONAL_ONLY" || result.relevance === "USER_PREFERENCE") {
        toast.info(`Dialogue classified as ${result.relevance.replace("_", " ")}`, {
          description: "No factual knowledge proposals were extracted.",
        });
      } else {
        toast.success(`Extracted ${result.counts.total_proposals} candidate proposals!`, {
          description: `${result.counts.entities} concepts, ${result.counts.claims} claims, ${result.counts.relations} relations.`,
        });
        setKnowledgeActivityOpen(true);
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Phase 7: Controlled Automatic Learning Pipeline
  const [learningStatus, setLearningStatus] = useState<
    "idle" | "analyzing" | "detected" | "resolving" | "planning" | "needs_review" | "brain_updated" | "no_new_knowledge" | "failed"
  >("idle");
  const [learnedSummary, setLearnedSummary] = useState<any>(null);
  const [summaryModalOpen, setSummaryModalOpen] = useState(false);

  const learnThisMutation = useMutation({
    mutationFn: async () => {
      if (!activeId) return null;
      setLearningStatus("analyzing");

      // Step 1: Extract
      const extractionResult = await KnowledgeExtractionService.extractFromConversation(activeId);
      if (
        !extractionResult ||
        extractionResult.relevance === "CONVERSATIONAL_ONLY" ||
        extractionResult.relevance === "USER_PREFERENCE"
      ) {
        setLearningStatus("no_new_knowledge");
        return { status: "no_new_knowledge" };
      }

      setLearningStatus("resolving");
      // Step 2: Resolve entities against existing Brain
      const resolutionService = new KnowledgeResolutionService(supabase);
      await resolutionService.resolveExtractionRun(extractionResult.extraction_run_id);

      setLearningStatus("planning");
      // Step 3: Knowledge Engine Diff & Plan
      const engine = new KnowledgeEngine(supabase);
      const plan = await engine.planExtractionRun(extractionResult.extraction_run_id, activeId);

      // Step 4: Check if auto-commit or needs review
      if (plan.status === "needs_review") {
        setLearningStatus("needs_review");
        return { status: "needs_review", plan };
      } else {
        // Safe auto-commit permitted under current policy
        await engine.approvePlan(plan.id);
        const commitRes = await engine.commitPlan(plan.id);
        setLearningStatus("brain_updated");
        setLearnedSummary(commitRes.summary);
        setSummaryModalOpen(true);
        return { status: "committed", commitRes };
      }
    },
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ["knowledge-proposals", activeId] });
      void queryClient.invalidateQueries({ queryKey: ["knowledge-proposals"] });
      void queryClient.invalidateQueries({ queryKey: ["knowledge-plans"] });
      void queryClient.invalidateQueries({ queryKey: ["knowledge-transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["operations"] });
      void queryClient.invalidateQueries({ queryKey: ["canonical-nodes-lookup"] });

      if (!res) return;
      if (res.status === "no_new_knowledge") {
        toast.info("No factual canonical knowledge detected in this dialogue.");
      } else if (res.status === "needs_review") {
        toast.info("Knowledge Plan created: awaiting review in Proposals Queue.", {
          description: "High-confidence / high-risk operations queued for approval.",
        });
      } else if (res.status === "committed") {
        toast.success("Brain Updated Successfully!", {
          description: "Controlled automatic learning executed through Knowledge Engine.",
        });
      }
    },
    onError: (err: Error) => {
      setLearningStatus("failed");
      toast.error(`Learning failed: ${err.message}`);
    },
  });

  // Handle Send submission
  const handleSend = () => {
    const text = draft.trim();
    if (!text || isGenerating) return;
    sendMessageMutation.mutate({ messageText: text });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Filter conversations
  const filteredConversations = conversations.filter((c: ConversationRow) =>
    (c.title ?? "Untitled").toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <AppShell
      title="AI Chat"
      description="Conversational intelligence with read-only Knowledge Brain grounding."
      actions={
        <div className="flex items-center gap-2">
          {isOffline && (
            <Badge variant="outline" className="text-xs gap-1.5 text-amber-500 border-amber-500/40 bg-amber-500/10 py-1 font-normal">
              <WifiOff className="size-3 animate-pulse" />
              <span>وضع أوفلاين (IndexedDB)</span>
            </Badge>
          )}

          {/* Subtle learning indicator in chat */}
          {learningStatus !== "idle" && (
            <div className="flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs">
              {learningStatus === "analyzing" && (
                <>
                  <Sparkles className="size-3 animate-spin text-primary" />
                  <span className="text-[11px] text-muted-foreground">Analyzing…</span>
                </>
              )}
              {learningStatus === "resolving" && (
                <>
                  <RotateCcw className="size-3 animate-spin text-blue-400" />
                  <span className="text-[11px] text-muted-foreground">Resolving…</span>
                </>
              )}
              {learningStatus === "planning" && (
                <>
                  <Brain className="size-3 animate-pulse text-purple-400" />
                  <span className="text-[11px] text-muted-foreground">Planning…</span>
                </>
              )}
              {learningStatus === "needs_review" && (
                <span className="text-[11px] text-amber-400 font-medium">
                  Needs Review (Queued)
                </span>
              )}
              {learningStatus === "brain_updated" && (
                <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                  <Check className="size-3" /> Brain Updated
                </span>
              )}
              {learningStatus === "no_new_knowledge" && (
                <span className="text-[11px] text-muted-foreground">
                  No New Knowledge
                </span>
              )}
              {learningStatus === "failed" && (
                <span className="text-[11px] text-rose-400">
                  Learning Failed
                </span>
              )}
            </div>
          )}

          {activeId && messages.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => learnThisMutation.mutate()}
              disabled={learnThisMutation.isPending || isGenerating}
              className="gap-1.5 text-xs border-primary/30 text-primary hover:bg-primary/10"
            >
              <Sparkles className="size-3.5" />
              {learnThisMutation.isPending ? "Learning…" : "Learn This"}
            </Button>
          )}

          <Button
            size="sm"
            onClick={() => {
              if (activeId && messages.length === 0) {
                textareaRef.current?.focus();
                return;
              }
              setActiveId(null);
              setDraft("");
              textareaRef.current?.focus();
            }}
            className="gap-1.5"
          >
            <Plus className="size-4" /> New Chat
          </Button>
        </div>
      }
    >
      <div className="flex h-[calc(100vh-14rem)] min-h-[38rem] overflow-hidden rounded-xl border border-border bg-card">
        {/* ================================================================= */}
        {/* SIDEBAR: CONVERSATION LIST */}
        {/* ================================================================= */}
        <aside
          className={cn(
            "flex flex-col border-r border-border bg-muted/20 transition-all duration-200",
            sidebarOpen ? "w-72 sm:w-80" : "w-0 -translate-x-full overflow-hidden border-r-0",
          )}
        >
          {/* Sidebar Header & Search */}
          <div className="border-b border-border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">
                Conversations
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 lg:hidden"
                onClick={() => setSidebarOpen(false)}
              >
                <X className="size-4" />
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search chats…"
                className="h-8 pl-8 text-xs bg-background"
              />
            </div>
          </div>

          {/* Conversation List */}
          <div className="flex-1 overflow-y-auto divide-y divide-border/60">
            {loadingConversations ? (
              <p className="p-4 text-center text-xs text-muted-foreground">Loading chats…</p>
            ) : filteredConversations.length === 0 ? (
              <p className="p-4 text-center text-xs text-muted-foreground">
                {searchQuery ? "No matching chats." : "No conversations yet."}
              </p>
            ) : (
              filteredConversations.map((conv: ConversationRow) => {
                const isActive = activeId === conv.id;
                const isArchived = conv.status === "archived";

                return (
                  <div
                    key={conv.id}
                    onClick={() => setActiveId(conv.id)}
                    className={cn(
                      "group flex items-center justify-between px-3 py-2.5 text-left text-xs transition-colors cursor-pointer",
                      isActive ? "bg-accent text-accent-foreground font-medium" : "hover:bg-accent/50 text-foreground/80",
                    )}
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate">{conv.title || "Untitled Chat"}</span>
                        {isArchived && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 text-muted-foreground">
                            Archived
                          </Badge>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {new Date(conv.updated_at).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })}
                      </span>
                    </div>

                    {/* Actions Menu */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <MoreVertical className="size-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="text-xs">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenameConvId(conv.id);
                            setRenameTitleDraft(conv.title || "");
                            setRenameDialogOpen(true);
                          }}
                        >
                          <Edit2 className="mr-2 size-3.5" /> Rename
                        </DropdownMenuItem>
                        {!isArchived && (
                          <DropdownMenuItem
                            onClick={(e) => {
                              e.stopPropagation();
                              archiveMutation.mutate(conv.id);
                            }}
                          >
                            <Archive className="mr-2 size-3.5 text-amber-500" /> Archive
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteMutation.mutate(conv.id);
                          }}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 size-3.5" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* ================================================================= */}
        {/* MAIN CHAT STAGE */}
        {/* ================================================================= */}
        <main className="flex flex-1 flex-col overflow-hidden bg-background">
          {/* Header Controls Bar */}
          <header className="flex h-13 items-center justify-between border-b border-border bg-card/60 px-4">
            <div className="flex items-center gap-2 truncate">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
              >
                {sidebarOpen ? <PanelLeftClose className="size-4" /> : <PanelLeft className="size-4" />}
              </Button>

              <h2 className="font-semibold text-sm truncate max-w-sm">
                {activeConversation?.title || "New Conversation"}
              </h2>

              {activeConversation?.status === "archived" && (
                <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30">
                  Archived
                </Badge>
              )}
            </div>

            {/* Chat Grounding, Model Settings & Knowledge Extraction */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Knowledge Activity Drawer Trigger */}
              {activeId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setKnowledgeActivityOpen(true)}
                  className="h-7 gap-1.5 px-2 text-xs border-primary/20 hover:border-primary/40 bg-primary/5 hover:bg-primary/10 text-primary"
                  title="View detected concepts, claims, and relations"
                >
                  <Sparkles className="size-3.5 text-primary" />
                  <span className="hidden sm:inline font-medium">Activity</span>
                  {activeProposals.length > 0 && (
                    <Badge variant="secondary" className="h-4 px-1 text-[10px] bg-primary/20 text-primary font-bold">
                      {activeProposals.length}
                    </Badge>
                  )}
                </Button>
              )}

              {/* Extract Knowledge Button */}
              {activeId && messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={extractMutation.isPending}
                  onClick={() => extractMutation.mutate()}
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                  title="Analyze conversation and generate knowledge proposals"
                >
                  {extractMutation.isPending ? (
                    <RotateCcw className="size-3.5 animate-spin text-primary" />
                  ) : (
                    <Sparkles className="size-3.5 text-amber-500" />
                  )}
                  <span className="hidden md:inline ml-1 font-medium">
                    {extractMutation.isPending ? "Analyzing..." : "Extract"}
                  </span>
                </Button>
              )}

              <div className="flex items-center gap-2 border-l border-r border-border px-2 sm:px-3">
                <Switch
                  id="brain-toggle"
                  checked={useBrainContext}
                  onCheckedChange={setUseBrainContext}
                  className="data-[state=checked]:bg-primary"
                />
                <Label htmlFor="brain-toggle" className="text-xs cursor-pointer flex items-center gap-1 font-medium">
                  <Brain className="size-3.5 text-primary" />
                  <span className="hidden sm:inline">Brain</span>
                </Label>
              </div>

              {/* Solo Fast-Capture Mode Toggle Badge (P0) */}
              <button
                type="button"
                onClick={() => {
                  const nextVal = !soloDirectCommit;
                  setSoloDirectCommit(nextVal);
                  AIProviderManager.saveSettings({ solo_direct_commit: nextVal });
                  toast.info(
                    nextVal
                      ? "⚡ نمط التدوين الفردي المباشر نشط (Solo Auto-Commit)"
                      : "تم إيقاف نمط التدوين المباشر (Review Required)",
                  );
                }}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all cursor-pointer border",
                  soloDirectCommit
                    ? "bg-amber-500/15 text-amber-500 border-amber-500/30 hover:bg-amber-500/25"
                    : "bg-muted/40 text-muted-foreground border-border hover:text-foreground",
                )}
                title="Solo Fast-Capture Mode: Low-risk extractions are auto-committed directly into the Brain without manual review"
              >
                <Zap className={cn("size-3.5", soloDirectCommit ? "fill-amber-500 text-amber-500 animate-pulse" : "text-muted-foreground")} />
                <span className="hidden sm:inline">Solo Auto-Commit</span>
              </button>

              {useBrainContext && (
                <select
                  value={answerMode}
                  onChange={(e) => setAnswerMode(e.target.value as AnswerMode)}
                  className="h-7 rounded border border-border bg-background px-2 text-xs font-sans text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  title="RAG Answer Strategy"
                >
                  <option value="BRAIN_PREFERRED">Brain-Preferred</option>
                  <option value="BRAIN_ONLY">Brain-Only (Strict)</option>
                  <option value="GENERAL_AI">General AI</option>
                </select>
              )}

              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="h-7 rounded border border-border bg-background px-2 text-xs font-mono text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="brain-assistant-fast">Fast (brain-fast)</option>
                <option value="gpt-4o-mini">GPT-4o Mini</option>
                <option value="claude-3-5-sonnet">Claude 3.5 Sonnet</option>
              </select>
            </div>
          </header>

          {/* Message Stream */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
            {!activeId || messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center max-w-md mx-auto px-4 py-8">
                <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Brain className="size-8" />
                </div>
                <h3 className="font-bold text-lg mb-1">Knowledge Brain Assistant</h3>
                <p className="text-xs text-muted-foreground mb-6 leading-relaxed">
                  Ask questions grounded in your verified Knowledge Nodes, Graph Relations, and Atomic Claims.
                  In Phase 4, responses are strictly read-only from the Brain.
                </p>

                {/* Example prompts */}
                <div className="w-full space-y-2 text-left">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                    Try asking:
                  </span>
                  {[
                    "What concepts and relations exist for Laravel?",
                    "How does Dependency Injection relate to Service Container?",
                    "What queue backend does Laravel use?",
                  ].map((example, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setDraft(example);
                        textareaRef.current?.focus();
                      }}
                      className="w-full rounded-lg border border-border bg-card/80 p-2.5 text-xs text-foreground/90 transition-all hover:border-primary/40 hover:bg-accent text-left"
                    >
                      "{example}"
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              (() => {
                const makeResponseContract = (
                  msg: MessageRow,
                  meta: Record<string, unknown>,
                  references?: ChatResponseContract["references"],
                ): ChatResponseContract => {
                  return {
                    message_id: msg.id,
                    conversation_id: msg.conversation_id,
                    content: msg.content,
                    status: meta["status"] === "failed" ? "failed" : "completed",
                    brain_context_used: Boolean(meta["brain_context_used"]),
                    grounding_state: meta["grounding_state"] as GroundingState | undefined,
                    answer_mode: meta["answer_mode"] as AnswerMode | undefined,
                    retrieval_run_id: (meta["retrieval_run_id"] as string) || undefined,
                    claim_ledger: (meta["claim_ledger"] as any[]) || [],
                    graph_paths: (meta["graph_paths"] as any[]) || [],
                    sources: (meta["sources"] as any[]) || [],
                    conflicts_detected: (meta["conflicts"] as any[]) || [],
                    references: references || undefined,
                    metadata: {
                      model: msg.model || undefined,
                      provider: (meta["provider"] as string) || undefined,
                      latency_ms: (meta["latency_ms"] as number) || undefined,
                      retrieval_summary: meta["retrieval_summary"] as any,
                    },
                  };
                };

                return messages.map((message: MessageRow) => {
                  const isUser = message.role === "user";
                  const meta = (message.metadata ?? {}) as Record<string, unknown>;
                  const brainContextUsed = Boolean(meta["brain_context_used"]);
                  const isFailed = meta["status"] === "failed";
                  const references = meta["references"] as ChatResponseContract["references"] | undefined;
                  const groundingState = (meta["grounding_state"] as GroundingState) || (brainContextUsed ? "STRONGLY_GROUNDED" : undefined);
                  const conflicts = (meta["conflicts"] as any[]) || [];
                  const hasConflicts = conflicts.length > 0 || groundingState === "CONFLICTED_KNOWLEDGE";

                  return (
                    <div
                      key={message.id}
                      className={cn("group/msg flex gap-3 max-w-3xl", isUser ? "ml-auto justify-end" : "mr-auto justify-start")}
                    >
                      {!isUser && (
                        <div className="flex size-8 shrink-0 select-none items-center justify-center rounded-lg bg-primary/15 text-primary border border-primary/20">
                          <Bot className="size-4" />
                        </div>
                      )}

                      <div className={cn("space-y-1.5 max-w-[85%] sm:max-w-[78%]", isUser && "text-right")}>
                        <div className="flex items-center gap-2 px-1 text-[11px] text-muted-foreground flex-wrap">
                          <span className="font-semibold">{isUser ? "You" : "Knowledge Assistant"}</span>
                          <span>•</span>
                          <span className="font-mono">
                            {new Date(message.created_at).toLocaleTimeString(undefined, {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          {isUser && meta["status"] === "queued_offline" && (
                            <Badge variant="outline" className="text-[10px] gap-1 text-amber-500 border-amber-500/30 bg-amber-500/10 py-0">
                              <WifiOff className="size-2.5" /> معلق في وضع عدم الاتصال
                            </Badge>
                          )}
                          {!isUser && brainContextUsed && groundingState && (
                            <button
                              onClick={() => {
                                setSelectedResponse(makeResponseContract(message, meta, references));
                                setWhyModalOpen(true);
                              }}
                              className={cn(
                                "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors cursor-pointer border",
                                groundingState === "STRONGLY_GROUNDED" && "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/20 dark:text-emerald-400",
                                groundingState === "PARTIALLY_GROUNDED" && "bg-blue-500/10 text-blue-600 border-blue-500/30 hover:bg-blue-500/20 dark:text-blue-400",
                                groundingState === "CONFLICTED_KNOWLEDGE" && "bg-amber-500/10 text-amber-600 border-amber-500/30 hover:bg-amber-500/20 dark:text-amber-400",
                                groundingState === "INSUFFICIENT_BRAIN_KNOWLEDGE" && "bg-zinc-500/10 text-zinc-600 border-zinc-500/30 hover:bg-zinc-500/20 dark:text-zinc-400",
                                groundingState === "GENERAL_KNOWLEDGE_USED" && "bg-purple-500/10 text-purple-600 border-purple-500/30 hover:bg-purple-500/20 dark:text-purple-400",
                              )}
                              title="Click to view structured attribution"
                            >
                              {groundingState === "STRONGLY_GROUNDED" && <Check className="size-2.5" />}
                              {groundingState === "PARTIALLY_GROUNDED" && <Sparkles className="size-2.5" />}
                              {groundingState === "CONFLICTED_KNOWLEDGE" && <AlertTriangle className="size-2.5" />}
                              {groundingState === "INSUFFICIENT_BRAIN_KNOWLEDGE" && <HelpCircle className="size-2.5" />}
                              {groundingState === "GENERAL_KNOWLEDGE_USED" && <Bot className="size-2.5" />}
                              <span>
                                {groundingState === "STRONGLY_GROUNDED"
                                  ? "Brain Grounded"
                                  : groundingState === "PARTIALLY_GROUNDED"
                                    ? "Partially Grounded"
                                    : groundingState === "CONFLICTED_KNOWLEDGE"
                                      ? "Conflicted Knowledge"
                                      : groundingState === "INSUFFICIENT_BRAIN_KNOWLEDGE"
                                        ? "Brain Insufficient"
                                        : "General AI"}
                              </span>
                            </button>
                          )}
                        </div>

                        {/* Message Content Bubble */}
                        <div
                          className={cn(
                            "rounded-2xl px-4 py-3 text-sm shadow-sm",
                            isUser
                              ? "bg-primary text-primary-foreground rounded-tr-xs"
                              : isFailed
                                ? "bg-destructive/10 border border-destructive/30 text-destructive rounded-tl-xs"
                                : "bg-muted/50 border border-border text-foreground rounded-tl-xs",
                          )}
                        >
                          {isUser ? (
                            <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                          ) : (
                            <ChatMessageMarkdown content={message.content} />
                          )}
                        </div>

                        {/* Real-Time Token & Provider Cost Tracker Badge */}
                        {!isUser && !isFailed && (() => {
                          const msgUsage = meta["usage"] as
                            | { promptTokens?: number; completionTokens?: number; totalTokens?: number }
                            | undefined;
                          const msgModel = message.model || (meta["model"] as string) || selectedModel || "brain-assistant-fast";
                          const msgLatency = (meta["latency_ms"] as number) || 380;
                          const pTokens =
                            msgUsage?.promptTokens ??
                            Math.max(1, Math.round(TokenCostTracker.estimateTokensFromText(message.content) * 0.7));
                          const cTokens =
                            msgUsage?.completionTokens ??
                            Math.max(1, TokenCostTracker.estimateTokensFromText(message.content));
                          const totTokens = msgUsage?.totalTokens ?? (pTokens + cTokens);
                          const estCost = TokenCostTracker.calculateCost(msgModel, pTokens, cTokens);
                          const costDisplay = TokenCostTracker.formatCost(estCost);
                          const pricing = TokenCostTracker.getModelPricing(msgModel);

                          return (
                            <div className="flex items-center gap-2 px-1 pt-0.5">
                              <TooltipProvider delayDuration={150}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground/80 hover:text-foreground font-mono cursor-pointer transition-colors bg-muted/40 hover:bg-muted/70 border border-border/50 px-2 py-0.5 rounded-md">
                                      <span className="text-amber-500">⚡</span>
                                      <span>
                                        {TokenCostTracker.formatTokens(totTokens)} tokens (~{costDisplay}) · {msgLatency}ms · [{pricing.displayName}]
                                      </span>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent
                                    side="bottom"
                                    className="text-xs p-2.5 space-y-1.5 bg-popover text-popover-foreground border border-border shadow-lg"
                                  >
                                    <div className="font-semibold text-[11px] border-b border-border/50 pb-1 text-primary flex items-center justify-between gap-3">
                                      <span>Token & Cost Breakdown</span>
                                      <span className="font-mono text-[10px] text-muted-foreground">{msgModel}</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] font-mono">
                                      <span className="text-muted-foreground">Input Tokens:</span>
                                      <span className="text-right">{pTokens.toLocaleString()}</span>
                                      <span className="text-muted-foreground">Output Tokens:</span>
                                      <span className="text-right">{cTokens.toLocaleString()}</span>
                                      <span className="text-muted-foreground">Total Tokens:</span>
                                      <span className="text-right font-semibold">{totTokens.toLocaleString()}</span>
                                      <span className="text-muted-foreground">Latency:</span>
                                      <span className="text-right">{msgLatency}ms</span>
                                      <span className="text-muted-foreground">Estimated Cost:</span>
                                      <span className="text-right font-semibold text-emerald-600 dark:text-emerald-400">
                                        {costDisplay}
                                      </span>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          );
                        })()}

                        {/* Interactive In-Chat Visual Conflict Resolution Card */}
                        {!isUser && hasConflicts && (
                          <ChatConflictResolutionCard
                            conflictId={conflicts[0]?.id}
                            claimA={{
                              id: conflicts[0]?.claim_a_id || references?.claims?.[0]?.id,
                              statement:
                                conflicts[0]?.statement_a ||
                                references?.claims?.[0]?.statement ||
                                "Verified specification in Knowledge Brain",
                              confidence: conflicts[0]?.confidence_a ?? references?.claims?.[0]?.confidence ?? 0.95,
                              source_title: references?.claims?.[0]?.source?.title || "Canonical Brain Node",
                              node_name: references?.claims?.[0]?.node_name || "Canonical Concept",
                              created_at: (references?.claims?.[0]?.created_at as string | undefined) || conflicts[0]?.created_at,
                              stance: "Canonical Fact",
                            }}
                            claimB={{
                              id: conflicts[0]?.claim_b_id || references?.claims?.[1]?.id,
                              statement:
                                conflicts[0]?.statement_b ||
                                conflicts[0]?.statement ||
                                references?.claims?.[1]?.statement ||
                                message.content.slice(0, 180),
                              confidence: conflicts[0]?.confidence_b ?? 0.92,
                              source_title: "Asserted Fact in Conversation",
                              stance: "Incoming Proposal",
                              created_at: message.created_at,
                            }}
                            reason={
                              conflicts[0]?.reason_summary ||
                              "Opposing factual assertions detected between existing verified Brain claim and conversational input."
                            }
                          />
                        )}

                        {/* Attached Sources Reference */}
                        {!isUser && brainContextUsed && references?.claims && (
                          (() => {
                            const sourceTitles = Array.from(
                              new Set(
                                references.claims
                                  .map((c) => c.source?.title)
                                  .filter((t): t is string => Boolean(t)),
                              ),
                            );
                            if (sourceTitles.length === 0) return null;
                            return (
                              <div className="flex flex-wrap items-center gap-1.5 pt-0.5 px-1 text-[11px] text-muted-foreground">
                                <span className="font-semibold text-[10px] uppercase tracking-wider text-muted-foreground/80">Sources:</span>
                                {sourceTitles.map((title, idx) => (
                                  <Badge
                                    key={idx}
                                    variant="outline"
                                    className="text-[10px] py-0 px-1.5 h-4 font-normal cursor-pointer hover:bg-accent transition-colors"
                                    onClick={() => {
                                      setSelectedResponse(makeResponseContract(message, meta, references));
                                      setWhyModalOpen(true);
                                    }}
                                  >
                                    {title}
                                  </Badge>
                                ))}
                              </div>
                            );
                          })()
                        )}

                        {/* Footer Actions: Retry, Why this answer, Retrieval trace, Regenerate */}
                        {!isUser && isFailed && (
                          <div className="flex items-center gap-2 pt-1 text-xs">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 text-xs gap-1 border-destructive/40 text-destructive hover:bg-destructive/10"
                              onClick={() => {
                                const prevUser = [...messages]
                                  .reverse()
                                  .find((m) => m.role === "user");
                                if (prevUser) {
                                  sendMessageMutation.mutate({
                                    messageText: prevUser.content,
                                    isRetry: true,
                                    retryMsgId: prevUser.id,
                                  });
                                }
                              }}
                            >
                              <RotateCcw className="size-3" /> Retry Generation
                            </Button>
                          </div>
                        )}

                        {!isUser && !isFailed && (
                          <div className="flex items-center gap-3 pt-1 px-1 text-xs">
                            {brainContextUsed && (
                              <>
                                <button
                                  onClick={() => {
                                    setSelectedResponse(makeResponseContract(message, meta, references));
                                    setWhyModalOpen(true);
                                  }}
                                  className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline cursor-pointer"
                                >
                                  <Brain className="size-3" />
                                  <span>Why this answer?</span>
                                </button>

                                <button
                                  onClick={() => {
                                    setSelectedResponse(makeResponseContract(message, meta, references));
                                    setInspectorModalOpen(true);
                                  }}
                                  className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground cursor-pointer"
                                >
                                  <Sliders className="size-3" />
                                  <span>Trace & Inspector</span>
                                </button>

                                <button
                                  onClick={() => {
                                    const focusNodeId = references?.nodes?.[0]?.id;
                                    if (focusNodeId) {
                                      void navigate({ to: "/graph", search: { focus: focusNodeId } as any });
                                    } else {
                                      void navigate({ to: "/graph" });
                                    }
                                  }}
                                  className="inline-flex items-center gap-1 text-[11px] font-medium text-cyan-500 hover:underline cursor-pointer"
                                >
                                  <Network className="size-3" />
                                  <span>View in Graph</span>
                                </button>
                              </>
                            )}

                            <div className="opacity-0 group-hover/msg:opacity-100 transition-opacity ml-auto">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 text-[10px] px-1.5 gap-1 text-muted-foreground hover:text-foreground"
                                onClick={() => {
                                  const prevUser = [...messages]
                                    .reverse()
                                    .find((m) => m.role === "user");
                                  if (prevUser) {
                                    sendMessageMutation.mutate({
                                      messageText: prevUser.content,
                                      isRetry: true,
                                      retryMsgId: prevUser.id,
                                    });
                                  }
                                }}
                              >
                                <RotateCcw className="size-2.5" /> Regenerate
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>

                      {isUser && (
                        <div className="flex size-8 shrink-0 select-none items-center justify-center rounded-lg bg-secondary text-secondary-foreground border border-border">
                          <User className="size-4" />
                        </div>
                      )}
                    </div>
                  );
                });
              })()
            )}

            {/* Generating Indicator */}
            {isGenerating && (
              <div className="flex gap-3 mr-auto max-w-3xl">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary border border-primary/20 animate-pulse">
                  <Bot className="size-4" />
                </div>
                <div className="rounded-2xl rounded-tl-xs border border-border bg-muted/40 px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="size-2 rounded-full bg-primary animate-ping" />
                    <span>Querying Brain & generating response…</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* ================================================================= */}
          {/* MESSAGE COMPOSER */}
          {/* ================================================================= */}
          <footer className="border-t border-border bg-card/80 p-3 sm:p-4">
            <div className="relative rounded-xl border border-border bg-background focus-within:border-primary focus-within:ring-1 focus-within:ring-primary shadow-sm">
              <Textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isGenerating || activeConversation?.status === "archived"}
                placeholder={
                  activeConversation?.status === "archived"
                    ? "This conversation is archived. Create a new chat to continue."
                    : "Ask about your Knowledge Brain… (Shift+Enter for newline, Enter to send)"
                }
                rows={2}
                className="resize-none border-0 bg-transparent p-3 text-sm focus-visible:ring-0 focus-visible:outline-none"
              />

              <div className="flex items-center justify-between border-t border-border/50 px-3 py-2 bg-muted/20 rounded-b-xl">
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span>{draft.length} / 8000</span>
                  {useBrainContext && (
                    <Badge variant="secondary" className="text-[10px] gap-1 font-normal py-0">
                      <Sparkles className="size-2.5 text-primary" /> Brain Grounding Active
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {/* Language switch button for voice recognition */}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      const nextLang = speechLang === "ar-SA" ? "en-US" : "ar-SA";
                      setSpeechLang(nextLang);
                      setVoiceLang(nextLang);
                      toast.info(`Voice recognition set to ${nextLang === "ar-SA" ? "العربية (Arabic)" : "English (US)"}`);
                    }}
                    title="تبديل لغة الإدخال الصوتي / Switch Voice Language"
                  >
                    <Globe className="size-3.5" />
                    <span className="font-mono text-[10px] font-semibold">
                      {speechLang === "ar-SA" ? "AR" : "EN"}
                    </span>
                  </Button>

                  {/* Voice dictation button */}
                  <Button
                    type="button"
                    variant={isVoiceListening ? "destructive" : "ghost"}
                    size="sm"
                    className={cn(
                      "h-8 w-8 p-0 transition-all",
                      isVoiceListening
                        ? "bg-red-500/20 text-red-600 hover:bg-red-500/30 animate-pulse border border-red-500/40"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => toggleVoiceListening()}
                    title={isVoiceListening ? "إيقاف الإملاء الصوتي / Stop voice recording" : "إملاء صوتي / Voice dictation (Web Speech)"}
                  >
                    {isVoiceListening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    disabled
                    className="h-8 w-8 p-0 text-muted-foreground/60 hover:text-muted-foreground"
                    title="Document attachments (prepared for Phase 5)"
                  >
                    <Paperclip className="size-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    disabled={!draft.trim() || isGenerating || activeConversation?.status === "archived"}
                    onClick={handleSend}
                    className="h-8 gap-1.5 px-3 font-medium"
                  >
                    <Send className="size-3.5" />
                    <span>Send</span>
                  </Button>
                </div>
              </div>
            </div>
          </footer>
        </main>
      </div>

      {/* Brain Context Inspector Modal */}
      <BrainContextInspector
        open={inspectModalOpen}
        onOpenChange={setInspectModalOpen}
        references={inspectReferences}
      />

      {/* Why This Answer Modal (Phase 9 Structured Attribution) */}
      <WhyThisAnswerModal
        open={whyModalOpen}
        onOpenChange={setWhyModalOpen}
        response={selectedResponse}
        onNavigateToNode={(_nodeId) => {
          setWhyModalOpen(false);
          window.location.href = "/knowledge";
        }}
      />

      {/* Retrieval Inspector Modal (Phase 9 Trace & Multi-Signal Inspector) */}
      <RetrievalInspectorModal
        open={inspectorModalOpen}
        onOpenChange={setInspectorModalOpen}
        response={selectedResponse}
      />

      {/* Knowledge Activity Drawer */}
      <KnowledgeActivityDrawer
        open={knowledgeActivityOpen}
        onOpenChange={setKnowledgeActivityOpen}
        conversationTitle={activeConversation?.title || undefined}
        conversationId={activeId}
        proposals={activeProposals}
        onTriggerExtraction={() => extractMutation.mutate()}
        isExtracting={extractMutation.isPending}
      />

      {/* Rename Conversation Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename Conversation</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={renameTitleDraft}
              onChange={(e) => setRenameTitleDraft(e.target.value)}
              placeholder="Conversation title…"
              onKeyDown={(e) => {
                if (e.key === "Enter") renameMutation.mutate();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRenameDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!renameTitleDraft.trim() || renameMutation.isPending}
              onClick={() => renameMutation.mutate()}
            >
              Save Title
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Brain Update Summary Modal */}
      <BrainUpdateSummaryModal
        open={summaryModalOpen}
        onOpenChange={setSummaryModalOpen}
        summary={learnedSummary}
      />
    </AppShell>
  );
}

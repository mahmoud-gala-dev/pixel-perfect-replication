// =====================================================================
// KNOWLEDGE BRAIN — PHASE 4: AI CHAT PAGE
// Conversation Memory, Secure LLM Gateway & Read-Only Brain Context
// =====================================================================

import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MessagesSquare,
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
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
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
import { ChatService, type ChatResponseContract } from "@/lib/ai";

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
  const queryClient = useQueryClient();

  // State
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [useBrainContext, setUseBrainContext] = useState(true);
  const [selectedModel, setSelectedModel] = useState("brain-assistant-fast");
  const [isGenerating, setIsGenerating] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Inspector modal state
  const [inspectModalOpen, setInspectModalOpen] = useState(false);
  const [inspectReferences, setInspectReferences] = useState<ChatResponseContract["references"] | null>(null);

  // Rename modal state
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [renameConvId, setRenameConvId] = useState<string | null>(null);
  const [renameTitleDraft, setRenameTitleDraft] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom when messages update
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // 1. Fetch Conversations
  const { data: conversations = [], isLoading: loadingConversations } = useQuery({
    queryKey: ["conversations"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .is("deleted_at", null)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Auto-select latest active conversation on first load if available
  useEffect(() => {
    if (!activeId && conversations.length > 0) {
      const firstActive = conversations.find((c) => c.status === "active") ?? conversations[0];
      if (firstActive) {
        setActiveId(firstActive.id);
      }
    }
  }, [conversations, activeId]);

  // 2. Fetch Messages for active conversation
  const { data: messages = [], isLoading: loadingMessages } = useQuery({
    queryKey: ["messages", activeId],
    enabled: !!activeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", activeId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    scrollToBottom();
  }, [messages, isGenerating]);

  const activeConversation = conversations.find((c) => c.id === activeId);

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

  // 4. Send Message Mutation (AI Gateway)
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
        const newConv = await ChatService.createConversation(messageText.slice(0, 36));
        targetConvId = newConv.id;
        setActiveId(newConv.id);
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
          },
        });
        return { response, targetConvId };
      } finally {
        setIsGenerating(false);
      }
    },
    onSuccess: (result) => {
      setDraft("");
      void queryClient.invalidateQueries({ queryKey: ["messages", result.targetConvId] });
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      void queryClient.invalidateQueries({ queryKey: ["brain-stats"] });
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
  const filteredConversations = conversations.filter((c) =>
    (c.title ?? "Untitled").toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <AppShell
      title="AI Chat"
      description="Conversational intelligence with read-only Knowledge Brain grounding."
      actions={
        <div className="flex items-center gap-2">
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
              filteredConversations.map((conv) => {
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

            {/* Chat Grounding & Model Settings */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 border-r border-border pr-3">
                <Switch
                  id="brain-toggle"
                  checked={useBrainContext}
                  onCheckedChange={setUseBrainContext}
                  className="data-[state=checked]:bg-primary"
                />
                <Label htmlFor="brain-toggle" className="text-xs cursor-pointer flex items-center gap-1 font-medium">
                  <Brain className="size-3.5 text-primary" />
                  <span className="hidden sm:inline">Brain Context</span>
                </Label>
              </div>

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
              messages.map((message) => {
                const isUser = message.role === "user";
                const meta = (message.metadata ?? {}) as Record<string, unknown>;
                const brainContextUsed = Boolean(meta["brain_context_used"]);
                const isFailed = meta["status"] === "failed";
                const references = meta["references"] as ChatResponseContract["references"] | undefined;

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
                      <div className="flex items-center gap-2 px-1 text-[11px] text-muted-foreground">
                        <span className="font-semibold">{isUser ? "You" : "Knowledge Assistant"}</span>
                        <span>•</span>
                        <span className="font-mono">
                          {new Date(message.created_at).toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {!isUser && brainContextUsed && (
                          <button
                            onClick={() => {
                              setInspectReferences(references ?? null);
                              setInspectModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 rounded bg-primary/15 text-primary hover:bg-primary/25 px-1.5 py-0.5 font-medium transition-colors"
                          >
                            <Sparkles className="size-3" />
                            <span>Brain Context Used</span>
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
                                    setInspectReferences(references ?? null);
                                    setInspectModalOpen(true);
                                  }}
                                >
                                  {title}
                                </Badge>
                              ))}
                            </div>
                          );
                        })()
                      )}

                      {/* Footer Actions: Retry or Regenerate */}
                      {!isUser && isFailed && (
                        <div className="flex items-center gap-2 pt-1 text-xs">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-6 text-xs gap-1 border-destructive/40 text-destructive hover:bg-destructive/10"
                            onClick={() => {
                              // Find previous user message
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
                        <div className="flex items-center gap-2 pt-0.5 px-1 text-xs opacity-0 group-hover/msg:opacity-100 transition-opacity">
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
                      )}
                    </div>

                    {isUser && (
                      <div className="flex size-8 shrink-0 select-none items-center justify-center rounded-lg bg-secondary text-secondary-foreground border border-border">
                        <User className="size-4" />
                      </div>
                    )}
                  </div>
                );
              })
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
    </AppShell>
  );
}

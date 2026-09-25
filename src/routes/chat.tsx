import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessagesSquare, Plus, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, EmptyState } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "Chat — Knowledge Brain" },
      { name: "description", content: "Conversations that will later feed the knowledge extraction pipeline." },
      { property: "og:title", content: "Chat — Knowledge Brain" },
      { property: "og:description", content: "Conversations that will later feed the knowledge extraction pipeline." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChatPage,
});

function ChatPage() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const { data: conversations } = useQuery({
    queryKey: ["conversations"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .is("deleted_at", null)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: messages } = useQuery({
    queryKey: ["messages", activeId],
    enabled: !!activeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("conversation_id", activeId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const newConversation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from("conversations")
        .insert({ title: "New conversation" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (conversation) => {
      setActiveId(conversation.id);
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      void queryClient.invalidateQueries({ queryKey: ["brain-stats"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const sendMessage = useMutation({
    mutationFn: async () => {
      if (!activeId) return;
      const content = draft.trim();
      const { error } = await supabase
        .from("messages")
        .insert({ conversation_id: activeId, role: "user", content });
      if (error) throw error;
      await supabase
        .from("conversations")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", activeId);
    },
    onSuccess: () => {
      setDraft("");
      void queryClient.invalidateQueries({ queryKey: ["messages", activeId] });
      void queryClient.invalidateQueries({ queryKey: ["brain-stats"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <AppShell
      title="Chat"
      description="Messages are stored now; the AI assistant and knowledge extraction arrive in Phase 2."
      actions={
        <Button size="sm" onClick={() => newConversation.mutate()}>
          <Plus className="size-4" /> New conversation
        </Button>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[18rem_1fr]">
        <aside className="panel h-fit divide-y divide-border">
          {!conversations || conversations.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">No conversations yet.</p>
          ) : (
            conversations.map((conversation) => (
              <button
                key={conversation.id}
                onClick={() => setActiveId(conversation.id)}
                className={cn(
                  "block w-full truncate px-4 py-3 text-left text-sm transition-colors hover:bg-accent",
                  activeId === conversation.id && "bg-accent text-accent-foreground",
                )}
              >
                {conversation.title ?? "Untitled"}
              </button>
            ))
          )}
        </aside>

        <section className="flex min-h-[26rem] flex-col">
          {!activeId ? (
            <EmptyState
              icon={MessagesSquare}
              title="No conversation selected"
              description="Create a conversation to start capturing raw material. In Phase 2 an AI assistant will answer here and propose structured knowledge from each exchange."
            />
          ) : (
            <>
              <div className="panel flex-1 space-y-3 p-4">
                {!messages || messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No messages yet.</p>
                ) : (
                  messages.map((message) => (
                    <div
                      key={message.id}
                      className={cn(
                        "max-w-[46rem] rounded-lg px-3 py-2 text-sm",
                        message.role === "user"
                          ? "ml-auto bg-primary/15 text-foreground"
                          : "bg-secondary text-secondary-foreground",
                      )}
                    >
                      <p className="mb-1 font-mono text-[10px] uppercase text-muted-foreground">
                        {message.role}
                      </p>
                      {message.content}
                    </div>
                  ))
                )}
              </div>
              <div className="mt-3 flex items-end gap-2">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Write a message… (stored in your brain, no AI reply yet)"
                  rows={3}
                />
                <Button
                  disabled={!draft.trim() || sendMessage.isPending}
                  onClick={() => sendMessage.mutate()}
                >
                  <Send className="size-4" />
                </Button>
              </div>
            </>
          )}
        </section>
      </div>
    </AppShell>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  BookMarked,
  Brain,
  GitBranch,
  Library,
  MessagesSquare,
  Network,
  Quote,
  Tags,
  History,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Knowledge Brain" },
      {
        name: "description",
        content: "Live statistics for your knowledge nodes, relations, claims, sources and conversations.",
      },
      { property: "og:title", content: "Dashboard — Knowledge Brain" },
      {
        property: "og:description",
        content: "Live statistics for your knowledge nodes, relations, claims, sources and conversations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

type Stats = Record<string, number>;

const CARDS: { key: string; label: string; icon: typeof Brain; to: string }[] = [
  { key: "nodes", label: "Knowledge nodes", icon: Library, to: "/knowledge" },
  { key: "edges", label: "Relations", icon: GitBranch, to: "/graph" },
  { key: "entries", label: "Knowledge entries", icon: Brain, to: "/knowledge" },
  { key: "aliases", label: "Aliases", icon: Tags, to: "/knowledge" },
  { key: "claims", label: "Claims", icon: Quote, to: "/knowledge" },
  { key: "sources", label: "Sources", icon: BookMarked, to: "/sources" },
  { key: "conversations", label: "Conversations", icon: MessagesSquare, to: "/chat" },
  { key: "messages", label: "Messages", icon: Network, to: "/chat" },
  { key: "operations", label: "Operations", icon: Activity, to: "/activity" },
  { key: "changes", label: "Recorded changes", icon: History, to: "/activity" },
];

function Dashboard() {
  const { session } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["brain-stats"],
    enabled: !!session,
    queryFn: async (): Promise<Stats> => {
      const { data, error } = await supabase.rpc("get_brain_stats");
      if (error) throw error;
      return (data ?? {}) as Stats;
    },
  });

  return (
    <AppShell title="Dashboard" description="Real numbers from your knowledge base — nothing simulated.">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {CARDS.map((card) => (
          <Link key={card.key} to={card.to} className="panel group p-4 transition-colors hover:border-primary/50">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{card.label}</span>
              <card.icon className="size-4 text-primary/70" />
            </div>
            <p className="mt-3 font-mono text-3xl font-semibold tabular-nums">
              {isLoading ? "—" : (data?.[card.key] ?? 0)}
            </p>
          </Link>
        ))}
      </div>

      <div className="panel mt-6 p-6">
        <h2 className="text-sm font-semibold">Phase 1 foundation</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          The data foundation is in place: an unlimited-depth knowledge hierarchy, typed relations,
          aliases, entries linked to many nodes, atomic claims, sources and evidence, conversations and
          messages, provenance, full version history, and a structured operations queue that will later
          be the only way AI is allowed to change the knowledge base.
        </p>
        <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
          Start in <Link to="/knowledge" className="text-primary underline-offset-4 hover:underline">Knowledge</Link>{" "}
          by creating your first root node.
        </p>
      </div>
    </AppShell>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Network } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, EmptyState } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/graph")({
  head: () => ({
    meta: [
      { title: "Graph — Knowledge Brain" },
      { name: "description", content: "Typed relations between knowledge nodes in your brain." },
      { property: "og:title", content: "Graph — Knowledge Brain" },
      { property: "og:description", content: "Typed relations between knowledge nodes in your brain." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GraphPage,
});

function GraphPage() {
  const { session } = useAuth();
  const { data: edges } = useQuery({
    queryKey: ["edges-all"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_edges")
        .select("id, relation_type, confidence, source:source_node_id(name), target:target_node_id(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <AppShell
      title="Graph"
      description="Visual graph rendering arrives in a later phase — relations are listed here."
    >
      {!edges || edges.length === 0 ? (
        <EmptyState
          icon={Network}
          title="No relations yet"
          description="Connect two knowledge nodes with a typed relation (uses, requires, prerequisite_of…) from the Knowledge explorer. Interactive graph visualization is planned for a later phase."
        />
      ) : (
        <div className="panel divide-y divide-border">
          {edges.map((edge) => (
            <div key={edge.id} className="flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
              <span className="font-medium">{(edge.source as { name: string } | null)?.name}</span>
              <span className="rounded-md bg-secondary px-2 py-0.5 font-mono text-xs text-muted-foreground">
                {edge.relation_type}
              </span>
              <span className="font-medium">{(edge.target as { name: string } | null)?.name}</span>
              {edge.confidence !== null ? (
                <span className="ml-auto font-mono text-xs text-muted-foreground">
                  confidence {edge.confidence}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}

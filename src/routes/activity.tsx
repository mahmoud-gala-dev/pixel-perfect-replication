import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, EmptyState } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/activity")({
  head: () => ({
    meta: [
      { title: "Brain Activity — Knowledge Brain" },
      { name: "description", content: "Structured knowledge operations and the full change history." },
      { property: "og:title", content: "Brain Activity — Knowledge Brain" },
      { property: "og:description", content: "Structured knowledge operations and the full change history." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ActivityPage,
});

function ActivityPage() {
  const { session } = useAuth();

  const { data: operations } = useQuery({
    queryKey: ["operations"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_operations")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const { data: changes } = useQuery({
    queryKey: ["changes"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_changes")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  return (
    <AppShell title="Brain Activity" description="Operations queue and recorded history of every change.">
      <div className="grid gap-5 lg:grid-cols-2">
        <section>
          <h2 className="mb-2 text-sm font-semibold">Knowledge operations</h2>
          {!operations || operations.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="No operations yet"
              description="Structured operations (CREATE_NODE, MOVE_NODE, MERGE_NODE…) will appear here once AI starts proposing changes. Every proposal passes validation before touching the database."
            />
          ) : (
            <div className="panel divide-y divide-border">
              {operations.map((op) => (
                <div key={op.id} className="px-4 py-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-primary">{op.operation_type}</span>
                    <span className="rounded bg-secondary px-2 py-0.5 text-[11px] text-muted-foreground">
                      {op.status}
                    </span>
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      {new Date(op.created_at).toLocaleString()}
                    </span>
                  </div>
                  {op.reason ? <p className="mt-1 text-xs text-muted-foreground">{op.reason}</p> : null}
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold">Change history</h2>
          {!changes || changes.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="No changes recorded yet"
              description="Every create, update, move and delete of a knowledge node or entry is recorded automatically with its previous and new state."
            />
          ) : (
            <div className="panel divide-y divide-border">
              {changes.map((change) => (
                <div key={change.id} className="px-4 py-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-primary">{change.change_type}</span>
                    <span className="text-xs text-muted-foreground">{change.subject_table}</span>
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      {new Date(change.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {(change.new_state as { name?: string; title?: string } | null)?.name ??
                      (change.new_state as { title?: string } | null)?.title ??
                      (change.previous_state as { name?: string } | null)?.name ??
                      "—"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

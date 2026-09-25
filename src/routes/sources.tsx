import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookMarked, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, EmptyState } from "@/components/AppShell";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/sources")({
  head: () => ({
    meta: [
      { title: "Sources — Knowledge Brain" },
      { name: "description", content: "Traceable origins for every piece of knowledge: docs, books, sites, conversations." },
      { property: "og:title", content: "Sources — Knowledge Brain" },
      { property: "og:description", content: "Traceable origins for every piece of knowledge: docs, books, sites, conversations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SourcesPage,
});

const KINDS = [
  "ai_research",
  "website",
  "documentation",
  "pdf",
  "book",
  "user",
  "conversation",
  "api",
  "manual",
] as const;

function SourcesPage() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [author, setAuthor] = useState("");
  const [kind, setKind] = useState<(typeof KINDS)[number]>("documentation");

  const { data: sources } = useQuery({
    queryKey: ["sources"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sources")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createSource = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("sources").insert({
        title: title.trim(),
        url: url.trim() || null,
        author: author.trim() || null,
        source_kind: kind,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Source added");
      setOpen(false);
      setTitle("");
      setUrl("");
      setAuthor("");
      void queryClient.invalidateQueries({ queryKey: ["sources"] });
      void queryClient.invalidateQueries({ queryKey: ["brain-stats"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const addButton = (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" /> Add source
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a source</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="source-title">Title</Label>
            <Input id="source-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="source-url">URL (optional)</Label>
            <Input id="source-url" value={url} onChange={(e) => setUrl(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="source-author">Author (optional)</Label>
            <Input id="source-author" value={author} onChange={(e) => setAuthor(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Kind</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as (typeof KINDS)[number])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={!title.trim() || createSource.isPending}
            onClick={() => createSource.mutate()}
          >
            Save source
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return (
    <AppShell
      title="Sources"
      description="Where knowledge comes from. AI text alone is never treated as evidence."
      actions={addButton}
    >
      {!sources || sources.length === 0 ? (
        <EmptyState
          icon={BookMarked}
          title="No sources yet"
          description="Add documentation, books, websites or research notes. Claims and entries can later cite excerpts from these as evidence."
        />
      ) : (
        <div className="panel divide-y divide-border">
          {sources.map((source) => (
            <div key={source.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{source.title}</span>
                <span className="rounded bg-secondary px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                  {source.source_kind}
                </span>
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {source.url ?? source.author ?? "No link"}
              </p>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}

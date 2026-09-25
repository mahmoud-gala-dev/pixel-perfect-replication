import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookMarked,
  Plus,
  Search,
  ExternalLink,
  Scale,
  Quote,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Calendar,
  Building,
  User,
} from "lucide-react";
import { useMemo, useState } from "react";
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
  DialogDescription,
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
import {
  normalizeSourceUrl,
  SOURCE_KINDS,
  type SourceKind,
  type SourceRow,
  type EvidenceRow,
  type KnowledgeClaimRow,
} from "@/lib/knowledge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/sources")({
  head: () => ({
    meta: [
      { title: "Sources — Knowledge Brain" },
      {
        name: "description",
        content:
          "Traceable origins for every piece of knowledge: docs, books, sites, conversations, and research.",
      },
      { property: "og:title", content: "Sources — Knowledge Brain" },
      {
        property: "og:description",
        content:
          "Traceable origins for every piece of knowledge: docs, books, sites, conversations, and research.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SourcesPage,
});

function SourcesPage() {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterKind, setFilterKind] = useState<string>("all");

  // Form states
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [author, setAuthor] = useState("");
  const [publisher, setPublisher] = useState("");
  const [kind, setKind] = useState<SourceKind>("documentation");

  // Fetch all sources
  const { data: sources, isLoading } = useQuery({
    queryKey: ["sources"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sources")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SourceRow[];
    },
  });

  // Fetch all claims citing sources
  const { data: allClaims } = useQuery({
    queryKey: ["all-claims-for-sources"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_claims")
        .select("*");
      if (error) throw error;
      return (data ?? []) as KnowledgeClaimRow[];
    },
  });

  // Fetch all evidence records
  const { data: allEvidence } = useQuery({
    queryKey: ["all-evidence-for-sources"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("evidence")
        .select("*");
      if (error) throw error;
      return (data ?? []) as EvidenceRow[];
    },
  });

  // Filter sources
  const filteredSources = useMemo(() => {
    const list = sources ?? [];
    return list.filter((s) => {
      if (filterKind !== "all" && s.source_kind !== filterKind) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        s.title.toLowerCase().includes(q) ||
        (s.url && s.url.toLowerCase().includes(q)) ||
        (s.author && s.author.toLowerCase().includes(q)) ||
        (s.publisher && s.publisher.toLowerCase().includes(q)) ||
        s.source_kind.toLowerCase().includes(q)
      );
    });
  }, [sources, searchQuery, filterKind]);

  // Safe create source mutation with URL normalization & duplicate prevention
  const createSource = useMutation({
    mutationFn: async () => {
      const normalizedUrl = normalizeSourceUrl(url);

      // Check if duplicate URL already exists
      if (normalizedUrl && sources) {
        const existing = sources.find((s) => s.url && normalizeSourceUrl(s.url) === normalizedUrl);
        if (existing) {
          throw new Error(
            `A source record with this URL already exists: "${existing.title}". Reusing existing sources prevents database duplication.`,
          );
        }
      }

      const { data: newSource, error } = await supabase
        .from("sources")
        .insert({
          title: title.trim(),
          url: normalizedUrl,
          author: author.trim() || null,
          publisher: publisher.trim() || null,
          source_kind: kind,
          accessed_at: new Date().toISOString(),
        })
        .select("*")
        .single();

      if (error) throw error;

      // Log knowledge operation
      try {
        await supabase.from("knowledge_operations").insert({
          operation_type: "ADD_SOURCE",
          status: "executed",
          payload: { title: title.trim(), url: normalizedUrl, kind },
          result: newSource as any,
          reason: "Manual source creation with URL normalization",
        });
      } catch {
        // Non-blocking audit
      }
    },
    onSuccess: () => {
      toast.success("Source added with normalized URL identity");
      setOpen(false);
      setTitle("");
      setUrl("");
      setAuthor("");
      setPublisher("");
      setKind("documentation");
      void queryClient.invalidateQueries({ queryKey: ["sources"] });
      void queryClient.invalidateQueries({ queryKey: ["brain-stats"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const selectedSource = useMemo(
    () => (sources ?? []).find((s) => s.id === selectedSourceId) ?? null,
    [sources, selectedSourceId],
  );

  const selectedSourceClaims = useMemo(() => {
    if (!selectedSourceId || !allClaims) return [];
    return allClaims.filter((c) => c.source_id === selectedSourceId);
  }, [selectedSourceId, allClaims]);

  const selectedSourceEvidence = useMemo(() => {
    if (!selectedSourceId || !allEvidence) return [];
    return allEvidence.filter((e) => e.source_id === selectedSourceId);
  }, [selectedSourceId, allEvidence]);

  const addButton = (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4 mr-1" /> Add source
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <BookMarked className="size-4 text-primary" />
            <DialogTitle>Add Verifiable Source</DialogTitle>
          </div>
          <DialogDescription>
            Reusable source origins (documentation, books, APIs, websites). URLs are automatically normalized to prevent duplicates.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="source-title">Title</Label>
            <Input
              id="source-title"
              placeholder="e.g. Laravel 11 Queues Documentation"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="source-url">URL (optional)</Label>
            <Input
              id="source-url"
              placeholder="https://laravel.com/docs/11.x/queues"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground">
              Trailing slashes and fragments are normalized to prevent redundant records.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="source-author">Author (optional)</Label>
              <Input
                id="source-author"
                placeholder="e.g. Taylor Otwell"
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="source-publisher">Publisher (optional)</Label>
              <Input
                id="source-publisher"
                placeholder="e.g. Laravel LLC, O'Reilly"
                value={publisher}
                onChange={(e) => setPublisher(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Source Kind</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as SourceKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SOURCE_KINDS.map((k) => (
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
            Save Canonical Source
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return (
    <AppShell
      title="Sources"
      description="Traceable origins for every piece of knowledge. AI text alone is never treated as ground truth."
      actions={addButton}
    >
      {/* Search and Filter Bar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[16rem] flex-1">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Search sources by title, author, URL, or publisher…"
            className="pl-8 text-xs"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <Select value={filterKind} onValueChange={setFilterKind}>
          <SelectTrigger className="w-44 text-xs">
            <SelectValue placeholder="All kinds" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All kinds</SelectItem>
            {SOURCE_KINDS.map((k) => (
              <SelectItem key={k} value={k}>
                {k}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="font-mono text-xs text-muted-foreground">
          {filteredSources.length} of {sources?.length ?? 0} sources
        </span>
      </div>

      {!sources || sources.length === 0 ? (
        <EmptyState
          icon={BookMarked}
          title="No sources yet"
          description="Add documentation, books, websites or research papers. Claims and entries cite excerpts from these as verifiable evidence."
        />
      ) : filteredSources.length === 0 ? (
        <div className="panel p-8 text-center text-xs text-muted-foreground">
          No sources match your search query "{searchQuery}".
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
          {/* Sources List */}
          <div className="space-y-2.5">
            {filteredSources.map((source) => {
              const evidenceCount = (allEvidence ?? []).filter((e) => e.source_id === source.id).length;
              const claimsCount = (allClaims ?? []).filter((c) => c.source_id === source.id).length;
              const isSelected = selectedSourceId === source.id;

              return (
                <div
                  key={source.id}
                  onClick={() => setSelectedSourceId(source.id)}
                  className={cn(
                    "cursor-pointer rounded-lg border p-4 transition-all hover:border-primary/40",
                    isSelected
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border bg-card",
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-semibold text-foreground truncate">
                          {source.title}
                        </h4>
                        <span className="rounded bg-secondary px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                          {source.source_kind}
                        </span>
                      </div>

                      {/* Author / Publisher / Accessed Row */}
                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                        {source.author && (
                          <span className="inline-flex items-center gap-1">
                            <User className="size-3" /> {source.author}
                          </span>
                        )}
                        {source.publisher && (
                          <span className="inline-flex items-center gap-1">
                            <Building className="size-3" /> {source.publisher}
                          </span>
                        )}
                        {source.accessed_at && (
                          <span className="inline-flex items-center gap-1 font-mono text-[10px]">
                            <Calendar className="size-3" /> {new Date(source.accessed_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>

                      {/* URL link */}
                      {source.url && (
                        <div className="pt-1">
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline truncate max-w-full"
                          >
                            <ExternalLink className="size-3 flex-shrink-0" />
                            <span className="truncate">{source.url}</span>
                          </a>
                        </div>
                      )}
                    </div>

                    {/* Stats pills */}
                    <div className="flex items-center gap-1.5 flex-shrink-0 text-right">
                      <span className="rounded bg-secondary px-2 py-1 font-mono text-[10px] text-muted-foreground" title="Evidence excerpts derived">
                        {evidenceCount} evidence
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Source Inspector Panel */}
          <aside className="panel h-fit p-4 space-y-4">
            {!selectedSource ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                <BookMarked className="mx-auto size-8 text-muted-foreground/40 mb-2" />
                <p className="font-medium text-foreground">Select a Source</p>
                <p className="mt-1 text-[11px]">
                  View all claims grounded by this source and evidence excerpts extracted from it.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-[10px] text-primary">
                      {selectedSource.source_kind}
                    </span>
                  </div>
                  <h3 className="mt-1 text-base font-bold text-foreground">{selectedSource.title}</h3>
                  {selectedSource.url && (
                    <a
                      href={selectedSource.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline break-all"
                    >
                      <ExternalLink className="size-3" /> Visit Source
                    </a>
                  )}
                </div>

                {/* Evidence excerpts derived from this source */}
                <div className="space-y-2 border-t border-border/50 pt-3">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="flex items-center gap-1">
                      <Scale className="size-3.5 text-primary" /> Derived Evidence ({selectedSourceEvidence.length})
                    </span>
                  </div>

                  {selectedSourceEvidence.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No evidence excerpts attached to this source yet. Attach evidence from any atomic claim in the Knowledge Explorer.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {selectedSourceEvidence.map((ev) => (
                        <div
                          key={ev.id}
                          className="rounded border border-border bg-secondary/30 p-2.5 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between font-mono text-[10px]">
                            <span className="font-semibold text-foreground uppercase">{ev.stance}</span>
                            <span className="text-muted-foreground">{ev.locator ?? "General citation"}</span>
                          </div>
                          {ev.excerpt && (
                            <p className="italic text-foreground line-clamp-3">"{ev.excerpt}"</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </aside>
        </div>
      )}
    </AppShell>
  );
}

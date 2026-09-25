import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Library,
  Plus,
  Tags,
  GitBranch,
  Archive,
  Pencil,
  FolderTree,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  ArrowRight,
  ChevronRight,
  BookOpen,
  Home,
  FileText,
  Hash,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, EmptyState } from "@/components/AppShell";
import { KnowledgeTree } from "@/components/KnowledgeTree";
import { useAuth } from "@/hooks/useAuth";
import {
  ALIAS_TYPES,
  buildHierarchyTree,
  formatHierarchyPath,
  generateCanonicalSlug,
  getDescendantIds,
  getHierarchyPath,
  lookupKnowledgeNode,
  NODE_STATUSES,
  NODE_TYPES,
  RELATION_TYPES,
  safeCreateKnowledgeNode,
  validateNodeMove,
  type AliasType,
  type KnowledgeAlias,
  type KnowledgeEdge,
  type KnowledgeNode,
  type NodeCandidate,
  type NodeResolutionResult,
  type NodeType,
  type SafeCreateNodeInput,
} from "@/lib/knowledge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/knowledge")({
  head: () => ({
    meta: [
      { title: "Knowledge Explorer — Knowledge Brain" },
      {
        name: "description",
        content:
          "Browse and manage your unlimited-depth knowledge hierarchy, aliases, and semantic relations.",
      },
      { property: "og:title", content: "Knowledge Explorer — Knowledge Brain" },
      {
        property: "og:description",
        content:
          "Browse and manage your unlimited-depth knowledge hierarchy, aliases, and semantic relations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: KnowledgePage,
});

const NONE = "__none__";

function KnowledgePage() {
  const { session } = useAuth();
  const queryClient = useQueryClient();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [dialog, setDialog] = useState<
    null | "create" | "edit" | "move" | "alias" | "relation"
  >(null);

  // Form states
  const [form, setForm] = useState({
    name: "",
    node_type: "topic" as NodeType,
    description: "",
    summary: "",
    status: "active",
    parent_id: NONE as string,
  });

  const [aliasForm, setAliasForm] = useState({
    alias: "",
    alias_type: "alternate_name" as AliasType,
    language: "",
  });

  const [relationForm, setRelationForm] = useState({
    target: NONE as string,
    type: "related_to",
    description: "",
  });

  // Duplicate warning modal state (Search-Before-Create Resolution)
  const [duplicateWarning, setDuplicateWarning] = useState<{
    resolution: NodeResolutionResult;
    input: SafeCreateNodeInput;
  } | null>(null);

  // Fetch all nodes
  const nodesQuery = useQuery({
    queryKey: ["nodes"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_nodes")
        .select("*")
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return data as KnowledgeNode[];
    },
  });

  const allNodes = useMemo(() => nodesQuery.data ?? [], [nodesQuery.data]);
  const activeNodes = useMemo(
    () => (showArchived ? allNodes : allNodes.filter((n) => n.status !== "archived")),
    [allNodes, showArchived],
  );

  const tree = useMemo(() => buildHierarchyTree(activeNodes), [activeNodes]);
  const selected = allNodes.find((n) => n.id === selectedId) ?? null;
  const children = allNodes.filter(
    (n) => n.parent_id === selectedId && (showArchived || n.status !== "archived"),
  );
  const path = selected ? getHierarchyPath(allNodes, selected.id) : [];

  // Fetch aliases for selected node
  const aliasesQuery = useQuery({
    queryKey: ["aliases", selectedId],
    enabled: !!selectedId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_aliases")
        .select("*")
        .eq("node_id", selectedId!)
        .order("alias");
      if (error) throw error;
      return data as KnowledgeAlias[];
    },
  });

  // Fetch all aliases for search-before-create lookup
  const allAliasesQuery = useQuery({
    queryKey: ["all-aliases"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_aliases")
        .select("*");
      if (error) throw error;
      return (data ?? []) as KnowledgeAlias[];
    },
  });

  // Fetch relations for selected node
  const edgesQuery = useQuery({
    queryKey: ["node-edges", selectedId],
    enabled: !!selectedId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_edges")
        .select("*")
        .or(`source_node_id.eq.${selectedId},target_node_id.eq.${selectedId}`);
      if (error) throw error;
      return data as KnowledgeEdge[];
    },
  });

  // Fetch associated cross-category knowledge entries
  const entriesQuery = useQuery({
    queryKey: ["node-entries", selectedId],
    enabled: !!selectedId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_entry_nodes")
        .select("id, role, relevance, entry:knowledge_entries(id, title, slug, summary, status)")
        .eq("node_id", selectedId!);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        role: string;
        relevance: number | null;
        entry: {
          id: string;
          title: string;
          slug: string;
          summary: string | null;
          status: string;
        } | null;
      }>;
    },
  });

  function refreshAll() {
    void queryClient.invalidateQueries({ queryKey: ["nodes"] });
    void queryClient.invalidateQueries({ queryKey: ["aliases", selectedId] });
    void queryClient.invalidateQueries({ queryKey: ["all-aliases"] });
    void queryClient.invalidateQueries({ queryKey: ["node-edges", selectedId] });
    void queryClient.invalidateQueries({ queryKey: ["node-entries", selectedId] });
    void queryClient.invalidateQueries({ queryKey: ["brain-stats"] });
  }

  // Safe Node Creation Mutation with Search-Before-Create Pipeline
  const createOrUpdateNode = useMutation({
    mutationFn: async (opts?: { force?: boolean }) => {
      const targetParentId = form.parent_id === NONE ? null : form.parent_id;

      if (dialog === "edit" && selected) {
        // Edit existing node
        const { error } = await supabase
          .from("knowledge_nodes")
          .update({
            name: form.name.trim(),
            slug: generateCanonicalSlug(form.name),
            node_type: form.node_type as KnowledgeNode["node_type"],
            description: form.description.trim() || null,
            summary: form.summary.trim() || null,
            status: form.status as KnowledgeNode["status"],
            parent_id: targetParentId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", selected.id);

        if (error) throw error;
        return { created: false, node_id: selected.id, action: "updated" };
      }

      // Safe Node Creation Flow
      const input: SafeCreateNodeInput = {
        name: form.name.trim(),
        parent_id: targetParentId,
        node_type: form.node_type,
        description: form.description.trim() || null,
        summary: form.summary.trim() || null,
        status: form.status as KnowledgeNode["status"],
        force: opts?.force ?? false,
      };

      // Search before create lookup
      if (!opts?.force) {
        const resolution = await lookupKnowledgeNode(supabase, {
          name: input.name,
          parentId: input.parent_id ?? null,
          nodeType: input.node_type,
          nodes: allNodes,
          aliases: allAliasesQuery.data ?? [],
        });

        if (resolution.status === "existing" && resolution.node_id) {
          return {
            created: false,
            node_id: resolution.node_id,
            action: "existing",
            resolution,
          };
        }

        if (resolution.status === "possible_duplicate" || resolution.status === "ambiguous") {
          // Open duplicate warning modal
          setDuplicateWarning({ resolution, input });
          return { created: false, node_id: null, action: "warning", resolution };
        }
      }

      // Create canonical node safely
      const result = await safeCreateKnowledgeNode(supabase, input, allNodes);
      if (!result.created && result.status !== "created") {
        if (result.node) {
          return { created: false, node_id: result.node.id, action: "existing" };
        }
        if (result.resolution) {
          setDuplicateWarning({ resolution: result.resolution, input });
          return { created: false, node_id: null, action: "warning" };
        }
      }

      return {
        created: true,
        node_id: result.node?.id ?? null,
        action: "created",
      };
    },
    onSuccess: (res) => {
      if (res.action === "warning") {
        return; // Modal opened, keep dialog state
      }

      if (res.action === "existing") {
        toast.info("Existing canonical node resolved in this hierarchy location.");
        if (res.node_id) setSelectedId(res.node_id);
        setDialog(null);
        setDuplicateWarning(null);
        refreshAll();
        return;
      }

      toast.success(dialog === "edit" ? "Node updated" : "Knowledge node created");
      if (res.node_id) setSelectedId(res.node_id);
      setDialog(null);
      setDuplicateWarning(null);
      refreshAll();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Safe Move Node Mutation
  const moveNode = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      const targetParentId = form.parent_id === NONE ? null : form.parent_id;

      // Validate move (prevents circular hierarchy A -> B -> C -> A)
      const val = validateNodeMove(allNodes, selected.id, targetParentId);
      if (!val.valid) {
        throw new Error(val.error ?? "Invalid node move.");
      }

      // Try PostgreSQL RPC first
      try {
        const { data, error } = await supabase.rpc("safe_move_knowledge_node", {
          p_node_id: selected.id,
          p_new_parent_id: targetParentId,
        });
        if (!error && data) {
          return;
        }
      } catch {
        // Fall back to direct update with trigger protection
      }

      const { error } = await supabase
        .from("knowledge_nodes")
        .update({
          parent_id: targetParentId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", selected.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Node moved safely");
      setDialog(null);
      refreshAll();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Archive / Restore Node Mutation
  const archiveNode = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      const nextStatus = selected.status === "archived" ? "active" : "archived";
      const { error } = await supabase
        .from("knowledge_nodes")
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq("id", selected.id);
      if (error) throw error;
      return nextStatus;
    },
    onSuccess: (status) => {
      toast.success(status === "archived" ? "Node archived" : "Node restored");
      refreshAll();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Add Alias Mutation
  const addAlias = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      const { error } = await supabase.from("knowledge_aliases").insert({
        node_id: selected.id,
        alias: aliasForm.alias.trim(),
        alias_type: aliasForm.alias_type,
        language: aliasForm.language.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Alias added");
      setAliasForm({ alias: "", alias_type: "alternate_name", language: "" });
      setDialog(null);
      refreshAll();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Remove Alias Mutation
  const removeAlias = useMutation({
    mutationFn: async (aliasId: string) => {
      const { error } = await supabase.from("knowledge_aliases").delete().eq("id", aliasId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Alias removed");
      refreshAll();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Add Typed Semantic Relation Mutation
  const addRelation = useMutation({
    mutationFn: async () => {
      if (!selected || relationForm.target === NONE) return;
      const { error } = await supabase.from("knowledge_edges").insert({
        source_node_id: selected.id,
        target_node_id: relationForm.target,
        relation_type: relationForm.type,
        description: relationForm.description.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Relation created");
      setRelationForm({ target: NONE, type: "related_to", description: "" });
      setDialog(null);
      refreshAll();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function openCreate(asChild: boolean) {
    setForm({
      name: "",
      node_type: "topic",
      description: "",
      summary: "",
      status: "active",
      parent_id: asChild && selected ? selected.id : NONE,
    });
    setDuplicateWarning(null);
    setDialog("create");
  }

  function openEdit() {
    if (!selected) return;
    setForm({
      name: selected.name,
      node_type: selected.node_type,
      description: selected.description ?? "",
      summary: selected.summary ?? "",
      status: selected.status,
      parent_id: selected.parent_id ?? NONE,
    });
    setDuplicateWarning(null);
    setDialog("edit");
  }

  const invalidParents = useMemo(
    () => (selected ? getDescendantIds(allNodes, selected.id) : new Set<string>()),
    [allNodes, selected],
  );

  const moveValidation = useMemo(() => {
    if (!selected || dialog !== "move") return { valid: true };
    const target = form.parent_id === NONE ? null : form.parent_id;
    return validateNodeMove(allNodes, selected.id, target);
  }, [allNodes, selected, form.parent_id, dialog]);

  const targetPathPreview = useMemo(() => {
    if (form.parent_id === NONE) return "Root (Top Level)";
    return `${formatHierarchyPath(allNodes, form.parent_id)} > ${selected?.name ?? ""}`;
  }, [allNodes, form.parent_id, selected]);

  const nodeName = (id: string) => allNodes.find((n) => n.id === id)?.name ?? "Unknown";

  return (
    <AppShell
      title="Knowledge Explorer"
      description="Unlimited-depth hierarchy, canonical identity, aliases, and semantic relations."
      actions={
        <Button size="sm" onClick={() => openCreate(false)}>
          <Plus className="size-4" /> New root node
        </Button>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
        {/* Left column: Tree Navigation */}
        <aside className="panel h-fit max-h-[82vh] overflow-auto p-3">
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Taxonomy Hierarchy
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">
              {activeNodes.length} nodes
            </span>
          </div>

          {activeNodes.length === 0 ? (
            <p className="px-2 py-6 text-sm text-muted-foreground">
              No knowledge nodes yet. Create your first root node to begin.
            </p>
          ) : (
            <KnowledgeTree
              nodes={tree}
              selectedId={selectedId}
              onSelect={setSelectedId}
              showArchived={showArchived}
              onToggleShowArchived={() => setShowArchived((v) => !v)}
            />
          )}
        </aside>

        {/* Right column: Selected Node Detail */}
        <section>
          {!selected ? (
            <EmptyState
              icon={Library}
              title="Select a knowledge node"
              description="Pick a node from the taxonomy tree to inspect its canonical identity, aliases, children, and semantic graph relations — or create a root node."
            />
          ) : (
            <div className="space-y-5">
              {/* Header Panel with Breadcrumb Navigation */}
              <div className="panel p-5">
                {/* Interactive Breadcrumb Navigation */}
                <nav
                  aria-label="Hierarchy Breadcrumbs"
                  className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"
                >
                  <button
                    type="button"
                    onClick={() => setSelectedId(null)}
                    className="flex items-center gap-1 hover:text-foreground"
                  >
                    <Home className="size-3.5" />
                    <span>Knowledge</span>
                  </button>

                  {path.map((item) => (
                    <span key={item.id} className="flex items-center gap-1.5">
                      <ChevronRight className="size-3 text-muted-foreground/60" />
                      <button
                        type="button"
                        onClick={() => setSelectedId(item.id)}
                        className={cn(
                          "transition-colors hover:text-foreground",
                          item.id === selected.id && "font-semibold text-foreground",
                        )}
                      >
                        {item.name}
                      </button>
                    </span>
                  ))}
                </nav>

                {/* Node Title & Action Toolbar */}
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/50 pb-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-bold tracking-tight">{selected.name}</h2>
                      {selected.status === "archived" ? (
                        <span className="rounded bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                          Archived
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="inline-flex items-center gap-1 rounded bg-secondary px-2 py-0.5 font-mono text-muted-foreground">
                        <Hash className="size-3" /> {selected.node_type}
                      </span>
                      <span className="rounded bg-secondary px-2 py-0.5 font-mono text-muted-foreground">
                        {selected.status}
                      </span>
                      <span className="rounded bg-secondary px-2 py-0.5 font-mono text-muted-foreground">
                        canonical: {selected.canonical_name ?? selected.name.toLowerCase()}
                      </span>
                      <span className="rounded bg-secondary px-2 py-0.5 font-mono text-muted-foreground">
                        /{selected.slug}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" onClick={() => openCreate(true)}>
                      <Plus className="size-4" /> Child
                    </Button>
                    <Button size="sm" variant="secondary" onClick={openEdit}>
                      <Pencil className="size-4" /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setForm((f) => ({ ...f, parent_id: selected.parent_id ?? NONE }));
                        setDialog("move");
                      }}
                    >
                      <FolderTree className="size-4" /> Move
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => archiveNode.mutate()}
                      disabled={archiveNode.isPending}
                    >
                      <Archive className="size-4" />
                      {selected.status === "archived" ? "Restore" : "Archive"}
                    </Button>
                  </div>
                </div>

                {/* Description & Summary */}
                {selected.description ? (
                  <p className="mt-4 text-sm text-foreground/90">{selected.description}</p>
                ) : null}
                {selected.summary ? (
                  <div className="mt-2 rounded-md bg-secondary/50 p-2.5 text-xs text-muted-foreground">
                    <strong className="text-foreground">Summary: </strong>
                    {selected.summary}
                  </div>
                ) : null}

                {/* Metadata Grid */}
                <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-4 border-t border-border/50 pt-3">
                  <div>
                    <dt className="text-muted-foreground">Parent</dt>
                    <dd className="font-medium">
                      {selected.parent_id ? (
                        <button
                          type="button"
                          className="hover:underline text-primary"
                          onClick={() => setSelectedId(selected.parent_id)}
                        >
                          {nodeName(selected.parent_id)}
                        </button>
                      ) : (
                        "— Root node —"
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Full Path</dt>
                    <dd className="truncate text-muted-foreground" title={formatHierarchyPath(allNodes, selected.id)}>
                      {formatHierarchyPath(allNodes, selected.id)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Created</dt>
                    <dd>{new Date(selected.created_at).toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Updated</dt>
                    <dd>{new Date(selected.updated_at).toLocaleString()}</dd>
                  </div>
                </dl>
              </div>

              {/* Multi-Section Details Grid */}
              <div className="grid gap-5 lg:grid-cols-3">
                {/* 1. Children List */}
                <div className="panel p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold">
                      Children ({children.length})
                    </h3>
                    <Button size="sm" variant="ghost" onClick={() => openCreate(true)} title="Add child node">
                      <Plus className="size-4" />
                    </Button>
                  </div>
                  {children.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No child nodes yet.</p>
                  ) : (
                    <ul className="space-y-1.5 text-sm">
                      {children.map((child) => (
                        <li key={child.id}>
                          <button
                            type="button"
                            className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-accent"
                            onClick={() => setSelectedId(child.id)}
                          >
                            <span className="truncate">{child.name}</span>
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {child.node_type}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* 2. Aliases Section (Alias Engine) */}
                <div className="panel p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold">Aliases</h3>
                      <p className="text-[11px] text-muted-foreground">
                        Alternative canonical names
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setDialog("alias")}>
                      <Tags className="size-4" />
                    </Button>
                  </div>

                  {!aliasesQuery.data || aliasesQuery.data.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No aliases yet. Add abbreviations, translations, or alternate names.
                    </p>
                  ) : (
                    <ul className="flex flex-wrap gap-2">
                      {aliasesQuery.data.map((alias) => (
                        <li
                          key={alias.id}
                          className="group inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary/80 px-2.5 py-1 text-xs text-secondary-foreground"
                        >
                          <span className="font-medium">{alias.alias}</span>
                          {alias.alias_type ? (
                            <span className="rounded bg-background px-1 text-[9px] font-mono text-muted-foreground">
                              {alias.alias_type}
                            </span>
                          ) : null}
                          {alias.language ? (
                            <span className="text-[10px] text-muted-foreground">
                              ({alias.language})
                            </span>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => removeAlias.mutate(alias.id)}
                            className="ml-1 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                            title="Remove alias"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* 3. Semantic Graph Relations (Knowledge Graph) */}
                <div className="panel p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold">Semantic Graph</h3>
                      <p className="text-[11px] text-muted-foreground">
                        Graph relations (uses, requires…)
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setDialog("relation")}>
                      <GitBranch className="size-4" />
                    </Button>
                  </div>

                  {!edgesQuery.data || edgesQuery.data.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No semantic relations yet.</p>
                  ) : (
                    <ul className="space-y-2 text-xs">
                      {edgesQuery.data.map((edge) => {
                        const outgoing = edge.source_node_id === selected.id;
                        const otherId = outgoing ? edge.target_node_id : edge.source_node_id;
                        return (
                          <li
                            key={edge.id}
                            className="flex items-center justify-between rounded bg-secondary/40 p-1.5"
                          >
                            <div className="flex items-center gap-1.5 truncate">
                              <span className="font-mono text-primary text-[11px]">
                                {outgoing ? "→" : "←"} {edge.relation_type}
                              </span>
                              <button
                                type="button"
                                className="truncate font-medium hover:underline"
                                onClick={() => setSelectedId(otherId)}
                              >
                                {nodeName(otherId)}
                              </button>
                            </div>
                            {edge.confidence !== null ? (
                              <span className="text-[10px] font-mono text-muted-foreground">
                                {edge.confidence}
                              </span>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>

              {/* 4. Cross-Category Knowledge Entries */}
              <div className="panel p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold">Cross-Category Knowledge Entries</h3>
                    <p className="text-xs text-muted-foreground">
                      Articles and entries associated with this knowledge node across multiple categories
                    </p>
                  </div>
                  <span className="font-mono text-xs text-muted-foreground">
                    {entriesQuery.data?.length ?? 0} entries
                  </span>
                </div>

                {!entriesQuery.data || entriesQuery.data.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No articles or entries are attached to this knowledge node yet.
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {entriesQuery.data.map((item) =>
                      item.entry ? (
                        <div
                          key={item.id}
                          className="rounded-lg border border-border p-3 text-xs space-y-1 bg-secondary/20"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-foreground">{item.entry.title}</span>
                            <span className="rounded bg-secondary px-1.5 py-0.2 font-mono text-[10px] text-muted-foreground">
                              {item.role}
                            </span>
                          </div>
                          {item.entry.summary ? (
                            <p className="text-muted-foreground line-clamp-2">{item.entry.summary}</p>
                          ) : null}
                          <div className="font-mono text-[10px] text-muted-foreground">
                            /{item.entry.slug} • {item.entry.status}
                          </div>
                        </div>
                      ) : null,
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Dialog 1: Create / Edit Node */}
      <Dialog
        open={dialog === "create" || dialog === "edit"}
        onOpenChange={(open) => {
          if (!open) {
            setDialog(null);
            setDuplicateWarning(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{dialog === "edit" ? "Edit Knowledge Node" : "New Knowledge Node"}</DialogTitle>
            <DialogDescription>
              Nodes support unlimited depth. Before creation, the knowledge base is searched for existing canonical nodes and aliases.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="node-name">Name</Label>
              <Input
                id="node-name"
                placeholder="e.g. Dependency Injection, Redis, Laravel"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select
                  value={form.node_type}
                  onValueChange={(v) => setForm({ ...form, node_type: v as NodeType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NODE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) => setForm({ ...form, status: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NODE_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Parent Hierarchy Location</Label>
              <Select
                value={form.parent_id}
                onValueChange={(v) => setForm({ ...form, parent_id: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value={NONE}>— Root level (top of taxonomy) —</SelectItem>
                  {allNodes
                    .filter((n) => !(dialog === "edit" && invalidParents.has(n.id)))
                    .map((n) => (
                      <SelectItem key={n.id} value={n.id}>
                        {formatHierarchyPath(allNodes, n.id)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="node-description">Description</Label>
              <Textarea
                id="node-description"
                rows={2}
                placeholder="Detailed explanation of this knowledge node…"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="node-summary">Short Summary</Label>
              <Textarea
                id="node-summary"
                rows={2}
                placeholder="One sentence summary…"
                value={form.summary}
                onChange={(e) => setForm({ ...form, summary: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              disabled={!form.name.trim() || createOrUpdateNode.isPending}
              onClick={() => createOrUpdateNode.mutate()}
            >
              {dialog === "edit" ? "Save Changes" : "Create Node"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog 2: Duplicate Warning Modal (Resolution Engine) */}
      <Dialog
        open={Boolean(duplicateWarning)}
        onOpenChange={(open) => !open && setDuplicateWarning(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-amber-500">
              <AlertTriangle className="size-5" />
              <DialogTitle>Possible Existing Knowledge Found</DialogTitle>
            </div>
            <DialogDescription>
              {duplicateWarning?.resolution.reason}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Instead of creating duplicates, the Brain prefers connecting or reusing existing canonical nodes.
            </p>

            <div className="max-h-48 overflow-y-auto space-y-2 rounded-md border border-border p-2 bg-secondary/20">
              {duplicateWarning?.resolution.candidates.map((cand: NodeCandidate) => (
                <div
                  key={cand.id}
                  className="flex items-center justify-between rounded p-2 text-xs hover:bg-secondary/60"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-foreground flex items-center gap-1.5">
                      {cand.name}
                      <span className="font-mono text-[10px] text-muted-foreground">
                        ({cand.node_type})
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">
                      {cand.parent_path ?? "Root"}
                    </div>
                    <div className="text-[10px] text-primary">
                      Match: {cand.match_type} {cand.matched_alias ? `("${cand.matched_alias}")` : ""} • confidence {(cand.confidence * 100).toFixed(0)}%
                    </div>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    className="ml-2 shrink-0 h-7 text-xs"
                    onClick={() => {
                      setSelectedId(cand.id);
                      setDuplicateWarning(null);
                      setDialog(null);
                      toast.info(`Selected existing canonical node "${cand.name}".`);
                    }}
                  >
                    Use Existing
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="ghost"
              onClick={() => setDuplicateWarning(null)}
            >
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={() => createOrUpdateNode.mutate({ force: true })}
              disabled={createOrUpdateNode.isPending}
            >
              Create Anyway (Override)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog 3: Safe Move Node */}
      <Dialog open={dialog === "move"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Move Knowledge Node</DialogTitle>
            <DialogDescription>
              Relocate this node in the taxonomy. A node cannot be moved inside its own subtree.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md bg-secondary/50 p-2.5 text-xs space-y-1">
              <div>
                <span className="text-muted-foreground">Node to move: </span>
                <strong className="text-foreground">{selected?.name}</strong>
              </div>
              <div>
                <span className="text-muted-foreground">Current path: </span>
                <span className="font-mono text-muted-foreground">
                  {selected ? formatHierarchyPath(allNodes, selected.id) : ""}
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Target Parent Location</Label>
              <Select
                value={form.parent_id}
                onValueChange={(v) => setForm({ ...form, parent_id: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value={NONE}>— Root level (Top level) —</SelectItem>
                  {allNodes
                    .filter((n) => !invalidParents.has(n.id))
                    .map((n) => (
                      <SelectItem key={n.id} value={n.id}>
                        {formatHierarchyPath(allNodes, n.id)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Destination Preview */}
            <div className="rounded-md border border-border p-2.5 text-xs space-y-1">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <ArrowRight className="size-3.5" />
                <span>Destination preview:</span>
              </div>
              <p className="font-mono text-foreground font-medium pl-5">
                {targetPathPreview}
              </p>
            </div>

            {/* Circular Hierarchy & Sibling Collision Error Notice */}
            {!moveValidation.valid ? (
              <div className="rounded-md bg-destructive/10 p-2.5 text-xs text-destructive flex items-start gap-2">
                <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                <span>{moveValidation.error}</span>
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              disabled={!moveValidation.valid || moveNode.isPending}
              onClick={() => moveNode.mutate()}
            >
              Confirm Move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog 4: Add Alias */}
      <Dialog open={dialog === "alias"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Alias</DialogTitle>
            <DialogDescription>
              Aliases (abbreviations, translations, alternate spellings) resolve to this canonical node during search and AI extraction.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="alias-input">Alias Text</Label>
              <Input
                id="alias-input"
                placeholder="e.g. DI, حقن الاعتماديات, Dependency-Injection"
                value={aliasForm.alias}
                onChange={(e) => setAliasForm({ ...aliasForm, alias: e.target.value })}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Alias Type</Label>
                <Select
                  value={aliasForm.alias_type}
                  onValueChange={(v) =>
                    setAliasForm({ ...aliasForm, alias_type: v as AliasType })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALIAS_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="alias-lang">Language (optional)</Label>
                <Input
                  id="alias-lang"
                  placeholder="en, ar, fr…"
                  value={aliasForm.language}
                  onChange={(e) => setAliasForm({ ...aliasForm, language: e.target.value })}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              disabled={!aliasForm.alias.trim() || addAlias.isPending}
              onClick={() => addAlias.mutate()}
            >
              Add Alias
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog 5: Create Semantic Typed Relation */}
      <Dialog open={dialog === "relation"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Semantic Relation</DialogTitle>
            <DialogDescription>
              Connect this node to another knowledge entity in the semantic knowledge graph.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <Label>Relation Type</Label>
              <Select
                value={relationForm.type}
                onValueChange={(v) => setRelationForm({ ...relationForm, type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RELATION_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Target Node</Label>
              <Select
                value={relationForm.target}
                onValueChange={(v) => setRelationForm({ ...relationForm, target: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select target node" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {allNodes
                    .filter((n) => n.id !== selected?.id)
                    .map((n) => (
                      <SelectItem key={n.id} value={n.id}>
                        {n.name} ({n.node_type})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="relation-description">Description (optional)</Label>
              <Input
                id="relation-description"
                placeholder="e.g. Primary backend dependency"
                value={relationForm.description}
                onChange={(e) => setRelationForm({ ...relationForm, description: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              disabled={relationForm.target === NONE || addRelation.isPending}
              onClick={() => addRelation.mutate()}
            >
              Create Relation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

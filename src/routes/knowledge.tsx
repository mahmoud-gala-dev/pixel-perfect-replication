import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Library, Plus, Tags, GitBranch, Archive, Pencil, FolderTree } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AppShell, EmptyState } from "@/components/AppShell";
import { KnowledgeTree } from "@/components/KnowledgeTree";
import { useAuth } from "@/hooks/useAuth";
import {
  ancestorPath,
  buildTree,
  descendantIds,
  NODE_STATUSES,
  NODE_TYPES,
  RELATION_TYPES,
  slugify,
  type KnowledgeNode,
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

export const Route = createFileRoute("/knowledge")({
  head: () => ({
    meta: [
      { title: "Knowledge Explorer — Knowledge Brain" },
      {
        name: "description",
        content: "Browse and edit your unlimited-depth knowledge hierarchy, aliases and typed relations.",
      },
      { property: "og:title", content: "Knowledge Explorer — Knowledge Brain" },
      {
        property: "og:description",
        content: "Browse and edit your unlimited-depth knowledge hierarchy, aliases and typed relations.",
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
  const [dialog, setDialog] = useState<null | "create" | "edit" | "move" | "alias" | "relation">(null);

  const [form, setForm] = useState({
    name: "",
    node_type: "topic",
    description: "",
    summary: "",
    status: "active",
    parent_id: NONE as string,
  });
  const [aliasValue, setAliasValue] = useState("");
  const [aliasLanguage, setAliasLanguage] = useState("");
  const [relation, setRelation] = useState({ target: NONE as string, type: "related_to", description: "" });

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

  const nodes = useMemo(() => nodesQuery.data ?? [], [nodesQuery.data]);
  const tree = useMemo(() => buildTree(nodes), [nodes]);
  const selected = nodes.find((n) => n.id === selectedId) ?? null;
  const children = nodes.filter((n) => n.parent_id === selectedId);
  const path = selected ? ancestorPath(nodes, selected.id) : [];

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
      return data;
    },
  });

  const edgesQuery = useQuery({
    queryKey: ["node-edges", selectedId],
    enabled: !!selectedId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_edges")
        .select("*")
        .or(`source_node_id.eq.${selectedId},target_node_id.eq.${selectedId}`);
      if (error) throw error;
      return data;
    },
  });

  function refreshAll() {
    void queryClient.invalidateQueries({ queryKey: ["nodes"] });
    void queryClient.invalidateQueries({ queryKey: ["aliases", selectedId] });
    void queryClient.invalidateQueries({ queryKey: ["node-edges", selectedId] });
    void queryClient.invalidateQueries({ queryKey: ["brain-stats"] });
  }

  const saveNode = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        slug: slugify(form.name),
        node_type: form.node_type as KnowledgeNode["node_type"],
        description: form.description.trim() || null,
        summary: form.summary.trim() || null,
        status: form.status as KnowledgeNode["status"],
        parent_id: form.parent_id === NONE ? null : form.parent_id,
      };
      if (dialog === "edit" && selected) {
        const { error } = await supabase.from("knowledge_nodes").update(payload).eq("id", selected.id);
        if (error) throw error;
        return selected.id;
      }
      const { data, error } = await supabase.from("knowledge_nodes").insert(payload).select().single();
      if (error) throw error;
      return data.id;
    },
    onSuccess: (id) => {
      toast.success(dialog === "edit" ? "Node updated" : "Node created");
      setSelectedId(id);
      setDialog(null);
      refreshAll();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const moveNode = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      const { error } = await supabase
        .from("knowledge_nodes")
        .update({ parent_id: form.parent_id === NONE ? null : form.parent_id })
        .eq("id", selected.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Node moved");
      setDialog(null);
      refreshAll();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const archiveNode = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      const nextStatus = selected.status === "archived" ? "active" : "archived";
      const { error } = await supabase
        .from("knowledge_nodes")
        .update({ status: nextStatus })
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

  const addAlias = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      const { error } = await supabase.from("knowledge_aliases").insert({
        node_id: selected.id,
        alias: aliasValue.trim(),
        language: aliasLanguage.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Alias added");
      setAliasValue("");
      setAliasLanguage("");
      setDialog(null);
      refreshAll();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const addRelation = useMutation({
    mutationFn: async () => {
      if (!selected || relation.target === NONE) return;
      const { error } = await supabase.from("knowledge_edges").insert({
        source_node_id: selected.id,
        target_node_id: relation.target,
        relation_type: relation.type,
        description: relation.description.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Relation created");
      setRelation({ target: NONE, type: "related_to", description: "" });
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
    setDialog("edit");
  }

  const invalidParents = selected ? descendantIds(nodes, selected.id) : new Set<string>();
  const nodeName = (id: string) => nodes.find((n) => n.id === id)?.name ?? "Unknown";

  return (
    <AppShell
      title="Knowledge Explorer"
      description="Unlimited-depth hierarchy. Create, edit, move and archive nodes manually."
      actions={
        <Button size="sm" onClick={() => openCreate(false)}>
          <Plus className="size-4" /> New root node
        </Button>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[20rem_1fr]">
        <aside className="panel h-fit max-h-[70vh] overflow-auto p-3">
          {nodes.length === 0 ? (
            <p className="px-2 py-6 text-sm text-muted-foreground">
              No knowledge nodes yet. Create your first root node.
            </p>
          ) : (
            <KnowledgeTree nodes={tree} selectedId={selectedId} onSelect={setSelectedId} />
          )}
        </aside>

        <section>
          {!selected ? (
            <EmptyState
              icon={Library}
              title="Select a node"
              description="Pick a node from the tree to see its type, description, parent, children, aliases and relations — or create your first root node to begin."
            />
          ) : (
            <div className="space-y-5">
              <div className="panel p-5">
                <nav className="mb-2 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                  {path.map((item, index) => (
                    <span key={item.id} className="flex items-center gap-1">
                      {index > 0 ? <span>/</span> : null}
                      <button
                        className="hover:text-foreground"
                        onClick={() => setSelectedId(item.id)}
                        type="button"
                      >
                        {item.name}
                      </button>
                    </span>
                  ))}
                </nav>
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-xl font-semibold tracking-tight">{selected.name}</h2>
                    <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
                      <span className="rounded bg-secondary px-2 py-0.5 font-mono text-muted-foreground">
                        {selected.node_type}
                      </span>
                      <span className="rounded bg-secondary px-2 py-0.5 font-mono text-muted-foreground">
                        {selected.status}
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
                    <Button size="sm" variant="secondary" onClick={() => archiveNode.mutate()}>
                      <Archive className="size-4" />
                      {selected.status === "archived" ? "Restore" : "Archive"}
                    </Button>
                  </div>
                </div>

                {selected.description ? (
                  <p className="mt-4 text-sm text-muted-foreground">{selected.description}</p>
                ) : null}
                {selected.summary ? <p className="mt-2 text-sm">{selected.summary}</p> : null}

                <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
                  <div>
                    <dt className="text-muted-foreground">Parent</dt>
                    <dd>{selected.parent_id ? nodeName(selected.parent_id) : "— root —"}</dd>
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

              <div className="grid gap-5 xl:grid-cols-3">
                <div className="panel p-4">
                  <h3 className="mb-3 text-sm font-semibold">Children</h3>
                  {children.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No children yet.</p>
                  ) : (
                    <ul className="space-y-1 text-sm">
                      {children.map((child) => (
                        <li key={child.id}>
                          <button
                            type="button"
                            className="hover:text-primary"
                            onClick={() => setSelectedId(child.id)}
                          >
                            {child.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="panel p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Aliases</h3>
                    <Button size="sm" variant="ghost" onClick={() => setDialog("alias")}>
                      <Tags className="size-4" />
                    </Button>
                  </div>
                  {!aliasesQuery.data || aliasesQuery.data.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No aliases yet.</p>
                  ) : (
                    <ul className="flex flex-wrap gap-2">
                      {aliasesQuery.data.map((alias) => (
                        <li
                          key={alias.id}
                          className="rounded bg-secondary px-2 py-1 text-xs text-secondary-foreground"
                        >
                          {alias.alias}
                          {alias.language ? (
                            <span className="ml-1 text-muted-foreground">({alias.language})</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="panel p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Related knowledge</h3>
                    <Button size="sm" variant="ghost" onClick={() => setDialog("relation")}>
                      <GitBranch className="size-4" />
                    </Button>
                  </div>
                  {!edgesQuery.data || edgesQuery.data.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No relations yet.</p>
                  ) : (
                    <ul className="space-y-2 text-xs">
                      {edgesQuery.data.map((edge) => {
                        const outgoing = edge.source_node_id === selected.id;
                        const other = outgoing ? edge.target_node_id : edge.source_node_id;
                        return (
                          <li key={edge.id} className="flex items-center gap-2">
                            <span className="font-mono text-primary">
                              {outgoing ? "→" : "←"} {edge.relation_type}
                            </span>
                            <button
                              type="button"
                              className="truncate hover:text-primary"
                              onClick={() => setSelectedId(other)}
                            >
                              {nodeName(other)}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Create / edit node */}
      <Dialog
        open={dialog === "create" || dialog === "edit"}
        onOpenChange={(open) => !open && setDialog(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog === "edit" ? "Edit node" : "New knowledge node"}</DialogTitle>
            <DialogDescription>
              Nodes can nest to any depth — a child can always have another child.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="node-name">Name</Label>
              <Input
                id="node-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select
                  value={form.node_type}
                  onValueChange={(v) => setForm({ ...form, node_type: v })}
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
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
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
              <Label>Parent</Label>
              <Select value={form.parent_id} onValueChange={(v) => setForm({ ...form, parent_id: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— root —</SelectItem>
                  {nodes
                    .filter((n) => !(dialog === "edit" && invalidParents.has(n.id)))
                    .map((n) => (
                      <SelectItem key={n.id} value={n.id}>
                        {n.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="node-description">Description</Label>
              <Textarea
                id="node-description"
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="node-summary">Summary</Label>
              <Textarea
                id="node-summary"
                rows={2}
                value={form.summary}
                onChange={(e) => setForm({ ...form, summary: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button disabled={!form.name.trim() || saveNode.isPending} onClick={() => saveNode.mutate()}>
              {dialog === "edit" ? "Save changes" : "Create node"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move */}
      <Dialog open={dialog === "move"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move node</DialogTitle>
            <DialogDescription>A node cannot be moved inside its own subtree.</DialogDescription>
          </DialogHeader>
          <Select value={form.parent_id} onValueChange={(v) => setForm({ ...form, parent_id: v })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>— root —</SelectItem>
              {nodes
                .filter((n) => !invalidParents.has(n.id))
                .map((n) => (
                  <SelectItem key={n.id} value={n.id}>
                    {n.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button disabled={moveNode.isPending} onClick={() => moveNode.mutate()}>
              Move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Alias */}
      <Dialog open={dialog === "alias"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add alias</DialogTitle>
            <DialogDescription>
              Alternative names in any language (e.g. DI, حقن الاعتماديات) point to the same node.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="alias">Alias</Label>
              <Input id="alias" value={aliasValue} onChange={(e) => setAliasValue(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="alias-lang">Language (optional)</Label>
              <Input
                id="alias-lang"
                placeholder="en, ar, de…"
                value={aliasLanguage}
                onChange={(e) => setAliasLanguage(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button disabled={!aliasValue.trim() || addAlias.isPending} onClick={() => addAlias.mutate()}>
              Add alias
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Relation */}
      <Dialog open={dialog === "relation"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create relation</DialogTitle>
            <DialogDescription>Typed link from this node to another node.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Relation type</Label>
              <Select value={relation.type} onValueChange={(v) => setRelation({ ...relation, type: v })}>
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
              <Label>Target node</Label>
              <Select
                value={relation.target}
                onValueChange={(v) => setRelation({ ...relation, target: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a node" />
                </SelectTrigger>
                <SelectContent>
                  {nodes
                    .filter((n) => n.id !== selected?.id)
                    .map((n) => (
                      <SelectItem key={n.id} value={n.id}>
                        {n.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="relation-description">Description (optional)</Label>
              <Input
                id="relation-description"
                value={relation.description}
                onChange={(e) => setRelation({ ...relation, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              disabled={relation.target === NONE || addRelation.isPending}
              onClick={() => addRelation.mutate()}
            >
              Create relation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

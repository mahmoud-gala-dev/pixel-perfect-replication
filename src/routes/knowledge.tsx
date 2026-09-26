import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Library,
  Plus,
  Tags,
  GitBranch,
  Archive,
  Pencil,
  FolderTree,
  Network,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  ArrowRight,
  ChevronRight,
  BookOpen,
  Home,
  FileText,
  Hash,
  Quote,
  Scale,
  ShieldCheck,
  HelpCircle,
  XCircle,
  ExternalLink,
  Layers,
  Search,
  ArrowLeftRight,
  History,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { OfflineChatStore } from "@/lib/offline/offline-chat-store";
import { AppShell, EmptyState } from "@/components/AppShell";
import { KnowledgeTree } from "@/components/KnowledgeTree";
import { useAuth } from "@/hooks/useAuth";
import { EntityHistoryModal } from "@/components/knowledge/EntityHistoryModal";
import { EvidencePathModal } from "@/components/knowledge/EvidencePathModal";
import { ConflictDashboardModal } from "@/components/knowledge/ConflictDashboardModal";
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
  DEFAULT_RELATION_TYPES,
  CLAIM_TYPES,
  EVIDENCE_STANCES,
  EVIDENCE_TYPES,
  SOURCE_KINDS,
  getRelationTypeDef,
  safeCreateKnowledgeNode,
  safeCreateRelation,
  safeCreateClaim,
  safeAttachEvidence,
  groupEvidenceByStance,
  normalizeSourceUrl,
  validateNodeMove,
  type AliasType,
  type KnowledgeAlias,
  type KnowledgeEdge,
  type KnowledgeNode,
  type NodeCandidate,
  type NodeResolutionResult,
  type NodeType,
  type SafeCreateNodeInput,
  type ClaimType,
  type EvidenceStance,
  type EvidenceType,
  type SourceKind,
  type KnowledgeClaimRow,
  type SourceRow,
  type EvidenceRow,
  type NodeRelationItem,
  type RelationTypeDef,
  type RelationTypeRow,
  type KnowledgeStatus,
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const initialNodeId = useMemo(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("nodeId");
  }, []);
  const [selectedId, setSelectedId] = useState<string | null>(initialNodeId);
  const [showArchived, setShowArchived] = useState(false);
  const [dialog, setDialog] = useState<
    null | "create" | "edit" | "move" | "alias" | "relation" | "claim" | "inspect-evidence" | "attach-evidence"
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
    type: "uses",
    description: "",
    confidence: 1.0,
  });
  const [relationSearch, setRelationSearch] = useState("");
  const [relationsTab, setRelationsTab] = useState<"all" | "outgoing" | "incoming">("all");

  const [claimForm, setClaimForm] = useState({
    statement: "",
    claim_type: "fact" as ClaimType,
    confidence: 1.0,
  });

  const [selectedClaimForEvidence, setSelectedClaimForEvidence] = useState<KnowledgeClaimRow | null>(null);
  const [evidenceForm, setEvidenceForm] = useState({
    stance: "supported" as EvidenceStance,
    source_id: NONE as string,
    excerpt: "",
    locator: "",
    evidence_type: "direct_quote" as EvidenceType,
    confidence: 1.0,
    quickSourceTitle: "",
    quickSourceUrl: "",
    quickSourceKind: "documentation" as SourceKind,
    isCreatingSource: false,
  });

  // Duplicate warning modal state (Search-Before-Create Resolution)
  const [duplicateWarning, setDuplicateWarning] = useState<{
    resolution: NodeResolutionResult;
    input: SafeCreateNodeInput;
  } | null>(null);

  // Phase 8: History, Evidence Path & Conflict states
  const [selectedHistoryEntity, setSelectedHistoryEntity] = useState<{ table: string; id: string; name: string } | null>(null);
  const [selectedClaimForPath, setSelectedClaimForPath] = useState<string | null>(null);
  const [showConflictDashboard, setShowConflictDashboard] = useState<boolean>(false);
  const [showOutdatedClaims, setShowOutdatedClaims] = useState<boolean>(false);

  // Fetch all nodes (with IndexedDB offline cache fallback)
  const nodesQuery = useQuery({
    queryKey: ["nodes"],
    enabled: !!session,
    queryFn: async () => {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return (await OfflineChatStore.getCachedKnowledgeNodes()) as KnowledgeNode[];
      }
      try {
        const { data, error } = await supabase
          .from("knowledge_nodes")
          .select("*")
          .is("deleted_at", null)
          .order("name");
        if (error) throw error;
        const nodes = (data ?? []) as KnowledgeNode[];
        await OfflineChatStore.cacheKnowledgeNodes(nodes as any);
        return nodes;
      } catch (err) {
        const cached = await OfflineChatStore.getCachedKnowledgeNodes();
        if (cached && cached.length > 0) return cached as KnowledgeNode[];
        throw err;
      }
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

  // Fetch relation types (with default fallback)
  const relationTypesQuery = useQuery({
    queryKey: ["relation-types"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("relation_types")
        .select("*")
        .order("name");
      if (error || !data || data.length === 0) return DEFAULT_RELATION_TYPES;
      return data as RelationTypeRow[];
    },
  });

  // Fetch claims for selected node
  const claimsQuery = useQuery({
    queryKey: ["node-claims", selectedId],
    enabled: !!selectedId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("knowledge_claims")
        .select("*")
        .eq("node_id", selectedId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as KnowledgeClaimRow[];
    },
  });

  // Fetch all evidence for selected node
  const allEvidenceQuery = useQuery({
    queryKey: ["node-evidence", selectedId],
    enabled: !!selectedId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("evidence")
        .select("*, source:sources(*)")
        .eq("node_id", selectedId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<EvidenceRow & { source: SourceRow | null }>;
    },
  });

  // Fetch reusable sources
  const sourcesQuery = useQuery({
    queryKey: ["sources"],
    enabled: !!session,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sources")
        .select("*")
        .is("deleted_at", null)
        .order("title");
      if (error) throw error;
      return (data ?? []) as SourceRow[];
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

  // Compute structured relations with symmetry and inverse keys
  const nodeRelations = useMemo(() => {
    if (!selected) return { outgoing: [], incoming: [], total: 0 };
    const allEdges = edgesQuery.data ?? [];
    const relationTypes = relationTypesQuery.data ?? DEFAULT_RELATION_TYPES;

    const nodesMap = new Map(allNodes.map((n) => [n.id, n]));
    const outgoing: NodeRelationItem[] = [];
    const incoming: NodeRelationItem[] = [];

    for (const edge of allEdges) {
      if (edge.status === "archived" || edge.status === "deprecated") continue;
      const relDef = getRelationTypeDef(edge.relation_type, relationTypes);

      if (edge.source_node_id === selected.id) {
        const targetNode = nodesMap.get(edge.target_node_id);
        outgoing.push({
          id: edge.id,
          direction: "outgoing",
          relation_type: edge.relation_type,
          relation_name: relDef.name,
          display_relation: edge.relation_type,
          inverse_key: relDef.inverse_key,
          is_symmetric: relDef.is_symmetric,
          description: edge.description,
          confidence: edge.confidence,
          status: edge.status as KnowledgeStatus,
          other_node: {
            id: edge.target_node_id,
            name: targetNode?.name ?? "Unknown Node",
            node_type: targetNode?.node_type ?? "concept",
            slug: targetNode?.slug ?? "",
          },
        });
      }

      if (edge.target_node_id === selected.id) {
        const sourceNode = nodesMap.get(edge.source_node_id);
        const displayRel = relDef.is_symmetric
          ? edge.relation_type
          : (relDef.inverse_key ?? `inverse_of_${edge.relation_type}`);

        incoming.push({
          id: edge.id,
          direction: "incoming",
          relation_type: edge.relation_type,
          relation_name: relDef.name,
          display_relation: displayRel,
          inverse_key: relDef.inverse_key,
          is_symmetric: relDef.is_symmetric,
          description: edge.description,
          confidence: edge.confidence,
          status: edge.status as KnowledgeStatus,
          other_node: {
            id: edge.source_node_id,
            name: sourceNode?.name ?? "Unknown Node",
            node_type: sourceNode?.node_type ?? "concept",
            slug: sourceNode?.slug ?? "",
          },
        });
      }
    }

    return { outgoing, incoming, total: outgoing.length + incoming.length };
  }, [selected, edgesQuery.data, relationTypesQuery.data, allNodes]);

  // Compute claims enriched with their supporting/contradicting evidence counts
  const claimsWithEvidence = useMemo(() => {
    const claims = claimsQuery.data ?? [];
    const allEv = allEvidenceQuery.data ?? [];

    return claims.map((claim) => {
      const claimEvidences = allEv.filter((e) => e.claim_id === claim.id);
      const grouped = groupEvidenceByStance(claimEvidences);
      return {
        ...claim,
        evidences: claimEvidences,
        grouped,
      };
    });
  }, [claimsQuery.data, allEvidenceQuery.data]);

  const displayedClaims = useMemo(() => {
    return claimsWithEvidence.filter((c) => {
      if (showOutdatedClaims) return true;
      const state = (c as any).knowledge_state;
      return state !== "outdated" && state !== "superseded" && state !== "deprecated";
    });
  }, [claimsWithEvidence, showOutdatedClaims]);

  function refreshAll() {
    void queryClient.invalidateQueries({ queryKey: ["nodes"] });
    void queryClient.invalidateQueries({ queryKey: ["aliases", selectedId] });
    void queryClient.invalidateQueries({ queryKey: ["all-aliases"] });
    void queryClient.invalidateQueries({ queryKey: ["node-edges", selectedId] });
    void queryClient.invalidateQueries({ queryKey: ["node-entries", selectedId] });
    void queryClient.invalidateQueries({ queryKey: ["node-claims", selectedId] });
    void queryClient.invalidateQueries({ queryKey: ["node-evidence", selectedId] });
    void queryClient.invalidateQueries({ queryKey: ["sources"] });
    void queryClient.invalidateQueries({ queryKey: ["relation-types"] });
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
          p_new_parent_id: (targetParentId ?? null) as string,
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

  // Safe Add Typed Semantic Relation Mutation
  const addRelation = useMutation({
    mutationFn: async () => {
      if (!selected || relationForm.target === NONE) {
        throw new Error("Please select a target knowledge node.");
      }
      const res = await safeCreateRelation(
        supabase,
        {
          source_node_id: selected.id,
          target_node_id: relationForm.target,
          relation_type: relationForm.type,
          description: relationForm.description.trim() || null,
          confidence: Number(relationForm.confidence) || 1.0,
        },
        edgesQuery.data ?? [],
        allNodes,
        relationTypesQuery.data ?? DEFAULT_RELATION_TYPES,
      );

      if (!res.created) {
        throw new Error(res.message ?? "Could not create relation.");
      }
      return res;
    },
    onSuccess: (res) => {
      toast.success(res.message ?? "Relation created successfully");
      setRelationForm({ target: NONE, type: "uses", description: "", confidence: 1.0 });
      setRelationSearch("");
      setDialog(null);
      refreshAll();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Archive Relation Mutation
  const archiveRelation = useMutation({
    mutationFn: async (edgeId: string) => {
      const { error } = await supabase
        .from("knowledge_edges")
        .update({ status: "archived", updated_at: new Date().toISOString() })
        .eq("id", edgeId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Relation archived");
      refreshAll();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Safe Add Atomic Claim Mutation
  const addClaim = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      const res = await safeCreateClaim(supabase, {
        node_id: selected.id,
        statement: claimForm.statement,
        claim_type: claimForm.claim_type,
        confidence: Number(claimForm.confidence) || 1.0,
      });

      if (!res.created) {
        throw new Error(res.message ?? "Failed to create atomic claim.");
      }
      return res;
    },
    onSuccess: () => {
      toast.success("Atomic claim added to knowledge node");
      setClaimForm({ statement: "", claim_type: "fact", confidence: 1.0 });
      setDialog(null);
      refreshAll();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Deprecate Claim Mutation
  const deprecateClaim = useMutation({
    mutationFn: async (claimId: string) => {
      const { error } = await supabase
        .from("knowledge_claims")
        .update({ status: "deprecated", updated_at: new Date().toISOString() })
        .eq("id", claimId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Claim deprecated");
      refreshAll();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Safe Attach Evidence Mutation
  const attachEvidence = useMutation({
    mutationFn: async () => {
      if (!selectedClaimForEvidence) {
        throw new Error("No claim selected for evidence attachment.");
      }

      let sourceId = evidenceForm.source_id;

      // Handle inline source creation
      if (evidenceForm.isCreatingSource) {
        if (!evidenceForm.quickSourceTitle.trim()) {
          throw new Error("Source title is required.");
        }
        const normalizedUrl = normalizeSourceUrl(evidenceForm.quickSourceUrl);
        const { data: newSource, error: sourceErr } = await supabase
          .from("sources")
          .insert({
            title: evidenceForm.quickSourceTitle.trim(),
            url: normalizedUrl,
            source_kind: evidenceForm.quickSourceKind,
          })
          .select("id")
          .single();

        if (sourceErr) throw sourceErr;
        sourceId = newSource.id;
      }

      if (sourceId === NONE) {
        throw new Error("Please select an existing source or create a new one.");
      }

      const res = await safeAttachEvidence(supabase, {
        claim_id: selectedClaimForEvidence.id,
        source_id: sourceId,
        stance: evidenceForm.stance,
        excerpt: evidenceForm.excerpt.trim() || null,
        locator: evidenceForm.locator.trim() || null,
        evidence_type: evidenceForm.evidence_type,
        confidence: Number(evidenceForm.confidence) || 1.0,
      });

      if (!res.created) {
        throw new Error(res.message ?? "Failed to attach evidence.");
      }
      return res;
    },
    onSuccess: (res) => {
      toast.success(
        `Evidence attached! Claim verification updated to "${res.claim_verification ?? "evaluated"}".`,
      );
      setEvidenceForm({
        stance: "supported",
        source_id: NONE,
        excerpt: "",
        locator: "",
        evidence_type: "direct_quote",
        confidence: 1.0,
        quickSourceTitle: "",
        quickSourceUrl: "",
        quickSourceKind: "documentation",
        isCreatingSource: false,
      });
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
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="border-amber-500/30 text-amber-500 hover:bg-amber-500/10 gap-1.5"
            onClick={() => setShowConflictDashboard(true)}
          >
            <AlertTriangle className="size-4" />
            Conflict Engine
          </Button>
          <Button size="sm" onClick={() => openCreate(false)}>
            <Plus className="size-4" /> New root node
          </Button>
        </div>
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
                      onClick={() => {
                        setSelectedHistoryEntity({
                          table: "knowledge_nodes",
                          id: selected.id,
                          name: selected.name,
                        });
                      }}
                    >
                      <History className="size-4" /> History
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        void navigate({ to: "/graph", search: { focus: selected.id } as any });
                      }}
                      title="Open in Knowledge Graph"
                    >
                      <Network className="size-4 text-cyan-400" /> View in Graph
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        void navigate({
                          to: "/chat",
                          search: { q: `Explain ${selected.name} and its verified claims in the Brain.` } as any,
                        });
                      }}
                      title="Ask Brain about this concept"
                    >
                      <Sparkles className="size-4 text-amber-400" /> Ask Brain
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

              {/* Row 1: Children and Aliases (Taxonomy Navigation) */}
              <div className="grid gap-5 sm:grid-cols-2">
                {/* 1. Children List */}
                <div className="panel p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold">Children ({children.length})</h3>
                      <p className="text-[11px] text-muted-foreground">Taxonomy hierarchy sub-nodes</p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => openCreate(true)} title="Add child node">
                      <Plus className="size-4" />
                    </Button>
                  </div>
                  {children.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No child nodes yet.</p>
                  ) : (
                    <ul className="space-y-1 text-sm max-h-48 overflow-y-auto pr-1">
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
                        Alternative canonical names & translations
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
                    <ul className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-1">
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
              </div>

              {/* Row 2: Semantic Graph Relations (Knowledge Graph) */}
              <div className="panel p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <GitBranch className="size-4 text-primary" />
                      <h3 className="text-base font-semibold">Knowledge Graph Relations</h3>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Semantic connections across canonical concepts with direction, inverse mappings, and symmetry
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Tab pills */}
                    <div className="flex rounded-md border border-border bg-secondary/40 p-0.5 text-xs">
                      <button
                        type="button"
                        onClick={() => setRelationsTab("all")}
                        className={cn(
                          "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                          relationsTab === "all" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        All ({nodeRelations.total})
                      </button>
                      <button
                        type="button"
                        onClick={() => setRelationsTab("outgoing")}
                        className={cn(
                          "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                          relationsTab === "outgoing" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        Outgoing ({nodeRelations.outgoing.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setRelationsTab("incoming")}
                        className={cn(
                          "rounded px-2.5 py-1 text-xs font-medium transition-colors",
                          relationsTab === "incoming" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        Incoming ({nodeRelations.incoming.length})
                      </button>
                    </div>

                    <Button size="sm" onClick={() => setDialog("relation")}>
                      <Plus className="size-4" /> Add relation
                    </Button>
                  </div>
                </div>

                {nodeRelations.total === 0 ? (
                  <p className="py-3 text-xs text-muted-foreground">
                    No graph relations recorded yet. Connect {selected.name} to related technologies, frameworks, or concepts.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {/* Outgoing relations */}
                    {(relationsTab === "all" || relationsTab === "outgoing") && nodeRelations.outgoing.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Outgoing Relations ({nodeRelations.outgoing.length})
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {nodeRelations.outgoing.map((rel) => (
                            <div
                              key={rel.id}
                              className="group flex items-start justify-between rounded-lg border border-border bg-secondary/30 p-2.5 text-xs transition-colors hover:border-primary/40"
                            >
                              <div className="space-y-1 min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="rounded bg-primary/10 px-2 py-0.5 font-mono text-[11px] font-semibold text-primary">
                                    → {rel.relation_type}
                                  </span>
                                  {rel.is_symmetric && (
                                    <span className="rounded bg-secondary px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground" title="Symmetric relation">
                                      ↔ symmetric
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setSelectedId(rel.other_node.id)}
                                    className="font-medium text-foreground hover:underline truncate"
                                  >
                                    {rel.other_node.name}
                                  </button>
                                  <span className="text-[10px] text-muted-foreground font-mono">
                                    ({rel.other_node.node_type})
                                  </span>
                                </div>
                                {rel.description && (
                                  <p className="text-[11px] text-muted-foreground line-clamp-2">
                                    {rel.description}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-1 ml-2">
                                {rel.confidence !== null && (
                                  <span className="font-mono text-[10px] text-muted-foreground" title="Confidence">
                                    {(rel.confidence * 100).toFixed(0)}%
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => archiveRelation.mutate(rel.id)}
                                  className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-opacity"
                                  title="Archive relation"
                                >
                                  <Trash2 className="size-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Incoming relations */}
                    {(relationsTab === "all" || relationsTab === "incoming") && nodeRelations.incoming.length > 0 && (
                      <div className="space-y-1.5 pt-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Incoming Relations ({nodeRelations.incoming.length})
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {nodeRelations.incoming.map((rel) => (
                            <div
                              key={rel.id}
                              className="group flex items-start justify-between rounded-lg border border-border bg-secondary/30 p-2.5 text-xs transition-colors hover:border-primary/40"
                            >
                              <div className="space-y-1 min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="rounded bg-accent px-2 py-0.5 font-mono text-[11px] font-semibold text-foreground">
                                    ← {rel.display_relation}
                                  </span>
                                  {rel.is_symmetric && (
                                    <span className="rounded bg-secondary px-1.5 py-0.5 text-[9px] font-mono text-muted-foreground" title="Symmetric relation">
                                      ↔ symmetric
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => setSelectedId(rel.other_node.id)}
                                    className="font-medium text-foreground hover:underline truncate"
                                  >
                                    {rel.other_node.name}
                                  </button>
                                  <span className="text-[10px] text-muted-foreground font-mono">
                                    ({rel.other_node.node_type})
                                  </span>
                                </div>
                                {rel.description && (
                                  <p className="text-[11px] text-muted-foreground line-clamp-2">
                                    {rel.description}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-1 ml-2">
                                {rel.confidence !== null && (
                                  <span className="font-mono text-[10px] text-muted-foreground" title="Confidence">
                                    {(rel.confidence * 100).toFixed(0)}%
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => archiveRelation.mutate(rel.id)}
                                  className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-opacity"
                                  title="Archive relation"
                                >
                                  <Trash2 className="size-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Row 3: Atomic Claims & Evidence Engine (Claims Section) */}
              <div className="panel p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-border/50 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Quote className="size-4 text-primary" />
                      <h3 className="text-base font-semibold">
                        Atomic Claims & Evidence ({displayedClaims.length})
                      </h3>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Atomic assertions about {selected.name} grounded in verifiable sources and evidence stances
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs text-muted-foreground"
                      onClick={() => setShowOutdatedClaims(!showOutdatedClaims)}
                    >
                      {showOutdatedClaims ? "Hide outdated/superseded" : "Show outdated/superseded"}
                    </Button>
                    <Button size="sm" onClick={() => setDialog("claim")}>
                      <Plus className="size-4" /> Add atomic claim
                    </Button>
                  </div>
                </div>

                {displayedClaims.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border p-6 text-center">
                    <Quote className="mx-auto size-8 text-muted-foreground/50 mb-2" />
                    <p className="text-xs text-muted-foreground">
                      No atomic claims added to {selected.name} yet.
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Atomic claims break knowledge into single verifiable facts (e.g. "{selected.name} supports Redis backends").
                    </p>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="mt-3"
                      onClick={() => setDialog("claim")}
                    >
                      <Plus className="size-3.5" /> Add first claim
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {displayedClaims.map((claim) => {
                      const supportingCount = claim.grouped.supporting.length;
                      const contradictingCount = claim.grouped.contradicting.length;
                      const totalEv = claim.evidences.length;
                      const kState = (claim as any).knowledge_state;

                      // Determine verification badge styling
                      let badgeColor = "bg-muted text-muted-foreground";
                      let badgeIcon = <HelpCircle className="size-3" />;
                      let badgeLabel = "Unverified";

                      if (claim.verification === "verified" || claim.verification === "supported") {
                        badgeColor = "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
                        badgeIcon = <CheckCircle2 className="size-3" />;
                        badgeLabel = "Verified";
                      } else if (claim.verification === "contradicted" || claim.verification === "rejected") {
                        badgeColor = "bg-destructive/10 text-destructive border-destructive/30";
                        badgeIcon = <XCircle className="size-3" />;
                        badgeLabel = "Contradicted";
                      } else if (claim.verification === "disputed") {
                        badgeColor = "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30";
                        badgeIcon = <AlertTriangle className="size-3" />;
                        badgeLabel = "Conflicting Evidence";
                      }

                      return (
                        <div
                          key={claim.id}
                          className="rounded-lg border border-border bg-card p-3.5 shadow-sm space-y-2.5 transition-colors hover:border-primary/30"
                        >
                          {/* Claim Statement */}
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-sm font-medium text-foreground leading-snug">
                              "{claim.claim_text}"
                            </p>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {kState === "conflicted" && (
                                <span className="rounded bg-rose-500/10 border border-rose-500/30 px-2 py-0.5 text-[10px] font-medium text-rose-400">
                                  Conflicted
                                </span>
                              )}
                              {kState === "outdated" && (
                                <span className="rounded bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                                  Outdated
                                </span>
                              )}
                              {kState === "superseded" && (
                                <span className="rounded bg-purple-500/10 border border-purple-500/30 px-2 py-0.5 text-[10px] font-medium text-purple-400">
                                  Superseded
                                </span>
                              )}
                              {claim.status === "deprecated" && (
                                <span className="rounded bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
                                  Deprecated
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Metadata row: type, verification, confidence, evidence count */}
                          <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
                            {/* Claim Type */}
                            <span className="rounded bg-secondary px-2 py-0.5 font-mono text-muted-foreground">
                              type: {claim.claim_type ?? "fact"}
                            </span>

                            {/* Verification Badge */}
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 rounded border px-2 py-0.5 font-medium text-[11px]",
                                badgeColor,
                              )}
                            >
                              {badgeIcon}
                              {badgeLabel}
                            </span>

                            {/* Confidence */}
                            {claim.confidence !== null && (
                              <span className="rounded bg-secondary px-2 py-0.5 font-mono text-muted-foreground">
                                confidence {(claim.confidence * 100).toFixed(0)}%
                              </span>
                            )}

                            {/* Evidence Summary Counters */}
                            <span className="rounded bg-secondary/80 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                              {totalEv === 0
                                ? "No evidence attached"
                                : `${supportingCount} supporting • ${contradictingCount} contradicting`}
                            </span>
                          </div>

                          {/* Action Toolbar */}
                          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 pt-2 text-xs">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => {
                                  setSelectedClaimForEvidence(claim);
                                  setDialog("inspect-evidence");
                                }}
                              >
                                <Scale className="size-3.5 mr-1" />
                                Inspect Evidence ({totalEv})
                              </Button>

                              <Button
                                size="sm"
                                variant="secondary"
                                className="h-7 text-xs"
                                onClick={() => {
                                  setSelectedClaimForEvidence(claim);
                                  setDialog("attach-evidence");
                                }}
                              >
                                <Plus className="size-3.5 mr-1" />
                                Attach Evidence
                              </Button>

                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs gap-1 text-primary border-primary/30 hover:bg-primary/10"
                                onClick={() => setSelectedClaimForPath(claim.id)}
                              >
                                <HelpCircle className="size-3.5" />
                                Why Brain knows this
                              </Button>

                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
                                onClick={() => {
                                  setSelectedHistoryEntity({
                                    table: "knowledge_claims",
                                    id: claim.id,
                                    name: claim.claim_text.length > 35 ? claim.claim_text.slice(0, 35) + "..." : claim.claim_text,
                                  });
                                }}
                              >
                                <History className="size-3.5" />
                                History
                              </Button>
                            </div>

                            {claim.status !== "deprecated" && (
                              <button
                                type="button"
                                onClick={() => deprecateClaim.mutate(claim.id)}
                                className="text-[11px] text-muted-foreground hover:text-destructive transition-colors"
                              >
                                Deprecate
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
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
              onClick={() => createOrUpdateNode.mutate(undefined)}
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

      {/* Dialog 5: Create Semantic Typed Relation (Searchable & Validated) */}
      <Dialog open={dialog === "relation"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Semantic Relation</DialogTitle>
            <DialogDescription>
              Connect {selected?.name} to another concept in the Knowledge Brain.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Relation Type Picker */}
            <div className="space-y-1.5">
              <Label>Relation Type</Label>
              <Select
                value={relationForm.type}
                onValueChange={(v) => setRelationForm({ ...relationForm, type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {(relationTypesQuery.data ?? DEFAULT_RELATION_TYPES).map((t) => (
                    <SelectItem key={t.key} value={t.key}>
                      <span className="font-medium">{t.name}</span>
                      <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                        {t.is_symmetric
                          ? "(symmetric ↔)"
                          : t.inverse_key
                            ? `(inverse: ${t.inverse_key})`
                            : ""}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Searchable Target Node Selector */}
            <div className="space-y-2">
              <Label>Target Knowledge Node</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  placeholder="Filter nodes by name or type…"
                  className="pl-8 text-xs"
                  value={relationSearch}
                  onChange={(e) => setRelationSearch(e.target.value)}
                />
              </div>

              <div className="max-h-40 overflow-y-auto space-y-1 rounded-md border border-border p-1 bg-secondary/20">
                {allNodes
                  .filter((n) => {
                    if (n.id === selected?.id) return false;
                    if (!relationSearch.trim()) return true;
                    const q = relationSearch.toLowerCase();
                    return (
                      n.name.toLowerCase().includes(q) ||
                      n.node_type.toLowerCase().includes(q) ||
                      n.slug.toLowerCase().includes(q)
                    );
                  })
                  .slice(0, 30)
                  .map((n) => {
                    const isSelected = relationForm.target === n.id;
                    return (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => setRelationForm({ ...relationForm, target: n.id })}
                        className={cn(
                          "flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left text-xs transition-colors",
                          isSelected
                            ? "bg-primary text-primary-foreground font-semibold"
                            : "hover:bg-accent text-foreground",
                        )}
                      >
                        <span className="truncate">{n.name}</span>
                        <span className={cn("font-mono text-[10px]", isSelected ? "text-primary-foreground/80" : "text-muted-foreground")}>
                          {n.node_type} • /{n.slug}
                        </span>
                      </button>
                    );
                  })}
              </div>

              {relationForm.target !== NONE && (
                <div className="rounded bg-secondary/50 px-2.5 py-1.5 text-xs text-foreground flex items-center justify-between">
                  <span>Selected: <strong>{nodeName(relationForm.target)}</strong></span>
                  <button
                    type="button"
                    onClick={() => setRelationForm({ ...relationForm, target: NONE })}
                    className="text-[11px] text-muted-foreground hover:text-destructive"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>

            {/* Description & Confidence */}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="relation-description">Description (optional)</Label>
                <Input
                  id="relation-description"
                  placeholder="e.g. Core dependency or architectural pattern"
                  value={relationForm.description}
                  onChange={(e) => setRelationForm({ ...relationForm, description: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="relation-confidence">Confidence (0-1)</Label>
                <Input
                  id="relation-confidence"
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  value={relationForm.confidence}
                  onChange={(e) =>
                    setRelationForm({
                      ...relationForm,
                      confidence: Math.min(1, Math.max(0, parseFloat(e.target.value) || 0)),
                    })
                  }
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              disabled={relationForm.target === NONE || addRelation.isPending}
              onClick={() => addRelation.mutate()}
            >
              Save Relation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog 6: Add Atomic Claim */}
      <Dialog open={dialog === "claim"} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Quote className="size-4 text-primary" />
              <DialogTitle>Add Atomic Claim</DialogTitle>
            </div>
            <DialogDescription>
              State a single atomic claim about {selected?.name}. Single statements are easier to verify and link with evidence.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5">
            <div className="space-y-1.5">
              <Label htmlFor="claim-statement">Statement</Label>
              <Textarea
                id="claim-statement"
                rows={3}
                placeholder="e.g. Laravel queues can use Redis as an asynchronous worker backend."
                value={claimForm.statement}
                onChange={(e) => setClaimForm({ ...claimForm, statement: e.target.value })}
              />
              <p className="text-[11px] text-muted-foreground">
                Tip: Keep it atomic. Rather than compound paragraphs, store individual claims for maximum clarity.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Claim Type</Label>
                <Select
                  value={claimForm.claim_type}
                  onValueChange={(v) => setClaimForm({ ...claimForm, claim_type: v as ClaimType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CLAIM_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="claim-confidence">Initial Confidence</Label>
                <Input
                  id="claim-confidence"
                  type="number"
                  step="0.05"
                  min="0"
                  max="1"
                  value={claimForm.confidence}
                  onChange={(e) =>
                    setClaimForm({
                      ...claimForm,
                      confidence: Math.min(1, Math.max(0, parseFloat(e.target.value) || 0)),
                    })
                  }
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              disabled={!claimForm.statement.trim() || addClaim.isPending}
              onClick={() => addClaim.mutate()}
            >
              Add Atomic Claim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog 7: Inspect Claim Evidence (Evidence Inspector) */}
      <Dialog
        open={dialog === "inspect-evidence"}
        onOpenChange={(open) => !open && setDialog(null)}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Scale className="size-4 text-primary" />
              <DialogTitle>Claim Evidence Inspector</DialogTitle>
            </div>
            <DialogDescription>
              Auditable sources and evidence stances supporting or contradicting this atomic assertion.
            </DialogDescription>
          </DialogHeader>

          {selectedClaimForEvidence && (
            <div className="space-y-4">
              {/* Claim Overview Box */}
              <div className="rounded-lg border border-border bg-secondary/30 p-3 space-y-1.5">
                <p className="text-sm font-semibold text-foreground">
                  "{selectedClaimForEvidence.claim_text}"
                </p>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground font-mono">
                  <span>type: {selectedClaimForEvidence.claim_type ?? "fact"}</span>
                  <span>•</span>
                  <span>verification: <strong>{selectedClaimForEvidence.verification}</strong></span>
                  <span>•</span>
                  <span>status: {selectedClaimForEvidence.status}</span>
                </div>
              </div>

              {/* Evidence Partition Lists */}
              {(() => {
                const claimEvs = (allEvidenceQuery.data ?? []).filter(
                  (e) => e.claim_id === selectedClaimForEvidence.id,
                );
                const grouped = groupEvidenceByStance(claimEvs);

                if (claimEvs.length === 0) {
                  return (
                    <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                      No evidence records attached to this claim yet.
                    </div>
                  );
                }

                return (
                  <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                    {/* Supporting Evidence */}
                    {grouped.supporting.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="size-3.5" />
                          Supporting Evidence ({grouped.supporting.length})
                        </div>
                        {grouped.supporting.map((ev) => (
                          <div key={ev.id} className="rounded border border-emerald-500/30 bg-emerald-500/5 p-2.5 text-xs space-y-1">
                            {ev.excerpt && <p className="italic text-foreground">"{ev.excerpt}"</p>}
                            <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-muted-foreground font-mono pt-1">
                              <span>Locator: {ev.locator ?? "Direct quote"}</span>
                              {ev.confidence !== null && <span>confidence: {(ev.confidence * 100).toFixed(0)}%</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Contradicting Evidence */}
                    {grouped.contradicting.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
                          <XCircle className="size-3.5" />
                          Contradicting Evidence ({grouped.contradicting.length})
                        </div>
                        {grouped.contradicting.map((ev) => (
                          <div key={ev.id} className="rounded border border-destructive/30 bg-destructive/5 p-2.5 text-xs space-y-1">
                            {ev.excerpt && <p className="italic text-foreground">"{ev.excerpt}"</p>}
                            <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-muted-foreground font-mono pt-1">
                              <span>Locator: {ev.locator ?? "Direct citation"}</span>
                              {ev.confidence !== null && <span>confidence: {(ev.confidence * 100).toFixed(0)}%</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Qualifying or Mentioning Evidence */}
                    {(grouped.qualifying.length > 0 || grouped.mentioning.length > 0) && (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                          <HelpCircle className="size-3.5" />
                          Qualifying / Mentions ({grouped.qualifying.length + grouped.mentioning.length})
                        </div>
                        {[...grouped.qualifying, ...grouped.mentioning].map((ev) => (
                          <div key={ev.id} className="rounded border border-border bg-secondary/20 p-2.5 text-xs space-y-1">
                            {ev.excerpt && <p className="italic text-foreground">"{ev.excerpt}"</p>}
                            <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-muted-foreground font-mono pt-1">
                              <span>Stance: {ev.stance} • Locator: {ev.locator ?? "General mention"}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setDialog("attach-evidence");
              }}
            >
              <Plus className="size-4" /> Attach New Evidence
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog 8: Attach Evidence */}
      <Dialog
        open={dialog === "attach-evidence"}
        onOpenChange={(open) => !open && setDialog(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Scale className="size-4 text-primary" />
              <DialogTitle>Attach Evidence to Claim</DialogTitle>
            </div>
            <DialogDescription>
              Connect traceable source excerpts to ground or dispute this assertion.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5">
            {/* Stance Selector */}
            <div className="space-y-1.5">
              <Label>Evidence Stance</Label>
              <Select
                value={evidenceForm.stance}
                onValueChange={(v) =>
                  setEvidenceForm({ ...evidenceForm, stance: v as EvidenceStance })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="supported">Supports Claim (Confirms assertion)</SelectItem>
                  <SelectItem value="contradicted">Contradicts Claim (Disputes assertion)</SelectItem>
                  <SelectItem value="qualifies">Qualifies Claim (Adds conditional nuance)</SelectItem>
                  <SelectItem value="mentions">Mentions Claim (Contextual reference)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Source Selection or Quick Create */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Source Record</Label>
                <button
                  type="button"
                  onClick={() =>
                    setEvidenceForm({
                      ...evidenceForm,
                      isCreatingSource: !evidenceForm.isCreatingSource,
                    })
                  }
                  className="text-[11px] text-primary hover:underline"
                >
                  {evidenceForm.isCreatingSource ? "Select existing source" : "+ Quick create new source"}
                </button>
              </div>

              {!evidenceForm.isCreatingSource ? (
                <Select
                  value={evidenceForm.source_id}
                  onValueChange={(v) => setEvidenceForm({ ...evidenceForm, source_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a verifiable source" />
                  </SelectTrigger>
                  <SelectContent className="max-h-52">
                    {(sourcesQuery.data ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.title} ({s.source_kind})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="space-y-2 rounded-md border border-border p-2.5 bg-secondary/30 text-xs">
                  <div className="space-y-1">
                    <Label htmlFor="q-source-title">Source Title</Label>
                    <Input
                      id="q-source-title"
                      placeholder="e.g. Official Documentation, Whitepaper…"
                      value={evidenceForm.quickSourceTitle}
                      onChange={(e) =>
                        setEvidenceForm({ ...evidenceForm, quickSourceTitle: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="q-source-url">URL (optional)</Label>
                    <Input
                      id="q-source-url"
                      placeholder="https://…"
                      value={evidenceForm.quickSourceUrl}
                      onChange={(e) =>
                        setEvidenceForm({ ...evidenceForm, quickSourceUrl: e.target.value })
                      }
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Excerpt / Citation */}
            <div className="space-y-1.5">
              <Label htmlFor="evidence-excerpt">Reference Quote / Excerpt</Label>
              <Textarea
                id="evidence-excerpt"
                rows={2}
                placeholder="Direct excerpt or quotation from the source…"
                value={evidenceForm.excerpt}
                onChange={(e) => setEvidenceForm({ ...evidenceForm, excerpt: e.target.value })}
              />
            </div>

            {/* Locator & Evidence Type */}
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="evidence-locator">Locator</Label>
                <Input
                  id="evidence-locator"
                  placeholder="Section 4.1, p. 12, #queue-driver"
                  value={evidenceForm.locator}
                  onChange={(e) => setEvidenceForm({ ...evidenceForm, locator: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Evidence Type</Label>
                <Select
                  value={evidenceForm.evidence_type}
                  onValueChange={(v) =>
                    setEvidenceForm({ ...evidenceForm, evidence_type: v as EvidenceType })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVIDENCE_TYPES.map((et) => (
                      <SelectItem key={et} value={et}>
                        {et}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              disabled={
                attachEvidence.isPending ||
                (!evidenceForm.isCreatingSource && evidenceForm.source_id === NONE) ||
                (evidenceForm.isCreatingSource && !evidenceForm.quickSourceTitle.trim())
              }
              onClick={() => attachEvidence.mutate()}
            >
              Attach Evidence
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Phase 8: Entity History & Version Timeline Modal */}
      {selectedHistoryEntity && (
        <EntityHistoryModal
          isOpen={!!selectedHistoryEntity}
          onClose={() => setSelectedHistoryEntity(null)}
          subjectTable={selectedHistoryEntity.table}
          subjectId={selectedHistoryEntity.id}
          entityName={selectedHistoryEntity.name}
          onEntityUpdated={() => {
            void queryClient.invalidateQueries({ queryKey: ["nodes"] });
            void queryClient.invalidateQueries({ queryKey: ["node-claims"] });
          }}
        />
      )}

      {/* Phase 8: Evidence Path Modal ("Why does the Brain know this?") */}
      {selectedClaimForPath && (
        <EvidencePathModal
          isOpen={!!selectedClaimForPath}
          onClose={() => setSelectedClaimForPath(null)}
          claimId={selectedClaimForPath}
        />
      )}

      {/* Phase 8: Conflict Dashboard Modal */}
      {showConflictDashboard && (
        <ConflictDashboardModal
          isOpen={showConflictDashboard}
          onClose={() => setShowConflictDashboard(false)}
          onConflictResolved={() => {
            void queryClient.invalidateQueries({ queryKey: ["node-claims"] });
          }}
        />
      )}
    </AppShell>
  );
}

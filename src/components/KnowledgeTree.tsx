import {
  ChevronRight,
  Folder,
  FolderOpen,
  Hash,
  Lightbulb,
  Cpu,
  Boxes,
  Wrench,
  GitMerge,
  BookOpen,
  User,
  Building,
  Calendar,
  FileText,
  Search,
  Eye,
  EyeOff,
  FolderTree,
} from "lucide-react";
import React, { useMemo, useState } from "react";
import type { TreeNode } from "@/lib/knowledge-engine/hierarchy";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface KnowledgeTreeProps {
  nodes: TreeNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  showArchived?: boolean | undefined;
  onToggleShowArchived?: (() => void) | undefined;
}

export function KnowledgeTree({
  nodes,
  selectedId,
  onSelect,
  showArchived = false,
  onToggleShowArchived,
}: KnowledgeTreeProps) {
  const [filter, setFilter] = useState("");
  const [expandAll, setExpandAll] = useState(false);

  // Filter nodes matching search query
  const filteredNodes = useMemo(() => {
    if (!filter.trim()) return nodes;
    const query = filter.toLowerCase().trim();

    function matchRecursive(node: TreeNode): TreeNode | null {
      const isMatch =
        node.name.toLowerCase().includes(query) ||
        node.slug.toLowerCase().includes(query) ||
        node.node_type.toLowerCase().includes(query);

      const matchedChildren = node.children
        .map(matchRecursive)
        .filter((c): c is TreeNode => c !== null);

      if (isMatch || matchedChildren.length > 0) {
        return {
          ...node,
          children: matchedChildren,
        };
      }
      return null;
    }

    return nodes.map(matchRecursive).filter((n): n is TreeNode => n !== null);
  }, [nodes, filter]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter knowledge tree…"
            className="h-8 pl-8 text-xs"
          />
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-8"
          title={expandAll ? "Collapse all" : "Expand all"}
          onClick={() => setExpandAll((v) => !v)}
        >
          <FolderTree className="size-3.5" />
        </Button>
        {onToggleShowArchived ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className={cn("size-8", showArchived && "text-primary")}
            title={showArchived ? "Hide archived nodes" : "Show archived nodes"}
            onClick={onToggleShowArchived}
          >
            {showArchived ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
          </Button>
        ) : null}
      </div>

      {filteredNodes.length === 0 ? (
        <div className="px-2 py-6 text-center text-xs text-muted-foreground">
          {filter ? "No matching knowledge nodes found." : "No nodes in this view."}
        </div>
      ) : (
        <ul className="space-y-0.5">
          {filteredNodes.map((node) => (
            <TreeItem
              key={node.id}
              node={node}
              selectedId={selectedId}
              onSelect={onSelect}
              depth={0}
              forceExpanded={expandAll || Boolean(filter)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function getNodeIcon(type: string, isFolderOpen?: boolean) {
  switch (type) {
    case "category":
      return isFolderOpen ? (
        <FolderOpen className="size-3.5 text-amber-500 shrink-0" />
      ) : (
        <Folder className="size-3.5 text-amber-500 shrink-0" />
      );
    case "topic":
      return <Hash className="size-3.5 text-blue-500 shrink-0" />;
    case "concept":
      return <Lightbulb className="size-3.5 text-yellow-500 shrink-0" />;
    case "technology":
      return <Cpu className="size-3.5 text-cyan-500 shrink-0" />;
    case "framework":
      return <Boxes className="size-3.5 text-indigo-500 shrink-0" />;
    case "tool":
      return <Wrench className="size-3.5 text-emerald-500 shrink-0" />;
    case "method":
      return <GitMerge className="size-3.5 text-violet-500 shrink-0" />;
    case "theory":
      return <BookOpen className="size-3.5 text-rose-500 shrink-0" />;
    case "person":
      return <User className="size-3.5 text-sky-500 shrink-0" />;
    case "organization":
      return <Building className="size-3.5 text-slate-500 shrink-0" />;
    case "event":
      return <Calendar className="size-3.5 text-orange-500 shrink-0" />;
    default:
      return <FileText className="size-3.5 text-muted-foreground shrink-0" />;
  }
}

interface TreeItemProps {
  node: TreeNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
  depth: number;
  forceExpanded?: boolean | undefined;
}

function TreeItem({ node, selectedId, onSelect, depth, forceExpanded }: TreeItemProps) {
  const [expanded, setExpanded] = useState(depth < 2);
  const isExpanded = forceExpanded ?? expanded;
  const hasChildren = node.children.length > 0;
  const isSelected = selectedId === node.id;
  const isArchived = node.status === "archived";

  return (
    <li>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-md px-1.5 py-1 text-xs transition-colors hover:bg-accent/70",
          isSelected && "bg-accent font-medium text-accent-foreground",
          isArchived && "opacity-60",
        )}
        style={{ paddingLeft: `${Math.max(4, depth * 14 + 4)}px` }}
      >
        <button
          type="button"
          aria-label={isExpanded ? "Collapse" : "Expand"}
          onClick={() => setExpanded((v) => !v)}
          className={cn(
            "flex size-4 items-center justify-center text-muted-foreground transition-transform hover:text-foreground",
            !hasChildren && "invisible pointer-events-none",
          )}
        >
          <ChevronRight className={cn("size-3.5 transition-transform", isExpanded && "rotate-90")} />
        </button>

        <button
          type="button"
          onClick={() => onSelect(node.id)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          {getNodeIcon(node.node_type, isExpanded && hasChildren)}
          <span className={cn("truncate", isArchived && "line-through")}>{node.name}</span>
        </button>

        <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100">
          <span className="font-mono text-[10px] text-muted-foreground">{node.node_type}</span>
          {hasChildren ? (
            <span className="rounded bg-secondary/80 px-1 py-0.2 text-[9px] font-mono text-muted-foreground">
              {node.children.length}
            </span>
          ) : null}
        </div>
      </div>

      {hasChildren && isExpanded ? (
        <ul className="space-y-0.5 border-l border-border/40 ml-2">
          {node.children.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              selectedId={selectedId}
              onSelect={onSelect}
              depth={depth + 1}
              forceExpanded={forceExpanded}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

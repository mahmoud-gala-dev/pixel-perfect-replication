import { ChevronRight, Folder } from "lucide-react";
import { useState } from "react";
import type { TreeNode } from "@/lib/knowledge";
import { cn } from "@/lib/utils";

export function KnowledgeTree({
  nodes,
  selectedId,
  onSelect,
  depth = 0,
}: {
  nodes: TreeNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  depth?: number;
}) {
  return (
    <ul className={cn(depth > 0 && "ml-3 border-l border-border pl-2")}>
      {nodes.map((node) => (
        <TreeItem key={node.id} node={node} selectedId={selectedId} onSelect={onSelect} depth={depth} />
      ))}
    </ul>
  );
}

function TreeItem({
  node,
  selectedId,
  onSelect,
  depth,
}: {
  node: TreeNode;
  selectedId: string | null;
  onSelect: (id: string) => void;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children.length > 0;

  return (
    <li>
      <div
        className={cn(
          "group flex items-center gap-1 rounded-md pr-2 text-sm transition-colors hover:bg-accent",
          selectedId === node.id && "bg-accent text-accent-foreground",
        )}
      >
        <button
          type="button"
          aria-label={expanded ? "Collapse" : "Expand"}
          onClick={() => setExpanded((v) => !v)}
          className={cn("p-1 text-muted-foreground", !hasChildren && "invisible")}
        >
          <ChevronRight className={cn("size-3.5 transition-transform", expanded && "rotate-90")} />
        </button>
        <button
          type="button"
          onClick={() => onSelect(node.id)}
          className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left"
        >
          <Folder className="size-3.5 shrink-0 text-primary/70" />
          <span className={cn("truncate", node.status === "archived" && "text-muted-foreground line-through")}>
            {node.name}
          </span>
        </button>
      </div>
      {hasChildren && expanded ? (
        <KnowledgeTree
          nodes={node.children}
          selectedId={selectedId}
          onSelect={onSelect}
          depth={depth + 1}
        />
      ) : null}
    </li>
  );
}

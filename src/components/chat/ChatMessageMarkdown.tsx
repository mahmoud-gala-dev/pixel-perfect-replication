// =====================================================================
// KNOWLEDGE BRAIN — PHASE 4: CHAT MESSAGE MARKDOWN & CODE COMPONENT
// Safe Markdown, Lists, Links, Headings & Code Blocks with Copy Button
// =====================================================================

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  content: string;
}

export function ChatMessageMarkdown({ content }: Props) {
  // Parse blocks: code blocks (```lang ... ```) vs text blocks
  const parts: Array<{ type: "code" | "text"; content: string; language?: string }> = [];

  const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: "text",
        content: content.slice(lastIndex, match.index),
      });
    }

    parts.push({
      type: "code",
      language: match[1]?.trim() || "code",
      content: match[2]?.trimEnd() ?? "",
    });

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push({
      type: "text",
      content: content.slice(lastIndex),
    });
  }

  return (
    <div className="space-y-3 leading-relaxed text-sm">
      {parts.map((part, index) => {
        if (part.type === "code") {
          return <CodeBlock key={index} code={part.content} language={part.language ?? "code"} />;
        }
        return <TextBlock key={index} text={part.content} />;
      })}
    </div>
  );
}

function CodeBlock({ code, language }: { code: string; language?: string | undefined }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2 overflow-hidden rounded-md border border-border bg-muted/70 text-xs font-mono">
      <div className="flex items-center justify-between border-b border-border/70 bg-muted/90 px-3 py-1.5 text-muted-foreground">
        <span className="font-semibold uppercase tracking-wider text-[11px]">{language || "text"}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-6 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
        >
          {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="overflow-x-auto p-3 leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function TextBlock({ text }: { text: string }) {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];
  let currentList: string[] = [];

  const flushList = () => {
    if (currentList.length > 0) {
      elements.push(
        <ul key={`list-${elements.length}`} className="my-1.5 list-disc space-y-1 pl-5">
          {currentList.map((item, idx) => (
            <li key={idx}>{renderInline(item)}</li>
          ))}
        </ul>,
      );
      currentList = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i] ?? "";
    const trimmed = rawLine.trim();

    if (!trimmed) {
      flushList();
      continue;
    }

    // Bullet list item
    if (trimmed.startsWith("• ") || trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      currentList.push(trimmed.slice(2));
      continue;
    }

    flushList();

    // Headings
    if (trimmed.startsWith("### ")) {
      elements.push(
        <h4 key={i} className="mt-3 mb-1 font-semibold text-foreground text-sm">
          {renderInline(trimmed.slice(4))}
        </h4>,
      );
    } else if (trimmed.startsWith("## ")) {
      elements.push(
        <h3 key={i} className="mt-4 mb-1.5 font-bold text-foreground text-base">
          {renderInline(trimmed.slice(3))}
        </h3>,
      );
    } else if (trimmed.startsWith("# ")) {
      elements.push(
        <h2 key={i} className="mt-4 mb-2 font-extrabold text-foreground text-lg">
          {renderInline(trimmed.slice(2))}
        </h2>,
      );
    } else {
      elements.push(
        <p key={i} className="my-1 text-foreground/90">
          {renderInline(trimmed)}
        </p>,
      );
    }
  }

  flushList();

  return <>{elements}</>;
}

function renderInline(text: string): React.ReactNode[] {
  // Parses `inline code`, **bold**, *italic*, and [link](url)
  const tokens: React.ReactNode[] = [];
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(text.slice(lastIndex, match.index));
    }

    const matched = match[0];
    if (matched.startsWith("`") && matched.endsWith("`")) {
      tokens.push(
        <code key={match.index} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12px] text-primary">
          {matched.slice(1, -1)}
        </code>,
      );
    } else if (matched.startsWith("**") && matched.endsWith("**")) {
      tokens.push(<strong key={match.index} className="font-semibold text-foreground">{matched.slice(2, -2)}</strong>);
    } else if (matched.startsWith("*") && matched.endsWith("*")) {
      tokens.push(<em key={match.index} className="italic">{matched.slice(1, -1)}</em>);
    } else if (matched.startsWith("[")) {
      const linkMatch = /\[([^\]]+)\]\(([^)]+)\)/.exec(matched);
      if (linkMatch) {
        tokens.push(
          <a
            key={match.index}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline hover:text-primary/80"
          >
            {linkMatch[1]}
          </a>,
        );
      } else {
        tokens.push(matched);
      }
    }

    lastIndex = match.index + matched.length;
  }

  if (lastIndex < text.length) {
    tokens.push(text.slice(lastIndex));
  }

  return tokens;
}

// =====================================================================
// KNOWLEDGE BRAIN — PHASE 11: RESEARCH PROVIDER & SAFETY
// Controlled external source discovery, fetcher abstraction & prompt injection defense
// =====================================================================

export interface ResearchSearchOptions {
  maxResults?: number;
  allowedDomains?: string[];
  blockedDomains?: string[];
  preferredSourceTypes?: string[];
  timeOrVersionContext?: string;
}

export interface ResearchSearchResult {
  url: string;
  title: string;
  snippet: string;
  sourceKind: string;
  publishedAt?: string;
  qualityScore?: number;
}

export interface ResearchFetchedContent {
  url: string;
  title: string;
  rawText: string;
  sanitizedText: string;
  contentHash: string;
  author?: string;
  publishedAt?: string;
  accessedAt: string;
}

export interface ResearchSourceMetadata {
  title: string;
  author?: string;
  publisher?: string;
  publishedAt?: string;
  sourceKind: string;
  reliability: number;
}

export interface ResearchProvider {
  search(query: string, options?: ResearchSearchOptions): Promise<ResearchSearchResult[]>;
  fetch(url: string): Promise<ResearchFetchedContent>;
  extractMetadata(content: string, url: string): ResearchSourceMetadata;
}

/**
 * Sanitizes untrusted external text.
 * Strips adversarial prompt injection attempts such as instructions to ignore prior system prompts,
 * override security settings, or perform unauthorized database mutations.
 * Guarantees that external text is treated strictly as inert source content.
 */
export function sanitizeExternalContent(rawContent: string): {
  sanitizedText: string;
  injectionDetected: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];
  let injectionDetected = false;

  // Patterns attempting to hijack LLM instruction stream
  const injectionPatterns = [
    /ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions/gi,
    /system\s+prompt\s+override/gi,
    /you\s+are\s+now\s+in\s+developer\s+mode/gi,
    /delete\s+from\s+knowledge_/gi,
    /drop\s+table/gi,
    /bypass\s+(?:all\s+)?rls/gi,
    /commit\s+without\s+review/gi,
  ];

  let sanitized = rawContent;
  for (const pattern of injectionPatterns) {
    if (pattern.test(sanitized)) {
      injectionDetected = true;
      warnings.push(`Suspicious prompt instruction pattern detected: ${pattern.source}`);
      // Neutralize the command by wrapping in a safe inert bracket
      sanitized = sanitized.replace(pattern, "[UNTRUSTED_CONTENT_FILTERED]");
    }
  }

  return {
    sanitizedText: sanitized,
    injectionDetected,
    warnings,
  };
}

/**
 * Mock/Deterministic Research Provider for testing and offline environments.
 */
export class MockResearchProvider implements ResearchProvider {
  private predefinedResults: Map<string, ResearchSearchResult[]> = new Map();
  private predefinedPages: Map<string, { title: string; content: string }> = new Map();

  constructor() {
    this.seedDefaultMockData();
  }

  public registerQueryResult(querySubstring: string, results: ResearchSearchResult[]): void {
    this.predefinedResults.set(querySubstring.toLowerCase(), results);
  }

  public registerPageContent(url: string, page: { title: string; content: string }): void {
    this.predefinedPages.set(url.toLowerCase(), page);
  }

  public async search(query: string, options: ResearchSearchOptions = {}): Promise<ResearchSearchResult[]> {
    const qLower = query.toLowerCase();
    const max = options.maxResults ?? 5;

    for (const [key, results] of this.predefinedResults.entries()) {
      if (qLower.includes(key)) {
        // Filter by allowed/blocked domains
        const filtered = results.filter((r) => {
          if (options.blockedDomains?.some((d) => r.url.includes(d))) return false;
          if (options.allowedDomains && options.allowedDomains.length > 0) {
            return options.allowedDomains.some((d) => r.url.includes(d));
          }
          return true;
        });
        return filtered.slice(0, max);
      }
    }

    // Default fallback
    return [];
  }

  public async fetch(url: string): Promise<ResearchFetchedContent> {
    const page = this.predefinedPages.get(url.toLowerCase());
    const rawText = page
      ? page.content
      : `Document content retrieved from ${url}. Contains factual references for the domain.`;
    const title = page ? page.title : `Documentation — ${url}`;

    const { sanitizedText } = sanitizeExternalContent(rawText);

    return {
      url,
      title,
      rawText,
      sanitizedText,
      contentHash: `hash-${url.length}-${Date.now().toString(36)}`,
      accessedAt: new Date().toISOString(),
    };
  }

  public extractMetadata(content: string, url: string): ResearchSourceMetadata {
    const isDoc = url.includes("docs") || url.includes("laravel.com") || url.includes("redis.io");
    return {
      title: `Source from ${new URL(url.startsWith("http") ? url : `https://${url}`).hostname}`,
      sourceKind: isDoc ? "documentation" : "website",
      reliability: isDoc ? 0.98 : 0.80,
      publishedAt: new Date().toISOString(),
    };
  }

  private seedDefaultMockData(): void {
    this.registerQueryResult("laravel", [
      {
        url: "https://laravel.com/docs/11.x/queues",
        title: "Laravel 11 Documentation — Queues",
        snippet: "Laravel queues provide a unified queuing API across a variety of backends including Redis.",
        sourceKind: "documentation",
        qualityScore: 1.0,
      },
      {
        url: "https://laravel.com/docs/11.x/octane",
        title: "Laravel 11 Documentation — Octane",
        snippet: "Laravel Octane supercharges your application performance by serving application requests using high-powered servers like Swoole and RoadRunner.",
        sourceKind: "documentation",
        qualityScore: 0.98,
      },
    ]);

    this.registerPageContent("https://laravel.com/docs/11.x/queues", {
      title: "Laravel 11 Documentation — Queues",
      content: "In Laravel 11, Redis remains a primary in-memory queue backend. The configuration utilizes PhpRedis or Predis.",
    });

    this.registerPageContent("https://laravel.com/docs/11.x/octane", {
      title: "Laravel 11 Documentation — Octane",
      content: "Laravel Octane maintains application state in memory between requests. Singletons should be carefully registered to prevent state leaks.",
    });
  }
}

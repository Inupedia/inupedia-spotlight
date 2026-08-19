import type { KnowledgeEvidence, KnowledgeQuery, WebSearchProvider } from "../contracts.js";

export interface HikariProviderOptions {
  baseUrl: string;
  token: string;
  maxAttempts?: number;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function unwrapSearchPayload(raw: unknown): {
  answer?: string;
  results?: unknown[];
} {
  const obj = asRecord(raw);
  if (!obj) return {};
  if (Array.isArray(obj.results) || typeof obj.answer === "string") {
    return {
      answer: typeof obj.answer === "string" ? obj.answer : undefined,
      results: Array.isArray(obj.results) ? obj.results : undefined,
    };
  }
  for (const key of ["data", "payload", "result", "body"]) {
    const nested = unwrapSearchPayload(obj[key]);
    if (nested.answer || nested.results) return nested;
  }
  return {};
}

function resultContent(item: Record<string, unknown>): string {
  for (const key of ["content", "snippet", "raw_content", "text", "description"]) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

export class HikariSearchProvider implements WebSearchProvider {
  readonly id = "hikari";

  constructor(private readonly options: HikariProviderOptions) {}

  async search(input: KnowledgeQuery): Promise<KnowledgeEvidence[]> {
    const attempts = Math.max(1, this.options.maxAttempts ?? 2);
    let lastError: unknown;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const base = this.options.baseUrl.replace(/\/$/u, "");
        const endpoint = base.endsWith("/api/tavily") ? `${base}/search` : `${base}/api/tavily/search`;
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: this.options.token,
            query: input.query,
            topic: "general",
            search_depth: "advanced",
            include_answer: true,
            max_results: input.limit ?? 5,
          }),
          signal: input.signal,
        });
        if (!response.ok) throw new Error(`Hikari search failed: ${response.status}`);
        const payload = unwrapSearchPayload(await response.json());
        const evidence: KnowledgeEvidence[] = (payload.results ?? []).flatMap((item) => {
          const record = asRecord(item);
          if (!record) return [];
          const content = resultContent(record);
          if (!content) return [];
          return [
            {
              content,
              title: typeof record.title === "string" ? record.title : undefined,
              url: typeof record.url === "string" ? record.url : undefined,
              score: typeof record.score === "number" ? record.score : undefined,
            },
          ];
        });
        if (payload.answer?.trim()) {
          evidence.unshift({ content: payload.answer.trim() });
        }
        return evidence.filter((item) => item.content.trim());
      } catch (error) {
        lastError = error;
        if (input.signal?.aborted || attempt === attempts) throw error;
      }
    }
    throw lastError;
  }
}

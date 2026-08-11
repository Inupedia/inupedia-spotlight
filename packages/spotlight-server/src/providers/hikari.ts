import type { KnowledgeEvidence, KnowledgeQuery, WebSearchProvider } from "../contracts.js";

export interface HikariProviderOptions {
  baseUrl: string;
  token: string;
  maxAttempts?: number;
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
        const payload = (await response.json()) as {
          answer?: string;
          results?: Array<{ title?: string; url?: string; content?: string; score?: number }>;
        };
        const evidence: KnowledgeEvidence[] = (payload.results ?? []).map((item) => ({
          content: item.content ?? "",
          title: item.title,
          url: item.url,
          score: item.score,
        }));
        if (payload.answer) evidence.unshift({ content: payload.answer, title: "Hikari answer" });
        return evidence.filter((item) => item.content.trim());
      } catch (error) {
        lastError = error;
        if (input.signal?.aborted || attempt === attempts) throw error;
      }
    }
    throw lastError;
  }
}

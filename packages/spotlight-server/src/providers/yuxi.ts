import type { KnowledgeEvidence, KnowledgeProvider, KnowledgeQuery } from "../contracts.js";

export interface YuxiProviderOptions {
  baseUrl: string;
  apiKey?: string;
  username?: string;
  password?: string;
  agentSlug?: string;
}

export class YuxiKnowledgeProvider implements KnowledgeProvider {
  readonly id = "yuxi";
  private token: string | null = null;
  private agentId: string | null = null;
  private readonly threadIds = new Map<string, string>();

  constructor(private readonly options: YuxiProviderOptions) {}

  private base(path: string): string {
    return `${this.options.baseUrl.replace(/\/$/u, "")}${path}`;
  }

  private async auth(): Promise<string> {
    if (this.options.apiKey) return `Bearer ${this.options.apiKey}`;
    if (this.token) return `Bearer ${this.token}`;
    if (!this.options.username || !this.options.password) {
      throw new Error("Yuxi requires apiKey or username/password");
    }
    const response = await fetch(this.base("/api/auth/token"), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        username: this.options.username,
        password: this.options.password,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as { access_token?: string };
    if (!response.ok || !payload.access_token) throw new Error(`Yuxi auth failed: ${response.status}`);
    this.token = payload.access_token;
    return `Bearer ${this.token}`;
  }

  private async json<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(this.base(path), {
      ...init,
      headers: {
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        Authorization: await this.auth(),
        ...init?.headers,
      },
    });
    if (!response.ok) throw new Error(`Yuxi ${path} failed: ${response.status}`);
    return response.json() as Promise<T>;
  }

  private async session(sessionId: string): Promise<{ agentId: string; threadId: string }> {
    const existingThreadId = this.threadIds.get(sessionId);
    if (this.agentId && existingThreadId) return { agentId: this.agentId, threadId: existingThreadId };
    const agentId = this.agentId ?? this.options.agentSlug ?? (await this.json<{
      slug?: string;
      agent_id?: string;
      default_agent_id?: string;
      agent?: { slug?: string; agent_id?: string };
    }>("/api/agent/default")).agent?.slug;
    if (!agentId) throw new Error("Yuxi default agent is unavailable");
    const thread = await this.json<{ id?: string; thread_id?: string }>("/api/chat/thread", {
      method: "POST",
      body: JSON.stringify({
        agent_id: agentId,
        title: "Spotlight knowledge",
        metadata: { source: "spotlight-server", spotlight_session_id: sessionId },
      }),
    });
    const threadId = thread.id ?? thread.thread_id;
    if (!threadId) throw new Error("Yuxi thread creation failed");
    this.agentId = agentId;
    this.threadIds.set(sessionId, threadId);
    return { agentId, threadId };
  }

  async search(input: KnowledgeQuery): Promise<KnowledgeEvidence[]> {
    const session = await this.session(input.sessionId);
    const run = await this.json<{ run_id?: string; stream_url?: string }>("/api/agent/runs", {
      method: "POST",
      body: JSON.stringify({
        query: input.query,
        agent_slug: session.agentId,
        thread_id: session.threadId,
        meta: { source: "spotlight-server", projectId: input.projectId },
      }),
      signal: input.signal,
    });
    if (!run.stream_url) throw new Error("Yuxi run returned no stream URL");
    const response = await fetch(this.base(run.stream_url), {
      headers: { Authorization: await this.auth() },
      signal: input.signal,
    });
    if (!response.ok) throw new Error(`Yuxi stream failed: ${response.status}`);
    const chunks: string[] = [];
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Yuxi stream has no response body");
    const decoder = new TextDecoder();
    let buffer = "";
    let terminal = false;
    while (!terminal) {
      const { done, value } = await reader.read();
      if (value) {
        buffer += decoder.decode(value, { stream: !done }).replace(/\r\n/gu, "\n");
      }
      if (done) {
        buffer += decoder.decode().replace(/\r\n/gu, "\n");
        if (!buffer.trim()) break;
        buffer += "\n\n";
      }
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        let eventType = "message";
        const dataLines: string[] = [];
        for (const line of frame.split("\n")) {
          if (line.startsWith("event:")) eventType = line.slice(6).trim() || "message";
          if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
        }
        if (!dataLines.length) continue;
        const envelope = JSON.parse(dataLines.join("\n")) as Record<string, unknown>;
        const payload = envelope.payload as Record<string, unknown> | undefined;
        const items = Array.isArray(payload?.items) ? payload.items : [payload?.chunk];
        for (const item of items) {
          if (!item || typeof item !== "object") continue;
          const streamEvent = (item as Record<string, unknown>).stream_event as
            | Record<string, unknown>
            | undefined;
          if (streamEvent?.type === "message_delta" && typeof streamEvent.content === "string") {
            chunks.push(streamEvent.content);
          }
        }
        if (eventType === "error") {
          throw new Error(String(payload?.message ?? envelope.message ?? "Yuxi run failed"));
        }
        if (eventType === "end") {
          const status = String(payload?.status ?? "completed");
          if (status !== "completed") throw new Error(`Yuxi run ended with status ${status}`);
          terminal = true;
          break;
        }
      }
      if (done) break;
    }
    await reader.cancel().catch(() => undefined);
    if (!terminal) throw new Error("Yuxi stream ended before a terminal event");
    const content = chunks.join("").trim();
    if (!content) throw new Error("Yuxi returned no answer content");
    return [{ content, title: "Yuxi project knowledge", metadata: { provider: this.id, runId: run.run_id } }];
  }
}

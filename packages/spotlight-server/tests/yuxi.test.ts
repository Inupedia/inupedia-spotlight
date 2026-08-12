import { afterEach, describe, expect, it, vi } from "vitest";
import { YuxiKnowledgeProvider } from "../src/index.js";

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Yuxi knowledge provider", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reuses a thread within one Spotlight session and isolates different sessions", async () => {
    const createdThreads: Array<{ id: string; sessionId: string }> = [];
    const runThreadIds: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/agent/default")) return json({ agent: { slug: "ydjm" } });
      if (url.endsWith("/api/chat/thread")) {
        const body = JSON.parse(String(init?.body)) as { metadata: { spotlight_session_id: string } };
        const id = `thread-${createdThreads.length + 1}`;
        createdThreads.push({ id, sessionId: body.metadata.spotlight_session_id });
        return json({ id });
      }
      if (url.endsWith("/api/agent/runs")) {
        const body = JSON.parse(String(init?.body)) as { thread_id: string };
        runThreadIds.push(body.thread_id);
        return json({ run_id: `run-${runThreadIds.length}`, stream_url: `/stream/${runThreadIds.length}` });
      }
      if (url.includes("/stream/")) {
        return new Response([
          'data: {"payload":{"items":[{"stream_event":{"type":"tool_call","name":"query_kb","tool_call_id":"tc-1","args":{"query":"介绍项目"}}}]}}',
          "",
          'data: {"payload":{"items":[{"msg":{"type":"tool","name":"query_kb","tool_call_id":"tc-1","content":[{"title":"概况"}]}}]}}',
          "",
          'data: {"payload":{"items":[{"stream_event":{"type":"message_delta","content":"ok"}}]}}',
          "",
          'event: end\ndata: {"payload":{"status":"completed"}}',
          "",
        ].join("\n"));
      }
      return new Response("not found", { status: 404 });
    }));

    const provider = new YuxiKnowledgeProvider({ baseUrl: "http://yuxi.test", apiKey: "test" });
    const toolNames: string[] = [];
    const query = (sessionId: string) => provider.search({
      query: "介绍项目",
      projectId: "ydjm",
      sessionId,
      onToolEvent: (event) => {
        if (event.type === "start") toolNames.push(event.call.name);
      },
    });
    await query("session-a");
    await query("session-a");
    await query("session-b");

    expect(createdThreads).toEqual([
      { id: "thread-1", sessionId: "session-a" },
      { id: "thread-2", sessionId: "session-b" },
    ]);
    expect(runThreadIds).toEqual(["thread-1", "thread-1", "thread-2"]);
    expect(toolNames).toEqual(["query_kb", "query_kb", "query_kb"]);
  });
});

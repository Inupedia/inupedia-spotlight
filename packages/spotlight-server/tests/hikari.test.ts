import { afterEach, describe, expect, it, vi } from "vitest";
import { HikariSearchProvider } from "../src/providers/hikari.js";

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("HikariSearchProvider", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("maps nested Tavily payloads and snippet fields into evidence", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        json({
          data: {
            answer: "引大济岷是一项跨流域调水工程。",
            results: [
              {
                title: "引大济岷工程 - 维基百科",
                url: "https://example.com/wiki",
                snippet: "从大渡河引水补充岷江。",
              },
            ],
          },
        }),
      ),
    );

    const provider = new HikariSearchProvider({
      baseUrl: "https://hikari.test/api/tavily",
      token: "token",
    });
    const evidence = await provider.search({
      query: "介绍下引大济岷",
      projectId: "ydjm",
      sessionId: "session-1",
    });

    expect(evidence.map((item) => item.content)).toEqual([
      "引大济岷是一项跨流域调水工程。",
      "从大渡河引水补充岷江。",
    ]);
    expect(evidence[1]).toMatchObject({
      title: "引大济岷工程 - 维基百科",
      url: "https://example.com/wiki",
    });
    expect(evidence[0]?.title).toBeUndefined();
  });
});

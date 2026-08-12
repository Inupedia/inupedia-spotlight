import { describe, expect, it } from "vitest";
import {
  applyYuxiStreamChunk,
  collectYuxiStreamChunks,
} from "../src/yuxiStreamTools.js";

describe("Yuxi stream tool parsing", () => {
  it("emits start and result for query_kb stream events", () => {
    const state = new Map();
    const envelopes = [
      {
        payload: {
          items: [
            {
              stream_event: {
                type: "tool_call",
                name: "query_kb",
                tool_call_id: "tc-1",
                args: { query: "引大济岷" },
              },
            },
          ],
        },
      },
      {
        payload: {
          items: [
            {
              msg: {
                type: "tool",
                name: "query_kb",
                tool_call_id: "tc-1",
                content: [{ title: "工程概况" }],
              },
            },
          ],
        },
      },
    ];

    const events = envelopes.flatMap((envelope) =>
      collectYuxiStreamChunks(envelope).flatMap((chunk) =>
        applyYuxiStreamChunk(state, chunk),
      ),
    );

    expect(events).toEqual([
      expect.objectContaining({
        type: "start",
        call: expect.objectContaining({
          id: "tc-1",
          name: "query_kb",
          input: { query: "引大济岷" },
        }),
      }),
      expect.objectContaining({
        type: "result",
        call: expect.objectContaining({
          id: "tc-1",
          name: "query_kb",
        }),
        success: true,
      }),
    ]);
  });

  it("keeps accumulating tool_call_delta args until the tool finishes", () => {
    const state = new Map();
    const first = applyYuxiStreamChunk(state, {
      stream_event: {
        type: "tool_call_delta",
        name: "list_kbs",
        tool_call_id: "tc-2",
        args_delta: '{"limit":',
      },
    });
    const second = applyYuxiStreamChunk(state, {
      stream_event: {
        type: "tool_call_delta",
        tool_call_id: "tc-2",
        args_delta: "5}",
      },
    });

    expect(first[0]).toMatchObject({ type: "start", call: { name: "list_kbs" } });
    expect(second[0]).toMatchObject({
      type: "progress",
      call: { id: "tc-2", input: { limit: 5 } },
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  isUserFacingKnowledgeTool,
  partitionToolCalls,
} from "../src/store/pipeline/toolDisplay.js";

describe("toolDisplay", () => {
  it("nests yuxi knowledge subtools under project_knowledge_search", () => {
    const { visible, nestedKnowledge } = partitionToolCalls([
      {
        id: "1",
        name: "project_knowledge_search",
        status: "running",
      },
      {
        id: "2",
        name: "query_kb",
        status: "running",
      },
      {
        id: "3",
        name: "list_kbs",
        status: "done",
      },
      {
        id: "4",
        name: "open_kb_document",
        status: "done",
      },
    ]);
    expect(visible.map((item) => item.name)).toEqual([
      "project_knowledge_search",
    ]);
    expect(nestedKnowledge.map((item) => item.name).sort()).toEqual([
      "list_kbs",
      "open_kb_document",
      "query_kb",
    ]);
    expect(isUserFacingKnowledgeTool("project_knowledge_search")).toBe(true);
  });

  it("keeps client tools visible and expandable", () => {
    const { visible } = partitionToolCalls([
      {
        id: "host-1",
        name: "mode.openPeopleFocus",
        status: "running",
      },
    ]);
    expect(visible).toEqual([
      expect.objectContaining({
        name: "mode.openPeopleFocus",
        status: "running",
      }),
    ]);
  });
});

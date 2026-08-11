import { describe, expect, it } from "vitest";
import { serializeSkillsForRemote } from "../src/host.js";

describe("serializeSkillsForRemote", () => {
  it("keeps consumer instructions while removing local filesystem details", () => {
    expect(
      serializeSkillsForRemote([
        {
          name: "skill.monitoring",
          displayName: "现场监控",
          description: "打开指定监控画面",
          allowedTools: ["playVideoFullscreen"],
          skillInstructionBody: "指定点位时调用 playVideoFullscreen。",
          skillPackAppendix: "业务补充说明",
          loadedFrom: "local",
          sourcePath: "/private/project/.inupedia/skills/monitoring/SKILL.md",
          skillRoot: "/private/project/.inupedia/skills/monitoring",
        },
      ]),
    ).toEqual([
      {
        name: "skill.monitoring",
        displayName: "现场监控",
        description: "打开指定监控画面",
        allowedTools: ["playVideoFullscreen"],
        skillInstructionBody: "指定点位时调用 playVideoFullscreen。",
        skillPackAppendix: "业务补充说明",
      },
    ]);
  });
});

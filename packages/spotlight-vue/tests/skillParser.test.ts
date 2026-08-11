import { describe, expect, it } from "vitest";
import { parseSpotlightSkillMarkdown } from "../src/skills/parser.js";

describe("parseSpotlightSkillMarkdown", () => {
  it("retains the workflow instruction body for remote LangGraph planning", () => {
    const skill = parseSpotlightSkillMarkdown(
      [
        "---",
        "id: skill.monitoring",
        "name: 现场监控",
        "description: 打开指定监控。",
        "allowed-tools: playVideoFullscreen",
        "---",
        "",
        "# 现场监控",
        "",
        "指定点位时调用 `playVideoFullscreen`。",
      ].join("\n"),
      ".inupedia/skills/skill.monitoring/SKILL.md",
    );

    expect(skill.skillInstructionBody).toBe(
      "# 现场监控\n\n指定点位时调用 `playVideoFullscreen`。",
    );
  });
});

import { describe, expect, it } from "vitest";
import {
  matchedSkillDeclaresChain,
  skillDeclaresKnowledgeThenAction,
} from "../src/workflow/skillChain.js";

const clientTools = [
  {
    name: "panel.openLayer",
    version: "1.0.0",
    description: "打开图层",
    inputSchema: { type: "object" as const, properties: {} },
    sideEffect: "ui" as const,
    replayPolicy: "never" as const,
    riskLevel: "low" as const,
  },
];

describe("skill knowledge-then-action conjunction", () => {
  it("requires knowledge source, client tool, and workflow body", () => {
    expect(
      skillDeclaresKnowledgeThenAction(
        {
          name: "skill.specs",
          description: "查规范再开图层",
          allowedTools: ["project_knowledge_search", "panel.openLayer"],
          skillInstructionBody: "先检索再执行：先查规范，再打开对应图层。",
        },
        clientTools,
      ),
    ).toBe(true);
  });

  it("does not chain without a workflow body match", () => {
    expect(
      skillDeclaresKnowledgeThenAction(
        {
          name: "skill.specs",
          description: "查规范",
          allowedTools: ["project_knowledge_search", "panel.openLayer"],
          skillInstructionBody: "可以查询规范或打开图层。",
        },
        clientTools,
      ),
    ).toBe(false);
  });

  it("only chains when the matched skill satisfies the conjunction", () => {
    expect(
      matchedSkillDeclaresChain(
        [
          {
            name: "skill.specs",
            description: "查规范再开图层",
            allowedTools: ["project_knowledge_search", "panel.openLayer"],
            skillInstructionBody: "## Workflow\n先检索再执行",
          },
        ],
        ["skill.specs"],
        clientTools,
      ),
    ).toBe(true);
    expect(
      matchedSkillDeclaresChain(
        [
          {
            name: "skill.specs",
            description: "查规范再开图层",
            allowedTools: ["project_knowledge_search", "panel.openLayer"],
            skillInstructionBody: "## Workflow\n先检索再执行",
          },
        ],
        ["skill.monitoring"],
        clientTools,
      ),
    ).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { AIMessage } from "@langchain/core/messages";
import type { FrontendToolDescriptorV1 } from "@inupedia/spotlight-protocol";
import {
  actionToolsAllowedBySkills,
  buildCapabilityHelp,
  prepareRunSkills,
} from "../src/index.js";
import {
  buildAgentSkillFiles,
  canonicalSkillName,
  renderAgentSkillFile,
  skillsReadFromMessages,
} from "../src/deepAgentSkills.js";

const tools: FrontendToolDescriptorV1[] = [
  {
    name: "playVideoFullscreen",
    version: "1.0.0",
    description: "播放指定监控",
    inputSchema: { type: "object", properties: {} },
    sideEffect: "ui",
    replayPolicy: "never",
    riskLevel: "low",
  },
  {
    name: "startTunnelPatrol",
    version: "1.0.0",
    description: "开始洞内巡检",
    inputSchema: { type: "object", properties: {} },
    sideEffect: "ui",
    replayPolicy: "never",
    riskLevel: "low",
  },
];

describe("consumer Skills", () => {
  it("keeps instructions but binds allowed tools to the registered manifest", () => {
    const skills = prepareRunSkills(
      [
        {
          name: "skill.monitoring",
          displayName: "现场监控",
          description: "处理视频操作",
          allowedTools: ["playVideoFullscreen", "server.admin.deleteAll"],
          capabilityExamples: ["打开钢筋棚监控"],
          toolExamples: [
            { example: "播放钢筋棚", toolName: "playVideoFullscreen" },
            { example: "越权", toolName: "server.admin.deleteAll" },
          ],
          skillInstructionBody: "指定点位时播放对应通道。",
        },
      ],
      tools,
    );

    expect(skills[0]).toMatchObject({
      allowedTools: ["playVideoFullscreen"],
      skillInstructionBody: "指定点位时播放对应通道。",
      toolExamples: [
        { example: "播放钢筋棚", toolName: "playVideoFullscreen" },
      ],
    });
    expect(
      actionToolsAllowedBySkills(tools, skills).map((tool) => tool.name),
    ).toEqual(["playVideoFullscreen"]);
  });

  it("builds capability help from the current run instead of cached copy", () => {
    const skills = prepareRunSkills(
      [
        {
          name: "skill.monitoring",
          displayName: "现场监控",
          description: "处理视频操作",
          allowedTools: ["playVideoFullscreen"],
          capabilityExamples: ["打开钢筋棚监控"],
        },
      ],
      tools,
    );
    const reply = buildCapabilityHelp(skills, tools, {
      capabilityHelpFooter: "直接说出监控名称即可。",
    });
    expect(reply).toContain("现场监控");
    expect(reply).toContain("打开钢筋棚监控");
    expect(reply).toContain("1 个页面操作");
    expect(reply).toContain("直接说出监控名称即可");
  });

  it("renders consumer Skills as official Agent Skills files", () => {
    const skill = {
      name: "skill.monitoring",
      displayName: "现场监控",
      description: "处理视频操作",
      allowedTools: ["playVideoFullscreen"],
      skillInstructionBody: "指定点位时播放对应通道。",
    };
    expect(canonicalSkillName(skill.name)).toBe("skill-monitoring");
    expect(renderAgentSkillFile(skill)).toContain("name: skill-monitoring");
    expect(renderAgentSkillFile(skill)).toContain(
      'spotlight-id: "skill.monitoring"',
    );
    expect(renderAgentSkillFile(skill)).toContain(
      "allowed-tools: playVideoFullscreen",
    );
    expect(Object.keys(buildAgentSkillFiles([skill]))).toEqual([
      "/skills/skill-monitoring/SKILL.md",
    ]);
  });

  it("reports a Skill only when its SKILL.md was actually read", () => {
    const skills = [
      {
        name: "skill.monitoring",
        displayName: "现场监控",
        description: "处理视频操作",
        allowedTools: ["playVideoFullscreen"],
      },
    ];
    const messages = [
      new AIMessage({
        content: "",
        tool_calls: [
          {
            id: "read-skill",
            name: "read_file",
            args: { file_path: "/skills/skill-monitoring/SKILL.md" },
            type: "tool_call",
          },
        ],
      }),
    ];
    expect(
      skillsReadFromMessages(messages, skills).map((skill) => skill.name),
    ).toEqual(["skill.monitoring"]);
  });
});

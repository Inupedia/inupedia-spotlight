import { describe, expect, it } from "vitest";
import type { FrontendToolDescriptorV1 } from "@inupedia/spotlight-protocol";
import {
  actionToolsAllowedBySkills,
  buildCapabilityHelp,
  prepareRunSkills,
} from "../src/index.js";

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
    const skills = prepareRunSkills([
      {
        name: "skill.monitoring",
        displayName: "现场监控",
        description: "处理视频操作",
        allowedTools: ["playVideoFullscreen", "server.admin.deleteAll"],
        capabilityExamples: ["打开钢筋棚监控"],
        skillInstructionBody: "指定点位时播放对应通道。",
      },
    ], tools);

    expect(skills[0]).toMatchObject({
      allowedTools: ["playVideoFullscreen"],
      skillInstructionBody: "指定点位时播放对应通道。",
    });
    expect(actionToolsAllowedBySkills(tools, skills).map((tool) => tool.name)).toEqual([
      "playVideoFullscreen",
    ]);
  });

  it("builds capability help from the current run instead of cached copy", () => {
    const skills = prepareRunSkills([
      {
        name: "skill.monitoring",
        displayName: "现场监控",
        description: "处理视频操作",
        allowedTools: ["playVideoFullscreen"],
        capabilityExamples: ["打开钢筋棚监控"],
      },
    ], tools);
    const reply = buildCapabilityHelp(skills, tools, {
      capabilityHelpFooter: "直接说出监控名称即可。",
    });
    expect(reply).toContain("现场监控");
    expect(reply).toContain("打开钢筋棚监控");
    expect(reply).toContain("1 个页面操作");
    expect(reply).toContain("直接说出监控名称即可");
  });
});

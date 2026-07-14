export interface AgentSkillFixtureV1 {
  id: string;
  directoryName: string;
  skillMarkdown: string;
  valid: boolean;
  expectedDiagnosticCodes: string[];
  collisionGroup?: string;
  sourceRoot?: ".agents/skills" | ".claude/skills";
}

function skillMarkdown(lines: string[]): string {
  return ["---", ...lines, "---", "", "# Fixture", ""].join("\n");
}

export const AGENT_SKILL_FIXTURES_V1: AgentSkillFixtureV1[] = [
  {
    id: "valid-basic",
    directoryName: "monitoring",
    skillMarkdown: skillMarkdown([
      "name: monitoring",
      "description: Query project cameras. Use when camera status is requested.",
      "allowed-tools: data.get-video-info video.open",
    ]),
    valid: true,
    expectedDiagnosticCodes: [],
  },
  {
    id: "valid-unicode",
    directoryName: "现场监控",
    skillMarkdown: skillMarkdown([
      "name: 现场监控",
      "description: 查询现场监控点。用户询问摄像头或视频通道时使用。",
    ]),
    valid: true,
    expectedDiagnosticCodes: [],
  },
  {
    id: "invalid-frontmatter-missing",
    directoryName: "missing-frontmatter",
    skillMarkdown: "# Missing frontmatter\n",
    valid: false,
    expectedDiagnosticCodes: ["SKILL_FRONTMATTER_MISSING"],
  },
  {
    id: "invalid-name-directory-mismatch",
    directoryName: "monitoring",
    skillMarkdown: skillMarkdown([
      "name: cameras",
      "description: Query cameras. Use when camera status is requested.",
    ]),
    valid: false,
    expectedDiagnosticCodes: ["SKILL_NAME_DIRECTORY_MISMATCH"],
  },
  {
    id: "invalid-unknown-top-level-field",
    directoryName: "unknown-field",
    skillMarkdown: skillMarkdown([
      "name: unknown-field",
      "description: Exercise unknown fields. Use in validator tests.",
      "spotlight-response-strategy: tool-answer",
    ]),
    valid: false,
    expectedDiagnosticCodes: ["SKILL_UNKNOWN_TOP_LEVEL_FIELD"],
  },
  {
    id: "invalid-allowed-tools-comma",
    directoryName: "comma-tools",
    skillMarkdown: skillMarkdown([
      "name: comma-tools",
      "description: Exercise allowed-tools parsing. Use in validator tests.",
      "allowed-tools: data.get-video-info,video.open",
    ]),
    valid: false,
    expectedDiagnosticCodes: ["SKILL_ALLOWED_TOOLS_NOT_SPACE_DELIMITED"],
  },
  {
    id: "invalid-description-limit",
    directoryName: "description-limit",
    skillMarkdown: skillMarkdown([
      "name: description-limit",
      `description: ${"x".repeat(1025)}`,
    ]),
    valid: false,
    expectedDiagnosticCodes: ["SKILL_DESCRIPTION_TOO_LONG"],
  },
  {
    id: "invalid-name-collision-a",
    directoryName: "collision",
    skillMarkdown: skillMarkdown([
      "name: collision",
      "description: First colliding Skill. Use in validator tests.",
    ]),
    valid: false,
    expectedDiagnosticCodes: ["SKILL_NAME_COLLISION"],
    collisionGroup: "collision",
    sourceRoot: ".agents/skills",
  },
  {
    id: "invalid-name-collision-b",
    directoryName: "collision",
    skillMarkdown: skillMarkdown([
      "name: collision",
      "description: Second colliding Skill. Use in validator tests.",
    ]),
    valid: false,
    expectedDiagnosticCodes: ["SKILL_NAME_COLLISION"],
    collisionGroup: "collision",
    sourceRoot: ".claude/skills",
  },
];

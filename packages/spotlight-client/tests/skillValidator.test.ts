import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { validateAgentSkillMarkdown } from "../src/node/index.js";

const skillMarkdown = (frontmatter: string, body = "# Monitoring") =>
  ["---", frontmatter, "---", body].join("\n");

const validFrontmatter = [
  "name: monitoring",
  "description: Query cameras. Use when camera status is requested.",
].join("\n");

type SkillsRefOracle = {
  repository: string;
  commit: string;
  packageVersion: string;
  cases: Array<{
    id: string;
    directoryName: string;
    markdown: string;
    officialValid: boolean;
    spotlightStrictValid: boolean;
    divergenceReason?: string;
  }>;
};

describe("validateAgentSkillMarkdown", () => {
  it("accepts a minimal valid Agent Skill", () => {
    const result = validateAgentSkillMarkdown({
      directoryName: "monitoring",
      skillFile: ".agents/skills/monitoring/SKILL.md",
      markdown: [
        "---",
        "name: monitoring",
        "description: Query cameras. Use when camera status is requested.",
        "allowed-tools: data.get-video-info video.open",
        "metadata:",
        "  spotlight.response-strategy: tool-answer",
        "---",
        "# Monitoring",
      ].join("\n"),
    });

    expect(result.ok).toBe(true);
    expect(result.skill?.allowedTools).toEqual([
      "data.get-video-info",
      "video.open",
    ]);
    expect(result.diagnostics).toEqual([]);
  });

  it("normalizes CRLF, optional fields, metadata and body", () => {
    const result = validateAgentSkillMarkdown({
      directoryName: "monitoring",
      skillFile: ".agents/skills/monitoring/SKILL.md",
      markdown: skillMarkdown(
        [
          validFrontmatter,
          "license: Apache-2.0",
          "compatibility: Requires Node.js 22.",
          "allowed-tools: data.get-video-info video.open",
          "metadata:",
          "  owner: platform",
        ].join("\n"),
        "\n# Monitoring\n",
      ).replace(/\n/g, "\r\n"),
    });

    expect(result).toMatchObject({
      ok: true,
      diagnostics: [],
      skill: {
        name: "monitoring",
        license: "Apache-2.0",
        compatibility: "Requires Node.js 22.",
        metadata: { owner: "platform" },
        allowedTools: ["data.get-video-info", "video.open"],
        body: "# Monitoring",
      },
    });
  });

  it("accepts exact maximum field lengths", () => {
    const name = "a".repeat(64);
    const result = validateAgentSkillMarkdown({
      directoryName: name,
      skillFile: `.agents/skills/${name}/SKILL.md`,
      markdown: skillMarkdown(
        [
          `name: ${name}`,
          `description: ${"d".repeat(1_024)}`,
          `compatibility: ${"c".repeat(500)}`,
        ].join("\n"),
      ),
    });

    expect(result.ok).toBe(true);
  });

  it.each([
    {
      title: "missing opening delimiter",
      markdown: `${validFrontmatter}\n---\n# Monitoring`,
      code: "SKILL_FRONTMATTER_MISSING",
    },
    {
      title: "unclosed frontmatter",
      markdown: `---\n${validFrontmatter}`,
      code: "SKILL_FRONTMATTER_UNCLOSED",
    },
    {
      title: "duplicate YAML keys",
      markdown: skillMarkdown(`${validFrontmatter}\nname: duplicate`),
      code: "SKILL_FRONTMATTER_INVALID_YAML",
    },
    {
      title: "invalid YAML",
      markdown: skillMarkdown(`${validFrontmatter}\nmetadata: [unterminated`),
      code: "SKILL_FRONTMATTER_INVALID_YAML",
    },
    {
      title: "non-mapping frontmatter",
      markdown: skillMarkdown("- name\n- description"),
      code: "SKILL_FRONTMATTER_NOT_MAPPING",
    },
    {
      title: "missing name",
      markdown: skillMarkdown("description: Query cameras."),
      code: "SKILL_NAME_REQUIRED",
    },
    {
      title: "non-string name",
      markdown: skillMarkdown("name: 42\ndescription: Query cameras."),
      code: "SKILL_NAME_NOT_STRING",
    },
    {
      title: "uppercase name",
      markdown: skillMarkdown("name: Monitoring\ndescription: Query cameras."),
      code: "SKILL_NAME_INVALID_FORMAT",
    },
    {
      title: "Unicode name",
      markdown: skillMarkdown("name: 监控\ndescription: Query cameras."),
      code: "SKILL_NAME_INVALID_FORMAT",
    },
    {
      title: "name longer than 64 characters",
      markdown: skillMarkdown(
        `name: ${"a".repeat(65)}\ndescription: Query cameras.`,
      ),
      code: "SKILL_NAME_TOO_LONG",
    },
    {
      title: "directory mismatch",
      markdown: skillMarkdown("name: other-skill\ndescription: Query cameras."),
      code: "SKILL_NAME_DIRECTORY_MISMATCH",
    },
    {
      title: "missing description",
      markdown: skillMarkdown("name: monitoring"),
      code: "SKILL_DESCRIPTION_REQUIRED",
    },
    {
      title: "non-string description",
      markdown: skillMarkdown("name: monitoring\ndescription: 42"),
      code: "SKILL_DESCRIPTION_NOT_STRING",
    },
    {
      title: "empty description",
      markdown: skillMarkdown('name: monitoring\ndescription: ""'),
      code: "SKILL_DESCRIPTION_EMPTY",
    },
    {
      title: "description longer than 1024 characters",
      markdown: skillMarkdown(
        `name: monitoring\ndescription: ${"a".repeat(1025)}`,
      ),
      code: "SKILL_DESCRIPTION_TOO_LONG",
    },
    {
      title: "non-string license",
      markdown: skillMarkdown(`${validFrontmatter}\nlicense: 42`),
      code: "SKILL_LICENSE_NOT_STRING",
    },
    {
      title: "empty license",
      markdown: skillMarkdown(`${validFrontmatter}\nlicense: ""`),
      code: "SKILL_LICENSE_EMPTY",
    },
    {
      title: "non-string compatibility",
      markdown: skillMarkdown(`${validFrontmatter}\ncompatibility: 42`),
      code: "SKILL_COMPATIBILITY_NOT_STRING",
    },
    {
      title: "empty compatibility",
      markdown: skillMarkdown(`${validFrontmatter}\ncompatibility: ""`),
      code: "SKILL_COMPATIBILITY_EMPTY",
    },
    {
      title: "compatibility longer than 500 characters",
      markdown: skillMarkdown(
        `${validFrontmatter}\ncompatibility: ${"a".repeat(501)}`,
      ),
      code: "SKILL_COMPATIBILITY_TOO_LONG",
    },
    {
      title: "non-mapping metadata",
      markdown: skillMarkdown(`${validFrontmatter}\nmetadata: []`),
      code: "SKILL_METADATA_NOT_MAPPING",
    },
    {
      title: "non-string metadata key",
      markdown: skillMarkdown(
        `${validFrontmatter}\nmetadata:\n  42: owner`,
      ),
      code: "SKILL_METADATA_KEY_NOT_STRING",
    },
    {
      title: "non-string metadata value",
      markdown: skillMarkdown(`${validFrontmatter}\nmetadata:\n  retries: 3`),
      code: "SKILL_METADATA_VALUE_NOT_STRING",
    },
    {
      title: "non-string allowed-tools",
      markdown: skillMarkdown(`${validFrontmatter}\nallowed-tools: []`),
      code: "SKILL_ALLOWED_TOOLS_NOT_STRING",
    },
    {
      title: "empty allowed-tools",
      markdown: skillMarkdown(`${validFrontmatter}\nallowed-tools: ""`),
      code: "SKILL_ALLOWED_TOOLS_EMPTY",
    },
    {
      title: "comma-delimited allowed-tools",
      markdown: skillMarkdown(
        `${validFrontmatter}\nallowed-tools: camera.open,camera.close`,
      ),
      code: "SKILL_ALLOWED_TOOLS_NOT_SPACE_DELIMITED",
    },
    {
      title: "unknown top-level field",
      markdown: skillMarkdown(`${validFrontmatter}\nwhen_to_use: Always`),
      code: "SKILL_UNKNOWN_TOP_LEVEL_FIELD",
    },
  ] as const)("rejects $title", ({ markdown, code }) => {
    const result = validateAgentSkillMarkdown({
      directoryName: "monitoring",
      skillFile: ".agents/skills/monitoring/SKILL.md",
      markdown,
    });

    expect(result.ok).toBe(false);
    expect(result.skill).toBeUndefined();
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      code,
    );
  });

  it("sorts unknown fields and invalid metadata keys by UTF-8 bytes", () => {
    const result = validateAgentSkillMarkdown({
      directoryName: "monitoring",
      skillFile: ".agents/skills/monitoring/SKILL.md",
      markdown: skillMarkdown(
        [
          validFrontmatter,
          "z-field: true",
          "a-field: true",
          "metadata:",
          "  z-key: 1",
          "  a-key: 1",
        ].join("\n"),
      ),
    });

    expect(result.diagnostics.map((diagnostic) => diagnostic.message)).toEqual([
      'Unknown Agent Skills top-level field "a-field".',
      'Unknown Agent Skills top-level field "z-field".',
      'Agent Skills metadata value for "a-key" must be a string.',
      'Agent Skills metadata value for "z-key" must be a string.',
    ]);
  });

  it("downgrades only approved legacy migration diagnostics in compat mode", () => {
    const markdown = skillMarkdown(
      [
        "name: 摄像头监控",
        "description: 打开摄像头并查看监控画面。",
        "id: skill.monitoring",
        "when_to_use: 用户要求查看摄像头时",
        "spotlight-response-strategy: tool-answer",
        "allowed-tools: data.get-video-info,video.open",
      ].join("\n"),
    );
    const strict = validateAgentSkillMarkdown({
      directoryName: "skill.monitoring",
      skillFile: ".agents/skills/skill.monitoring/SKILL.md",
      markdown,
    });
    const compat = validateAgentSkillMarkdown({
      directoryName: "skill.monitoring",
      skillFile: ".agents/skills/skill.monitoring/SKILL.md",
      markdown,
      mode: "compat",
    });

    expect(strict.ok).toBe(false);
    expect(strict.diagnostics.map(({ code }) => code)).toEqual([
      "SKILL_UNKNOWN_TOP_LEVEL_FIELD",
      "SKILL_UNKNOWN_TOP_LEVEL_FIELD",
      "SKILL_UNKNOWN_TOP_LEVEL_FIELD",
      "SKILL_NAME_INVALID_FORMAT",
      "SKILL_NAME_DIRECTORY_MISMATCH",
      "SKILL_ALLOWED_TOOLS_NOT_SPACE_DELIMITED",
    ]);
    expect(compat.ok).toBe(true);
    expect(compat.diagnostics.map(({ code }) => code)).toEqual(
      strict.diagnostics.map(({ code }) => code),
    );
    expect(
      compat.diagnostics.every(({ severity }) => severity === "warning"),
    ).toBe(true);
    expect(compat.skill?.allowedTools).toEqual([
      "data.get-video-info",
      "video.open",
    ]);
  });

  it.each([
    {
      title: "missing required description",
      frontmatter: "name: monitoring",
      code: "SKILL_DESCRIPTION_REQUIRED",
    },
    {
      title: "numeric metadata",
      frontmatter: `${validFrontmatter}\nmetadata:\n  retries: 3`,
      code: "SKILL_METADATA_VALUE_NOT_STRING",
    },
    {
      title: "non-string license",
      frontmatter: `${validFrontmatter}\nlicense: 42`,
      code: "SKILL_LICENSE_NOT_STRING",
    },
  ] as const)(
    "keeps $title as an error in compat mode",
    ({ frontmatter, code }) => {
      const result = validateAgentSkillMarkdown({
        directoryName: "monitoring",
        skillFile: ".agents/skills/monitoring/SKILL.md",
        markdown: skillMarkdown(frontmatter),
        mode: "compat",
      });

      expect(result.ok).toBe(false);
      expect(result.skill).toBeUndefined();
      expect(result.diagnostics).toContainEqual(
        expect.objectContaining({ code, severity: "error" }),
      );
    },
  );

  it("matches the pinned official skills-ref oracle snapshot", () => {
    const oracle = JSON.parse(
      readFileSync(
        new URL("./fixtures/skillsRefOracle.json", import.meta.url),
        "utf8",
      ),
    ) as SkillsRefOracle;

    expect(oracle).toMatchObject({
      repository: "https://github.com/agentskills/agentskills.git",
      commit: "38a2ff82958afee88dadf4831509e6f7e9d8ef4e",
      packageVersion: "0.1.0",
    });
    expect(oracle.cases.length).toBeGreaterThanOrEqual(15);

    for (const fixture of oracle.cases) {
      const result = validateAgentSkillMarkdown({
        directoryName: fixture.directoryName,
        skillFile: `.agents/skills/${fixture.directoryName}/SKILL.md`,
        markdown: fixture.markdown,
      });

      expect(result.ok, fixture.id).toBe(fixture.spotlightStrictValid);
      if (fixture.officialValid === fixture.spotlightStrictValid) {
        expect(fixture.divergenceReason, fixture.id).toBeUndefined();
      } else {
        expect(fixture.divergenceReason, fixture.id).toBeTruthy();
      }
    }
  });
});

import type { BaseMessage } from "@langchain/core/messages";
import type { SpotlightSkill } from "@inupedia/spotlight-protocol";
import {
  StateBackend,
  createFilesystemMiddleware,
  createSkillsMiddleware,
  type FileData,
} from "deepagents";

const SKILLS_ROOT = "/skills/";

export function canonicalSkillName(name: string): string {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .replace(/-{2,}/gu, "-");
  return normalized || "spotlight-skill";
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

export function renderAgentSkillFile(skill: SpotlightSkill): string {
  const canonicalName = canonicalSkillName(skill.name);
  const lines = [
    "---",
    `name: ${canonicalName}`,
    `description: ${yamlString(skill.description)}`,
    "metadata:",
    `  spotlight-id: ${yamlString(skill.name)}`,
    `  display-name: ${yamlString(skill.displayName ?? skill.name)}`,
  ];
  if (skill.allowedTools?.length) {
    lines.push(`allowed-tools: ${skill.allowedTools.join(" ")}`);
  }
  lines.push(
    "---",
    "",
    `# ${skill.displayName ?? skill.name}`,
    "",
    skill.whenToUse ? `适用场景：${skill.whenToUse}` : "",
    skill.toolExamples?.length
      ? `精确工具示例：\n${skill.toolExamples.map((item) => `- “${item.example}” → \`${item.toolName}\``).join("\n")}`
      : "",
    skill.skillInstructionBody ?? "",
    skill.skillPackAppendix ?? "",
  );
  return lines
    .filter((line, index) => line !== "" || lines[index - 1] !== "")
    .join("\n")
    .trim();
}

export function buildAgentSkillFiles(
  skills: SpotlightSkill[],
): Record<string, FileData> {
  const now = new Date().toISOString();
  return Object.fromEntries(
    skills.map((skill) => [
      `${SKILLS_ROOT}${canonicalSkillName(skill.name)}/SKILL.md`,
      {
        content: renderAgentSkillFile(skill),
        mimeType: "text/markdown",
        created_at: now,
        modified_at: now,
      },
    ]),
  );
}

export function createAgentSkillsRuntime(skills: SpotlightSkill[]) {
  const backend = new StateBackend();
  return {
    files: buildAgentSkillFiles(skills),
    middleware: [
      createFilesystemMiddleware({
        backend,
        tools: ["read_file"],
        permissions: [
          { operations: ["read"], paths: ["/skills/**"] },
          { operations: ["read"], paths: ["/**"], mode: "deny" },
        ],
        systemPrompt: null,
      }),
      createSkillsMiddleware({ backend, sources: [SKILLS_ROOT] }),
    ] as const,
  };
}

export function skillsReadFromMessages(
  messages: BaseMessage[] | undefined,
  skills: SpotlightSkill[],
): SpotlightSkill[] {
  const byCanonicalName = new Map(
    skills.map((skill) => [canonicalSkillName(skill.name), skill]),
  );
  const used = new Set<string>();
  for (const message of messages ?? []) {
    const toolCalls = (
      message as BaseMessage & {
        tool_calls?: Array<{ name?: string; args?: Record<string, unknown> }>;
      }
    ).tool_calls;
    for (const call of toolCalls ?? []) {
      if (call.name !== "read_file") continue;
      const path =
        typeof call.args?.file_path === "string"
          ? call.args.file_path
          : typeof call.args?.path === "string"
            ? call.args.path
            : "";
      const match = path.match(/^\/skills\/([^/]+)\/SKILL\.md$/u);
      if (match?.[1] && byCanonicalName.has(match[1])) used.add(match[1]);
    }
  }
  return [...used].map((name) => byCanonicalName.get(name)!).filter(Boolean);
}

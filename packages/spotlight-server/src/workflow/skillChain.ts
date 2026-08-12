import type {
  FrontendToolDescriptorV1,
  SpotlightSkill,
} from "@inupedia/spotlight-protocol";

const KNOWLEDGE_TOOL_NAMES = new Set([
  "project_knowledge_search",
  "web_search",
]);

const WORKFLOW_BODY_PATTERN =
  /##\s*Workflow\b|knowledge_then_action|先检索再执行|先查询再执行|先查(?:询|资料|知识).{0,16}再(?:打开|执行|操作|调用)/u;

function skillText(skill: SpotlightSkill): string {
  return [
    skill.description,
    skill.whenToUse,
    skill.skillInstructionBody,
    skill.skillPackAppendix,
  ]
    .filter(Boolean)
    .join("\n");
}

export function skillAllowsKnowledgeSource(skill: SpotlightSkill): boolean {
  if (skill.name === "skill.knowledge") return true;
  return (skill.allowedTools ?? []).some(
    (name) =>
      KNOWLEDGE_TOOL_NAMES.has(name) ||
      name.includes("knowledge") ||
      name.startsWith("server_"),
  );
}

export function skillAllowsClientTool(
  skill: SpotlightSkill,
  clientTools: FrontendToolDescriptorV1[],
): boolean {
  const registered = new Set(clientTools.map((tool) => tool.name));
  return (skill.allowedTools ?? []).some((name) => registered.has(name));
}

export function skillDeclaresKnowledgeThenAction(
  skill: SpotlightSkill,
  clientTools: FrontendToolDescriptorV1[],
): boolean {
  return (
    skillAllowsKnowledgeSource(skill) &&
    skillAllowsClientTool(skill, clientTools) &&
    WORKFLOW_BODY_PATTERN.test(skillText(skill))
  );
}

export function matchedSkillDeclaresChain(
  skills: SpotlightSkill[],
  matchedSkillNames: string[] | undefined,
  clientTools: FrontendToolDescriptorV1[],
): boolean {
  if (!matchedSkillNames?.length) return false;
  const matched = new Set(matchedSkillNames);
  return skills.some(
    (skill) =>
      matched.has(skill.name) &&
      skillDeclaresKnowledgeThenAction(skill, clientTools),
  );
}

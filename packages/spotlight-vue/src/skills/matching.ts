import type { SpotlightSkill } from "@inupedia/spotlight-protocol";

export function normalizeSkillQuestion(value: string): string {
  return value.trim().replaceAll(" ", "");
}

function extractSkillTextFragments(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(
      /[，。；、,\s/()（）]+|用户|要求|处理|用于|或|以及|等|其他|相关|问题|请求|操作|前端|常见|当前|进行|一个|类|的/g,
    )
    .map((item) => normalizeSkillQuestion(item))
    .filter((item) => item.length >= 2);
}

/** bypass 旁路用片段（when_to_use / description）；不做 keywords 预路由。 */
export function buildSkillQuestionFragments(skill: SpotlightSkill): string[] {
  const names = [skill.displayName, skill.name].filter(Boolean) as string[];
  const whenToUseFragments = extractSkillTextFragments(skill.whenToUse);
  const descriptionFragments = extractSkillTextFragments(skill.description);

  return [...names, ...whenToUseFragments, ...descriptionFragments]
    .map((item) => normalizeSkillQuestion(item))
    .filter((item) => item.length >= 2);
}

/** Deterministic Gate / guards 旁路软匹配；planner 路由由服务端 skill.invoke 负责。 */
export function questionMatchesSkill(
  question: string,
  skill: SpotlightSkill | undefined,
): boolean {
  if (!skill) return false;
  const normalizedQuestion = normalizeSkillQuestion(question);
  if (!normalizedQuestion) return false;
  return buildSkillQuestionFragments(skill).some((fragment) =>
    normalizedQuestion.includes(fragment),
  );
}

export function getBypassMatchedSkills(
  question: string,
  skills: SpotlightSkill[],
): SpotlightSkill[] {
  return skills.filter((skill) => questionMatchesSkill(question, skill));
}

/** @deprecated 使用 getBypassMatchedSkills */
export function getMatchedSkills(
  question: string,
  skills: SpotlightSkill[],
): SpotlightSkill[] {
  return getBypassMatchedSkills(question, skills);
}

export function getModelInvokableSkills(
  skills: SpotlightSkill[],
): SpotlightSkill[] {
  return skills.filter((skill) => skill.disableModelInvocation !== true);
}

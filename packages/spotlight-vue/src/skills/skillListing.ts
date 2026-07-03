import type { SpotlightSkill } from "@inupedia/spotlight-protocol";

export const SKILL_BUDGET_CONTEXT_PERCENT = 0.01;
export const CHARS_PER_TOKEN = 4;
export const DEFAULT_CHAR_BUDGET = 8_000;
export const MAX_LISTING_DESC_CHARS = 250;

export function getSkillListingCharBudget(
  contextWindowTokens?: number,
): number {
  const envBudget = Number(
    import.meta.env.VITE_SPOTLIGHT_SKILL_LISTING_CHAR_BUDGET,
  );
  if (Number.isFinite(envBudget) && envBudget > 0) return envBudget;
  if (contextWindowTokens && contextWindowTokens > 0) {
    return Math.floor(
      contextWindowTokens * CHARS_PER_TOKEN * SKILL_BUDGET_CONTEXT_PERCENT,
    );
  }
  return DEFAULT_CHAR_BUDGET;
}

function getSkillListingDescription(skill: SpotlightSkill): string {
  const desc = skill.whenToUse
    ? `${skill.description} - ${skill.whenToUse}`
    : skill.description;
  const trimmed = desc.trim();
  if (trimmed.length <= MAX_LISTING_DESC_CHARS) return trimmed;
  return `${trimmed.slice(0, MAX_LISTING_DESC_CHARS - 1)}…`;
}

function formatSkillListingEntry(skill: SpotlightSkill): string {
  const label = skill.displayName ?? skill.name;
  return `- ${skill.name}（${label}）：${getSkillListingDescription(skill)}`;
}

/** 预算内 skill 名录（对齐 Inupedia Agent Skills skill_listing / 服务端 skillListing.ts）。 */
export function formatSkillsWithinBudget(
  skills: SpotlightSkill[],
  contextWindowTokens?: number,
): string {
  if (skills.length === 0) return "";

  const budget = getSkillListingCharBudget(contextWindowTokens);
  const entries = skills.map((skill) => ({
    skill,
    line: formatSkillListingEntry(skill),
  }));
  const fullTotal =
    entries.reduce((sum, entry) => sum + entry.line.length, 0) +
    Math.max(0, entries.length - 1);

  if (fullTotal <= budget) {
    return entries.map((entry) => entry.line).join("\n");
  }

  const minDescLength = 20;
  const rest = [...skills];
  let currentBudget = budget;
  const lines: string[] = [];

  while (rest.length > 0) {
    const perSkillBudget = Math.max(
      minDescLength,
      Math.floor(currentBudget / rest.length),
    );
    const skill = rest.shift()!;
    const base = `- ${skill.name}（${skill.displayName ?? skill.name}）：`;
    const descBudget = Math.max(minDescLength, perSkillBudget - base.length);
    const desc = getSkillListingDescription(skill);
    const truncated =
      desc.length > descBudget ? `${desc.slice(0, descBudget - 1)}…` : desc;
    lines.push(`${base}${truncated}`);
    currentBudget -= lines.at(-1)!.length + 1;
  }

  return lines.join("\n");
}

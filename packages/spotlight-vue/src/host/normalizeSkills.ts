import type { SpotlightHostSkillsInput } from "./defineHost.js";

export type SpotlightHostSkillsOption =
  | SpotlightHostSkillsInput
  | Record<string, string>;

function isStructuredSkillsInput(
  value: SpotlightHostSkillsOption,
): value is SpotlightHostSkillsInput {
  return "bundled" in value || "inline" in value;
}

export function normalizeSkillsOption(
  skills?: SpotlightHostSkillsOption,
): SpotlightHostSkillsInput | undefined {
  if (!skills) return undefined;
  if (isStructuredSkillsInput(skills)) return skills;
  return { bundled: skills };
}

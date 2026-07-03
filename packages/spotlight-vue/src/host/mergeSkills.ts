import type { SpotlightSkill } from "@inupedia/spotlight-protocol";

/** Merge bundled (.inupedia) and inline registry skills; inline wins on name conflict. */
export function mergeSpotlightSkills(
  inlineSkills: SpotlightSkill[],
  bundledSkills: SpotlightSkill[],
): SpotlightSkill[] {
  const merged = new Map<string, SpotlightSkill>();
  for (const skill of bundledSkills) merged.set(skill.name, skill);
  for (const skill of inlineSkills) merged.set(skill.name, skill);
  return Array.from(merged.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

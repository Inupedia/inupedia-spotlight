import type { SpotlightSkill } from "@inupedia/spotlight-protocol";
import { getSpotlightConfig } from "../plugin.js";
import { parseSpotlightSkillMarkdown } from "./parser.js";

/** Host-provided skill pool for each create-run request. */
export function getSkillsPoolForRun(): SpotlightSkill[] {
  const config = getSpotlightConfig();
  if (config.getSkillsForRun) {
    return config.getSkillsForRun();
  }
  const skills = config.skills;
  return typeof skills === "function" ? skills() : (skills ?? []);
}

export { getBypassMatchedSkills, getModelInvokableSkills } from "./matching.js";
export { formatSkillsWithinBudget } from "./skillListing.js";
export { parseSpotlightSkillMarkdown };

export function loadBundledSkillsFromGlob(
  modules: Record<string, string>,
): SpotlightSkill[] {
  return Object.entries(modules)
    .filter(([path]) => !path.includes("/_template/"))
    .map(([path, markdown]) =>
      parseSpotlightSkillMarkdown(
        markdown,
        path.replace(/^.*\/\.inupedia\/skills\//, ".inupedia/skills/"),
      ),
    );
}

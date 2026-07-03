import type { SpotlightSkill } from "@inupedia/spotlight-protocol";
import { parseSpotlightSkillMarkdownFields } from "./skillFrontmatterParse";
import { inferSkillRootFromSourcePath } from "./skillPaths.js";

export function parseSpotlightSkillMarkdown(
  markdown: string,
  sourcePath: string,
): SpotlightSkill {
  const skillRoot = inferSkillRootFromSourcePath(
    sourcePath.replace(/^.*\/\.inupedia\/skills\//, ".inupedia/skills/"),
  );
  return {
    ...parseSpotlightSkillMarkdownFields(markdown, sourcePath),
    loadedFrom: "bundled_markdown",
    sourcePath,
    ...(skillRoot ? { skillRoot } : {}),
  };
}

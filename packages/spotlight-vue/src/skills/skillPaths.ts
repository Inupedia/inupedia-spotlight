import type { SpotlightSkill } from "@inupedia/spotlight-protocol";

export function inferSkillRootFromSourcePath(
  sourcePath: string,
): string | undefined {
  const norm = sourcePath.replace(/\\/g, "/");
  if (norm.endsWith("/SKILL.md")) {
    return norm.slice(0, -"/SKILL.md".length);
  }
  return undefined;
}

export function resolveSkillRoot(
  skillName: string,
  skills: SpotlightSkill[],
  projectDir: string,
): string | undefined {
  const skill = skills.find((item) => item.name === skillName);
  if (!skill) return undefined;
  if (skill.skillRoot) {
    return skill.skillRoot.startsWith("/")
      ? skill.skillRoot
      : `${projectDir.replace(/\/$/, "")}/${skill.skillRoot.replace(/^\.\//, "")}`;
  }
  if (skill.sourcePath) {
    const relative = inferSkillRootFromSourcePath(skill.sourcePath);
    if (relative) {
      return relative.startsWith("/")
        ? relative
        : `${projectDir.replace(/\/$/, "")}/${relative.replace(/^\.\//, "")}`;
    }
  }
  return undefined;
}

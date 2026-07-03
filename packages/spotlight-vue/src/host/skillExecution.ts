import type { SpotlightSkill } from "@inupedia/spotlight-protocol";
import {
  registerSkillScriptTool,
  type SkillScriptRunner,
} from "@inupedia/spotlight-client";
import { resolveSkillRoot } from "../skills/skillPaths.js";

export type SpotlightSkillExecutionOptions = {
  projectDir: string;
  runScript: SkillScriptRunner;
};

let skillScriptToolRegistered = false;

/** Register skill.runScript host tool once per app. */
export function wireSkillExecution(
  options: SpotlightSkillExecutionOptions,
  getSkills: () => SpotlightSkill[],
): void {
  if (skillScriptToolRegistered) return;
  skillScriptToolRegistered = true;
  registerSkillScriptTool({
    projectDir: options.projectDir,
    runScript: options.runScript,
    getSkillRoot: (skillName) =>
      resolveSkillRoot(skillName, getSkills(), options.projectDir),
  });
}

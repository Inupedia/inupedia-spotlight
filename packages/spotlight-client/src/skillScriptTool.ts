import { defineAgentTool } from "./defineAgentTool.js";
import { joinSkillScriptPath, type SkillScriptRunResult } from "./skillScriptRunner.js";

export type SkillScriptRunner = (params: {
  skillRoot: string;
  scriptPath: string;
  args?: string;
  cwd: string;
}) => Promise<SkillScriptRunResult>;

export type RegisterSkillScriptToolOptions = {
  getSkillRoot: (skillName: string) => string | undefined;
  projectDir: string;
  runScript: SkillScriptRunner;
};

/**
 * Host-only tool: run a file under skill/scripts/.
 * Register via defineSpotlightHost({ skillExecution: { ... } }).
 */
export function registerSkillScriptTool(
  options: RegisterSkillScriptToolOptions,
): void {
  defineAgentTool({
    name: "skill.runScript",
    displayName: "运行 Skill 脚本",
    description:
      "执行当前 skill 目录 scripts/ 下的脚本（API 胶水、批处理）。须先 skill.invoke 加载对应 skill。",
    input: {
      skillName: {
        type: "string",
        description: "skill id，例如 skill.knowledge",
      },
      script: {
        type: "string",
        description: "scripts/ 下相对路径，例如 fetch-gas.sh",
      },
      args: {
        type: "string",
        optional: true,
        description: "传给脚本的参数字符串",
      },
    },
    executionTarget: "host",
    exposeToLoop: false,
    invoke: async (input: {
      skillName: string;
      script: string;
      args?: string;
    }) => {
      const skillRoot = options.getSkillRoot(input.skillName.trim());
      if (!skillRoot) {
        return {
          success: false,
          error: `未知 skill 或缺少 skillRoot：${input.skillName}`,
        };
      }
      const scriptPath = joinSkillScriptPath(skillRoot, input.script);
      const result = await options.runScript({
        skillRoot,
        scriptPath,
        args: input.args?.trim(),
        cwd: options.projectDir,
      });
      return {
        success: result.exitCode === 0,
        data: result,
        ...(result.exitCode !== 0
          ? { error: result.stderr || `脚本退出码 ${result.exitCode}` }
          : {}),
      };
    },
  });
}

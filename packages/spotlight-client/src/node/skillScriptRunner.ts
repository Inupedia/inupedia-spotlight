import type { SkillScriptRunResult } from "../skillScriptPath.js";

export type NodeSkillScriptRunner = (params: {
  skillRoot: string;
  scriptPath: string;
  args?: string;
  cwd: string;
}) => Promise<SkillScriptRunResult>;

/**
 * Node 宿主默认脚本执行器（浏览器宿主请自定义 runScript）。
 */
export async function createNodeSkillScriptRunner(options: {
  defaultCwd: string;
}): Promise<NodeSkillScriptRunner> {
  const { spawn } = await import("node:child_process");

  return async ({ scriptPath, args, cwd }) => {
    const argv = args?.trim() ? [scriptPath, args.trim()] : [scriptPath];
    const child = spawn("bash", argv, {
      cwd: cwd || options.defaultCwd,
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk: Buffer | string) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += String(chunk);
    });

    const exitCode: number = await new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("close", (code) => resolve(code ?? 1));
    });

    return { stdout, stderr, exitCode };
  };
}

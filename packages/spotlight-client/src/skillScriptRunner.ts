// @ts-nocheck — Node-only script runner; not typechecked in browser vue-tsc graph.

export type SkillScriptRunResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

/** Resolve scripts/foo.sh under skill root; rejects path traversal. */
export function joinSkillScriptPath(
  skillRoot: string,
  scriptRelative: string,
): string {
  const root = skillRoot.replace(/\\/g, "/").replace(/\/$/, "");
  const rel = scriptRelative
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/^scripts\//, "");
  if (!rel || rel.includes("..")) {
    throw new Error(`非法脚本路径：${scriptRelative}`);
  }
  return `${root}/scripts/${rel}`;
}

/**
 * Node 宿主默认脚本执行器（浏览器宿主请自定义 runScript）。
 */
export async function createNodeSkillScriptRunner(options: {
  defaultCwd: string;
}): Promise<
  (params: {
    skillRoot: string;
    scriptPath: string;
    args?: string;
    cwd: string;
  }) => Promise<SkillScriptRunResult>
> {
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

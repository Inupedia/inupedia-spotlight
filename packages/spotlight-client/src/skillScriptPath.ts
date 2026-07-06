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

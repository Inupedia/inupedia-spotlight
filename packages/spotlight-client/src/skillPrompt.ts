import { INUPEDIA_SKILL_PLACEHOLDERS } from "@inupedia/spotlight-protocol";

export type SkillPlaceholderContext = {
  skillDir?: string;
  projectDir?: string;
  sessionId?: string;
};

/** Replace Inupedia skill placeholders (and legacy CLAUDE_* aliases). */
export function substituteSkillPlaceholders(
  content: string,
  ctx: SkillPlaceholderContext,
): string {
  let out = content;
  const skillDir = ctx.skillDir ?? "";
  const projectDir = ctx.projectDir ?? "";
  const sessionId = ctx.sessionId ?? "";

  const pairs: Array<[string, string]> = [
    [INUPEDIA_SKILL_PLACEHOLDERS.skillDir, skillDir],
    [INUPEDIA_SKILL_PLACEHOLDERS.legacySkillDir, skillDir],
    [INUPEDIA_SKILL_PLACEHOLDERS.projectDir, projectDir],
    [INUPEDIA_SKILL_PLACEHOLDERS.legacyProjectDir, projectDir],
    [INUPEDIA_SKILL_PLACEHOLDERS.sessionId, sessionId],
  ];
  for (const [token, value] of pairs) {
    out = out.split(token).join(value);
  }
  return out;
}

const INLINE_SHELL_LINE = /^(?:[^\S\n]*)(!\`([^`]+)\`)/m;

/**
 * Expand lines like !`git status` before the model sees skill content.
 * Only runs when host provides `runInlineShell` (browser SaaS 默认跳过).
 */
export async function executeInlineShellInMarkdown(
  content: string,
  options: {
    cwd: string;
    runInlineShell: (command: string, cwd: string) => Promise<string>;
  },
): Promise<string> {
  const lines = content.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const match = line.match(INLINE_SHELL_LINE);
    if (!match) {
      out.push(line);
      continue;
    }
    const command = match[2]?.trim() ?? "";
    if (!command) {
      out.push(line);
      continue;
    }
    try {
      const result = await options.runInlineShell(command, options.cwd);
      out.push(result.trimEnd());
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error ?? "unknown error");
      out.push(`[shell execution failed: ${message}]`);
    }
  }
  return out.join("\n");
}

export async function prepareSkillMarkdownContent(
  content: string,
  options: SkillPlaceholderContext & {
    cwd?: string;
    runInlineShell?: (command: string, cwd: string) => Promise<string>;
  },
): Promise<string> {
  let prepared = substituteSkillPlaceholders(content, options);
  if (options.runInlineShell && options.cwd) {
    prepared = await executeInlineShellInMarkdown(prepared, {
      cwd: options.cwd,
      runInlineShell: options.runInlineShell,
    });
  }
  return prepared;
}

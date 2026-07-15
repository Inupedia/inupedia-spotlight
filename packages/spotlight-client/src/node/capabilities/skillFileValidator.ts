import { lstat, readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import type { ScannedSkill } from "./skillScanner.js";
import {
  validateAgentSkillMarkdown,
  type AgentSkillDiagnostic,
  type AgentSkillValidationResult,
} from "./skillValidator.js";

const MAX_REFERENCE_BYTES = 1024 * 1024;
const MARKDOWN_LINK_PATTERN =
  /(?<!!)\[[^\]]*\]\(([^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'))?\)/g;
const URI_SCHEME_PATTERN = /^[a-z][a-z\d+.-]*:/i;

export type ValidateScannedSkillInput = {
  projectRoot: string;
  skill: ScannedSkill;
  mode?: "strict" | "compat";
};

export type ValidateSkillContentInput = {
  skill: ScannedSkill;
  markdown: string;
  mode?: "strict" | "compat";
  skillRoot: string;
  readReference: (
    relativePath: string,
  ) => Promise<Uint8Array | undefined>;
};

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function extractRelativeMarkdownLinks(markdown: string): string[] {
  const links = new Set<string>();
  for (const match of markdown.matchAll(MARKDOWN_LINK_PATTERN)) {
    const destination = match[1];
    if (
      !destination ||
      destination.startsWith("#") ||
      destination.startsWith("/") ||
      URI_SCHEME_PATTERN.test(destination)
    ) {
      continue;
    }

    const path = destination.split(/[?#]/, 1)[0];
    if (path?.toLowerCase().endsWith(".md")) links.add(path);
  }
  return [...links].sort(compareUtf8);
}

function isWithin(root: string, candidate: string): boolean {
  const relativePath = relative(root, candidate);
  return (
    relativePath === "" ||
    (!relativePath.startsWith("..") && !isAbsolute(relativePath))
  );
}

function warning(
  skill: ScannedSkill,
  code: AgentSkillDiagnostic["code"],
  message: string,
): AgentSkillDiagnostic {
  return {
    code,
    severity: "warning",
    message,
    skillFile: skill.skillFile,
  };
}

async function referenceWarnings(
  input: ValidateSkillContentInput,
  markdown: string,
): Promise<AgentSkillDiagnostic[]> {
  const skillRoot = resolve(input.skillRoot);
  const diagnostics: AgentSkillDiagnostic[] = [];

  for (const link of extractRelativeMarkdownLinks(markdown)) {
    const target = resolve(skillRoot, link);
    if (!isWithin(skillRoot, target)) {
      diagnostics.push(
        warning(
          input.skill,
          "SKILL_REFERENCE_OUTSIDE_ROOT",
          `Markdown reference "${link}" resolves outside the Skill root.`,
        ),
      );
      continue;
    }

    const referencedBytes = await input.readReference(
      relative(skillRoot, target),
    );
    if (
      referencedBytes === undefined ||
      referencedBytes.byteLength > MAX_REFERENCE_BYTES
    ) {
      continue;
    }

    const referencedMarkdown = Buffer.from(referencedBytes).toString("utf8");
    if (extractRelativeMarkdownLinks(referencedMarkdown).length > 0) {
      diagnostics.push(
        warning(
          input.skill,
          "SKILL_REFERENCE_CHAIN_DEEP",
          `Markdown reference "${link}" links to another Markdown reference.`,
        ),
      );
    }
  }

  return diagnostics;
}

export async function validateSkillContent(
  input: ValidateSkillContentInput,
): Promise<AgentSkillValidationResult> {
  const markdown = input.markdown.replace(/\r\n?/g, "\n");
  const result = validateAgentSkillMarkdown({
    directoryName: input.skill.name,
    skillFile: input.skill.skillFile,
    markdown,
    mode: input.mode,
  });
  const diagnostics = [...result.diagnostics];
  const lineCount = markdown.split("\n").length;
  const estimatedTokens = Math.ceil(markdown.length / 4);

  if (lineCount > 500) {
    diagnostics.push(
      warning(
        input.skill,
        "SKILL_RECOMMENDATION_LINES",
        `SKILL.md contains ${lineCount} lines; the Agent Skills recommendation is at most 500.`,
      ),
    );
  }
  if (estimatedTokens > 5_000) {
    diagnostics.push(
      warning(
        input.skill,
        "SKILL_RECOMMENDATION_TOKENS",
        `SKILL.md has a deterministic estimate of ${estimatedTokens} tokens; the recommendation is at most 5000.`,
      ),
    );
  }
  diagnostics.push(...(await referenceWarnings(input, markdown)));

  return { ...result, diagnostics };
}

export async function validateScannedSkill(
  input: ValidateScannedSkillInput,
): Promise<AgentSkillValidationResult> {
  const projectRoot = resolve(input.projectRoot);
  const skillPath = resolve(projectRoot, input.skill.skillFile);
  const skillRoot = dirname(skillPath);
  const markdown = await readFile(skillPath, "utf8");
  return validateSkillContent({
    skill: input.skill,
    markdown,
    mode: input.mode,
    skillRoot,
    async readReference(relativePath) {
      const target = resolve(skillRoot, relativePath);
      let stats;
      try {
        stats = await lstat(target);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return undefined;
        }
        throw error;
      }
      if (
        !stats.isFile() ||
        stats.isSymbolicLink() ||
        stats.size > MAX_REFERENCE_BYTES
      ) {
        return undefined;
      }
      return readFile(target);
    },
  });
}

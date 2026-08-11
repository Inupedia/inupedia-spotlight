import { lstat, readdir } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

export type SkillScanMode = "compat" | "strict";

export type SkillRootInput = {
  path: string;
  kind?: "canonical" | "inupedia-compat" | "claude-compat" | "custom";
};

export type ScannedSkill = {
  name: string;
  root: string;
  directory: string;
  skillFile: string;
  sourceKind: NonNullable<SkillRootInput["kind"]>;
};

export type SkillScanDiagnostic = {
  code: "SKILL_NAME_SHADOWED" | "SKILL_NAME_COLLISION";
  severity: "warning" | "error";
  name: string;
  selected?: string;
  candidates: string[];
};

export type ScanProjectSkillsOptions = {
  projectRoot: string;
  mode?: SkillScanMode;
  skillRoots?: readonly (string | SkillRootInput)[];
};

export type SkillScanResult = {
  skills: ScannedSkill[];
  diagnostics: SkillScanDiagnostic[];
};

export const DEFAULT_SKILL_ROOTS: readonly Required<SkillRootInput>[] = [
  { path: ".agents/skills", kind: "canonical" },
  { path: ".inupedia/skills", kind: "inupedia-compat" },
  { path: ".claude/skills", kind: "claude-compat" },
];

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

function toPosix(path: string): string {
  return path.split(sep).join("/");
}

function normalizeRoot(
  input: string | SkillRootInput,
): Required<SkillRootInput> {
  if (typeof input === "string") return { path: input, kind: "custom" };
  return { path: input.path, kind: input.kind ?? "custom" };
}

async function isRegularFile(path: string): Promise<boolean> {
  try {
    return (await lstat(path)).isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function scanRoot(
  projectRoot: string,
  rootInput: Required<SkillRootInput>,
): Promise<ScannedSkill[]> {
  const rootPath = isAbsolute(rootInput.path)
    ? rootInput.path
    : resolve(projectRoot, rootInput.path);
  let entries;
  try {
    entries = await readdir(rootPath, { withFileTypes: true });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") return [];
    throw error;
  }

  const root = toPosix(relative(projectRoot, rootPath));
  const skills: ScannedSkill[] = [];
  for (const entry of entries
    .filter((candidate) => candidate.isDirectory())
    .sort((left, right) => compareUtf8(left.name, right.name))) {
    const directoryPath = resolve(rootPath, entry.name);
    const skillFilePath = resolve(directoryPath, "SKILL.md");
    if (!(await isRegularFile(skillFilePath))) continue;
    skills.push({
      name: entry.name,
      root,
      directory: toPosix(relative(projectRoot, directoryPath)),
      skillFile: toPosix(relative(projectRoot, skillFilePath)),
      sourceKind: rootInput.kind,
    });
  }
  return skills;
}

export async function scanProjectSkills(
  options: ScanProjectSkillsOptions,
): Promise<SkillScanResult> {
  const projectRoot = resolve(options.projectRoot);
  const roots = (options.skillRoots ?? DEFAULT_SKILL_ROOTS).map(normalizeRoot);
  const candidates = (
    await Promise.all(roots.map((root) => scanRoot(projectRoot, root)))
  ).flat();
  if (options.mode === "strict") {
    const grouped = new Map<string, ScannedSkill[]>();
    for (const candidate of candidates) {
      const group = grouped.get(candidate.name) ?? [];
      group.push(candidate);
      grouped.set(candidate.name, group);
    }
    const skills: ScannedSkill[] = [];
    const diagnostics: SkillScanDiagnostic[] = [];
    for (const [name, group] of grouped) {
      if (group.length === 1) {
        skills.push(group[0]!);
        continue;
      }
      diagnostics.push({
        code: "SKILL_NAME_COLLISION",
        severity: "error",
        name,
        candidates: group.map((candidate) => candidate.skillFile),
      });
    }
    return { skills, diagnostics };
  }

  const selected = new Map<string, ScannedSkill>();
  const diagnostics: SkillScanDiagnostic[] = [];
  for (const candidate of candidates) {
    const winner = selected.get(candidate.name);
    if (!winner) {
      selected.set(candidate.name, candidate);
      continue;
    }
    diagnostics.push({
      code: "SKILL_NAME_SHADOWED",
      severity: "warning",
      name: candidate.name,
      selected: winner.skillFile,
      candidates: [winner.skillFile, candidate.skillFile],
    });
  }
  return {
    skills: [...selected.values()],
    diagnostics,
  };
}

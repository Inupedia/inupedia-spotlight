import { lstat, readFile, readdir } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import type { CanonicalSkillInputV1 } from "./capabilityArtifactTypes.js";
import type { ScannedSkill } from "./skillScanner.js";

export const CAPABILITY_SKILL_LIMITS_V1 = {
  maxSkills: 200,
  maxFiles: 2_000,
  maxExpandedBytes: 20 * 1024 * 1024,
} as const;

export type CapabilitySkillLoadErrorCodeV1 =
  | "CAPABILITY_SKILL_ENTRY_UNSAFE"
  | "CAPABILITY_SKILL_LIMIT_EXCEEDED"
  | "CAPABILITY_FILE_LIMIT_EXCEEDED"
  | "CAPABILITY_EXPANDED_SIZE_EXCEEDED";

export class CapabilitySkillLoadErrorV1 extends Error {
  readonly code: CapabilitySkillLoadErrorCodeV1;

  constructor(code: CapabilitySkillLoadErrorCodeV1, message: string) {
    super(message);
    this.name = "CapabilitySkillLoadErrorV1";
    this.code = code;
  }
}

export interface LoadCanonicalSkillsInputV1 {
  projectRoot: string;
  skills: readonly ScannedSkill[];
}

export interface LoadedCanonicalSkillsV1 {
  skills: CanonicalSkillInputV1[];
  watchedFiles: string[];
  fileCount: number;
  expandedBytes: number;
}

const compareUtf8 = (left: string, right: string): number =>
  Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));

function isContained(base: string, candidate: string): boolean {
  const path = relative(base, candidate);
  return path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

function toPosix(path: string): string {
  return path.split(sep).join("/");
}

function unsafe(message: string): CapabilitySkillLoadErrorV1 {
  return new CapabilitySkillLoadErrorV1(
    "CAPABILITY_SKILL_ENTRY_UNSAFE",
    message,
  );
}

export async function loadCanonicalSkillsV1(
  input: LoadCanonicalSkillsInputV1,
): Promise<LoadedCanonicalSkillsV1> {
  if (input.skills.length > CAPABILITY_SKILL_LIMITS_V1.maxSkills) {
    throw new CapabilitySkillLoadErrorV1(
      "CAPABILITY_SKILL_LIMIT_EXCEEDED",
      `Skill count ${input.skills.length} exceeds ${CAPABILITY_SKILL_LIMITS_V1.maxSkills}`,
    );
  }

  const projectRoot = resolve(input.projectRoot);
  const loadedSkills: CanonicalSkillInputV1[] = [];
  const watchedFiles: string[] = [];
  let fileCount = 0;
  let expandedBytes = 0;

  for (const skill of [...input.skills].sort((left, right) =>
    compareUtf8(left.name, right.name),
  )) {
    const skillDirectory = resolve(projectRoot, skill.directory);
    if (!isContained(projectRoot, skillDirectory)) {
      throw unsafe(`Skill directory escapes project root: ${skill.directory}`);
    }

    let directoryStat;
    try {
      directoryStat = await lstat(skillDirectory);
    } catch {
      throw unsafe(`Cannot inspect Skill directory: ${skill.directory}`);
    }
    if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
      throw unsafe(
        `Skill directory is not a regular directory: ${skill.directory}`,
      );
    }

    const files: CanonicalSkillInputV1["files"] = [];

    const walk = async (directory: string): Promise<void> => {
      let entries;
      try {
        entries = await readdir(directory, { withFileTypes: true });
      } catch {
        throw unsafe(`Cannot read Skill directory: ${directory}`);
      }

      entries.sort((left, right) => compareUtf8(left.name, right.name));
      for (const entry of entries) {
        const candidate = resolve(directory, entry.name);
        if (!isContained(skillDirectory, candidate)) {
          throw unsafe(`Skill entry escapes its directory: ${candidate}`);
        }

        let stat;
        try {
          stat = await lstat(candidate);
        } catch {
          throw unsafe(`Cannot inspect Skill entry: ${candidate}`);
        }
        if (stat.isSymbolicLink()) {
          throw unsafe(`Symbolic links are not allowed in Skills: ${candidate}`);
        }
        if (stat.isDirectory()) {
          await walk(candidate);
          continue;
        }
        if (!stat.isFile()) {
          throw unsafe(`Non-regular Skill entry is not allowed: ${candidate}`);
        }

        fileCount += 1;
        if (fileCount > CAPABILITY_SKILL_LIMITS_V1.maxFiles) {
          throw new CapabilitySkillLoadErrorV1(
            "CAPABILITY_FILE_LIMIT_EXCEEDED",
            `File count ${fileCount} exceeds ${CAPABILITY_SKILL_LIMITS_V1.maxFiles}`,
          );
        }

        let bytes;
        try {
          bytes = await readFile(candidate);
        } catch {
          throw unsafe(`Cannot read Skill file: ${candidate}`);
        }
        expandedBytes += bytes.byteLength;
        if (expandedBytes > CAPABILITY_SKILL_LIMITS_V1.maxExpandedBytes) {
          throw new CapabilitySkillLoadErrorV1(
            "CAPABILITY_EXPANDED_SIZE_EXCEEDED",
            `Expanded size ${expandedBytes} exceeds ${CAPABILITY_SKILL_LIMITS_V1.maxExpandedBytes} bytes`,
          );
        }

        files.push({
          relativePath: toPosix(relative(skillDirectory, candidate)),
          bytes,
        });
        watchedFiles.push(candidate);
      }
    };

    await walk(skillDirectory);
    files.sort((left, right) =>
      compareUtf8(left.relativePath, right.relativePath),
    );
    loadedSkills.push({ name: skill.name, files });
  }

  watchedFiles.sort(compareUtf8);
  return {
    skills: loadedSkills,
    watchedFiles,
    fileCount,
    expandedBytes,
  };
}

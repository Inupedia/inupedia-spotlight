import { constants } from "node:fs";
import { lstat, open, opendir, realpath } from "node:fs/promises";
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

interface PathIdentity {
  dev: bigint;
  ino: bigint;
}

interface PathSnapshot extends PathIdentity {
  size: bigint;
  mtimeNs: bigint;
  ctimeNs: bigint;
}

interface DirectoryPin extends PathSnapshot {
  path: string;
  canonicalPath: string;
}

interface PinnedSkill {
  skill: ScannedSkill;
  directory: string;
  root: DirectoryPin;
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

function hasSameIdentity(left: PathIdentity, right: PathIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function hasSameSnapshot(left: PathSnapshot, right: PathSnapshot): boolean {
  return (
    hasSameIdentity(left, right) &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
  );
}

function validateSkillDefinitions(
  projectRoot: string,
  skills: readonly ScannedSkill[],
): void {
  const sortedNames = [...skills].map((skill) => skill.name).sort(compareUtf8);
  for (let index = 1; index < sortedNames.length; index += 1) {
    if (sortedNames[index] === sortedNames[index - 1]) {
      throw unsafe(`Duplicate Skill name is not allowed: ${sortedNames[index]}`);
    }
  }

  const sortedDirectories = skills
    .map((skill) => resolve(projectRoot, skill.directory))
    .sort(compareUtf8);
  for (
    let parentIndex = 0;
    parentIndex < sortedDirectories.length;
    parentIndex += 1
  ) {
    const parent = sortedDirectories[parentIndex]!;
    for (
      let candidateIndex = parentIndex + 1;
      candidateIndex < sortedDirectories.length;
      candidateIndex += 1
    ) {
      const candidate = sortedDirectories[candidateIndex]!;
      if (parent === candidate || isContained(parent, candidate)) {
        throw unsafe(
          `Duplicate or overlapping Skill directories are not allowed: ${parent} and ${candidate}`,
        );
      }
    }
  }
}

async function pinDirectory(
  directory: string,
  canonicalSkillRoot?: string,
): Promise<DirectoryPin> {
  try {
    const before = await lstat(directory, { bigint: true });
    if (before.isSymbolicLink() || !before.isDirectory()) {
      throw unsafe("Skill directory is not a regular directory");
    }
    const canonicalPath = await realpath(directory);
    const after = await lstat(directory, { bigint: true });
    if (
      after.isSymbolicLink() ||
      !after.isDirectory() ||
      !hasSameIdentity(before, after)
    ) {
      throw unsafe("Skill directory changed while inspected");
    }
    if (
      canonicalSkillRoot !== undefined &&
      !isContained(canonicalSkillRoot, canonicalPath)
    ) {
      throw unsafe("Skill directory resolves outside its root");
    }
    return {
      path: directory,
      canonicalPath,
      dev: after.dev,
      ino: after.ino,
      size: after.size,
      mtimeNs: after.mtimeNs,
      ctimeNs: after.ctimeNs,
    };
  } catch (error) {
    if (error instanceof CapabilitySkillLoadErrorV1) throw error;
    throw unsafe("Cannot securely inspect Skill directory");
  }
}

async function validateDirectory(pin: DirectoryPin): Promise<void> {
  try {
    const stat = await lstat(pin.path, { bigint: true });
    const canonicalPath = await realpath(pin.path);
    if (
      stat.isSymbolicLink() ||
      !stat.isDirectory() ||
      !hasSameSnapshot(pin, stat) ||
      canonicalPath !== pin.canonicalPath
    ) {
      throw unsafe(`Skill directory changed during traversal: ${pin.path}`);
    }
  } catch (error) {
    if (error instanceof CapabilitySkillLoadErrorV1) throw error;
    throw unsafe(`Cannot revalidate Skill directory: ${pin.path}`);
  }
}

async function readBoundedFile(
  candidate: string,
  parent: DirectoryPin,
  canonicalSkillRoot: string,
  remainingBytes: number,
): Promise<Buffer> {
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    await validateDirectory(parent);
    const pathBefore = await lstat(candidate, { bigint: true });
    if (pathBefore.isSymbolicLink() || !pathBefore.isFile()) {
      throw unsafe("Non-regular Skill entry is not allowed");
    }
    const canonicalBefore = await realpath(candidate);
    if (!isContained(canonicalSkillRoot, canonicalBefore)) {
      throw unsafe("Skill file resolves outside its directory");
    }

    // O_NOFOLLOW closes the final-component race on platforms that expose it.
    // The handle/path identity and canonical containment checks below are the
    // explicit safe fallback where the flag is unavailable.
    const noFollow =
      typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
    handle = await open(candidate, constants.O_RDONLY | noFollow);
    const opened = await handle.stat({ bigint: true });
    const pathAfterOpen = await lstat(candidate, { bigint: true });
    const canonicalAfterOpen = await realpath(candidate);
    await validateDirectory(parent);
    if (
      !opened.isFile() ||
      pathAfterOpen.isSymbolicLink() ||
      !pathAfterOpen.isFile() ||
      !hasSameIdentity(pathBefore, opened) ||
      !hasSameIdentity(opened, pathAfterOpen) ||
      pathBefore.size !== opened.size ||
      opened.size !== pathAfterOpen.size ||
      pathBefore.mtimeNs !== opened.mtimeNs ||
      pathBefore.ctimeNs !== opened.ctimeNs ||
      opened.mtimeNs !== pathAfterOpen.mtimeNs ||
      opened.ctimeNs !== pathAfterOpen.ctimeNs ||
      canonicalBefore !== canonicalAfterOpen ||
      !isContained(canonicalSkillRoot, canonicalAfterOpen)
    ) {
      throw unsafe("Skill file changed before reading");
    }

    const chunks: Buffer[] = [];
    let bytesRead = 0;
    const maximumRead = remainingBytes + 1;
    while (bytesRead < maximumRead) {
      const buffer = Buffer.allocUnsafe(
        Math.min(64 * 1024, maximumRead - bytesRead),
      );
      const result = await handle.read(buffer, 0, buffer.byteLength, null);
      if (result.bytesRead === 0) break;
      chunks.push(buffer.subarray(0, result.bytesRead));
      bytesRead += result.bytesRead;
    }

    const openedAfterRead = await handle.stat({ bigint: true });
    const pathAfterRead = await lstat(candidate, { bigint: true });
    const canonicalAfterRead = await realpath(candidate);
    await validateDirectory(parent);
    if (
      pathAfterRead.isSymbolicLink() ||
      !pathAfterRead.isFile() ||
      !hasSameIdentity(opened, openedAfterRead) ||
      !hasSameIdentity(openedAfterRead, pathAfterRead) ||
      opened.size !== openedAfterRead.size ||
      openedAfterRead.size !== pathAfterRead.size ||
      opened.mtimeNs !== openedAfterRead.mtimeNs ||
      opened.ctimeNs !== openedAfterRead.ctimeNs ||
      openedAfterRead.mtimeNs !== pathAfterRead.mtimeNs ||
      openedAfterRead.ctimeNs !== pathAfterRead.ctimeNs ||
      canonicalAfterOpen !== canonicalAfterRead ||
      !isContained(canonicalSkillRoot, canonicalAfterRead)
    ) {
      throw unsafe("Skill file changed while reading");
    }
    if (bytesRead > remainingBytes) {
      throw new CapabilitySkillLoadErrorV1(
        "CAPABILITY_EXPANDED_SIZE_EXCEEDED",
        `Expanded size exceeds ${CAPABILITY_SKILL_LIMITS_V1.maxExpandedBytes} bytes`,
      );
    }
    return Buffer.concat(chunks, bytesRead);
  } catch (error) {
    if (error instanceof CapabilitySkillLoadErrorV1) throw error;
    throw unsafe("Cannot securely read Skill file");
  } finally {
    await handle?.close().catch(() => undefined);
  }
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
  validateSkillDefinitions(projectRoot, input.skills);
  let canonicalProjectRoot: string;
  try {
    canonicalProjectRoot = await realpath(projectRoot);
  } catch {
    throw unsafe(`Cannot resolve project root: ${projectRoot}`);
  }

  const sortedSkills = [...input.skills].sort((left, right) =>
    compareUtf8(left.name, right.name),
  );
  const pinnedSkills: PinnedSkill[] = [];
  for (const skill of sortedSkills) {
    const directory = resolve(projectRoot, skill.directory);
    if (!isContained(projectRoot, directory)) {
      throw unsafe(`Skill directory escapes project root: ${skill.directory}`);
    }
    const root = await pinDirectory(directory);
    if (!isContained(canonicalProjectRoot, root.canonicalPath)) {
      throw unsafe(
        `Skill directory resolves outside project root: ${skill.directory}`,
      );
    }
    pinnedSkills.push({ skill, directory, root });
  }

  for (let leftIndex = 0; leftIndex < pinnedSkills.length; leftIndex += 1) {
    const left = pinnedSkills[leftIndex]!;
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < pinnedSkills.length;
      rightIndex += 1
    ) {
      const right = pinnedSkills[rightIndex]!;
      if (
        hasSameIdentity(left.root, right.root) ||
        left.root.canonicalPath === right.root.canonicalPath ||
        isContained(left.root.canonicalPath, right.root.canonicalPath) ||
        isContained(right.root.canonicalPath, left.root.canonicalPath)
      ) {
        throw unsafe("Duplicate or overlapping Skill directories are not allowed");
      }
    }
  }

  const loadedSkills: CanonicalSkillInputV1[] = [];
  const watchedFiles: string[] = [];
  let fileCount = 0;
  let expandedBytes = 0;

  for (const pinnedSkill of pinnedSkills) {
    const { skill, directory: skillDirectory, root: skillRoot } = pinnedSkill;
    const files: CanonicalSkillInputV1["files"] = [];

    const walk = async (directory: DirectoryPin): Promise<void> => {
      await validateDirectory(directory);
      let directoryHandle: Awaited<ReturnType<typeof opendir>> | undefined;
      const entries = [];
      try {
        directoryHandle = await opendir(directory.path);
        await validateDirectory(directory);
        for (;;) {
          const entry = await directoryHandle.read();
          if (entry === null) break;
          entries.push(entry);
        }
      } catch {
        throw unsafe(`Cannot read Skill directory: ${directory.path}`);
      } finally {
        await directoryHandle?.close().catch(() => undefined);
      }
      await validateDirectory(directory);

      entries.sort((left, right) => compareUtf8(left.name, right.name));
      for (const entry of entries) {
        await validateDirectory(directory);
        const candidate = resolve(directory.path, entry.name);
        if (!isContained(skillDirectory, candidate)) {
          throw unsafe("Skill entry escapes its directory");
        }

        let stat;
        try {
          stat = await lstat(candidate, { bigint: true });
        } catch {
          throw unsafe("Cannot inspect Skill entry");
        }
        if (stat.isSymbolicLink()) {
          throw unsafe("Symbolic links are not allowed in Skills");
        }
        if (stat.isDirectory()) {
          const child = await pinDirectory(candidate, skillRoot.canonicalPath);
          await walk(child);
          await validateDirectory(directory);
          continue;
        }
        if (!stat.isFile()) {
          throw unsafe("Non-regular Skill entry is not allowed");
        }

        fileCount += 1;
        if (fileCount > CAPABILITY_SKILL_LIMITS_V1.maxFiles) {
          throw new CapabilitySkillLoadErrorV1(
            "CAPABILITY_FILE_LIMIT_EXCEEDED",
            `File count ${fileCount} exceeds ${CAPABILITY_SKILL_LIMITS_V1.maxFiles}`,
          );
        }

        const bytes = await readBoundedFile(
          candidate,
          directory,
          skillRoot.canonicalPath,
          CAPABILITY_SKILL_LIMITS_V1.maxExpandedBytes - expandedBytes,
        );
        expandedBytes += bytes.byteLength;
        files.push({
          relativePath: toPosix(relative(skillDirectory, candidate)),
          bytes,
        });
        watchedFiles.push(candidate);
      }
      await validateDirectory(directory);
    };

    await walk(skillRoot);
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

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { platform } from "node:process";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import {
  CAPABILITY_SKILL_LIMITS_V1,
  loadCanonicalSkillsV1,
  scanProjectSkills,
  type ScannedSkill,
} from "../src/node/index.js";

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];

async function createProject(): Promise<string> {
  const fixtureRoot = await mkdtemp(
    join(tmpdir(), "spotlight-skill-directory-loader-"),
  );
  temporaryDirectories.push(fixtureRoot);
  const projectRoot = join(fixtureRoot, "project");
  await mkdir(projectRoot);
  return projectRoot;
}

function scannedSkill(
  name: string,
  directory = `.agents/skills/${name}`,
): ScannedSkill {
  return {
    name,
    root: ".agents/skills",
    directory,
    skillFile: `${directory}/SKILL.md`,
    sourceKind: "canonical",
  };
}

async function writeSkill(
  projectRoot: string,
  name: string,
  files: Readonly<Record<string, string | Uint8Array>>,
): Promise<void> {
  const directory = join(projectRoot, ".agents", "skills", name);
  for (const [relativePath, bytes] of Object.entries(files)) {
    const path = join(directory, ...relativePath.split("/"));
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
  }
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("loadCanonicalSkillsV1", () => {
  it("loads complete Skills as exact bytes in stable UTF-8 order", async () => {
    const projectRoot = await createProject();
    const icon = Uint8Array.of(0, 255, 1, 128);
    await writeSkill(projectRoot, "\u{10000}-skill", {
      "SKILL.md": "supplementary",
      "references/\u{10000}.json": "supplementary-file",
      "references/\uE000.json": "private-file",
      "assets/icon.bin": icon,
      "a./dot.txt": "dot",
      "a/slash.txt": "slash",
    });
    await writeSkill(projectRoot, "\uE000-skill", {
      "SKILL.md": "private",
      "references/cameras.json": '{"camera":1}',
    });
    const { skills } = await scanProjectSkills({ projectRoot });

    const result = await loadCanonicalSkillsV1({
      projectRoot,
      skills: [...skills].reverse(),
    });

    expect(result.skills.map((skill) => skill.name)).toEqual([
      "\uE000-skill",
      "\u{10000}-skill",
    ]);
    expect(
      result.skills[1]?.files.map((file) => file.relativePath),
    ).toEqual([
      "SKILL.md",
      "a./dot.txt",
      "a/slash.txt",
      "assets/icon.bin",
      "references/\uE000.json",
      "references/\u{10000}.json",
    ]);
    expect(Array.from(result.skills[1]?.files[3]?.bytes ?? [])).toEqual(
      Array.from(icon),
    );
    expect(result.watchedFiles).toEqual(
      [
        join(projectRoot, ".agents/skills/\uE000-skill/SKILL.md"),
        join(
          projectRoot,
          ".agents/skills/\uE000-skill/references/cameras.json",
        ),
        join(projectRoot, ".agents/skills/\u{10000}-skill/SKILL.md"),
        join(projectRoot, ".agents/skills/\u{10000}-skill/a./dot.txt"),
        join(projectRoot, ".agents/skills/\u{10000}-skill/a/slash.txt"),
        join(projectRoot, ".agents/skills/\u{10000}-skill/assets/icon.bin"),
        join(
          projectRoot,
          ".agents/skills/\u{10000}-skill/references/\uE000.json",
        ),
        join(
          projectRoot,
          ".agents/skills/\u{10000}-skill/references/\u{10000}.json",
        ),
      ].sort((left, right) =>
        Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8")),
      ),
    );
    expect(result.watchedFiles.every((path) => path.startsWith("/"))).toBe(
      true,
    );
    expect(result.fileCount).toBe(8);
    expect(result.expandedBytes).toBe(
      Buffer.byteLength("private") +
        Buffer.byteLength('{"camera":1}') +
        Buffer.byteLength("supplementary") +
        Buffer.byteLength("dot") +
        Buffer.byteLength("slash") +
        icon.byteLength +
        Buffer.byteLength("private-file") +
        Buffer.byteLength("supplementary-file"),
    );
  });

  it.each([
    ["symlink file", async (directory: string, fixtureRoot: string) => {
      const target = join(fixtureRoot, "secret.txt");
      await writeFile(target, "must-not-be-read", "utf8");
      await symlink(target, join(directory, "secret.txt"));
    }],
    ["symlink directory", async (directory: string, fixtureRoot: string) => {
      const target = join(fixtureRoot, "secret-directory");
      await mkdir(target);
      await writeFile(join(target, "secret.txt"), "must-not-be-read", "utf8");
      await symlink(target, join(directory, "linked"), "dir");
    }],
  ])("rejects an unsafe %s entry", async (_label, addUnsafeEntry) => {
    const projectRoot = await createProject();
    await writeSkill(projectRoot, "unsafe", { "SKILL.md": "safe" });
    const directory = join(projectRoot, ".agents/skills/unsafe");
    await addUnsafeEntry(directory, dirname(projectRoot));

    await expect(
      loadCanonicalSkillsV1({
        projectRoot,
        skills: [scannedSkill("unsafe")],
      }),
    ).rejects.toMatchObject({ code: "CAPABILITY_SKILL_ENTRY_UNSAFE" });
  });

  it.skipIf(platform === "win32")(
    "rejects a FIFO as a non-regular entry where supported",
    async () => {
      const projectRoot = await createProject();
      await writeSkill(projectRoot, "unsafe", { "SKILL.md": "safe" });
      const fifo = join(projectRoot, ".agents/skills/unsafe/events.fifo");
      await execFileAsync("mkfifo", [fifo]);

      await expect(
        loadCanonicalSkillsV1({
          projectRoot,
          skills: [scannedSkill("unsafe")],
        }),
      ).rejects.toMatchObject({ code: "CAPABILITY_SKILL_ENTRY_UNSAFE" });
    },
  );

  it("rejects a Skill directory that escapes the project root", async () => {
    const projectRoot = await createProject();
    const outsideName = `${basename(projectRoot)}-outside`;
    const outside = join(dirname(projectRoot), outsideName);
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, "SKILL.md"), "must-not-be-read", "utf8");

    await expect(
      loadCanonicalSkillsV1({
        projectRoot,
        skills: [scannedSkill("escape", `../${outsideName}`)],
      }),
    ).rejects.toMatchObject({ code: "CAPABILITY_SKILL_ENTRY_UNSAFE" });
  });

  it("checks the 200 Skill limit before walking", async () => {
    const projectRoot = await createProject();
    const skills = Array.from(
      { length: CAPABILITY_SKILL_LIMITS_V1.maxSkills + 1 },
      (_, index) => scannedSkill(`skill-${index}`),
    );

    await expect(
      loadCanonicalSkillsV1({ projectRoot, skills }),
    ).rejects.toMatchObject({ code: "CAPABILITY_SKILL_LIMIT_EXCEEDED" });
  });

  it("rejects the 2,001st file", async () => {
    const projectRoot = await createProject();
    const directory = join(projectRoot, ".agents/skills/files");
    await mkdir(directory, { recursive: true });
    await Promise.all(
      Array.from(
        { length: CAPABILITY_SKILL_LIMITS_V1.maxFiles + 1 },
        (_, index) =>
          writeFile(
            join(directory, `file-${String(index).padStart(4, "0")}`),
            "",
          ),
      ),
    );

    await expect(
      loadCanonicalSkillsV1({
        projectRoot,
        skills: [scannedSkill("files")],
      }),
    ).rejects.toMatchObject({ code: "CAPABILITY_FILE_LIMIT_EXCEEDED" });
  });

  it("rejects 20 MiB plus one byte", async () => {
    const projectRoot = await createProject();
    await writeSkill(projectRoot, "large", {
      "SKILL.md": Buffer.alloc(
        CAPABILITY_SKILL_LIMITS_V1.maxExpandedBytes + 1,
      ),
    });

    await expect(
      loadCanonicalSkillsV1({
        projectRoot,
        skills: [scannedSkill("large")],
      }),
    ).rejects.toMatchObject({
      code: "CAPABILITY_EXPANDED_SIZE_EXCEEDED",
    });
  });
});

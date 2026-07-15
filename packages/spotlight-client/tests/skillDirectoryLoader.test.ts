import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  rename,
  rm,
  symlink,
  truncate,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { platform } from "node:process";
import { promisify } from "node:util";

import { afterEach, describe, expect, it, vi } from "vitest";

const fsRace = vi.hoisted(() => ({
  afterLstatPath: "",
  afterLstat: undefined as undefined | (() => Promise<void>),
  afterReaddirPath: "",
  afterReaddir: undefined as undefined | (() => Promise<void>),
  blockedOutsideReadPath: "",
  outsideReadAttempts: 0,
  unboundedReadFileCalls: 0,
  openedReadBytes: 0,
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    lstat: vi.fn(async (...args: Parameters<typeof actual.lstat>) => {
      const stat = await actual.lstat(...args);
      if (String(args[0]) === fsRace.afterLstatPath && fsRace.afterLstat) {
        const action = fsRace.afterLstat;
        fsRace.afterLstat = undefined;
        await action();
      }
      return stat;
    }),
    readdir: vi.fn(async (...args: Parameters<typeof actual.readdir>) => {
      const entries = await actual.readdir(...args as [never]);
      if (String(args[0]) === fsRace.afterReaddirPath && fsRace.afterReaddir) {
        const action = fsRace.afterReaddir;
        fsRace.afterReaddir = undefined;
        await action();
      }
      return entries;
    }),
    readFile: vi.fn(async (...args: Parameters<typeof actual.readFile>) => {
      fsRace.unboundedReadFileCalls += 1;
      if (String(args[0]) === fsRace.blockedOutsideReadPath) {
        fsRace.outsideReadAttempts += 1;
        throw new Error("test blocked outside-content read");
      }
      return actual.readFile(...args);
    }),
    open: vi.fn(async (...args: Parameters<typeof actual.open>) => {
      const handle = await actual.open(...args);
      const originalRead = handle.read.bind(handle);
      handle.read = vi.fn(async (...readArgs: Parameters<typeof handle.read>) => {
        const result = await originalRead(...readArgs);
        fsRace.openedReadBytes += result.bytesRead;
        return result;
      }) as typeof handle.read;
      return handle;
    }),
  };
});

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
  fsRace.afterLstatPath = "";
  fsRace.afterLstat = undefined;
  fsRace.afterReaddirPath = "";
  fsRace.afterReaddir = undefined;
  fsRace.blockedOutsideReadPath = "";
  fsRace.outsideReadAttempts = 0;
  fsRace.unboundedReadFileCalls = 0;
  fsRace.openedReadBytes = 0;
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

  it("accepts exactly 200 uniquely rooted Skills", async () => {
    const projectRoot = await createProject();
    const skills = Array.from(
      { length: CAPABILITY_SKILL_LIMITS_V1.maxSkills },
      (_, index) => scannedSkill(`skill-${String(index).padStart(3, "0")}`),
    );
    await Promise.all(
      skills.map((skill) =>
        writeSkill(projectRoot, skill.name, { "SKILL.md": "" }),
      ),
    );

    const result = await loadCanonicalSkillsV1({ projectRoot, skills });

    expect(result.skills).toHaveLength(CAPABILITY_SKILL_LIMITS_V1.maxSkills);
    expect(result.fileCount).toBe(CAPABILITY_SKILL_LIMITS_V1.maxSkills);
  });

  it.each([
    [
      "duplicate Skill names",
      [scannedSkill("same"), scannedSkill("same", ".agents/skills/other")],
    ],
    [
      "duplicate Skill directories",
      [
        scannedSkill("one", ".agents/skills/shared"),
        scannedSkill("two", ".agents/skills/shared"),
      ],
    ],
    [
      "parent and child Skill directories",
      [
        scannedSkill("parent", ".agents/skills/nested"),
        scannedSkill("child", ".agents/skills/nested/child"),
      ],
    ],
    [
      "non-adjacent parent and child Skill directories",
      [
        scannedSkill("parent", ".agents/skills/a"),
        scannedSkill("sibling", ".agents/skills/a-elsewhere"),
        scannedSkill("child", ".agents/skills/a/child"),
      ],
    ],
  ])("rejects %s deterministically", async (_label, skills) => {
    const projectRoot = await createProject();
    await Promise.all(
      [...new Set(skills.map((skill) => skill.directory))].map(
        async (directory) => {
          const absolute = join(projectRoot, ...directory.split("/"));
          await mkdir(absolute, { recursive: true });
          await writeFile(join(absolute, "SKILL.md"), "safe", "utf8");
        },
      ),
    );

    await expect(
      loadCanonicalSkillsV1({ projectRoot, skills }),
    ).rejects.toMatchObject({
      code: "CAPABILITY_SKILL_ENTRY_UNSAFE",
    });
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

  it("accepts exactly 2,000 files", async () => {
    const projectRoot = await createProject();
    const directory = join(projectRoot, ".agents/skills/files");
    await mkdir(directory, { recursive: true });
    await Promise.all(
      Array.from({ length: CAPABILITY_SKILL_LIMITS_V1.maxFiles }, (_, index) =>
        writeFile(join(directory, `file-${String(index).padStart(4, "0")}`), ""),
      ),
    );

    const result = await loadCanonicalSkillsV1({
      projectRoot,
      skills: [scannedSkill("files")],
    });

    expect(result.fileCount).toBe(CAPABILITY_SKILL_LIMITS_V1.maxFiles);
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
    expect(fsRace.unboundedReadFileCalls).toBe(0);
    expect(fsRace.openedReadBytes).toBeLessThanOrEqual(
      CAPABILITY_SKILL_LIMITS_V1.maxExpandedBytes + 1,
    );
  });

  it("accepts exactly 20 MiB", async () => {
    const projectRoot = await createProject();
    await writeSkill(projectRoot, "large", {
      "SKILL.md": Buffer.alloc(CAPABILITY_SKILL_LIMITS_V1.maxExpandedBytes),
    });

    const result = await loadCanonicalSkillsV1({
      projectRoot,
      skills: [scannedSkill("large")],
    });

    expect(result.expandedBytes).toBe(
      CAPABILITY_SKILL_LIMITS_V1.maxExpandedBytes,
    );
  });

  it("reads only the remaining budget plus one byte from a larger file", async () => {
    const projectRoot = await createProject();
    const candidate = join(projectRoot, ".agents/skills/large/SKILL.md");
    await writeSkill(projectRoot, "large", { "SKILL.md": "" });
    await truncate(
      candidate,
      CAPABILITY_SKILL_LIMITS_V1.maxExpandedBytes + 1024 * 1024,
    );

    await expect(
      loadCanonicalSkillsV1({
        projectRoot,
        skills: [scannedSkill("large")],
      }),
    ).rejects.toMatchObject({
      code: "CAPABILITY_EXPANDED_SIZE_EXCEEDED",
    });
    expect(fsRace.unboundedReadFileCalls).toBe(0);
    expect(fsRace.openedReadBytes).toBe(
      CAPABILITY_SKILL_LIMITS_V1.maxExpandedBytes + 1,
    );
  });

  it("does not observe outside content when a file is swapped after lstat", async () => {
    const projectRoot = await createProject();
    const outsideRoot = dirname(projectRoot);
    const outside = join(outsideRoot, "outside-secret.txt");
    const candidate = join(projectRoot, ".agents/skills/race/SKILL.md");
    await writeSkill(projectRoot, "race", { "SKILL.md": "safe" });
    await writeFile(outside, "must-not-be-read", "utf8");
    fsRace.blockedOutsideReadPath = candidate;
    fsRace.afterLstatPath = candidate;
    fsRace.afterLstat = async () => {
      await rm(candidate);
      await symlink(outside, candidate);
    };

    await expect(
      loadCanonicalSkillsV1({ projectRoot, skills: [scannedSkill("race")] }),
    ).rejects.toMatchObject({ code: "CAPABILITY_SKILL_ENTRY_UNSAFE" });
    expect(fsRace.outsideReadAttempts).toBe(0);
  });

  it("rejects a Skill-root swap after readdir before any outside content read", async () => {
    const projectRoot = await createProject();
    const outsideRoot = join(dirname(projectRoot), "outside-skill");
    const skillRoot = join(projectRoot, ".agents/skills/race");
    const movedRoot = `${skillRoot}-original`;
    await writeSkill(projectRoot, "race", { "SKILL.md": "safe" });
    await mkdir(outsideRoot);
    await writeFile(join(outsideRoot, "SKILL.md"), "must-not-be-read", "utf8");
    fsRace.blockedOutsideReadPath = join(skillRoot, "SKILL.md");
    fsRace.afterReaddirPath = skillRoot;
    fsRace.afterReaddir = async () => {
      await rename(skillRoot, movedRoot);
      await symlink(outsideRoot, skillRoot, "dir");
    };

    await expect(
      loadCanonicalSkillsV1({ projectRoot, skills: [scannedSkill("race")] }),
    ).rejects.toMatchObject({ code: "CAPABILITY_SKILL_ENTRY_UNSAFE" });
    expect(fsRace.outsideReadAttempts).toBe(0);
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { scanProjectSkills } from "../src/node/capabilities/skillScanner.js";

const temporaryProjects: string[] = [];

async function createProject(): Promise<string> {
  const projectRoot = await mkdtemp(join(tmpdir(), "spotlight-skill-scanner-"));
  temporaryProjects.push(projectRoot);
  return projectRoot;
}

async function writeSkill(projectRoot: string, relativeDirectory: string) {
  const directory = join(projectRoot, relativeDirectory);
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "SKILL.md"),
    `---\nname: ${relativeDirectory.split("/").at(-1)}\ndescription: fixture\n---\n`,
    "utf8",
  );
}

afterEach(async () => {
  await Promise.all(
    temporaryProjects
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("scanProjectSkills", () => {
  it("discovers only direct child skills in deterministic order", async () => {
    const projectRoot = await createProject();
    await writeSkill(projectRoot, ".agents/skills/zeta");
    await writeSkill(projectRoot, ".agents/skills/alpha");
    await writeSkill(projectRoot, ".agents/skills/group/nested");
    await mkdir(join(projectRoot, ".agents/skills/no-skill-file"), {
      recursive: true,
    });
    await mkdir(join(projectRoot, "external"), { recursive: true });
    await writeFile(join(projectRoot, "external/SKILL.md"), "external", "utf8");
    await mkdir(join(projectRoot, ".agents/skills/symlinked"), {
      recursive: true,
    });
    await symlink(
      join(projectRoot, "external/SKILL.md"),
      join(projectRoot, ".agents/skills/symlinked/SKILL.md"),
    );

    const result = await scanProjectSkills({ projectRoot });

    expect(result).toEqual({
      skills: [
        {
          name: "alpha",
          root: ".agents/skills",
          directory: ".agents/skills/alpha",
          skillFile: ".agents/skills/alpha/SKILL.md",
          sourceKind: "canonical",
        },
        {
          name: "zeta",
          root: ".agents/skills",
          directory: ".agents/skills/zeta",
          skillFile: ".agents/skills/zeta/SKILL.md",
          sourceKind: "canonical",
        },
      ],
      diagnostics: [],
    });
  });

  it("uses default root precedence and reports every shadowed skill", async () => {
    const projectRoot = await createProject();
    await writeSkill(projectRoot, ".agents/skills/camera");
    await writeSkill(projectRoot, ".inupedia/skills/camera");
    await writeSkill(projectRoot, ".claude/skills/camera");
    await writeSkill(projectRoot, ".claude/skills/pdf");

    const result = await scanProjectSkills({ projectRoot, mode: "compat" });

    expect(result.skills.map((skill) => skill.skillFile)).toEqual([
      ".agents/skills/camera/SKILL.md",
      ".claude/skills/pdf/SKILL.md",
    ]);
    expect(result.diagnostics).toEqual([
      {
        code: "SKILL_NAME_SHADOWED",
        severity: "warning",
        name: "camera",
        selected: ".agents/skills/camera/SKILL.md",
        candidates: [
          ".agents/skills/camera/SKILL.md",
          ".inupedia/skills/camera/SKILL.md",
        ],
      },
      {
        code: "SKILL_NAME_SHADOWED",
        severity: "warning",
        name: "camera",
        selected: ".agents/skills/camera/SKILL.md",
        candidates: [
          ".agents/skills/camera/SKILL.md",
          ".claude/skills/camera/SKILL.md",
        ],
      },
    ]);
  });

  it("replaces default roots with explicit caller precedence", async () => {
    const projectRoot = await createProject();
    await writeSkill(projectRoot, ".agents/skills/camera");
    await writeSkill(projectRoot, "vendor/skills/camera");

    const result = await scanProjectSkills({
      projectRoot,
      mode: "compat",
      skillRoots: ["vendor/skills", ".agents/skills"],
    });

    expect(result.skills).toHaveLength(1);
    expect(result.skills[0]?.skillFile).toBe("vendor/skills/camera/SKILL.md");
    expect(result.skills[0]?.sourceKind).toBe("custom");
    expect(result.diagnostics).toHaveLength(1);
  });

  it("rejects every colliding skill in strict mode", async () => {
    const projectRoot = await createProject();
    await writeSkill(projectRoot, ".agents/skills/camera");
    await writeSkill(projectRoot, ".inupedia/skills/camera");
    await writeSkill(projectRoot, ".claude/skills/camera");
    await writeSkill(projectRoot, ".agents/skills/pdf");

    const result = await scanProjectSkills({ projectRoot, mode: "strict" });

    expect(result.skills.map((skill) => skill.name)).toEqual(["pdf"]);
    expect(result.diagnostics).toEqual([
      {
        code: "SKILL_NAME_COLLISION",
        severity: "error",
        name: "camera",
        candidates: [
          ".agents/skills/camera/SKILL.md",
          ".inupedia/skills/camera/SKILL.md",
          ".claude/skills/camera/SKILL.md",
        ],
      },
    ]);
  });
});

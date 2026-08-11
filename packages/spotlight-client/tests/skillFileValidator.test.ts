import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { ScannedSkill } from "../src/node/capabilities/skillScanner.js";
import { validateScannedSkill } from "../src/node/index.js";

const temporaryProjects: string[] = [];

async function createProject(): Promise<string> {
  const projectRoot = await mkdtemp(
    join(tmpdir(), "spotlight-skill-validator-"),
  );
  temporaryProjects.push(projectRoot);
  return projectRoot;
}

async function writeScannedSkill(
  projectRoot: string,
  markdown: string,
): Promise<ScannedSkill> {
  const directory = ".agents/skills/monitoring";
  await mkdir(join(projectRoot, directory), { recursive: true });
  await writeFile(join(projectRoot, directory, "SKILL.md"), markdown, "utf8");
  return {
    name: "monitoring",
    root: ".agents/skills",
    directory,
    skillFile: `${directory}/SKILL.md`,
    sourceKind: "canonical",
  };
}

const frontmatter = [
  "---",
  "name: monitoring",
  "description: Query cameras when monitoring status is requested.",
  "---",
];

afterEach(async () => {
  await Promise.all(
    temporaryProjects
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("validateScannedSkill", () => {
  it("warns when SKILL.md contains more than 500 lines", async () => {
    const projectRoot = await createProject();
    const markdown = [...frontmatter, ...Array(497).fill("content")].join("\n");
    const skill = await writeScannedSkill(projectRoot, markdown);

    const result = await validateScannedSkill({ projectRoot, skill });

    expect(markdown.split("\n")).toHaveLength(501);
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "SKILL_RECOMMENDATION_LINES",
        severity: "warning",
      }),
    ]);
  });

  it("warns when the deterministic token estimate exceeds 5000", async () => {
    const projectRoot = await createProject();
    const markdown = [...frontmatter, "x".repeat(20_001)].join("\n");
    const skill = await writeScannedSkill(projectRoot, markdown);

    const result = await validateScannedSkill({ projectRoot, skill });

    expect(markdown.split("\n").length).toBeLessThanOrEqual(500);
    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "SKILL_RECOMMENDATION_TOKENS",
        severity: "warning",
      }),
    ]);
  });

  it("warns about relative Markdown references outside the Skill root", async () => {
    const projectRoot = await createProject();
    const skill = await writeScannedSkill(
      projectRoot,
      [...frontmatter, "[Outside](../outside.md)"].join("\n"),
    );

    const result = await validateScannedSkill({ projectRoot, skill });

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "SKILL_REFERENCE_OUTSIDE_ROOT",
        severity: "warning",
      }),
    ]);
  });

  it("warns once when a direct reference links to another reference", async () => {
    const projectRoot = await createProject();
    const skill = await writeScannedSkill(
      projectRoot,
      [...frontmatter, "[Reference](references/a.md)"].join("\n"),
    );
    const references = join(projectRoot, skill.directory, "references");
    await mkdir(references, { recursive: true });
    await writeFile(join(references, "a.md"), "[Next](b.md)", "utf8");
    await writeFile(join(references, "b.md"), "# Leaf", "utf8");

    const result = await validateScannedSkill({ projectRoot, skill });

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "SKILL_REFERENCE_CHAIN_DEEP",
        severity: "warning",
      }),
    ]);
  });
});

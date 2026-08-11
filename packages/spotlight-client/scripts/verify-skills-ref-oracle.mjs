import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const oracle = JSON.parse(
  await readFile(
    new URL("../tests/fixtures/skillsRefOracle.json", import.meta.url),
    "utf8",
  ),
);

function run(command, args) {
  return spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
}

function assertSuccess(result, description) {
  if (result.status === 0) return;

  const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
  throw new Error(
    `${description} failed with exit code ${result.status}.\n${output}`,
  );
}

const workspace = await mkdtemp(join(tmpdir(), "spotlight-skills-ref-"));

try {
  const pythonCommand = process.env.PYTHON ?? "python3";
  const venvResult = run(pythonCommand, [
    "-m",
    "venv",
    join(workspace, "venv"),
  ]);
  assertSuccess(
    venvResult,
    "Creating the skills-ref Python virtual environment",
  );

  const executableDirectory = process.platform === "win32" ? "Scripts" : "bin";
  const pythonExecutable = join(
    workspace,
    "venv",
    executableDirectory,
    process.platform === "win32" ? "python.exe" : "python",
  );
  const skillsRefExecutable = join(
    workspace,
    "venv",
    executableDirectory,
    process.platform === "win32" ? "skills-ref.exe" : "skills-ref",
  );
  const source = `git+${oracle.repository}@${oracle.commit}#subdirectory=skills-ref`;
  const installResult = run(pythonExecutable, [
    "-m",
    "pip",
    "install",
    "--disable-pip-version-check",
    source,
  ]);
  assertSuccess(installResult, `Installing pinned skills-ref from ${source}`);

  const versionResult = run(pythonExecutable, [
    "-c",
    "from importlib.metadata import version; print(version('skills-ref'))",
  ]);
  assertSuccess(versionResult, "Reading the installed skills-ref version");
  const installedVersion = versionResult.stdout.trim();
  if (installedVersion !== oracle.packageVersion) {
    throw new Error(
      `Expected skills-ref ${oracle.packageVersion}, received ${installedVersion}.`,
    );
  }

  const mismatches = [];
  for (const fixture of oracle.cases) {
    const skillDirectory = join(
      workspace,
      "cases",
      fixture.id,
      fixture.directoryName,
    );
    await mkdir(skillDirectory, { recursive: true });
    await writeFile(join(skillDirectory, "SKILL.md"), fixture.markdown, "utf8");

    const result = run(skillsRefExecutable, ["validate", skillDirectory]);
    const actualValid = result.status === 0;
    if (actualValid !== fixture.officialValid) {
      mismatches.push({
        id: fixture.id,
        expectedValid: fixture.officialValid,
        actualValid,
        output: [result.stdout, result.stderr]
          .filter(Boolean)
          .join("\n")
          .trim(),
      });
    }
  }

  if (mismatches.length > 0) {
    throw new Error(
      `Pinned skills-ref oracle mismatches:\n${JSON.stringify(mismatches, null, 2)}`,
    );
  }

  console.log(
    `Verified ${oracle.cases.length} Agent Skills cases against skills-ref ${installedVersion} at ${oracle.commit}.`,
  );
} finally {
  await rm(workspace, { recursive: true, force: true });
}

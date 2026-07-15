#!/usr/bin/env node
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const packagesRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = mkdtempSync(join(tmpdir(), "inupedia-spotlight-smoke-"));
const pnpmCli = process.env.npm_execpath;

try {
  const packDir = join(tempDir, "packs");
  const consumerDir = join(tempDir, "consumer");
  mkdirSync(packDir, { recursive: true });
  mkdirSync(consumerDir, { recursive: true });

  for (const packageName of [
    "spotlight-protocol",
    "spotlight-client",
    "spotlight-vue",
  ]) {
    runPnpm(
      [
        "--dir",
        join(packagesRoot, packageName),
        "pack",
        "--pack-destination",
        packDir,
      ],
      packagesRoot,
    );
  }

  const protocolTarball = findTarball(packDir, "spotlight-protocol");
  const clientTarball = findTarball(packDir, "spotlight-client");
  const vueTarball = findTarball(packDir, "spotlight-vue");
  writeFileSync(
    join(consumerDir, "package.json"),
    `${JSON.stringify(
      {
        private: true,
        type: "module",
        dependencies: {
          "@inspira-ui/plugins": "^0.0.2",
          "@inupedia/spotlight-client": `file:${clientTarball}`,
          "@inupedia/spotlight-protocol": `file:${protocolTarball}`,
          "@inupedia/spotlight-vue": `file:${vueTarball}`,
          "md-editor-v3": "^6.0.0",
          pinia: "^3.0.0",
          vue: "^3.5.0",
        },
        pnpm: {
          overrides: {
            "@inupedia/spotlight-client": `file:${clientTarball}`,
            "@inupedia/spotlight-protocol": `file:${protocolTarball}`,
          },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  runPnpm(
    [
      "install",
      "--prefer-offline",
      "--ignore-scripts",
      "--no-frozen-lockfile",
    ],
    consumerDir,
  );

  const runnerPath = join(consumerDir, "smoke.mjs");
  writeFileSync(
    runnerPath,
    `
const imports = [
  {
    id: "@inupedia/spotlight-protocol",
    assert(mod) {
      assertExport(mod, "SPOTLIGHT_CORE_TOOL_NAMES", this.id);
    },
  },
  {
    id: "@inupedia/spotlight-client",
    assert(mod) {
      assertExport(mod, "createSpotlightHttp", this.id);
      if ("createNodeSkillScriptRunner" in mod) {
        throw new Error(\`\${this.id} leaked Node-only createNodeSkillScriptRunner\`);
      }
      for (const nodeOnlyExport of [
        "spotlightCapabilities",
        "SPOTLIGHT_CAPABILITIES_MODULE_ID",
        "RESOLVED_SPOTLIGHT_CAPABILITIES_MODULE_ID",
        "validateAgentSkillMarkdown",
        "validateScannedSkill",
        "buildCapabilityArtifactV1",
        "buildCapabilityFileMapV1",
        "buildToolManifestV1",
        "canonicalizeJson",
        "computeArtifactDigestV1",
        "CapabilityArtifactError",
      ]) {
        if (nodeOnlyExport in mod) {
          throw new Error(\`\${this.id} leaked Node-only \${nodeOnlyExport}\`);
        }
      }
    },
  },
  {
    id: "@inupedia/spotlight-client/node",
    assert(mod) {
      assertExport(mod, "createNodeSkillScriptRunner", this.id);
      assertExport(mod, "joinSkillScriptPath", this.id);
      assertExport(mod, "scanProjectSkills", this.id);
      assertExport(mod, "validateAgentSkillMarkdown", this.id);
      assertExport(mod, "validateScannedSkill", this.id);
      assertExport(mod, "buildCapabilityArtifactV1", this.id);
      assertExport(mod, "buildCapabilityFileMapV1", this.id);
      assertExport(mod, "buildToolManifestV1", this.id);
      assertExport(mod, "canonicalizeJson", this.id);
      assertExport(mod, "computeArtifactDigestV1", this.id);
      assertExport(mod, "CapabilityArtifactError", this.id);
      const artifact = mod.buildCapabilityArtifactV1({ skills: [], tools: [] });
      if (!(artifact.archive instanceof Uint8Array) || artifact.byteLength === 0) {
        throw new Error(this.id + " failed to build a smoke Artifact");
      }
      if (!/^sha256:[a-f0-9]{64}$/.test(artifact.artifactDigest)) {
        throw new Error(this.id + " returned an invalid artifactDigest");
      }
      const canonical = new TextDecoder().decode(
        mod.canonicalizeJson({ z: 1, a: 2 }),
      );
      if (canonical !== '{"a":2,"z":1}') {
        throw new Error(this.id + " canonical JSON smoke mismatch");
      }
    },
  },
  {
    id: "@inupedia/spotlight-client/vite",
    async assert(mod) {
      if (typeof mod.default !== "function") {
        throw new Error(\`\${this.id} default export must be a function\`);
      }
      for (const name of [
        "spotlightCapabilities",
        "SPOTLIGHT_CAPABILITIES_MODULE_ID",
        "RESOLVED_SPOTLIGHT_CAPABILITIES_MODULE_ID",
      ]) {
        assertExport(mod, name, this.id);
      }

      const { mkdirSync, writeFileSync } = await import("node:fs");
      const { join } = await import("node:path");
      const fixtureRoot = process.cwd();
      const skillDirectory = join(
        fixtureRoot,
        ".agents",
        "skills",
        "package-smoke",
      );
      mkdirSync(skillDirectory, { recursive: true });
      writeFileSync(
        join(skillDirectory, "SKILL.md"),
        "---\\nname: package-smoke\\ndescription: Package boundary smoke\\n---\\nExercise the published Vite capability entrypoint.\\n",
        "utf8",
      );

      const plugin = mod.spotlightCapabilities(
        { projectId: "package-smoke-project", tools: [] },
        { frontendBuildId: "package-smoke-build", devRuntimeUpload: true },
      );
      await hook(plugin.configResolved).call(undefined, {
        root: fixtureRoot,
        command: "build",
      });
      const watchedFiles = [];
      await hook(plugin.buildStart).call({
        addWatchFile(file) {
          watchedFiles.push(file);
        },
      });
      if (watchedFiles.length !== 1 || !watchedFiles[0].endsWith("SKILL.md")) {
        throw new Error(\`\${this.id} did not watch the fixture SKILL.md\`);
      }

      const resolvedId = await hook(plugin.resolveId).call(
        undefined,
        mod.SPOTLIGHT_CAPABILITIES_MODULE_ID,
      );
      if (resolvedId !== mod.RESOLVED_SPOTLIGHT_CAPABILITIES_MODULE_ID) {
        throw new Error(\`\${this.id} virtual module resolution mismatch\`);
      }
      const source = await hook(plugin.load).call(undefined, resolvedId);
      if (typeof source !== "string") {
        throw new Error(\`\${this.id} did not load the virtual module\`);
      }
      const generated = await import(
        \`data:text/javascript;base64,\${Buffer.from(source, "utf8").toString("base64")}\`
      );
      const buildInfo = generated.capabilityBuildInfo;
      if (
        buildInfo.schemaVersion !== "spotlight.capability-build-info/1" ||
        buildInfo.projectId !== "package-smoke-project" ||
        buildInfo.frontendBuildId !== "package-smoke-build"
      ) {
        throw new Error(\`\${this.id} generated invalid capability build info\`);
      }

      const nodeMod = await import("@inupedia/spotlight-client/node");
      const scan = await nodeMod.scanProjectSkills({
        projectRoot: fixtureRoot,
        mode: "strict",
      });
      const loaded = await nodeMod.loadCanonicalSkillsV1({
        projectRoot: fixtureRoot,
        skills: scan.skills,
      });
      const independentArtifact = nodeMod.buildCapabilityArtifactV1({
        skills: loaded.skills,
        tools: [],
      });
      if (buildInfo.artifactDigest !== independentArtifact.artifactDigest) {
        throw new Error(\`\${this.id} generated a non-exact artifact digest\`);
      }
      if (!/^sha256:[a-f0-9]{64}$/.test(buildInfo.artifactDigest)) {
        throw new Error(\`\${this.id} generated an invalid sha256 digest\`);
      }

      let disabledError;
      try {
        await generated.openUploadStream();
      } catch (error) {
        disabledError = error;
      }
      if (
        !(disabledError instanceof Error) ||
        disabledError.code !== "ARTIFACT_RUNTIME_UPLOAD_DISABLED"
      ) {
        throw new Error(\`\${this.id} production upload provider was not disabled\`);
      }

      const emitted = [];
      await hook(plugin.generateBundle).call({
        emitFile(asset) {
          emitted.push(asset);
        },
      });
      const canonicalBuildInfo = new TextDecoder().decode(
        nodeMod.canonicalizeJson(buildInfo),
      );
      if (
        emitted.length !== 1 ||
        emitted[0].type !== "asset" ||
        emitted[0].fileName !== "capability-build-info.json" ||
        emitted[0].source !== canonicalBuildInfo + "\\n"
      ) {
        throw new Error(\`\${this.id} emitted non-canonical build-info assets\`);
      }
    },
  },
  {
    id: "@inupedia/spotlight-vue",
    assert(mod) {
      assertExport(mod, "SpotlightVue", this.id);
      if ("resetSpotlightRuntimeForTests" in mod) {
        throw new Error(\`\${this.id} leaked testing reset helper\`);
      }
    },
  },
  {
    id: "@inupedia/spotlight-vue/remote",
    assert(mod) {
      assertExport(mod, "runRemoteSpotlightPipeline", this.id);
    },
  },
  {
    id: "@inupedia/spotlight-vue/markdown",
    assert(mod) {
      assertExport(mod, "formatSpotlightKnowledgeMarkdown", this.id);
    },
  },
  {
    id: "@inupedia/spotlight-vue/store",
    assert(mod) {
      assertExport(mod, "useSpotlightStore", this.id);
    },
  },
  {
    id: "@inupedia/spotlight-vue/workflow",
    assert(mod) {
      assertExport(mod, "createOperateDefinition", this.id);
    },
  },
  {
    id: "@inupedia/spotlight-vue/testing",
    assert(mod) {
      assertExport(mod, "resetSpotlightRuntimeForTests", this.id);
    },
  },
  {
    id: "@inupedia/spotlight-vue/components",
    assert(mod) {
      assertExport(mod, "InspiraCardSpotlight", this.id);
    },
  },
  {
    id: "@inupedia/spotlight-vue/components/InspiraCardSpotlight",
    assert(mod) {
      assertDefault(mod, this.id);
    },
  },
  {
    id: "@inupedia/spotlight-vue/components/InspiraCardSpotlight.vue",
    assert(mod) {
      assertDefault(mod, this.id);
    },
  },
];

const { existsSync, readFileSync, realpathSync } = await import("node:fs");
const { dirname, isAbsolute, join, relative, sep } = await import("node:path");
const { fileURLToPath } = await import("node:url");
const consumerRoot = realpathSync(process.cwd());
const viteEntry = realpathSync(
  fileURLToPath(import.meta.resolve("@inupedia/spotlight-client/vite")),
);
for (const id of [
  "@inupedia/spotlight-protocol",
  "@inupedia/spotlight-client",
  "@inupedia/spotlight-client/node",
  "@inupedia/spotlight-client/vite",
  "@inupedia/spotlight-vue",
  "@inupedia/spotlight-vue/remote",
  "@inupedia/spotlight-vue/markdown",
  "@inupedia/spotlight-vue/store",
  "@inupedia/spotlight-vue/workflow",
  "@inupedia/spotlight-vue/testing",
  "@inupedia/spotlight-vue/components",
  "@inupedia/spotlight-vue/components/InspiraCardSpotlight",
  "@inupedia/spotlight-vue/components/InspiraCardSpotlight.vue",
  "@inupedia/spotlight-vue/styles/spotlight-vue.css",
]) {
  const entry = realpathSync(fileURLToPath(import.meta.resolve(id)));
  const fromConsumer = relative(consumerRoot, entry);
  if (
    fromConsumer === "" ||
    fromConsumer === ".." ||
    fromConsumer.startsWith(".." + sep) ||
    isAbsolute(fromConsumer) ||
    !fromConsumer.split(sep).includes("node_modules")
  ) {
    throw new Error(id + " resolved outside temporary consumer: " + entry);
  }
}

const packedClientManifestPath = join(dirname(viteEntry), "..", "..", "package.json");
if (!existsSync(packedClientManifestPath)) {
  throw new Error("packed client manifest is missing beside resolved Vite entry");
}
const packedClientManifest = JSON.parse(
  readFileSync(packedClientManifestPath, "utf8"),
);
const packedClientNodeModules = join(
  dirname(packedClientManifestPath),
  "..",
  "..",
);
if (
  packedClientManifest.exports?.["./vite"]?.types !==
    "./dist/vite/index.d.ts" ||
  packedClientManifest.exports?.["./vite"]?.import !==
    "./dist/vite/index.js"
) {
  throw new Error("packed client manifest has an invalid Vite export");
}
if (JSON.stringify(packedClientManifest).includes("workspace:")) {
  throw new Error("packed client manifest retained a workspace dependency");
}
for (const dependency of [
  "@inupedia/spotlight-protocol",
  "@babel/parser",
  "@babel/traverse",
  "@babel/types",
  "canonicalize",
  "fflate",
  "magic-string",
  "yaml",
]) {
  if (!(dependency in packedClientManifest.dependencies)) {
    throw new Error(
      "packed client manifest is missing runtime dependency " + dependency,
    );
  }
  const dependencyPackage = realpathSync(
    join(packedClientNodeModules, ...dependency.split("/")),
  );
  const fromConsumer = relative(consumerRoot, dependencyPackage);
  if (
    fromConsumer === ".." ||
    fromConsumer.startsWith(".." + sep) ||
    isAbsolute(fromConsumer)
  ) {
    throw new Error(
      "packed client dependency resolved outside temporary consumer: " +
        dependency +
        " -> " +
        dependencyPackage,
    );
  }
}

function assertExport(mod, name, id) {
  if (!(name in mod)) {
    throw new Error(\`\${id} is missing export \${name}\`);
  }
}

function assertDefault(mod, id) {
  if (!("default" in mod)) {
    throw new Error(\`\${id} is missing default export\`);
  }
}

function hook(value) {
  if (!value) throw new Error("expected Vite hook");
  return typeof value === "function" ? value : value.handler;
}

for (const item of imports) {
  const mod = await import(item.id);
  await item.assert(mod);
  console.log(\`[smoke-imports] \${item.id} ok\`);
}
`,
    "utf8",
  );

  const result = spawnSync(process.execPath, [runnerPath], {
    cwd: consumerDir,
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);

  console.log(
    "[smoke-imports] @inupedia/spotlight-vue/styles/spotlight-vue.css ok",
  );
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

function findTarball(directory, packageName) {
  const matches = readdirSync(directory)
    .filter((entry) => entry.includes(packageName) && entry.endsWith(".tgz"))
    .sort();
  if (matches.length !== 1) {
    throw new Error(
      `expected one packed ${packageName} tarball, found ${matches.length}`,
    );
  }
  return join(directory, matches[0]);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with status ${result.status ?? "unknown"}`,
    );
  }
}

function runPnpm(args, cwd) {
  if (pnpmCli) {
    run(process.execPath, [pnpmCli, ...args], cwd);
    return;
  }
  run("pnpm", args, cwd);
}

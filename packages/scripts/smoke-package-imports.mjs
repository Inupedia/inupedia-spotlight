#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const packagesRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = mkdtempSync(join(tmpdir(), "inupedia-spotlight-smoke-"));

try {
  const scopeDir = join(tempDir, "node_modules", "@inupedia");
  mkdirSync(scopeDir, { recursive: true });

  for (const packageName of [
    "spotlight-protocol",
    "spotlight-client",
    "spotlight-vue",
  ]) {
    symlinkSync(join(packagesRoot, packageName), join(scopeDir, packageName), "dir");
  }

  const runnerPath = join(tempDir, "smoke.mjs");
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
    },
  },
  {
    id: "@inupedia/spotlight-client/node",
    assert(mod) {
      assertExport(mod, "createNodeSkillScriptRunner", this.id);
      assertExport(mod, "joinSkillScriptPath", this.id);
    },
  },
  {
    id: "@inupedia/spotlight-client/vite",
    assert(mod) {
      if (typeof mod.default !== "function") {
        throw new Error(\`\${this.id} default export must be a function\`);
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

for (const item of imports) {
  const mod = await import(item.id);
  item.assert(mod);
  console.log(\`[smoke-imports] \${item.id} ok\`);
}
`,
    "utf8",
  );

  const result = spawnSync(process.execPath, [runnerPath], {
    cwd: tempDir,
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);

  const cssPath = join(
    packagesRoot,
    "spotlight-vue",
    "dist",
    "assets",
    "spotlight-vue.css",
  );
  if (!existsSync(cssPath)) {
    throw new Error(`missing style export target: ${cssPath}`);
  }
  console.log(
    "[smoke-imports] @inupedia/spotlight-vue/styles/spotlight-vue.css ok",
  );
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

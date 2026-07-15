import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Plugin, ResolvedConfig } from "vite";
import { afterEach, describe, expect, it, vi } from "vitest";

import { canonicalizeJson } from "../src/node/capabilities/canonicalJson.js";
import { buildViteCapabilitiesV1 } from "../src/vite/capabilityBuild.js";
import {
  RESOLVED_SPOTLIGHT_CAPABILITIES_MODULE_ID,
  SPOTLIGHT_CAPABILITIES_MODULE_ID,
} from "../src/vite/capabilityVirtualModule.js";
import { spotlightCapabilities } from "../src/vite/spotlightCapabilities.js";

const temporaryProjects: string[] = [];
const textDecoder = new TextDecoder();

async function createProject(): Promise<{
  root: string;
  skillBody: string;
  skillFile: string;
}> {
  const root = await mkdtemp(join(tmpdir(), "spotlight-capabilities-plugin-"));
  temporaryProjects.push(root);
  const skillDirectory = join(root, ".agents/skills/monitoring");
  const skillFile = join(skillDirectory, "SKILL.md");
  const skillBody = "PRIVATE_SKILL_BODY_DO_NOT_EMBED";
  await mkdir(skillDirectory, { recursive: true });
  await writeFile(
    skillFile,
    `---\nname: monitoring\ndescription: Monitor channels\n---\n${skillBody}\n`,
    "utf8",
  );
  return { root, skillBody, skillFile };
}

function hook<T extends (...args: never[]) => unknown>(
  value: T | { handler: T } | undefined,
): T {
  if (!value) throw new Error("Expected Vite hook");
  return typeof value === "function" ? value : value.handler;
}

async function buildPlugin(options: { devRuntimeUpload?: boolean } = {}) {
  const fixture = await createProject();
  const plugin = spotlightCapabilities(
    { projectId: "camera-console", tools: [] },
    { frontendBuildId: "frontend-2026-07-15", ...options },
  );
  const watchedFiles: string[] = [];
  hook(plugin.configResolved).call(undefined, {
    root: fixture.root,
    command: "build",
  } as ResolvedConfig);
  await hook(plugin.buildStart).call({
    addWatchFile(file: string) {
      watchedFiles.push(file);
    },
  });
  const source = await hook(plugin.load).call(
    undefined,
    RESOLVED_SPOTLIGHT_CAPABILITIES_MODULE_ID,
  );
  if (typeof source !== "string") {
    throw new Error("Expected virtual module source");
  }
  return { fixture, plugin, source, watchedFiles };
}

async function importGeneratedSource(source: string): Promise<{
  capabilityBuildInfo: Readonly<Record<string, unknown>>;
  openUploadStream: () => Promise<never>;
}> {
  const encoded = Buffer.from(source, "utf8").toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryProjects
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("spotlightCapabilities", () => {
  it("resolves only the exact public virtual module ID", async () => {
    const { plugin } = await buildPlugin();
    const resolveId = hook(plugin.resolveId);

    expect(
      await resolveId.call(undefined, SPOTLIGHT_CAPABILITIES_MODULE_ID),
    ).toBe(RESOLVED_SPOTLIGHT_CAPABILITIES_MODULE_ID);
    expect(
      await resolveId.call(undefined, RESOLVED_SPOTLIGHT_CAPABILITIES_MODULE_ID),
    ).toBeNull();
    expect(await resolveId.call(undefined, "virtual:spotlight/other")).toBeNull();
  });

  it("exports a frozen canonical build-info literal without sensitive payloads", async () => {
    const { fixture, source, watchedFiles } = await buildPlugin();
    const generated = await importGeneratedSource(source);
    const independentBuild = await buildViteCapabilitiesV1({
      root: fixture.root,
      command: "build",
      project: { projectId: "camera-console", tools: [] },
      options: { frontendBuildId: "frontend-2026-07-15" },
    });
    const canonicalJson = textDecoder.decode(
      canonicalizeJson(generated.capabilityBuildInfo),
    );

    expect(source).toContain(
      `export const capabilityBuildInfo = Object.freeze(${canonicalJson});`,
    );
    expect(Object.isFrozen(generated.capabilityBuildInfo)).toBe(true);
    expect(generated.capabilityBuildInfo).toMatchObject({
      schemaVersion: "spotlight.capability-build-info/1",
      projectId: "camera-console",
      frontendBuildId: "frontend-2026-07-15",
      artifactVersion: "spotlight.capability-artifact/1",
    });
    expect(watchedFiles).toEqual([fixture.skillFile]);

    for (const forbidden of [
      fixture.skillBody,
      fixture.root,
      Buffer.from(independentBuild.archive).toString("base64"),
      Buffer.from(independentBuild.archive).toString("hex"),
      "node:",
      "localStorage",
      "indexedDB",
      "IndexedDB",
      "base64",
      "virtual:spotlight/capability-upload",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it.each([false, true])(
    "emits exact canonical production bytes and keeps runtime upload disabled when devRuntimeUpload=%s",
    async (devRuntimeUpload) => {
      const { plugin, source } = await buildPlugin({ devRuntimeUpload });
      const generated = await importGeneratedSource(source);
      const canonicalJson = textDecoder.decode(
        canonicalizeJson(generated.capabilityBuildInfo),
      );
      const emitFile = vi.fn();

      await hook(plugin.generateBundle).call({ emitFile });

      expect(emitFile).toHaveBeenCalledTimes(1);
      expect(emitFile).toHaveBeenCalledWith({
        type: "asset",
        fileName: "capability-build-info.json",
        source: `${canonicalJson}\n`,
      });
      expect(source).not.toContain("/api/spotlight/capabilities");
      await expect(generated.openUploadStream()).rejects.toMatchObject({
        message: "Runtime capability Artifact upload is disabled.",
        code: "ARTIFACT_RUNTIME_UPLOAD_DISABLED",
      });
    },
  );
});

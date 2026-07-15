import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { FrontendToolDescriptorV1 } from "@inupedia/spotlight-protocol";
import { afterEach, describe, expect, it } from "vitest";

import { buildViteCapabilitiesV1 } from "../src/vite/capabilityBuild.js";

const temporaryProjects: string[] = [];

async function createProject(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "spotlight-capability-build-"));
  temporaryProjects.push(root);
  return root;
}

async function writeSkill(
  root: string,
  options: { compatWarning?: boolean; reverseFiles?: boolean } = {},
): Promise<void> {
  const directory = join(root, ".agents/skills/monitoring");
  await mkdir(join(directory, "references"), { recursive: true });
  const files: Array<[string, string]> = [
    [
      join(directory, "SKILL.md"),
      [
        "---",
        "name: monitoring",
        "description: Monitor video channels",
        ...(options.compatWarning ? ["legacy-field: accepted-in-compat"] : []),
        "---",
        "Open the requested video channel.",
        "",
      ].join("\n"),
    ],
    [join(directory, "references/channels.json"), '{"lobby":1}\n'],
  ];
  if (options.reverseFiles) files.reverse();
  for (const [path, contents] of files) await writeFile(path, contents, "utf8");
}

function videoOpen(
  overrides: Partial<FrontendToolDescriptorV1> = {},
): FrontendToolDescriptorV1 {
  return {
    name: "video.open",
    version: "1.0.0",
    description: "Open a video channel",
    inputSchema: {
      type: "object",
      properties: { channelId: { type: "string" } },
      required: ["channelId"],
    },
    sideEffect: "ui",
    replayPolicy: "never",
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryProjects
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("buildViteCapabilitiesV1", () => {
  it("composes serve state in compat mode and derives its development build ID", async () => {
    const root = await createProject();
    await writeSkill(root, { compatWarning: true });

    const result = await buildViteCapabilitiesV1({
      root,
      command: "serve",
      project: { projectId: "camera-console", tools: [videoOpen()] },
    });

    expect(result.buildInfo).toEqual({
      schemaVersion: "spotlight.capability-build-info/1",
      projectId: "camera-console",
      frontendBuildId: `dev:${result.buildInfo.artifactDigest}`,
      artifactVersion: "spotlight.capability-artifact/1",
      artifactDigest: expect.stringMatching(/^sha256:[a-f\d]{64}$/),
      manifestDigest: expect.stringMatching(/^sha256:[a-f\d]{64}$/),
      toolManifestDigest: expect.stringMatching(/^sha256:[a-f\d]{64}$/),
      byteLength: result.archive.byteLength,
    });
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: "SKILL_UNKNOWN_TOP_LEVEL_FIELD",
        severity: "warning",
      }),
    ]);
    expect(result.watchedFiles).toEqual([
      join(root, ".agents/skills/monitoring/SKILL.md"),
      join(root, ".agents/skills/monitoring/references/channels.json"),
    ]);
    expect(Object.isFrozen(result.buildInfo)).toBe(true);
    expect(Object.isFrozen(result.watchedFiles)).toBe(true);
    expect(Object.isFrozen(result.diagnostics)).toBe(true);
  });

  it("requires an explicit non-empty frontend build ID for production builds", async () => {
    const root = await createProject();

    for (const frontendBuildId of [undefined, "", "   "]) {
      await expect(
        buildViteCapabilitiesV1({
          root,
          command: "build",
          project: { projectId: "camera-console", tools: [] },
          options: { frontendBuildId },
        }),
      ).rejects.toMatchObject({ code: "ARTIFACT_INPUT_INVALID" });
    }

    const result = await buildViteCapabilitiesV1({
      root,
      command: "build",
      project: { projectId: "camera-console", tools: [] },
      options: { frontendBuildId: "release-42" },
    });
    expect(result.buildInfo.frontendBuildId).toBe("release-42");
    expect(result.watchedFiles).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });

  it("produces identical state for equivalent reordered Tools and Skill files", async () => {
    const firstRoot = await createProject();
    const secondRoot = await createProject();
    await writeSkill(firstRoot);
    await writeSkill(secondRoot, { reverseFiles: true });

    const cameraGet = {
      name: "camera.get",
      version: "1.0.0",
      description: "Get a camera",
      inputSchema: { type: "object" },
      sideEffect: "none",
      replayPolicy: "safe",
    } satisfies FrontendToolDescriptorV1;
    const reorderedVideoOpen = {
      replayPolicy: "never",
      sideEffect: "ui",
      inputSchema: {
        required: ["channelId"],
        properties: { channelId: { type: "string" } },
        type: "object",
      },
      description: "Open a video channel",
      version: "1.0.0",
      name: "video.open",
    } satisfies FrontendToolDescriptorV1;

    const first = await buildViteCapabilitiesV1({
      root: firstRoot,
      command: "build",
      project: {
        projectId: "camera-console",
        tools: [videoOpen(), cameraGet],
      },
      options: { frontendBuildId: "release-42" },
    });
    const second = await buildViteCapabilitiesV1({
      root: secondRoot,
      command: "build",
      project: {
        tools: [cameraGet, reorderedVideoOpen],
        projectId: "camera-console",
      },
      options: { frontendBuildId: "release-42" },
    });

    expect(second.buildInfo).toEqual(first.buildInfo);
    expect(second.archive).toEqual(first.archive);
    expect(second.diagnostics).toEqual(first.diagnostics);
  });

  it("rejects strict Skill diagnostics before loading an artifact", async () => {
    const root = await createProject();
    await writeSkill(root, { compatWarning: true });

    await expect(
      buildViteCapabilitiesV1({
        root,
        command: "build",
        project: { projectId: "camera-console", tools: [] },
        options: { frontendBuildId: "release-42" },
      }),
    ).rejects.toMatchObject({
      code: "SKILL_UNKNOWN_TOP_LEVEL_FIELD",
      severity: "error",
    });
  });

  it.each([
    ["empty project", {}],
    [
      "unknown project field",
      { projectId: "camera-console", tools: [], handlers: [] },
    ],
    ["empty project ID", { projectId: "   ", tools: [] }],
  ])("rejects an invalid project shape: %s", async (_label, project) => {
    const root = await createProject();
    await expect(
      buildViteCapabilitiesV1({
        root,
        command: "serve",
        project: project as never,
      }),
    ).rejects.toMatchObject({ code: "ARTIFACT_INPUT_INVALID" });
  });

  it("rejects a proxied project without executing its traps", async () => {
    const root = await createProject();
    let trapCalls = 0;
    const project = new Proxy(
      { projectId: "camera-console", tools: [] },
      {
        get() {
          trapCalls += 1;
          return undefined;
        },
        ownKeys() {
          trapCalls += 1;
          return [];
        },
      },
    );

    await expect(
      buildViteCapabilitiesV1({ root, command: "serve", project }),
    ).rejects.toMatchObject({ code: "ARTIFACT_INPUT_INVALID" });
    expect(trapCalls).toBe(0);
  });

  it.each(["accessor", "non-enumerable"])(
    "rejects a project with a %s own field without reading it",
    async (kind) => {
      const root = await createProject();
      let getterCalls = 0;
      const project = { tools: [] } as Record<string, unknown>;
      Object.defineProperty(project, "projectId", {
        configurable: true,
        enumerable: kind === "accessor",
        ...(kind === "accessor"
          ? {
              get() {
                getterCalls += 1;
                return "camera-console";
              },
            }
          : { value: "camera-console" }),
      });

      await expect(
        buildViteCapabilitiesV1({
          root,
          command: "serve",
          project: project as never,
        }),
      ).rejects.toMatchObject({ code: "ARTIFACT_INPUT_INVALID" });
      expect(getterCalls).toBe(0);
    },
  );

  it("preserves CAP-0103 Tool validation codes", async () => {
    const root = await createProject();
    await expect(
      buildViteCapabilitiesV1({
        root,
        command: "serve",
        project: {
          projectId: "camera-console",
          tools: [videoOpen(), videoOpen()],
        },
      }),
    ).rejects.toMatchObject({ code: "ARTIFACT_TOOL_DUPLICATE" });

    await expect(
      buildViteCapabilitiesV1({
        root,
        command: "serve",
        project: {
          projectId: "camera-console",
          tools: [{ ...videoOpen(), description: "" }],
        },
      }),
    ).rejects.toMatchObject({ code: "ARTIFACT_TOOL_INVALID" });
  });

  it("rejects Proxy, accessor, and function-valued Tool descriptors without executing them", async () => {
    const root = await createProject();
    let trapCalls = 0;
    const proxiedTool = new Proxy(videoOpen(), {
      get() {
        trapCalls += 1;
        return undefined;
      },
      ownKeys() {
        trapCalls += 1;
        return [];
      },
    });
    await expect(
      buildViteCapabilitiesV1({
        root,
        command: "serve",
        project: { projectId: "camera-console", tools: [proxiedTool] },
      }),
    ).rejects.toMatchObject({ code: "ARTIFACT_JSON_UNSUPPORTED_VALUE" });
    expect(trapCalls).toBe(0);

    let getterCalls = 0;
    const accessorTool = videoOpen() as FrontendToolDescriptorV1 & {
      invoke?: unknown;
    };
    Object.defineProperty(accessorTool, "invoke", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return undefined;
      },
    });
    await expect(
      buildViteCapabilitiesV1({
        root,
        command: "serve",
        project: { projectId: "camera-console", tools: [accessorTool] },
      }),
    ).rejects.toMatchObject({ code: "ARTIFACT_JSON_UNSUPPORTED_VALUE" });
    expect(getterCalls).toBe(0);

    let handlerCalls = 0;
    const functionTool = {
      ...videoOpen(),
      invoke() {
        handlerCalls += 1;
      },
    } as unknown as FrontendToolDescriptorV1;
    await expect(
      buildViteCapabilitiesV1({
        root,
        command: "serve",
        project: { projectId: "camera-console", tools: [functionTool] },
      }),
    ).rejects.toMatchObject({ code: "ARTIFACT_JSON_UNSUPPORTED_VALUE" });
    expect(handlerCalls).toBe(0);
  });
});

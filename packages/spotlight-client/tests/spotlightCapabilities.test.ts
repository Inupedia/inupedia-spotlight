import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Plugin, ResolvedConfig, ViteDevServer } from "vite";
import { afterEach, describe, expect, it, vi } from "vitest";

import { canonicalizeJson } from "../src/node/capabilities/canonicalJson.js";
import * as capabilityBuildModule from "../src/vite/capabilityBuild.js";
import { buildViteCapabilitiesV1 } from "../src/vite/capabilityBuild.js";
import { createCapabilityDevMiddlewareV1 } from "../src/vite/capabilityDevMiddleware.js";
import {
  buildCapabilityVirtualModuleV1,
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
  openUploadStream: () => Promise<{
    digest: string;
    byteLength: number;
    contentType: string;
    stream: ReadableStream<Uint8Array>;
  }>;
}> {
  const encoded = Buffer.from(source, "utf8").toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
}

class ResponseDouble extends EventEmitter {
  statusCode = 200;
  readonly headers = new Map<string, string>();
  readonly chunks: Buffer[] = [];
  ended = false;

  setHeader(name: string, value: string | number) {
    this.headers.set(name.toLowerCase(), String(value));
    return this;
  }

  end(chunk?: Uint8Array | string) {
    if (chunk !== undefined) this.chunks.push(Buffer.from(chunk));
    this.ended = true;
    this.emit("finish");
    return this;
  }

  body(): Buffer {
    return Buffer.concat(this.chunks);
  }
}

async function invokeMiddleware(input: {
  result: Awaited<ReturnType<typeof buildViteCapabilitiesV1>>;
  method: string;
  url: string;
}) {
  const response = new ResponseDouble();
  const next = vi.fn();
  const middleware = createCapabilityDevMiddlewareV1(() => input.result);
  middleware(
    { method: input.method, url: input.url } as never,
    response as never,
    next,
  );
  return { response, next };
}

async function invokeMountedMiddleware(
  middleware: (request: never, response: never, next: () => void) => void,
  method: string,
  url: string,
) {
  const response = new ResponseDouble();
  const next = vi.fn();
  middleware(
    { method, url } as never,
    response as never,
    next,
  );
  return { response, next };
}

async function createServeHarness(
  options: { devRuntimeUpload?: boolean; skillRoots?: readonly string[] } = {},
) {
  const fixture = await createProject();
  const plugin = spotlightCapabilities(
    { projectId: "camera-console", tools: [] },
    options,
  );
  const mounted: Array<
    (request: never, response: never, next: () => void) => void
  > = [];
  const addWatchFile = vi.fn();
  const moduleNode = {};
  const invalidateModule = vi.fn();
  const loggerError = vi.fn();
  const watcherAdd = vi.fn();
  const watcher = new EventEmitter() as EventEmitter & {
    add: typeof watcherAdd;
  };
  watcher.add = watcherAdd;
  const httpServer = new EventEmitter();
  const server = {
    middlewares: {
      use(
        middleware: (
          request: never,
          response: never,
          next: () => void,
        ) => void,
      ) {
        mounted.push(middleware);
      },
    },
    moduleGraph: {
      getModuleById: vi.fn(() => moduleNode),
      invalidateModule,
    },
    watcher,
    httpServer,
    config: { logger: { error: loggerError } },
  } as unknown as ViteDevServer;

  hook(plugin.configResolved).call(undefined, {
    root: fixture.root,
    command: "serve",
  } as ResolvedConfig);
  if (plugin.configureServer) {
    hook(plugin.configureServer).call(undefined, server);
  }
  await hook(plugin.buildStart).call({ addWatchFile });

  async function source() {
    const loaded = await hook(plugin.load).call(
      undefined,
      RESOLVED_SPOTLIGHT_CAPABILITIES_MODULE_ID,
    );
    if (typeof loaded !== "string") throw new Error("Expected source");
    return loaded;
  }

  async function update(event: "add" | "change" | "unlink", file: string) {
    const listeners = watcher.listeners(event);
    await Promise.all(listeners.map((listener) => listener(file)));
  }

  return {
    fixture,
    plugin,
    server,
    mounted,
    addWatchFile,
    invalidateModule,
    loggerError,
    watcherAdd,
    watcher,
    httpServer,
    source,
    update,
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await Promise.all(
    temporaryProjects
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("spotlightCapabilities", () => {
  it("streams only the exact digest with byte-identical GET and bodyless HEAD", async () => {
    const fixture = await createProject();
    const result = await buildViteCapabilitiesV1({
      root: fixture.root,
      command: "serve",
      project: { projectId: "camera-console", tools: [] },
    });
    const path = `/@spotlight/capability-artifacts/${result.buildInfo.artifactDigest}`;
    const expectedHeaders = new Map([
      ["content-type", "application/gzip"],
      ["content-length", String(result.archive.byteLength)],
      ["cache-control", "no-store"],
      ["x-content-type-options", "nosniff"],
    ]);

    const get = await invokeMiddleware({ result, method: "GET", url: path });
    expect(get.next).not.toHaveBeenCalled();
    expect(get.response.statusCode).toBe(200);
    expect(get.response.headers).toEqual(expectedHeaders);
    expect(get.response.body()).toEqual(Buffer.from(result.archive));

    const head = await invokeMiddleware({ result, method: "HEAD", url: path });
    expect(head.next).not.toHaveBeenCalled();
    expect(head.response.statusCode).toBe(200);
    expect(head.response.headers).toEqual(expectedHeaders);
    expect(head.response.body()).toHaveLength(0);
  });

  it("delegates unrelated paths and rejects malformed, stale, and unsupported requests without digest disclosure", async () => {
    const fixture = await createProject();
    const result = await buildViteCapabilitiesV1({
      root: fixture.root,
      command: "serve",
      project: { projectId: "camera-console", tools: [] },
    });
    const prefix = "/@spotlight/capability-artifacts/";
    const stale = `sha256:${"0".repeat(64)}`;

    const unrelated = await invokeMiddleware({
      result,
      method: "GET",
      url: "/assets/application.js",
    });
    expect(unrelated.next).toHaveBeenCalledOnce();
    expect(unrelated.response.ended).toBe(false);

    for (const url of [
      `${prefix}not-a-digest`,
      `${prefix}sha256:${"A".repeat(64)}`,
      `${prefix}${stale}`,
      `${prefix}${result.buildInfo.artifactDigest}?leak=true`,
    ]) {
      const rejected = await invokeMiddleware({ result, method: "GET", url });
      expect(rejected.response.statusCode).toBe(404);
      expect(rejected.response.body().toString("utf8")).not.toContain(
        result.buildInfo.artifactDigest,
      );
      expect(rejected.response.body()).toHaveLength(0);
    }

    const method = await invokeMiddleware({
      result,
      method: "POST",
      url: `${prefix}${result.buildInfo.artifactDigest}`,
    });
    expect(method.response.statusCode).toBe(405);
    expect(method.response.headers.get("allow")).toBe("GET, HEAD");
    expect(method.response.body()).toHaveLength(0);
    const staleMethod = await invokeMiddleware({
      result,
      method: "DELETE",
      url: `${prefix}${stale}`,
    });
    expect(staleMethod.response.statusCode).toBe(405);
    expect(staleMethod.response.headers.get("allow")).toBe("GET, HEAD");
  });

  it("generates a serve provider that returns the live response stream without buffering", async () => {
    const fixture = await createProject();
    const result = await buildViteCapabilitiesV1({
      root: fixture.root,
      command: "serve",
      project: { projectId: "camera-console", tools: [] },
    });
    const source = buildCapabilityVirtualModuleV1(result.buildInfo, {
      runtimeUpload: true,
    }).source;
    const generated = await importGeneratedSource(source);
    const stream = new ReadableStream<Uint8Array>();
    const response = new Response(stream);
    const arrayBuffer = vi.spyOn(response, "arrayBuffer");
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);

    await expect(generated.openUploadStream()).resolves.toEqual({
      digest: result.buildInfo.artifactDigest,
      byteLength: result.buildInfo.byteLength,
      contentType: "application/gzip",
      stream: response.body,
    });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(
      `/@spotlight/capability-artifacts/${result.buildInfo.artifactDigest}`,
      {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
      },
    );
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(source).not.toContain(Buffer.from(result.archive).toString("base64"));
    expect(source).not.toContain(Buffer.from(result.archive).toString("hex"));
    expect(source).not.toContain(fixture.skillBody);
    expect(source).not.toContain(fixture.root);
    expect(source).not.toContain("node:");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("indexedDB");
  });

  it("rejects non-ok and missing-body serve responses without calling arrayBuffer", async () => {
    const fixture = await createProject();
    const result = await buildViteCapabilitiesV1({
      root: fixture.root,
      command: "serve",
      project: { projectId: "camera-console", tools: [] },
    });
    const generated = await importGeneratedSource(
      buildCapabilityVirtualModuleV1(result.buildInfo, {
        runtimeUpload: true,
      }).source,
    );
    const failedResponse = new Response(null, { status: 500 });
    const failedArrayBuffer = vi.spyOn(failedResponse, "arrayBuffer");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(failedResponse),
    );
    await expect(generated.openUploadStream()).rejects.toThrow(
      "Unable to open capability Artifact stream.",
    );
    expect(failedArrayBuffer).not.toHaveBeenCalled();

    const missingBodyResponse = new Response(null);
    const missingBodyArrayBuffer = vi.spyOn(missingBodyResponse, "arrayBuffer");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(missingBodyResponse),
    );
    await expect(generated.openUploadStream()).rejects.toThrow(
      "Capability Artifact response has no stream body.",
    );
    expect(missingBodyArrayBuffer).not.toHaveBeenCalled();
  });

  it("mounts a live serve provider only when development runtime upload is enabled", async () => {
    const enabled = await createServeHarness();
    expect(enabled.mounted).toHaveLength(1);
    const enabledModule = await importGeneratedSource(await enabled.source());
    expect(await enabled.source()).toContain(
      `/@spotlight/capability-artifacts/${enabledModule.capabilityBuildInfo.artifactDigest}`,
    );

    const disabled = await createServeHarness({ devRuntimeUpload: false });
    expect(disabled.mounted).toHaveLength(0);
    const disabledModule = await importGeneratedSource(await disabled.source());
    await expect(disabledModule.openUploadStream()).rejects.toMatchObject({
      code: "ARTIFACT_RUNTIME_UPLOAD_DISABLED",
    });
  });

  it("removes every capability watcher listener when the development server closes", async () => {
    const harness = await createServeHarness();

    expect(harness.plugin.handleHotUpdate).toBeUndefined();
    expect(harness.watcher.listenerCount("add")).toBe(1);
    expect(harness.watcher.listenerCount("change")).toBe(1);
    expect(harness.watcher.listenerCount("unlink")).toBe(1);

    harness.httpServer.emit("close");

    expect(harness.watcher.listenerCount("add")).toBe(0);
    expect(harness.watcher.listenerCount("change")).toBe(0);
    expect(harness.watcher.listenerCount("unlink")).toBe(0);
  });

  it("rebuilds relevant add/change/unlink paths, replaces the exact route, and invalidates the virtual module", async () => {
    const harness = await createServeHarness();
    const middleware = harness.mounted[0]!;
    const initial = await importGeneratedSource(await harness.source());
    const initialDigest = initial.capabilityBuildInfo.artifactDigest as string;

    await writeFile(
      harness.fixture.skillFile,
      "---\nname: monitoring\ndescription: Changed monitor\n---\nchanged\n",
      "utf8",
    );
    await harness.update("change", harness.fixture.skillFile);
    const changed = await importGeneratedSource(await harness.source());
    const changedDigest = changed.capabilityBuildInfo.artifactDigest as string;
    expect(changedDigest).not.toBe(initialDigest);
    expect(harness.invalidateModule).toHaveBeenCalledOnce();

    const oldRoute = await invokeMountedMiddleware(
      middleware,
      "GET",
      `/@spotlight/capability-artifacts/${initialDigest}`,
    );
    expect(oldRoute.response.statusCode).toBe(404);
    const newRoute = await invokeMountedMiddleware(
      middleware,
      "GET",
      `/@spotlight/capability-artifacts/${changedDigest}`,
    );
    expect(newRoute.response.statusCode).toBe(200);

    await writeFile(
      harness.fixture.skillFile,
      "---\nname: monitoring\ndescription: Changed monitor\n---\nchanged\n",
      "utf8",
    );
    await harness.update("change", harness.fixture.skillFile);
    const equivalent = await importGeneratedSource(await harness.source());
    expect(equivalent.capabilityBuildInfo.artifactDigest).toBe(changedDigest);

    const addedSkillDirectory = join(
      harness.fixture.root,
      ".agents/skills/camera",
    );
    const addedFile = join(addedSkillDirectory, "SKILL.md");
    await mkdir(addedSkillDirectory, { recursive: true });
    await writeFile(
      addedFile,
      "---\nname: camera\ndescription: Open a camera\n---\ncamera\n",
      "utf8",
    );
    await harness.update("add", addedFile);
    const added = await importGeneratedSource(await harness.source());
    expect(added.capabilityBuildInfo.artifactDigest).not.toBe(changedDigest);
    expect(harness.watcherAdd).toHaveBeenCalledWith(
      expect.arrayContaining([addedFile]),
    );

    await unlink(addedFile);
    await harness.update("unlink", addedFile);
    const unlinked = await importGeneratedSource(await harness.source());
    expect(unlinked.capabilityBuildInfo.artifactDigest).toBe(changedDigest);

    const invalidationCount = harness.invalidateModule.mock.calls.length;
    const evilFile = join(
      harness.fixture.root,
      ".agents/skills-evil/ignored.txt",
    );
    await mkdir(join(harness.fixture.root, ".agents/skills-evil"), {
      recursive: true,
    });
    await writeFile(evilFile, "ignored", "utf8");
    await harness.update("add", evilFile);
    expect(harness.invalidateModule).toHaveBeenCalledTimes(invalidationCount);
  });

  it("keeps the last successful immutable state and logs a sanitized diagnostic after rebuild failure", async () => {
    const harness = await createServeHarness();
    const middleware = harness.mounted[0]!;
    const initialSource = await harness.source();
    const initial = await importGeneratedSource(initialSource);
    const digest = initial.capabilityBuildInfo.artifactDigest as string;

    await writeFile(harness.fixture.skillFile, "---\nname: broken\n", "utf8");
    await expect(
      harness.update("change", harness.fixture.skillFile),
    ).resolves.not.toThrow();

    expect(await harness.source()).toBe(initialSource);
    expect(harness.invalidateModule).not.toHaveBeenCalled();
    expect(harness.loggerError).toHaveBeenCalledOnce();
    const published = JSON.stringify(harness.loggerError.mock.calls);
    expect(published).toContain("CAPABILITY_DEV_REBUILD_FAILED");
    expect(published).not.toContain(harness.fixture.root);
    expect(published).not.toContain(harness.fixture.skillBody);
    expect(published).not.toContain(digest);
    const stillCurrent = await invokeMountedMiddleware(
      middleware,
      "GET",
      `/@spotlight/capability-artifacts/${digest}`,
    );
    expect(stillCurrent.response.statusCode).toBe(200);
  });

  it("tracks configured relative Skill roots with a strict path-segment boundary", async () => {
    const harness = await createServeHarness({ skillRoots: ["custom-skills"] });
    const before = await importGeneratedSource(await harness.source());
    const customDirectory = join(
      harness.fixture.root,
      "custom-skills/camera",
    );
    const customSkill = join(customDirectory, "SKILL.md");
    await mkdir(customDirectory, { recursive: true });
    await writeFile(
      customSkill,
      "---\nname: camera\ndescription: Open a camera\n---\ncamera\n",
      "utf8",
    );
    await harness.update("add", customSkill);
    const after = await importGeneratedSource(await harness.source());
    expect(after.capabilityBuildInfo.artifactDigest).not.toBe(
      before.capabilityBuildInfo.artifactDigest,
    );

    const invalidations = harness.invalidateModule.mock.calls.length;
    const evilDirectory = join(harness.fixture.root, "custom-skills-evil");
    const evilFile = join(evilDirectory, "SKILL.md");
    await mkdir(evilDirectory, { recursive: true });
    await writeFile(evilFile, "ignored", "utf8");
    await harness.update("add", evilFile);
    expect(harness.invalidateModule).toHaveBeenCalledTimes(invalidations);
  });

  it("serializes overlapping rebuilds so a later result wins atomically", async () => {
    const harness = await createServeHarness();
    const originalBuild = capabilityBuildModule.buildViteCapabilitiesV1;
    await writeFile(
      harness.fixture.skillFile,
      "---\nname: monitoring\ndescription: Older\n---\nolder\n",
      "utf8",
    );
    const older = await originalBuild({
      root: harness.fixture.root,
      command: "serve",
      project: { projectId: "camera-console", tools: [] },
    });
    await writeFile(
      harness.fixture.skillFile,
      "---\nname: monitoring\ndescription: Newer\n---\nnewer\n",
      "utf8",
    );
    const newer = await originalBuild({
      root: harness.fixture.root,
      command: "serve",
      project: { projectId: "camera-console", tools: [] },
    });

    let resolveOlder!: (value: typeof older) => void;
    let resolveNewer!: (value: typeof newer) => void;
    const olderPromise = new Promise<typeof older>((resolve) => {
      resolveOlder = resolve;
    });
    const newerPromise = new Promise<typeof newer>((resolve) => {
      resolveNewer = resolve;
    });
    const buildSpy = vi
      .spyOn(capabilityBuildModule, "buildViteCapabilitiesV1")
      .mockImplementationOnce(() => olderPromise)
      .mockImplementationOnce(() => newerPromise);

    const first = harness.update("change", harness.fixture.skillFile);
    const second = harness.update("change", harness.fixture.skillFile);
    await vi.waitFor(() => expect(buildSpy).toHaveBeenCalledTimes(1));
    resolveOlder(older);
    await vi.waitFor(() => expect(buildSpy).toHaveBeenCalledTimes(2));
    resolveNewer(newer);
    await Promise.all([first, second]);

    const finalModule = await importGeneratedSource(await harness.source());
    expect(finalModule.capabilityBuildInfo.artifactDigest).toBe(
      newer.buildInfo.artifactDigest,
    );
  });
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

      expect(emitFile).toHaveBeenCalledTimes(2);
      expect(emitFile).toHaveBeenCalledWith({
        type: "asset",
        fileName: "capability-build-info.json",
        source: `${canonicalJson}\n`,
      });
      expect(emitFile).toHaveBeenCalledWith({
        type: "asset",
        fileName: `capability-artifacts/${generated.capabilityBuildInfo.artifactDigest}.tar.gz`,
        source: expect.any(Uint8Array),
      });
      expect(source).not.toContain("/api/spotlight/capabilities");
      await expect(generated.openUploadStream()).rejects.toMatchObject({
        message: "Runtime capability Artifact upload is disabled.",
        code: "ARTIFACT_RUNTIME_UPLOAD_DISABLED",
      });
    },
  );
});

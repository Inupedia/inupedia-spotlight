import { isAbsolute, relative, resolve, sep } from "node:path";

import type { Plugin, ResolvedConfig, ViteDevServer } from "vite";

import { DEFAULT_SKILL_ROOTS } from "../node/index.js";

import { createCapabilityDevMiddlewareV1 } from "./capabilityDevMiddleware.js";
import {
  buildViteCapabilitiesV1,
  type CapabilityPluginBuildResultV1,
  type SpotlightCapabilitiesOptionsV1,
  type SpotlightCapabilityProjectBuildV1,
} from "./capabilityBuild.js";
import {
  buildCapabilityVirtualModuleV1,
  RESOLVED_SPOTLIGHT_CAPABILITIES_MODULE_ID,
  SPOTLIGHT_CAPABILITIES_MODULE_ID,
  type CapabilityVirtualModuleV1,
} from "./capabilityVirtualModule.js";

interface CapabilityPluginStateV1 {
  result: Readonly<CapabilityPluginBuildResultV1>;
  virtualModule: Readonly<CapabilityVirtualModuleV1>;
}

const SPOTLIGHT_CAPABILITIES_RUNTIME_MODULE_PATH =
  "/@spotlight/capabilities-runtime";

function isAtOrBelow(candidate: string, directory: string): boolean {
  const relativePath = relative(directory, candidate);
  return (
    relativePath === "" ||
    (!relativePath.startsWith(`..${sep}`) &&
      relativePath !== ".." &&
      !isAbsolute(relativePath))
  );
}

export function spotlightCapabilities(
  project: SpotlightCapabilityProjectBuildV1,
  options?: SpotlightCapabilitiesOptionsV1,
): Plugin {
  let root: string | undefined;
  let command: ResolvedConfig["command"] | undefined;
  let base = "/";
  let state: Readonly<CapabilityPluginStateV1> | undefined;
  let server: ViteDevServer | undefined;
  let rebuildChain: Promise<void> = Promise.resolve();
  let relevantRoots: readonly string[] = [];
  let removeServerListeners: (() => void) | undefined;
  let finishInitialization!: () => void;
  const initialization = new Promise<void>((resolveInitialization) => {
    finishInitialization = resolveInitialization;
  });

  const currentState = (): Readonly<CapabilityPluginStateV1> => {
    if (state === undefined) {
      throw new Error("Spotlight capabilities were not built.");
    }
    return state;
  };

  const createState = (
    result: CapabilityPluginBuildResultV1,
  ): Readonly<CapabilityPluginStateV1> =>
    Object.freeze({
      result: Object.freeze(result),
      virtualModule: buildCapabilityVirtualModuleV1(result.buildInfo, {
        runtimeUpload:
          command === "serve" && options?.devRuntimeUpload !== false,
      }),
    });

  const isRelevantFile = (file: string): boolean => {
    const absoluteFile = resolve(file);
    const current = state;
    return (
      current?.result.watchedFiles.some(
        (watchedFile) => resolve(watchedFile) === absoluteFile,
      ) === true ||
      relevantRoots.some((skillRoot) => isAtOrBelow(absoluteFile, skillRoot))
    );
  };

  const enqueueRebuild = (file: string): Promise<void> => {
    if (command !== "serve" || root === undefined || !isRelevantFile(file)) {
      return Promise.resolve();
    }
    const projectRoot = root;
    const task = rebuildChain.then(async () => {
      await initialization;
      if (state === undefined) return;
      try {
        const result = await buildViteCapabilitiesV1({
          root: projectRoot,
          command: "serve",
          project,
          options,
        });
        const nextState = createState(result);
        server?.watcher.add([...result.watchedFiles]);
        const moduleNode = server?.moduleGraph.getModuleById(
          RESOLVED_SPOTLIGHT_CAPABILITIES_MODULE_ID,
        );
        const previousState = state;
        state = nextState;
        try {
          if (moduleNode !== undefined) {
            server?.moduleGraph.invalidateModule(moduleNode);
          }
          server?.ws?.send("spotlight:capability-build", {
            buildInfo: nextState.result.buildInfo,
          });
        } catch (error) {
          state = previousState;
          throw error;
        }
      } catch {
        try {
          server?.config.logger.error(
            "[CAPABILITY_DEV_REBUILD_FAILED] Capability development rebuild failed.",
          );
        } catch {
          // A development logger failure must not poison later rebuilds.
        }
      }
    });
    rebuildChain = task.catch(() => undefined);
    return task;
  };

  return {
    name: "spotlight-capabilities",
    configResolved(config) {
      root = config.root;
      command = config.command;
      base = config.base || "/";
      const roots = options?.skillRoots ?? project.skillRoots ?? DEFAULT_SKILL_ROOTS;
      relevantRoots = Object.freeze(
        roots.map((entry) => {
          const path = typeof entry === "string" ? entry : entry.path;
          return resolve(config.root, path);
        }),
      );
    },
    async buildStart() {
      if (root === undefined || command === undefined) {
        throw new Error("Spotlight capabilities require resolved Vite config.");
      }
      try {
        const result = await buildViteCapabilitiesV1({
          root,
          command,
          project,
          options,
        });
        state = createState(result);
        for (const file of result.watchedFiles) this.addWatchFile(file);
      } finally {
        finishInitialization();
      }
    },
    configureServer(viteServer) {
      removeServerListeners?.();
      server = viteServer;
      viteServer.watcher.add([...relevantRoots]);
      const add = (file: string) => enqueueRebuild(file);
      const change = (file: string) => enqueueRebuild(file);
      const unlink = (file: string) => enqueueRebuild(file);
      viteServer.watcher.on("add", add);
      viteServer.watcher.on("change", change);
      viteServer.watcher.on("unlink", unlink);
      const cleanup = () => {
        viteServer.watcher.off("add", add);
        viteServer.watcher.off("change", change);
        viteServer.watcher.off("unlink", unlink);
        viteServer.httpServer?.off("close", cleanup);
        if (removeServerListeners === cleanup) {
          removeServerListeners = undefined;
        }
      };
      removeServerListeners = cleanup;
      viteServer.httpServer?.once("close", cleanup);
      if (options?.devRuntimeUpload === false) return;
      viteServer.middlewares.use(
        createCapabilityDevMiddlewareV1(() => currentState().result, base),
      );
    },
    resolveId(id) {
      return id === SPOTLIGHT_CAPABILITIES_MODULE_ID ||
        id === SPOTLIGHT_CAPABILITIES_RUNTIME_MODULE_PATH
        ? RESOLVED_SPOTLIGHT_CAPABILITIES_MODULE_ID
        : null;
    },
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        const runtimeScript = `<script type="module" src="${SPOTLIGHT_CAPABILITIES_RUNTIME_MODULE_PATH}"></script>`;
        const head = /<head(?:\s[^>]*)?>/i;
        return head.test(html)
          ? html.replace(
              head,
              (openingHead) => `${openingHead}\n  ${runtimeScript}`,
            )
          : `${runtimeScript}\n${html}`;
      },
    },
    load(id) {
      if (id !== RESOLVED_SPOTLIGHT_CAPABILITIES_MODULE_ID) return null;
      return currentState().virtualModule.source;
    },
    closeBundle() {
      removeServerListeners?.();
    },
    generateBundle() {
      if (command !== "build") return;
      const current = currentState();
      this.emitFile({
        type: "asset",
        fileName: "capability-build-info.json",
        source: `${current.virtualModule.canonicalBuildInfoJson}\n`,
      });
      this.emitFile({
        type: "asset",
        fileName: `capability-artifacts/${current.result.buildInfo.artifactDigest}.tar.gz`,
        source: current.result.archive,
      });
    },
  };
}

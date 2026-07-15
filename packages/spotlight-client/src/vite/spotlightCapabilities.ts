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
  let state: Readonly<CapabilityPluginStateV1> | undefined;
  let server: ViteDevServer | undefined;
  let rebuildChain: Promise<void> = Promise.resolve();
  let relevantRoots: readonly string[] = [];

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

  return {
    name: "spotlight-capabilities",
    configResolved(config) {
      root = config.root;
      command = config.command;
      const roots = options?.skillRoots ?? DEFAULT_SKILL_ROOTS;
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
      const result = await buildViteCapabilitiesV1({
        root,
        command,
        project,
        options,
      });
      state = createState(result);
      for (const file of result.watchedFiles) this.addWatchFile(file);
    },
    configureServer(viteServer) {
      server = viteServer;
      viteServer.watcher.add([...relevantRoots]);
      if (options?.devRuntimeUpload === false) return;
      viteServer.middlewares.use(
        createCapabilityDevMiddlewareV1(() => currentState().result),
      );
    },
    resolveId(id) {
      return id === SPOTLIGHT_CAPABILITIES_MODULE_ID
        ? RESOLVED_SPOTLIGHT_CAPABILITIES_MODULE_ID
        : null;
    },
    load(id) {
      if (id !== RESOLVED_SPOTLIGHT_CAPABILITIES_MODULE_ID) return null;
      return currentState().virtualModule.source;
    },
    handleHotUpdate(context) {
      if (
        command !== "serve" ||
        root === undefined ||
        !isRelevantFile(context.file)
      ) {
        return;
      }
      const projectRoot = root;
      rebuildChain = rebuildChain.then(async () => {
        try {
          const result = await buildViteCapabilitiesV1({
            root: projectRoot,
            command: "serve",
            project,
            options,
          });
          const nextState = createState(result);
          server?.watcher.add([...result.watchedFiles]);
          state = nextState;
          const moduleNode = server?.moduleGraph.getModuleById(
            RESOLVED_SPOTLIGHT_CAPABILITIES_MODULE_ID,
          );
          if (moduleNode !== undefined) {
            server?.moduleGraph.invalidateModule(moduleNode);
          }
        } catch {
          server?.config.logger.error(
            "[CAPABILITY_DEV_REBUILD_FAILED] Capability development rebuild failed.",
          );
        }
      });
      return rebuildChain.then(() => []);
    },
    generateBundle() {
      if (command !== "build") return;
      const current = currentState();
      this.emitFile({
        type: "asset",
        fileName: "capability-build-info.json",
        source: `${current.virtualModule.canonicalBuildInfoJson}\n`,
      });
    },
  };
}

import type { Plugin, ResolvedConfig } from "vite";

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

export function spotlightCapabilities(
  project: SpotlightCapabilityProjectBuildV1,
  options?: SpotlightCapabilitiesOptionsV1,
): Plugin {
  let root: string | undefined;
  let command: ResolvedConfig["command"] | undefined;
  let buildResult: Readonly<CapabilityPluginBuildResultV1> | undefined;
  let virtualModule: Readonly<CapabilityVirtualModuleV1> | undefined;

  return {
    name: "spotlight-capabilities",
    configResolved(config) {
      root = config.root;
      command = config.command;
    },
    async buildStart() {
      if (root === undefined || command === undefined) {
        throw new Error("Spotlight capabilities require resolved Vite config.");
      }
      buildResult = Object.freeze(
        await buildViteCapabilitiesV1({ root, command, project, options }),
      );
      virtualModule = buildCapabilityVirtualModuleV1(buildResult.buildInfo);
      for (const file of buildResult.watchedFiles) this.addWatchFile(file);
    },
    resolveId(id) {
      return id === SPOTLIGHT_CAPABILITIES_MODULE_ID
        ? RESOLVED_SPOTLIGHT_CAPABILITIES_MODULE_ID
        : null;
    },
    load(id) {
      if (id !== RESOLVED_SPOTLIGHT_CAPABILITIES_MODULE_ID) return null;
      if (virtualModule === undefined || buildResult === undefined) {
        throw new Error("Spotlight capabilities were not built.");
      }
      return virtualModule.source;
    },
    generateBundle() {
      if (command !== "build") return;
      if (virtualModule === undefined || buildResult === undefined) {
        throw new Error("Spotlight capabilities were not built.");
      }
      this.emitFile({
        type: "asset",
        fileName: "capability-build-info.json",
        source: `${virtualModule.canonicalBuildInfoJson}\n`,
      });
    },
  };
}

import type { App, InjectionKey } from "vue";
import {
  createClientToolRegistry,
  createSpotlightHttp,
  type ClientTool,
  type SpotlightHttp,
} from "@inupedia/spotlight-client";
import {
  defineSpotlightConfig,
  SPOTLIGHT_CONFIG_KEY,
  type SpotlightConfig,
  type SpotlightVuePluginOptions,
} from "./config.js";
import { mountSpotlightShell, unmountSpotlightShellForTests } from "./mountShell.js";
import type { SpotlightAvatarConfig } from "./avatar/config.js";

export const SPOTLIGHT_HTTP_KEY: InjectionKey<SpotlightHttp> =
  Symbol("spotlight-http");
export type SpotlightClientToolRegistry = ReturnType<typeof createClientToolRegistry>;
export const SPOTLIGHT_CLIENT_TOOLS_KEY: InjectionKey<SpotlightClientToolRegistry> =
  Symbol("spotlight-client-tools");

let installedConfig: SpotlightConfig | null = null;
let installedHttp: SpotlightHttp | null = null;
let installedClientTools: SpotlightClientToolRegistry | null = null;

export function getSpotlightConfig(): SpotlightConfig {
  if (!installedConfig) {
    throw new Error(
      "Spotlight is not installed. Call app.use(SpotlightVue, { config }) in main.ts",
    );
  }
  return installedConfig;
}

export function getSpotlightHttp(): SpotlightHttp {
  if (!installedHttp) {
    const config = getSpotlightConfig();
    installedHttp = createSpotlightHttp(config);
  }
  return installedHttp;
}

export function getSpotlightClientTools(): SpotlightClientToolRegistry {
  if (!installedClientTools) {
    const config = getSpotlightConfig();
    const tools = typeof config.tools === "function" ? config.tools() : config.tools;
    installedClientTools = createClientToolRegistry(tools as ClientTool[]);
  }
  return installedClientTools;
}

/** Reset singletons (tests / HMR). */
export function resetSpotlightRuntimeForTests(): void {
  unmountSpotlightShellForTests();
  installedConfig = null;
  installedHttp = null;
  installedClientTools = null;
}

export const SpotlightVue = {
  install(appValue: unknown, options: SpotlightVuePluginOptions): void {
    const app = appValue as App;
    const config = defineSpotlightConfig(options.config);
    const resolvedTools =
      typeof config.tools === "function" ? config.tools() : config.tools;
    if (!Array.isArray(resolvedTools) || resolvedTools.length === 0) {
      throw new Error(
        "Spotlight config: at least one client tool is required after tools() resolves",
      );
    }
    installedConfig = config;
    installedHttp = createSpotlightHttp(config);
    installedClientTools = createClientToolRegistry(resolvedTools);

    app.provide(SPOTLIGHT_CONFIG_KEY, config);
    app.provide(SPOTLIGHT_HTTP_KEY, installedHttp);
    app.provide(SPOTLIGHT_CLIENT_TOOLS_KEY, installedClientTools);

    app.config.globalProperties.$spotlightEnabled = options.enabled !== false;
    app.config.globalProperties.$spotlightAvatarEnabled =
      options.avatarEnabled === true;

    mountSpotlightShell(app, options);
  },
};

export {
  defineSpotlightConfig,
  SPOTLIGHT_CONFIG_KEY,
  type SpotlightConfig,
  type SpotlightVuePluginOptions,
  type SpotlightAvatarConfig,
};

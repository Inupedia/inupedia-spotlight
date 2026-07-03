import type { App, InjectionKey } from "vue";
import {
  createSpotlightHostAdapter,
  createSpotlightHttp,
  type SpotlightHostAdapter,
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
export const SPOTLIGHT_HOST_ADAPTER_KEY: InjectionKey<SpotlightHostAdapter> =
  Symbol("spotlight-host-adapter");

let installedConfig: SpotlightConfig | null = null;
let installedHttp: SpotlightHttp | null = null;
let installedAdapter: SpotlightHostAdapter | null = null;

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

export function getSpotlightHostAdapter(): SpotlightHostAdapter {
  if (!installedAdapter) {
    const config = getSpotlightConfig();
    installedAdapter = createSpotlightHostAdapter({ tools: config.tools });
  }
  return installedAdapter;
}

/** Reset singletons (tests / HMR). */
export function resetSpotlightRuntimeForTests(): void {
  unmountSpotlightShellForTests();
  installedConfig = null;
  installedHttp = null;
  installedAdapter = null;
}

export const SpotlightVue = {
  install(app: App, options: SpotlightVuePluginOptions): void {
    const config = defineSpotlightConfig(options.config);
    const resolvedTools =
      typeof config.tools === "function" ? config.tools() : config.tools;
    if (!Array.isArray(resolvedTools) || resolvedTools.length === 0) {
      throw new Error(
        "Spotlight config: at least one host tool is required after tools() resolves",
      );
    }
    installedConfig = config;
    installedHttp = createSpotlightHttp(config);
    installedAdapter = createSpotlightHostAdapter({ tools: config.tools });

    app.provide(SPOTLIGHT_CONFIG_KEY, config);
    app.provide(SPOTLIGHT_HTTP_KEY, installedHttp);
    app.provide(SPOTLIGHT_HOST_ADAPTER_KEY, installedAdapter);

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

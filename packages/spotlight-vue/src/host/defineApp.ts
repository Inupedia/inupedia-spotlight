import { defineSpotlightConfig, type SpotlightConfig } from "../config.js";
import { defineSpotlightHost, type DefineSpotlightHostOptions } from "./defineHost.js";

export type SpotlightEnvDefaults = {
  serverUrl?: string;
  projectId?: string;
};

/** Read standard Vite env vars for Spotlight server connection. */
export function readSpotlightEnv(
  env: Record<string, string | undefined>,
  defaults: SpotlightEnvDefaults = {},
): Pick<DefineSpotlightAppOptions, "serverUrl" | "projectId" | "apiKey"> {
  return {
    serverUrl: String(
      env.VITE_SPOTLIGHT_SERVER_URL ?? defaults.serverUrl ?? "/spotlight-api",
    ),
    apiKey: String(env.VITE_SPOTLIGHT_API_KEY ?? "").trim() || undefined,
    projectId: String(
      env.VITE_SPOTLIGHT_PROJECT_ID ?? defaults.projectId ?? "",
    ).trim(),
  };
}

export type DefineSpotlightAppOptions = DefineSpotlightHostOptions & {
  serverUrl: string;
  projectId: string;
  apiKey?: string;
};

/** Single entry: server config + host registration in one call. */
export function defineSpotlightApp(
  options: DefineSpotlightAppOptions,
): SpotlightConfig {
  const { serverUrl, projectId, apiKey, ...hostOptions } = options;
  return defineSpotlightConfig({
    serverUrl,
    projectId,
    apiKey,
    host: defineSpotlightHost(hostOptions),
  });
}

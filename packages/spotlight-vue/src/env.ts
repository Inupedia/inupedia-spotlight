export type SpotlightEnvDefaults = {
  serverUrl?: string;
  projectId?: string;
};

/** Read standard Vite env vars for Spotlight server connection. */
export function readSpotlightEnv(
  env: Record<string, string | undefined>,
  defaults: SpotlightEnvDefaults = {},
) {
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

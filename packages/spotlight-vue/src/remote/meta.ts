import type { SpotlightCommandCatalogVideoChannel } from "@inupedia/spotlight-protocol";
import { getSpotlightConfig } from "../plugin.js";
import { appendSpotlightProjectQuery } from "./httpConfig.js";
import { getSpotlightJson } from "./serverJson.js";

export type SpotlightUiPrompts = {
  capabilityHelpPatterns: string[];
  capabilityHelpFooter?: string;
  suggestionChips: Record<string, string[]>;
};

export type SpotlightVideoChannelMeta = SpotlightCommandCatalogVideoChannel;

let uiPromptsCache: SpotlightUiPrompts | null = null;
let metaInflight: Promise<void> | null = null;

const DEFAULT_UI_PROMPTS: SpotlightUiPrompts = {
  capabilityHelpPatterns: [],
  suggestionChips: {
    default: ["你能做什么"],
  },
};

function asUiPrompts(raw: unknown): SpotlightUiPrompts {
  const parsed = raw as SpotlightUiPrompts;
  if (
    parsed &&
    Array.isArray(parsed.capabilityHelpPatterns) &&
    parsed.suggestionChips &&
    typeof parsed.suggestionChips === "object"
  ) {
    return parsed;
  }
  return getSpotlightConfig().uiPromptsFallback ?? DEFAULT_UI_PROMPTS;
}

function asVideoChannels(raw: unknown): SpotlightVideoChannelMeta[] {
  if (!Array.isArray(raw)) {
    return getSpotlightConfig().videoChannels ?? [];
  }
  return raw.filter(
    (item): item is SpotlightVideoChannelMeta =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as SpotlightVideoChannelMeta).id === "string" &&
      typeof (item as SpotlightVideoChannelMeta).label === "string" &&
      Array.isArray((item as SpotlightVideoChannelMeta).aliases),
  );
}

/** Fetch ui-prompts and video-channels; falls back to config when server is unavailable. */
export async function ensureSpotlightMeta(signal?: AbortSignal): Promise<void> {
  if (uiPromptsCache) return;
  if (metaInflight) {
    await metaInflight;
    return;
  }
  metaInflight = (async () => {
    const config = getSpotlightConfig();
    try {
      const [uiPayload, videoPayload] = await Promise.all([
        getSpotlightJson<{ prompts: unknown }>(
          appendSpotlightProjectQuery("/v1/meta/ui-prompts"),
          signal,
        ),
        getSpotlightJson<{ channels: unknown }>(
          appendSpotlightProjectQuery("/v1/meta/video-channels"),
          signal,
        ),
      ]);
      uiPromptsCache = asUiPrompts(uiPayload.prompts);
      config.onVideoChannelsLoaded?.(asVideoChannels(videoPayload.channels));
    } catch {
      uiPromptsCache = config.uiPromptsFallback ?? DEFAULT_UI_PROMPTS;
      if (config.videoChannels?.length) {
        config.onVideoChannelsLoaded?.(config.videoChannels);
      }
    } finally {
      metaInflight = null;
    }
  })();
  await metaInflight;
}

export function getSpotlightUiPrompts(): SpotlightUiPrompts {
  return (
    uiPromptsCache ??
    getSpotlightConfig().uiPromptsFallback ??
    DEFAULT_UI_PROMPTS
  );
}

export function resetSpotlightMetaCacheForTests(): void {
  uiPromptsCache = null;
  metaInflight = null;
}

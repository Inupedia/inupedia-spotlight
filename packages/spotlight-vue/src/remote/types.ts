import type { SpotlightCommand } from "../store/types.js";

export type SpotlightPipelineRunOutcome = {
  command: SpotlightCommand | null;
  usedLegacyFallback: boolean;
  memoryReplay?: {
    source: "exact" | "semantic" | "session";
    entryId: string;
    kind: string;
  } | null;
};

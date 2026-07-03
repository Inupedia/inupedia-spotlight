import type { SpotlightCommand } from "../store/types.js";

export type SpotlightPipelineRunOutcome = {
  command: SpotlightCommand | null;
  usedLegacyFallback: boolean;
};

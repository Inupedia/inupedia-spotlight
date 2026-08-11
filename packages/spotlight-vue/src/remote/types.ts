import type { SpotlightMemoryDecision } from "@inupedia/spotlight-protocol";
import type { SpotlightCommand } from "../store/types.js";

export type SpotlightPipelineRunOutcome = {
  command: SpotlightCommand | null;
  assistantReply?: string | null;
  memoryReplay?: {
    source: "exact" | "semantic" | "session";
    entryId: string;
    kind: string;
  } | null;
  memoryDecision?: SpotlightMemoryDecision | null;
};

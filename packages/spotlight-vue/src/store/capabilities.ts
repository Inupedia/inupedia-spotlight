import { getSpotlightUiPrompts } from "../remote/meta.js";

function pickSuggestionChips(params: {
  sceneLevel: number | null | undefined;
  smallTab?: string | null;
  activeTarget?: string | null;
}): string[] {
  const chips = getSpotlightUiPrompts().suggestionChips;
  if (
    params.activeTarget &&
    chips[`activeTarget:${params.activeTarget}`]?.length
  ) {
    return [...chips[`activeTarget:${params.activeTarget}`]!];
  }
  if (params.smallTab && chips[`smallTab:${params.smallTab}`]?.length) {
    return [...chips[`smallTab:${params.smallTab}`]!];
  }
  if (params.sceneLevel != null && chips[`sceneLevel:${params.sceneLevel}`]?.length) {
    return [...chips[`sceneLevel:${params.sceneLevel}`]!];
  }
  return chips.default?.length ? [...chips.default] : ["你能做什么"];
}

/** UI suggestion chips from spotlight-server `/v1/meta/ui-prompts`. */
export function getSuggestedQuestions(params: {
  sceneLevel: number | null | undefined;
  smallTab?: string | null;
  activeTarget?: string | null;
}): string[] {
  return pickSuggestionChips(params);
}

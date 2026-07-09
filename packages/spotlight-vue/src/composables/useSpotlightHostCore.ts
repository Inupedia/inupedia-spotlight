import { getCurrentScope, onScopeDispose } from "vue";
import {
  createSpotlightHostCore,
  type SpotlightFrontendAction,
  type SpotlightHostCore,
  type SpotlightReadableContext,
} from "@inupedia/spotlight-client";

const defaultCore = createSpotlightHostCore();

export type UseSpotlightHostCoreOptions = {
  core?: SpotlightHostCore;
};

function registerScoped(unregister: () => void): void {
  if (getCurrentScope()) {
    onScopeDispose(unregister);
  }
}

export function useSpotlightReadable(
  readable: SpotlightReadableContext,
  options: UseSpotlightHostCoreOptions = {},
): void {
  const unregister = (options.core ?? defaultCore).registerReadable(readable);
  registerScoped(unregister);
}

export function useSpotlightAction<
  TInput extends Record<string, unknown> = Record<string, unknown>,
>(
  action: SpotlightFrontendAction<TInput>,
  options: UseSpotlightHostCoreOptions = {},
): void {
  const unregister = (options.core ?? defaultCore).registerAction(
    action as SpotlightFrontendAction,
  );
  registerScoped(unregister);
}

export function getDefaultSpotlightHostCore(): SpotlightHostCore {
  return defaultCore;
}

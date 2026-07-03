/**
 * Wrap a consumer action with shared context preparation (route, tab, scene, etc.).
 */
export function createContextualAction<TArgs extends unknown[]>(options: {
  prepare: () => Promise<void>;
  act: (...args: TArgs) => Promise<void> | void;
}): (...args: TArgs) => Promise<void> {
  return async (...args: TArgs) => {
    await options.prepare();
    await options.act(...args);
  };
}

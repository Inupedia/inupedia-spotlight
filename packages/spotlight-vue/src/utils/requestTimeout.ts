export function withRequestTimeout(
  timeoutMs: number,
  parentSignal?: AbortSignal,
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  const onAbort = () => controller.abort();
  parentSignal?.addEventListener("abort", onAbort, { once: true });

  const cleanup = () => {
    window.clearTimeout(timer);
    parentSignal?.removeEventListener("abort", onAbort);
  };

  return { signal: controller.signal, cleanup };
}

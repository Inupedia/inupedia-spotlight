export function logMemoryEvent(
  event: string,
  data: Record<string, unknown>,
): void {
  console.info(
    JSON.stringify({
      event,
      ...data,
      at: Date.now(),
    }),
  );
}

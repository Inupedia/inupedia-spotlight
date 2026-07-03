export function devWarn(message: string, ...args: unknown[]): void {
  if (import.meta.env?.DEV) {
    console.warn(message, ...args);
  }
}

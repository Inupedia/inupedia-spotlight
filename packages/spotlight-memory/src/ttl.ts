/** Hard upper bound for any memory entry TTL (24 hours). */
export const MEMORY_TTL_MAX_SEC = 86_400;

export function clampMemoryTtlSec(ttlSec: number): number {
  if (!Number.isFinite(ttlSec)) return 0;
  return Math.max(0, Math.min(Math.floor(ttlSec), MEMORY_TTL_MAX_SEC));
}

import type { SpotlightMemoryEntry } from "@inupedia/spotlight-protocol";

export type MemoryEntryScope = "project" | "session";

export type ScopedMemoryEntry = SpotlightMemoryEntry & {
  scope?: MemoryEntryScope;
  sessionId?: string;
};

export function resolveMemoryEntryScopeFields(entry: SpotlightMemoryEntry): {
  scope: MemoryEntryScope;
  sessionId: string;
  kind: string;
  createdAt: number;
  expiresAt: number;
} {
  const scoped = entry as ScopedMemoryEntry;
  const scope: MemoryEntryScope =
    scoped.scope === "session" ? "session" : "project";
  const sessionId =
    scope === "session" ? (scoped.sessionId?.trim() ?? "") : "";
  const createdAt = entry.createdAt;
  const ttlSec = entry.ttlSec > 0 ? entry.ttlSec : 86_400;
  return {
    scope,
    sessionId,
    kind: entry.kind,
    createdAt,
    expiresAt: createdAt + ttlSec * 1000,
  };
}

export function entryMatchesLookupScopes(
  entry: SpotlightMemoryEntry,
  scopes: Array<{ scope: MemoryEntryScope; sessionId?: string }>,
): boolean {
  const { scope, sessionId } = resolveMemoryEntryScopeFields(entry);
  return scopes.some((candidate) => {
    if (candidate.scope !== scope) return false;
    if (scope === "session") {
      return Boolean(candidate.sessionId?.trim()) && sessionId === candidate.sessionId?.trim();
    }
    return true;
  });
}

export function isMemoryEntryExpired(
  entry: SpotlightMemoryEntry,
  now = Date.now(),
): boolean {
  return resolveMemoryEntryScopeFields(entry).expiresAt <= now;
}

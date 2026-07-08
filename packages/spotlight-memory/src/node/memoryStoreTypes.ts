import type { MemoryEntryScope } from "./memoryEntryScope.js";

export interface SemanticLookupOptions {
  scopes?: Array<{ scope: MemoryEntryScope; sessionId?: string }>;
  now?: number;
}

export type SemanticWriteResult =
  | { written: true }
  | { written: false; skippedReason: string };

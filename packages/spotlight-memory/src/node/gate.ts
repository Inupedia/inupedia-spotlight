import {
  SPOTLIGHT_MEMORY_DEFAULT_TTL_SEC,
  type SpotlightMemoryGateResult,
  type SpotlightMemoryEntry,
  type SpotlightMemoryLookupInput,
  type SpotlightMemoryWriteInput,
  type SpotlightMemoryWriteResult,
} from "@inupedia/spotlight-protocol";
import { classifyMemoryKind, isMemoryKindAllowedForRead } from "../classify.js";
import { normalizeQuestion } from "../normalize.js";
import { isMemoryEntryStale } from "../stale.js";
import { buildCacheKey, createMemoryEntryId } from "./cacheKey.js";
import type { MemoryEntryScope } from "./memoryEntryScope.js";

export interface MemoryStoreReader {
  getExact(cacheKey: string): Promise<import("@inupedia/spotlight-protocol").SpotlightMemoryEntry | null>;
  findSemantic(
    projectId: string,
    questionNorm: string,
    limit?: number,
    lookupScopes?: Array<{ scope: MemoryEntryScope; sessionId?: string }>,
  ): Promise<
    Array<{
      entry: import("@inupedia/spotlight-protocol").SpotlightMemoryEntry;
      score: number;
    }>
  >;
  touch(entryId: string): Promise<void>;
}

export interface MemoryStoreWriter {
  putExact(
    cacheKey: string,
    entry: import("@inupedia/spotlight-protocol").SpotlightMemoryEntry,
  ): Promise<void>;
  putSemantic(
    entry: import("@inupedia/spotlight-protocol").SpotlightMemoryEntry,
  ): Promise<void>;
  hasExact(cacheKey: string): Promise<boolean>;
}

export interface MemoryGateConfig {
  enabled?: boolean;
  semanticThreshold?: number;
  writeMinConfidence?: number;
  semanticEnabled?: boolean;
}

export interface MemoryGate {
  lookup(input: SpotlightMemoryLookupInput): Promise<SpotlightMemoryGateResult>;
  write(input: SpotlightMemoryWriteInput): Promise<SpotlightMemoryWriteResult>;
}

type MemoryScope = MemoryEntryScope;
type ScopedMemoryEntry = SpotlightMemoryEntry & {
  scope?: MemoryScope;
  sessionId?: string;
};
type ScopedLookupInput = SpotlightMemoryLookupInput & {
  scope?: MemoryScope;
  sessionId?: string;
};
type ScopedWriteInput = SpotlightMemoryWriteInput & {
  scope?: MemoryScope;
  sessionId?: string;
};

function resolveWriteScope(input: {
  scope?: MemoryScope;
  sessionId?: string;
}): { scope: MemoryScope; sessionId?: string } {
  if (input.scope === "project") return { scope: "project" };
  if (input.scope === "session" || input.sessionId?.trim()) {
    const sessionId = input.sessionId?.trim();
    return sessionId ? { scope: "session", sessionId } : { scope: "project" };
  }
  return { scope: "project" };
}

function resolveLookupScopes(input: ScopedLookupInput): Array<{
  scope: MemoryScope;
  sessionId?: string;
}> {
  const sessionId = input.sessionId?.trim();
  if (input.scope === "project" || !sessionId) return [{ scope: "project" }];
  return [{ scope: "session", sessionId }, { scope: "project" }];
}

function pickViableSemanticHit<T extends { entry: SpotlightMemoryEntry; score: number }>(
  candidates: T[],
  params: {
    threshold: number;
    invalidation: SpotlightMemoryLookupInput["invalidation"];
  },
): T | null {
  const viable = candidates
    .filter((candidate) => candidate.score >= params.threshold)
    .filter(
      (candidate) => !isMemoryEntryStale(candidate.entry, params.invalidation),
    )
    .filter((candidate) => isMemoryKindAllowedForRead(candidate.entry.kind));
  return viable[0] ?? null;
}

export function createMemoryGate(
  reader: MemoryStoreReader,
  writer: MemoryStoreWriter,
  config: MemoryGateConfig = {},
): MemoryGate {
  const enabled = config.enabled ?? true;
  const semanticThreshold = config.semanticThreshold ?? 0.92;
  const writeMinConfidence = config.writeMinConfidence ?? 0.85;
  const semanticEnabled = config.semanticEnabled ?? true;

  return {
    async lookup(input): Promise<SpotlightMemoryGateResult> {
      const started = performance.now();
      const finishMiss = (
        reason: import("@inupedia/spotlight-protocol").SpotlightMemoryMiss["reason"],
      ): SpotlightMemoryGateResult => ({
        hit: false,
        miss: { reason, lookupLatencyMs: performance.now() - started },
      });

      if (!enabled) return finishMiss("disabled");

      const questionNorm = normalizeQuestion(input.question);
      if (!questionNorm) return finishMiss("not_found");

      const lookupScopes = resolveLookupScopes(input as ScopedLookupInput);
      for (const scope of lookupScopes) {
        const cacheKey = buildCacheKey({
          projectId: input.projectId,
          ...scope,
          questionNorm,
          invalidation: input.invalidation,
        });

        const exact = await reader.getExact(cacheKey);
        if (exact) {
          if (isMemoryEntryStale(exact, input.invalidation)) {
            continue;
          }
          if (!isMemoryKindAllowedForRead(exact.kind)) {
            return finishMiss("kind_blocked");
          }
          await reader.touch(exact.id);
          return {
            hit: true,
            result: {
              source: scope.scope === "session" ? "session" : "exact",
              entry: exact,
              confidence: 1,
              lookupLatencyMs: performance.now() - started,
            },
          };
        }
      }

      if (!input.exactOnly && semanticEnabled) {
        let bestScore = 0;
        let sawStaleAboveThreshold = false;
        for (const scope of lookupScopes) {
          const semantic = await reader.findSemantic(
            input.projectId,
            questionNorm,
            20,
            [scope],
          );
          const top = pickViableSemanticHit(semantic, {
            threshold: semanticThreshold,
            invalidation: input.invalidation,
          });
          if (top) {
            await reader.touch(top.entry.id);
            return {
              hit: true,
              result: {
                source: "semantic",
                entry: top.entry,
                confidence: top.score,
                lookupLatencyMs: performance.now() - started,
              },
            };
          }
          for (const candidate of semantic) {
            if (candidate.score > bestScore) bestScore = candidate.score;
            if (
              candidate.score >= semanticThreshold &&
              isMemoryEntryStale(candidate.entry, input.invalidation)
            ) {
              sawStaleAboveThreshold = true;
            }
          }
        }
        if (sawStaleAboveThreshold) {
          return finishMiss("stale");
        }
        if (bestScore > 0 && bestScore < semanticThreshold) {
          return finishMiss("below_threshold");
        }
      }

      return finishMiss("not_found");
    },

    async write(input): Promise<SpotlightMemoryWriteResult> {
      if (!enabled) return { written: false, skippedReason: "below_confidence" };
      if (input.confidence < writeMinConfidence) {
        return { written: false, skippedReason: "below_confidence" };
      }

      const classified = classifyMemoryKind({
        question: input.question,
        hasToolPlan: Boolean(input.plan?.toolCalls?.length || input.plan?.command),
        hasTextAnswer: Boolean(input.answer?.trim()),
        usedDataTools: input.kind === "data_snapshot",
      });

      const kind = input.kind ?? classified.kind;
      if (!kind) {
        return { written: false, skippedReason: "kind_blocked" };
      }

      const questionNorm = normalizeQuestion(input.question);
      const scopedInput = input as ScopedWriteInput;
      const scope = resolveWriteScope(scopedInput);
      const cacheKey = buildCacheKey({
        projectId: input.projectId,
        ...scope,
        questionNorm,
        invalidation: input.invalidation,
      });

      if (await writer.hasExact(cacheKey)) {
        return { written: false, skippedReason: "duplicate" };
      }

      const entry: ScopedMemoryEntry = {
        id: createMemoryEntryId(),
        projectId: input.projectId,
        scope: scope.scope,
        sessionId: scope.sessionId,
        questionNorm,
        questionRaw: input.question,
        kind,
        answer: input.answer,
        plan: input.plan,
        invalidation: input.invalidation,
        ttlSec: input.ttlSec ?? SPOTLIGHT_MEMORY_DEFAULT_TTL_SEC[kind],
        createdAt: Date.now(),
        hitCount: 0,
        confidence: input.confidence,
        sourceRunId: input.sourceRunId,
      };

      await writer.putExact(cacheKey, entry);
      await writer.putSemantic(entry);
      return { written: true, entryId: entry.id };
    },
  };
}

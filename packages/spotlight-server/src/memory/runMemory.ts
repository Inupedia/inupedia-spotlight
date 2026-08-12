import type {
  CreateRunRequest,
  SpotlightMemoryDecision,
  SpotlightMemoryGateResult,
  SpotlightMemoryLookupInput,
  SpotlightMemoryReplayMeta,
  SpotlightMemoryWriteInput,
} from "@inupedia/spotlight-protocol";
import type { MemoryGate } from "@inupedia/spotlight-memory/node";
import { isMemoryReadEnabled } from "../safety.js";

export function buildInvalidationContext(request: CreateRunRequest) {
  return {
    catalogVersion: request.clientToolManifest?.manifestDigest ?? null,
    assetsVersion:
      request.frontendBuildId ??
      request.clientToolManifest?.frontendBuildId ??
      null,
  };
}

export async function lookupProjectMemory(
  gate: MemoryGate,
  request: CreateRunRequest,
  projectId: string,
): Promise<SpotlightMemoryGateResult> {
  if (!isMemoryReadEnabled(request)) {
    return { hit: false, miss: { reason: "disabled", lookupLatencyMs: 0 } };
  }
  const input: SpotlightMemoryLookupInput = {
    projectId,
    question: request.userQuestion,
    invalidation: buildInvalidationContext(request),
    sessionId: request.sessionId,
  };
  return gate.lookup(input);
}

export function buildMemoryDecision(
  lookup: SpotlightMemoryGateResult,
  memoryRefreshRequested: boolean,
): SpotlightMemoryDecision {
  if (memoryRefreshRequested) {
    return {
      action: "refresh",
      reasonCode: "user_refresh",
      confidence: 1,
      memoryIds: [],
      canForceRefresh: false,
    };
  }
  if (
    lookup.hit &&
    lookup.result.entry.kind === "qa_answer" &&
    lookup.result.entry.answer?.trim()
  ) {
    return {
      action: "reuse",
      reasonCode:
        lookup.result.matchKind === "semantic" ? "semantic_hit" : "exact_hit",
      confidence: lookup.result.confidence,
      memoryIds: [lookup.result.entry.id],
      sourceLabel: lookup.result.source,
      verifiedAt: lookup.result.entry.verifiedAt,
      canForceRefresh: true,
    };
  }
  if (lookup.hit) {
    return {
      action: "augment",
      reasonCode: "partial_hit",
      confidence: lookup.result.confidence,
      memoryIds: [lookup.result.entry.id],
      canForceRefresh: true,
    };
  }
  return {
    action: "ignore",
    reasonCode: "no_hit",
    confidence: 0,
    memoryIds: [],
    canForceRefresh: false,
  };
}

export function replayMetaFromHit(
  lookup: SpotlightMemoryGateResult & { hit: true },
): SpotlightMemoryReplayMeta {
  return {
    source: lookup.result.source,
    matchKind: lookup.result.matchKind,
    scope: lookup.result.scope,
    entryId: lookup.result.entry.id,
    replayedAt: Date.now(),
    kind: lookup.result.entry.kind,
  };
}

export async function writeProjectMemory(
  gate: MemoryGate,
  params: {
    request: CreateRunRequest;
    projectId: string;
    runId: string;
    route: string;
    assistantReply: string;
    confidence: number;
    invokedTools: string[];
  },
): Promise<void> {
  if (!params.assistantReply.trim()) return;
  const isAction =
    params.route === "action" || params.invokedTools.length > 0;
  const kind = isAction ? "action_plan" : "qa_answer";
  const input: SpotlightMemoryWriteInput = {
    projectId: params.projectId,
    question: params.request.userQuestion,
    sessionId: params.request.sessionId,
    kind,
    answer: kind === "qa_answer" ? params.assistantReply : undefined,
    plan:
      kind === "action_plan"
        ? {
            kind: "direct_plan",
            toolCalls: params.invokedTools.map((name) => ({
              name,
              input: {},
            })),
          }
        : undefined,
    invalidation: buildInvalidationContext(params.request),
    confidence: params.confidence,
    sourceRunId: params.runId,
  };
  await gate.write(input);
}

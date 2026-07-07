/** Spotlight Memory — shared types (client ↔ server, persisted entries). */

export type SpotlightMemoryEntryKind =
  | "qa_answer"
  | "action_plan"
  | "routing_hint"
  | "data_snapshot";

export type SpotlightMemoryHitSource = "exact" | "semantic" | "session";

/** Version pins — entry invalid when context versions diverge. */
export interface SpotlightMemoryInvalidationContext {
  assetsVersion?: string | null;
  catalogVersion?: string | null;
  knowledgeIndexVersion?: string | null;
}

export interface SpotlightMemoryPlan {
  kind: "direct_plan" | "query_loop" | "command";
  toolCalls?: Array<{ name: string; input: Record<string, unknown> }>;
  command?: Record<string, unknown>;
  skillNames?: string[];
}

/** One persisted memory row (exact jsonl or semantic sqlite). */
export interface SpotlightMemoryEntry {
  id: string;
  projectId: string;
  questionNorm: string;
  questionRaw?: string;
  kind: SpotlightMemoryEntryKind;
  /** Text answer for qa_answer / data_snapshot. */
  answer?: string;
  plan?: SpotlightMemoryPlan;
  invalidation: SpotlightMemoryInvalidationContext;
  ttlSec: number;
  createdAt: number;
  lastHitAt?: number;
  hitCount: number;
  confidence: number;
  sourceRunId?: string;
}

export interface SpotlightMemoryLookupInput {
  projectId: string;
  question: string;
  invalidation: SpotlightMemoryInvalidationContext;
  sessionId?: string;
  /** Skip semantic layer (e.g. tests). */
  exactOnly?: boolean;
}

export interface SpotlightMemoryHit {
  source: SpotlightMemoryHitSource;
  entry: SpotlightMemoryEntry;
  confidence: number;
  lookupLatencyMs: number;
}

export interface SpotlightMemoryMiss {
  reason:
    | "disabled"
    | "not_found"
    | "stale"
    | "below_threshold"
    | "kind_blocked";
  lookupLatencyMs: number;
}

export type SpotlightMemoryGateResult =
  | { hit: true; result: SpotlightMemoryHit }
  | { hit: false; miss: SpotlightMemoryMiss };

export interface SpotlightMemoryWriteInput {
  projectId: string;
  question: string;
  kind: SpotlightMemoryEntryKind;
  answer?: string;
  plan?: SpotlightMemoryPlan;
  invalidation: SpotlightMemoryInvalidationContext;
  ttlSec?: number;
  confidence: number;
  sourceRunId?: string;
}

export interface SpotlightMemoryWriteResult {
  written: boolean;
  entryId?: string;
  skippedReason?: "below_confidence" | "kind_blocked" | "duplicate";
}

/** SSE / run meta — optional cache attribution. */
export interface SpotlightMemoryReplayMeta {
  source: SpotlightMemoryHitSource;
  entryId: string;
  replayedAt: number;
  kind: SpotlightMemoryEntryKind;
}

/** Default TTL seconds by kind. */
export const SPOTLIGHT_MEMORY_DEFAULT_TTL_SEC: Record<
  SpotlightMemoryEntryKind,
  number
> = {
  qa_answer: 86_400,
  action_plan: 86_400,
  routing_hint: 86_400,
  data_snapshot: 1_800,
};

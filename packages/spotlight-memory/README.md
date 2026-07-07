# @inupedia/spotlight-memory

Spotlight **Memory Gate** — exact + semantic cache for repeated user questions.

Part of the Inupedia Spotlight SDK. See `docs/SPOTLIGHT_MEMORY_ARCHITECTURE.md` in the host repo.

## Role

| Layer | Storage | Package API |
|-------|---------|-------------|
| L0 Exact | `packs/<id>/memory/exact/` | `ExactMemoryStore` |
| L1 Semantic | `packs/<id>/memory/semantic/` (Phase 3) | `findSemantic` (MVP: bigram scan) |
| Gate | — | `createMemoryGate` |

## Install

```bash
pnpm add @inupedia/spotlight-memory @inupedia/spotlight-protocol
```

## Usage (spotlight-server)

```typescript
import { createPackMemoryStores } from "@inupedia/spotlight-memory/node";

const { gate } = createPackMemoryStores({
  packsRoot: "/app/packs",
  projectId: "ydjm-construction-map",
  gateConfig: { semanticThreshold: 0.92 },
});

// Gate 0 — before deterministic gate
const result = await gate.lookup({
  projectId,
  question: request.userQuestion,
  invalidation: {
    assetsVersion: assetsMeta.version,
    catalogVersion: catalogHash,
  },
});

if (result.hit) {
  return replayMemoryHit(result.result, sink);
}

// After slow path succeeds:
await gate.write({
  projectId,
  question: request.userQuestion,
  kind: "qa_answer",
  answer: finalReply,
  invalidation: { assetsVersion, catalogVersion },
  confidence: 0.9,
  sourceRunId: run.id,
});
```

## Exports

| Entry | Runtime | Purpose |
|-------|---------|---------|
| `@inupedia/spotlight-memory` | isomorphic | normalize, classify, gate factory |
| `@inupedia/spotlight-memory/node` | Node | pack paths, exact jsonl store |

## Build

```bash
pnpm install
pnpm build
pnpm test
```

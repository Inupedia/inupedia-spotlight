# Stage 1 — Parallel capability extraction

Run separate extraction passes (parallel sub-agents when available, otherwise serial). Each pass reads `FRONTEND_OVERVIEW.md` and writes Candidate records under `.spotlight-integrate/candidates/`.

Do **not** create Client Tools yet. Discovery and exposure are separate decisions.

## Extractors (all required)

| File | Looks for |
|---|---|
| [extractors/navigation.md](../extractors/navigation.md) | route / scene / tab / mode navigation |
| [extractors/panels.md](../extractors/panels.md) | open/close dialog, drawer, overlay, filters |
| [extractors/catalogs.md](../extractors/catalogs.md) | named entities the user can speak |
| [extractors/reads.md](../extractors/reads.md) | read/list/status data already surfaced by the UI |
| [extractors/ui-actions.md](../extractors/ui-actions.md) | user actions backed by host functions/stores/services |
| [extractors/danger.md](../extractors/danger.md) | destructive, external, security-sensitive, or generic escape hatches |

The danger pass is mandatory: high-risk host behavior must be **classified**, not silently omitted.

## Candidate schema

```md
### CANDIDATE <slug>
- domain: <domain id from stage 0>
- kind: read | open | close | navigate | filter | toggle | create | update | add | remove | submit | external
- proposedToolName: <verb-first name>
- userPhrasings: ["<host-grounded phrasing>"]
- symbol: <file>#<exportOrAction>
  - file: src/services/items.ts
  - export: openItemByName
  - store: useItemStore().open
- inputs:
  - name: name, type: string, required: true, source: "catalog/user/uiContext"
- sideEffect: none | ui | external
- replayPolicy: safe | idempotency-key | never
- riskLevel: low | medium | high
- requiresConfirmation: true | false
- pairsWith: <tool/capability or none>
- evidence:
  - UI: <Component.vue> / <visible label>
  - catalog: <file> / <name field>
- notes:
```

Replace every placeholder with host evidence.

## Extraction rules

- `symbol` must identify the real behavior. If no callable/named code path can be located, record the UI job as unresolved/`REFACTOR` evidence instead of inventing a Tool.
- Include component-local handlers when they are real user jobs; stage 1.5 decides whether they need behavior-preserving extraction.
- `userPhrasings` come from visible UI copy, route titles, catalog `name/label/alias`, or nearby product semantics.
- Prefer one Tool per user intention, not one Tool per low-level setter.
- Catalog-backed actions accept a user-meaningful name/id, not arbitrary indexes unless the UI itself is index-only.
- Preserve quantities, enum values, ids, and validation boundaries that already exist in the host.
- Skip renderer/telemetry/worker/persistence internals that are not user jobs.
- Never propose `runStoreMethod`, `executeScript`, arbitrary URL fetch, or arbitrary CSS selector tools.

## Coverage bar

Every domain in `FRONTEND_OVERVIEW.md` must end with:

- one or more Candidates, or
- a written reason in `candidates/_coverage.md` explaining why it has no imperative/speakable capability.

Coverage is about **classification**, not maximizing Tool count.

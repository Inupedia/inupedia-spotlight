# Stage 1 — Parallel extractors

Spawn **separate** extraction passes (parallel sub-agents if the host supports them; otherwise serial). Each pass reads `FRONTEND_OVERVIEW.md` plus its prompt, and writes **one** file under `.spotlight-integrate/candidates/`.

Do not wrap tools yet. Only emit **Candidate** records.

## Extractors (all required)

| File | Looks for |
|---|---|
| [extractors/navigation.md](../extractors/navigation.md) | scene / route / tab / mode switches |
| [extractors/panels.md](../extractors/panels.md) | open/close dialog, drawer, overlay, filters |
| [extractors/catalogs.md](../extractors/catalogs.md) | named entity lists the user can speak |
| [extractors/reads.md](../extractors/reads.md) | fetch + summarize APIs the UI already shows |
| [extractors/ui-actions.md](../extractors/ui-actions.md) | click handlers that call named host functions |

Optional last pass: [extractors/danger.md](../extractors/danger.md) marks candidates that must not ship.

## Candidate schema (every record)

```md
### CANDIDATE <slug>
- domain: <domain id from stage 0>
- kind: read | open | close | navigate | filter | toggle
- proposedToolName: openItem
- userPhrasings: ["<list phrasing from UI copy>", "<open phrasing + exact catalog name>"]
- symbol: <file>#<exportOrAction>
  - file: src/services/items.ts
  - export: openItemByName
  - pinia: useItemStore().open   # if wrapping a store action
- inputs:
  - name: name, type: string, required: true, source: "catalog name or id"
- sideEffect: none | ui
- pairsWith: getItemList   # list/open twins when both exist
- evidence:
  - UI: <Component.vue> click "<visible label>"
  - catalog: <file> name field
- risk: low | medium | high
- notes:
```

`proposedToolName`, file paths, and phrasings above are **schema placeholders**. Replace them with this host’s symbols.

Rules for extractors:

- `symbol` must be copy-pasteable. If you cannot name file + export/action, it is not a candidate.
- `userPhrasings` must come from visible UI copy, route titles, catalog `name`/`label`/`alias`, or comments next to the handler. Inventing English-only names for a Chinese UI is wrong.
- Prefer **one tool per user intention**, not one tool per store setter. `setFoo(true)` + `setFoo(false)` often become `openFoo` / `closeFoo`, not `setFoo`.
- Catalog-backed open tools take `name` or `id` the user would say, not raw array indexes, unless the UI itself is index-only.
- Skip: persistence plugins, HTTP interceptors, shaders, worker internals, `console.log` helpers.

## Coverage bar

After all extractors, every domain in `FRONTEND_OVERVIEW.md` must have **either** ≥1 candidate **or** a written reason in `candidates/_coverage.md` (“domain X is display-only charts, no imperative API”).

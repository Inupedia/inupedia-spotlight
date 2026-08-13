# Stage 1.5 — Triple verification

Every candidate from `candidates/` must pass **all three**. Failures go to `rejected/<slug>.md` with the failing V and a quote from the code.

## V1 Callable

Pass only if you can open the file and point to the exact export/action the wrapper will call.

Fail if:

- “the page engine can probably do this” but no function exists
- wrapping would require new math, new HTTP APIs, or copying business logic out of a large component into the tool
- the only handle is a template `@click` inline with 30+ lines of logic — first extract that logic to a named function in the host app **only if the user allowed refactors**. Default: reject, list in `leftovers.md` as “needs extract function”

Thin wrappers around existing functions are the intended shape (`tools.ts` → `existingExport`).

## V2 Speakable

Pass only if a non-developer would say this to the command bar.

Must have ≥1 `userPhrasing` grounded in UI/catalog.

Fail if it is only useful to the renderer (`updateMatrix`, `tick`, `setNeedsRender`, `flush`).

## V3 Safe & non-generic

Fail (reject) if:

- delete / remove / destroy / pay / transfer / logout / resetAll / wipe
- writes server state with no confirmation UI in the original product
- duplicates another candidate (keep the one closer to user language)
- is a generic “run arbitrary store method” escape hatch

High-risk UI that the product already exposes (stop a live session, close a viewer) can pass at `risk: medium` if V1/V2 hold.

## Pairing rewrite

If a domain has a list/read candidate and an open candidate, mark `pairsWith` both ways. If it has open but no list, and a catalog module exists, **add** a read tool candidate that returns the catalog (names, ids, aliases) — this is still V1 if the catalog module already exports data.

## User light confirm

Print:

```
WRAP (N):
- openItem ← existing open + catalog names
- getItemList ← existing list/catalog export
REJECT (M):
- wipeCache — destructive
- updateRenderMatrix — not speakable
```

Wait for confirmation if the user is present. If they already said “integrate fully”, continue with WRAP and keep REJECT in `rejected/`.

Write `verified.md` as the WRAP list using the same Candidate schema.

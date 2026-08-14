# Stage 1.5 — Verify and classify

Every candidate from `candidates/` must be verified against the host source and assigned exactly one class from [architecture.md](../architecture.md): `DIRECT`, `REFACTOR`, `GATED`, or `REJECT`.

## V1 Real capability

Pass only if you can point to the exact existing code path that performs the user-visible behavior.

- exported Store/Service/Router/page-engine function -> eligible for `DIRECT`
- component-local named/inline handler with real business logic -> `REFACTOR`
- hypothetical API, invented math, guessed SDK method -> `REJECT`

A Client Tool must never become the new source of truth for host behavior.

## V2 Speakable

Pass only if a non-developer would reasonably ask for the capability in the Spotlight command UI.

Must have at least one `userPhrasing` grounded in UI copy/catalog. Renderer internals (`tick`, `flush`, `updateMatrix`, telemetry) -> `REJECT`.

## V3 Safety

Classify, do not hide risky behavior:

- read/list/status -> normally `DIRECT`
- reversible navigation/open/close -> normally `DIRECT`
- ordinary reversible mutation -> `DIRECT` only with accurate Tool safety metadata
- delete/remove-all/pay/transfer/submit-order/logout/reset/wipe or irreversible external commit -> `GATED`
- arbitrary method/URL/DOM/script executor -> `REJECT`

`GATED` is not a bug. It records a real host capability that the autonomous integration intentionally does not expose without explicit approval and an appropriate confirmation path.

## Refactor rule

A `REFACTOR` candidate may be promoted to `DIRECT` only when:

1. behavior already exists in the host;
2. extraction is behavior-preserving (move/rename, not redesign);
3. the extracted function has a narrow stable contract;
4. the user requested full integration/refactoring or explicitly approved it;
5. existing UI still calls the same extracted host function.

Do not move hundreds of lines into `tools.ts`. The Tool remains a thin adapter.

## Pairing / intent families

For each domain, record which families exist:

- read/list/status
- named open/view/play/navigation
- mutation/update
- close/exit
- knowledge-only
- ambiguous/referential inputs

If list and named-open both exist, pair them and require distinct gold rows. If a catalog already exports data, it can back a read Tool; do not manufacture a catalog API.

## Outputs

`verified.md` contains only capabilities approved for Tool wrapping (`DIRECT`, including promoted behavior-preserving refactors).

`leftovers.md` contains all non-wrapped real capabilities:

```md
| capability | class | source | reason | next action |
|---|---|---|---|---|
| ... | REFACTOR | ... | component-local | extract host function |
| ... | GATED | ... | destructive/external | explicit approval + confirmation design |
```

`rejected/<slug>.md` stores `REJECT` evidence.

## Proceed behavior

If the user already asked for full safe integration, continue with `DIRECT` capabilities and approved behavior-preserving refactors. Never auto-promote `GATED` capabilities.

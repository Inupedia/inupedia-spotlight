# Extractor: catalogs

Find **named entities** users will say: anything with a visible `name` / `label` the command bar should accept.

## Where to look

- `*List`, `*Info`, `*Catalog`, mock JSON, i18n option tables
- Objects with `id` + `name` / `label` + `aliases`
- Resolve helpers: `resolve*`, `find*ByName`, `get*Option`

## Emit two kinds of candidates per catalog (if both exist)

1. **read** `getXList` / `listX` — return names, ids, aliases, counts. Prefer an existing summarize helper.
2. **open** `openX` / `playX` — takes `name` or `id` that `resolve*` already accepts.

`userPhrasings` **must** include 2–3 real names copied from the catalog file in **this** repo.

## Pairing

Set `pairsWith` between list and open. Stage 1.5 will fail the domain if open exists without a list and a catalog module is present — you should emit the list candidate here.

## Skip

- Internal URLs, mesh ids, or storage keys the user would never speak
- Duplicate alias tables that are not user-facing

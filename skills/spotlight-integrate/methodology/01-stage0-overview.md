# Stage 0 — Frontend overview

Goal: a map of **what the running UI can do**, not a file tree dump.

## Read first

In parallel, gather:

1. `package.json` — Vue/Vite? existing `@inupedia/spotlight-*`?
2. Router (`src/router/**`, `createWebHistory` routes, route meta titles)
3. Pinia stores under `src/stores/**` — `defineStore` id, public actions, not private helpers
4. Top-level pages/shells (`App.vue`, layout, command palettes, tab bars)
5. Existing `src/spotlight/**` or any older agent tools folder if present
6. i18n / hard-coded button labels (these become `capability-examples`)
7. Data catalogs: list modules, mock JSON, `*List`, objects with `id` + `name`/`label`

Cap store/action listing: for huge stores, do **not** read the whole file. Search `actions:` / exported functions / `function handle` and sample the public API.

## Classify the product

Write `.spotlight-integrate/FRONTEND_OVERVIEW.md`:

```md
# Frontend overview
- app: <name from package.json>
- stack: Vue 3 / Vite / <Pinia?> / <Vue Router?> / <other page engines>
- projectId proposal: <kebab-case from app name>
- existing Spotlight: none | partial | complete

## User-facing domains
| Domain | User job | UI entry | Backing code |
| <spoken domain> | list / open / close / navigate | <menu, tab, button> | <file#export> |

## Navigation graph
<route or scene chain the user can walk>

## Catalogs (named entities the user will say)
- <domain>: <2–3 exact strings from this repo>  (source: <file>)

## Identity
- login store: <path or none>
- stable user id field: <or session-only>

## Out of scope (internal)
- token refresh, telemetry, renderer internals, workers
```

Fill every `<…>` from **this** repo. Do not import domain names from this skill’s examples.

## Domain heuristic

A **domain** is a set of UI moves a non-developer would name in one breath. If two features never appear in the same sentence, they are different domains.

## Confirm with the user

List domains in one short bullet list. Then stage 1 extractors run **per domain**, not over the whole monorepo blindly.

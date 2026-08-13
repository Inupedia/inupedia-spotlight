# Stage 0 — Compatibility + frontend overview

Goal: determine **whether the host can be wired safely** and map what the running UI can actually do. This is not a file-tree dump.

## A. Compatibility preflight

Read:

1. `package.json` — Vue/Vite/Pinia/Router/Node engines/packageManager; existing `@inupedia/spotlight-*`
2. lockfile — preserve the existing package manager
3. published Spotlight version + peer dependencies per [standard.md](../standard.md)

Write `.spotlight-integrate/COMPATIBILITY.md`:

```md
# Compatibility
- host: <app name>
- package manager: <pnpm/npm/yarn>
- vue: <version/range>
- vite: <version/range or none>
- pinia: <version/range or none>
- target spotlight: <published version or BLOCKED>
- spotlight peers: <vue/pinia/etc>
- status: READY | UPGRADE_REQUIRED | BUILD_MIGRATION_REQUIRED | UNSUPPORTED_AUTOMATION
- blockers: <exact mismatch or none>
- action: <continue / report only / migration requires approval>
```

Do not force dependency upgrades or create a second lockfile.

## B. Capability overview

In parallel, gather:

1. Router (`src/router/**`, routes, route meta titles)
2. Pinia/Vuex stores and exported composables — public actions/getters only
3. Services/API adapters — stable business methods
4. Top-level pages/shells (`App.vue`, layouts, tabs, menus)
5. Existing `src/spotlight/**` or older agent/tool folders
6. i18n/hard-coded button labels (future capability examples)
7. Data catalogs: JSON/list modules/objects with stable id + name/label
8. Component-local handlers that represent real user jobs but are not reusable exports

For huge stores/components, search public API/handlers first; do not ingest the entire monorepo blindly.

Write `.spotlight-integrate/FRONTEND_OVERVIEW.md`:

```md
# Frontend overview
- app: <name>
- stack: <Vue/Vite/Pinia/Router/...>
- projectId proposal: <kebab-case>
- existing Spotlight: none | partial | complete

## User-facing domains
| Domain | User job | UI entry | Backing code | Initial class |
| <domain> | list/open/add/etc | <menu/button/route> | <file#symbol> | DIRECT/REFACTOR/GATED/REJECT |

## Navigation graph
<route/scene flow>

## Catalogs
- <domain>: <2–3 exact repo strings> (source: <file>)

## Identity/context
- login/session store: <path or none>
- stable user id: <field or session-only>
- useful uiContext: <selected item, active route, etc>

## Out of scope internals
- token refresh, telemetry, render ticks, workers, arbitrary DOM selectors
```

Every named capability must have a code location or be marked unresolved. Do not invent a symbol because a UI label exists.

## Domain heuristic

A domain is a set of user jobs that share vocabulary, data/catalog, and business context. Prefer a few coherent domains over one Skill per button or one mega-Skill for the entire app.

## Proceed behavior

If status is `READY`, continue automatically when the user requested full integration. If not `READY`, capability analysis may continue, but stop before dependency/build-system migration unless explicitly requested.

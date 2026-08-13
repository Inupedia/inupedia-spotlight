# Stage 0 — Compatibility + frontend overview

Goal: determine **whether the host can be wired safely** and map what the running UI can actually do. This is not a file-tree dump.

## A. Compatibility preflight

Read:

1. `package.json` — framework/build tool/state/router/Node engines/packageManager; existing `@inupedia/spotlight-*`
2. lockfile — preserve the existing package manager
3. published Spotlight version + peer dependencies per [standard.md](../standard.md)

Write `.spotlight-integrate/COMPATIBILITY.md` with **Core Agentization** and **UI Adapter** reported separately:

```md
# Compatibility
- host: <app name>
- package manager: <pnpm/npm/yarn>
- framework: <Vue/React/other + version/range>
- build: <Vite/version or other>
- state/router: <Pinia/Redux/Router/etc or none>
- target spotlight: <published version or BLOCKED>
- core status: READY | UPGRADE_REQUIRED | BUILD_MIGRATION_REQUIRED | UNSUPPORTED_AUTOMATION
- ui adapter: VUE_READY | UPGRADE_REQUIRED | ADAPTER_REQUIRED | HEADLESS_ONLY
- spotlight peers: <relevant adapter peers>
- blockers: <exact mismatch or none>
- action: <continue core / continue full / report only / migration requires approval>
```

Interpretation:

- `core=READY` means the host can expose framework-neutral Client Tools and participate in the Spotlight Server/Skill/Tool runtime path.
- `uiAdapter=VUE_READY` means the shipped `@inupedia/spotlight-vue` shell can be embedded safely.
- `uiAdapter=ADAPTER_REQUIRED` means Core Agentization and headless Server benchmarking may continue, but the host does not yet have a supported visual shell adapter.
- A missing UI adapter is **not** equivalent to `UNSUPPORTED_AUTOMATION`.

Do not force dependency upgrades or create a second lockfile.

## B. Capability overview

In parallel, gather:

1. Router/navigation (`src/router/**`, route tables, framework routers, route meta titles)
2. State stores and exported composables/hooks — public actions/selectors only
3. Services/API adapters — stable business methods
4. Top-level pages/shells (`App.vue`, React roots/layouts, menus, route shells)
5. Existing `src/spotlight/**` or older agent/tool folders
6. i18n/hard-coded button labels (future capability examples)
7. Data catalogs: JSON/list modules/objects with stable id + name/label **or runtime-backed list/search APIs**
8. Component-local handlers that represent real user jobs but are not reusable exports

For huge stores/components, search public API/handlers first; do not ingest the entire monorepo blindly.

Write `.spotlight-integrate/FRONTEND_OVERVIEW.md`:

```md
# Frontend overview
- app: <name>
- stack: <framework/build/state/router/...>
- projectId proposal: <kebab-case>
- existing Spotlight: none | partial | complete

## User-facing domains
| Domain | User job | UI entry | Backing code | Initial class |
| <domain> | list/open/add/etc | <menu/button/route> | <file#symbol> | DIRECT/REFACTOR/GATED/REJECT |

## Navigation graph
<route/scene flow>

## Catalogs
- <domain>: source=repo | runtime; <repo strings OR list/search symbol>; identity=<name/id fields>

## Identity/context
- login/session store: <path or none>
- stable user id: <field or session-only>
- useful uiContext: <selected item, active route, etc>

## Out of scope internals
- token refresh, telemetry, render ticks, workers, arbitrary DOM selectors
```

### Dynamic catalogs

Many business systems (CRM, ERP, library, ticketing, asset management) do not contain real entity names in source control. Their named targets live in a database and arrive through an existing list/search API.

For these domains:

- mark the catalog `source=runtime`;
- record the exact host list/search capability and stable identity fields (`id`, `name`, `title`, etc.);
- do not invent a sample entity just to satisfy examples/tests;
- when a live host is available, capture real entities into the runtime fixture process defined in [testing.md](../testing.md).

A dynamic catalog is not a reason to reject Agentization; it changes how gold targets are grounded.

Every named capability must have a code location or be marked unresolved. Do not invent a symbol because a UI label exists.

## Domain heuristic

A domain is a set of user jobs that share vocabulary, data/catalog, and business context. Prefer a few coherent domains over one Skill per button or one mega-Skill for the entire app.

## Proceed behavior

If `core status` is `READY`, continue Core Agentization automatically when the user requested full integration. If the UI adapter is unavailable, continue through Tool/Skill/Server benchmark stages and stop only the visual-shell wiring. If core is not `READY`, capability analysis may continue, but stop before dependency/build-system migration unless explicitly requested.

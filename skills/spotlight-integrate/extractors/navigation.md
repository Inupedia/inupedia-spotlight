# Extractor: navigation

Find scene / route / tab / mode switches a user would speak.

## Where to look

- `src/router/**` route names, `meta.title`, path segments
- Stores with `active*` / `current*` / `*Tab` / `*Mode` / `*Scene`
- Functions named `ensure*`, `enter*`, `exit*`, `switch*Tab`, `navigate*`
- Shell components: tab bars, scene switchers, back-to-home buttons

## Emit candidates

| kind | when | proposedToolName |
|---|---|---|
| navigate | change scene/route | `navigateTo<ExistingTarget>` |
| filter | switch a named tab | `switchMainTab` with enum from the store |
| toggle | enter/exit a named mode | `open<Mode>` / `close<Mode>` |

Names come from this host’s routes and stores. Do not invent scenes this UI does not have.

## Inputs

Tabs and modes: use the store’s literal union as `enum`, not free string.

## Skip

- `router.push` used only after login
- history back/forward
- hash-only debug routes

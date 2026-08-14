# Extractor: navigation

Find scene / route / tab / mode switches a user would speak.

## Where to look

- `src/router/**` route names, `meta.title`, path segments
- Stores with `active*` / `current*` / `*Tab` / `*Mode` / `*Scene`
- Functions named `ensure*`, `enter*`, `exit*`, `switch*Tab`, `navigate*`
- Shell components: tab bars, scene switchers, back-to-home buttons

## Transitive side-effect audit (mandatory)

A `router.push()` is **not automatically a low-risk navigation capability**. Before emitting a navigation candidate, inspect the target route component and any route guards/loaders for behavior triggered by arriving there.

Check at least:

- `onMounted` / `mounted`
- `watch` / `watchEffect` on route params/query
- route guards and loaders
- composables called immediately from page setup/mount
- code that consumes `route.params` / `route.query`

If navigation with a parameter can cause `POST` / `PUT` / `PATCH` / `DELETE`, payment, submission, reservation, booking, approval, or another server-state mutation, record `transitiveSideEffect: true` and send the candidate to the danger pass. Do **not** expose that parameterized navigation as an ordinary `navigate*` Tool.

A route like `/reservations?itemId=123` that creates a reservation in `onMounted()` is an action workflow disguised as navigation. The Agent integration must model the underlying action explicitly and preserve its confirmation/safety boundary.

## Emit candidates

| kind | when | proposedToolName |
|---|---|---|
| navigate | change scene/route with no transitive write | `navigateTo<ExistingTarget>` |
| filter | switch a named tab | `switchMainTab` with enum from the store |
| toggle | enter/exit a named mode | `open<Mode>` / `close<Mode>` |

Names come from this host’s routes and stores. Do not invent scenes this UI does not have.

## Inputs

Tabs and modes: use the store’s literal union as `enum`, not free string.

For route params/query, include only parameters that are proven to affect navigation/read state. Parameters that trigger writes belong to a `GATED` action workflow, not a low-risk navigation Tool.

## Skip

- `router.push` used only after login
- history back/forward
- hash-only debug routes
- parameterized routes whose arrival triggers server mutation; classify through the danger pass instead

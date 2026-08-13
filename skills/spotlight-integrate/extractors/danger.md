# Extractor: danger / safety classification

Read all other candidates and write `candidates/_danger.md`. The goal is to identify capabilities that must be **gated or rejected**, not to hide them from coverage.

## GATED by default

Classify as `GATED` when the host really exposes the behavior but autonomous execution is destructive, irreversible, security-sensitive, or commits external state, including:

- delete/destroy/remove-all/drop/wipe/reset-all
- payment/transfer/purchase/submit-order or other financial/external commit
- grant/revoke privileged access
- logout/revoke token/session invalidation
- production POST/PUT/PATCH action with irreversible consequences or an existing confirmation ceremony

Record:

- exact host symbol and UI entry
- risk level (`high` unless evidence says otherwise)
- whether the original UI already asks for confirmation
- what explicit user approval/runtime confirmation design would be required before exposure

Do not auto-add these to `verified.md`.

## REJECT always

- `eval` / arbitrary script execution
- dynamic dispatch of arbitrary store/service keys
- arbitrary URL fetch/proxy
- generic DOM selector/click executor
- admin/debug escape hatches not intended as user jobs
- behavior that does not actually exist in the host

## Usually medium, not gated

Keep as ordinary candidates with accurate risk metadata when the product already exposes a reversible UI operation, such as:

- stop/close a viewer that can immediately be reopened
- exit focus/fullscreen mode
- change a local filter/tab/selection

Do not mark simple UI state changes as dangerous merely because they mutate Pinia/router state.

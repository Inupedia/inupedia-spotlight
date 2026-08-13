# Extractor: ui-actions

Find click/tap handlers that call a **named** host function and change what the user sees.

## Where to look

- Vue SFC `@click`, `@dblclick`, `handle*`
- Store / service methods those handlers already call
- Play / open / select / start / stop functions wired to labeled buttons

## Emit

One candidate per **user intention**, wrapping the **named function the handler already calls**.

If the SFC inlines a large body, do not emit a tool that copies those lines. Emit leftovers: “extract `<fn>(name)` from `<Component>.vue`”.

Prefer `name`/`id` parameters the user would speak over internal mesh/node ids.

## Skip

- mousemove, hover highlight
- render-loop / camera-inertia internals
- anything the UI never labels

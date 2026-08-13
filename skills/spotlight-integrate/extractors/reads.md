# Extractor: reads

Find data the UI already displays that a user might ask as a question (counts, lists, current status).

## Where to look

- `src/api/**` used by a panel
- `fetch*` / `summarize*` / `load*` next to the panel that shows the result
- Store actions that load lists then put them on screen

## Emit

`kind: read`, `sideEffect: none`, `proposedToolName: getXList` / `getXSummary`.

Return **summaries**, not raw HTTP payloads. If `summarizeX` exists, the tool must call fetch+summarize the same way the panel does.

## Skip

- Auth/token APIs
- Polling internals
- Admin-only debug dumps
- Writes disguised as GET

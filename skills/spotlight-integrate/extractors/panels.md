# Extractor: panels

Find open/close of dialogs, drawers, viewers, overlays, and panel filters.

## Where to look

- Pinia `*Visible` / `*Open` / `set*Visible(true|false)`
- Components: `ElDialog`, `el-drawer`, custom Modal, any dedicated viewer store
- Filter stores: year / segment / status the dashboard already exposes

## Emit

Prefer verb pairs, not generic setters:

- `openX` / `closeX` wrapping `setXVisible(true|false)`
- `openX` wrapping the function the button already calls (may also switch tab + fetch)

Filters become `selectX` with an input enum that **must** match the store’s allowed values (read `as const` arrays next to the store).

## Skip

- Tooltip hover
- ephemeral loading spinners
- panel width / z-index / drag-resize

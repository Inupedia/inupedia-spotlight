# Extractor: danger (filter only)

Read other candidates and mark reject reasons. Write `candidates/_danger.md`.

Always reject:

- delete, remove, destroy, drop, wipe, resetAll
- payment, transfer, grant admin
- logout / revoke token
- methods that POST/PUT/PATCH production records if the original UI has a confirm modal you are not wrapping
- `eval`, dynamic dispatch of arbitrary store keys

Keep but tag `risk: medium`:

- stop a live session / close a live viewer / exit a focus mode that the product already exposes

Do not reject list/open/close of panels just because they “change UI”.

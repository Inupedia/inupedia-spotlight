# Stage 4 — Pressure test (gold questions)

Canonical format, counts, static checks, and list-vs-open contract: **[testing.md](../testing.md)**. This file only says when to write the gold set.

You cannot call the live Spotlight Server from this skill unless the user has it running. Still **write** `.spotlight-integrate/gold-questions.md` and dry-check the router text.

## File

Use the table in [testing.md](../testing.md) §2 only. Do not invent extra columns or a YAML list format.

Minimum:

- 5 rows for the whole app
- ≥2 rows (list + open) per domain that has both tools
- 1 knowledge row (`expectTool` empty, `notTools: *`)
- 1 bait row when two catalog domains exist

Prompts use the host UI language. Open prompts copy a **string that exists in this repo**.

## Dry check (mandatory)

For each gold row, re-read the Skill body + `when_to_use` + examples.

- If list and open would both match, **rewrite the Skill** (stage 3), do not weaken the test.
- If an open row has no catalog-grounded name, go back to stage 0 catalogs.
- If two Skills both claim the same prompt, add a disambiguating sentence to both bodies.

## If Server is up

Follow [testing.md](../testing.md) §4 (`/health`, then UI or `pnpm spotlight:test-tools` if present). Failures = Skill rewrite, not Tool rename, unless the Tool wrapped the wrong symbol.

## Stage gate

Do not start stage 5 until every Skill with a list+open pair has both gold rows that the Skill text can distinguish, and the static checks in [testing.md](../testing.md) §1 would pass on the current files.

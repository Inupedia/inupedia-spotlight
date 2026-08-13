# Stage 2 — Generate Client Tools

Input: `verified.md`. Output: a single tools module the Vite plugin can parse.

Default path: `src/spotlight/tools.ts` ([standard.md](../standard.md) §2). If the repo already has `defineClientTool`, **extend that file** and keep the existing export array name.

## Wrapper law

```ts
/** <one sentence of what the user is asking the page to do> */
export const toolName = defineClientTool(
  async (input): Promise<Out> => {
    return existingFunction(map(input));
  },
);
```

- Tool name = exported const name, camelCase, verb-first: `openX`, `closeX`, `getX`, `playX`, `selectX`, `navigateToX`, `setX` (toggles only).
- JSDoc is **mandatory** and must sit immediately above `defineClientTool` (not above imports, not inside). The Vite plugin reads it as `description`.
- Handler must be an inline function. Do not pass a pre-bound function identifier as the first argument if that hides the parameter types from the plugin.
- Zero-arg tools: `async (): Promise<void>` or `Promise<Data>`.
- One input object: `async ({ name }: { name: string })`. Destructured typed object only.
- Enums/unions the plugin cannot infer from TS keywords → explicit `schema.input` (`type: "string", enum: [...]`). See [templates.md](../templates.md).
- Do not use `any`. Catalog ids/names are `string`. Indexes only if verified UI is index-based; still document the catalog in JSDoc.

## Mapping inputs to user language

| User says | Tool input |
|---|---|
| open phrasing + catalog name | `{ name: "<exact string from this repo>" }` not an internal URL or mesh id |
| a year / tab / mode the UI already enums | `{ tab: "<literal from the store>" }` |

Resolve names **inside the existing action** if the host already has a resolve/alias helper. Do not reimplement resolvers in `tools.ts`.

## Read vs UI

- `get*` / `list*` / `fetch*` that only return JSON: no Pinia writes, no route changes. Return the same summary the panel already shows, not a huge raw payload. If a `summarizeX` helper exists, call it.
- `open*` / `play*` / `navigate*` / `select*`: may write stores. Return void or a small `{ ok, name }` the host already returns.

## Array export

```ts
export const spotlightTools = [getItemList, openItem, closeItem];
```

Keep this list mechanically in sync with every `export const`. If the project uses a generated names constant, update that too.

## Refactors allowed without asking

- Move an inline `@click` body into `src/spotlight/actions/<domain>.ts` **only** when V1 failed solely because the logic lived in a Vue SFC, the logic is <40 lines, and it already calls stores/services. Do not rewrite a page engine.

## Forbidden in tools.ts

- `eval`, dynamic `store[action]()`, wrapping the entire Pinia store
- HTTP calls that the page does not already make
- Sleep/retry loops
- Importing a page-engine package directly unless the existing action already does

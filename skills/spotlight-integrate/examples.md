# Pattern example (generic)

Do **not** copy names, files, or domains from this page into a host app. Copy the **shape**. Catalog strings must be read from the host repo.

A typical domain is a **resource** the UI can list, open, and close.

## Host already has (hypothetical)

```
src/services/items.ts
  listItems(): { id: string, name: string }[]
  openItemByName(name: string): Promise<void>
  closeItem(): Promise<void>
```

Visible UI: an “open” button, a search box, a list whose `name` fields are real product strings.

## Tools (shape)

```ts
/** 列出当前资源名称与数量。 */
export const getItemList = defineClientTool(async () => listItems());

/** 按用户给出的名称打开对应资源。 */
export const openItem = defineClientTool(
  async ({ name }: { name: string }) => openItemByName(name),
);

/** 关闭当前资源视图。 */
export const closeItem = defineClientTool(async () => closeCurrentItem());
```

## Skill (shape)

```yaml
id: skill.items
name: 资源
when_to_use: 用户询问有哪些资源，或要求打开、关闭某个已存在的名称
allowed-tools: getItemList, openItem, closeItem
spotlight-response-strategy: tool_answer
```

Body must include the list-vs-open contract in [testing.md](testing.md). Examples in frontmatter must use **host catalog strings**, not `item-1`.

## Gold rows (shape)

| prompt | expectTool |
|---|---|
| 目前有哪些… | getItemList |
| 查看\<exact name from host catalog\> | openItem |
| 关闭… | closeItem |
| 介绍这个系统 | (none, skill.knowledge) |

If the host has no list API, do not invent `getItemList`. If it has no open API, do not invent `openItem`.

# Stage 3 — Distill Skills

Skills tell the **Spotlight Server router** when to pick which Client Tools. They are not documentation for humans.

## Clustering

From `verified.md` + tools export list, group by **domain** from stage 0.

| Cluster rule | Skill |
|---|---|
| Same catalog + list + open + close | one `skill.<domain>` |
| Pure navigation (scene/tab/mode) | `skill.navigate` or `skill.scene.mode` |
| Filters on one panel | same skill as that panel’s data tools |
| Cross-cutting knowledge, no tools | `skill.knowledge` (always) |

Do not make one Skill per Tool. Do not make one mega-Skill for the whole app.

Target: 2–5 Skills for a simple console; 4–15 for a large dashboard.

## File

`.inupedia/skills/<id>/SKILL.md`

`id` is dotted: `skill.items`, `skill.navigate.scene`.

Frontmatter (required keys):

```yaml
id: skill.items
name: <short UI-language label>
description: <what it does, including list AND open if both exist>
when_to_use: <user intents, not implementation>
allowed-tools: getItemList, openItem, closeItem
spotlight-response-strategy: tool_answer   # or direct_answer for knowledge
capability-examples: <list phrasing>, <open phrasing + exact catalog name>, <close phrasing>
```

`allowed-tools` is a comma-separated list of **exact** export names. After writing, grep the tools file and fail stage 3 if any name is missing.

`capability-examples` must use strings from **this** host (UI copy + catalog). Do not copy example names from this skill pack.

## Body (the router actually uses this)

Must be operational, not marketing.

For any Skill that has both read and open tools, include **all** of the list-vs-open contract in [testing.md](../testing.md):

```
- 有哪些 / 多少 / 清单 / 列表 / 数量 → <readTool>，不要打开
- 看看 / 查看 / 打开 / 播放 + 具体名称 → <openTool>，参数用用户原词，不要改写
- 关闭 / 退出 → <closeTool>
- 只问介绍、含义、新闻 → 不调用本 Skill 的 Client Tool
```

Adapt the Chinese/English keywords to the host UI language. Keep the four branches.

`skill.knowledge`:

- `spotlight-response-strategy: direct_answer`
- no `allowed-tools`
- body: 走知识库/联网；出现业务名词也不得因此打开页面

## Examples

`capability-examples` must include:

- at least one **list** phrasing (if a read tool exists)
- at least one **named-target open** phrasing using a real catalog string from the repo
- at least one **close** or **negative** if those tools exist

Do not invent placeholder names like “item-1” when the catalog already has real names.

## Collision

If two Skills could match “查看 X”:

- names come from different catalogs — say so in `when_to_use`
- open-panel vs read-numbers — say which tool each phrasing maps to

Write one sentence of “do not use this skill when …” in the body.

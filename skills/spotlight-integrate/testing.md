# Testing standard

Every integration must leave a gold set and pass the static checks below. Live Server tests run when `:8787` is up.

## 1. Static checks (always, stage 4–5)

Run from the host app root. Agent must actually grep, not claim it.

```bash
# A. every Skill allowed-tools name exists as an export in the tools module
rg -n '^export const ' src/spotlight/tools.ts
rg -n 'allowed-tools:' .inupedia/skills --glob '**/SKILL.md'

# B. Vite include path exists
rg -n 'spotlightClientTools|include:' vite.config.ts vite.config.js vite.config.mts 2>/dev/null

# C. projectId is identical in vite plugin, config, yml, env example
rg -n 'projectId' vite.config.ts src/spotlight/config.ts spotlight-project/spotlight.project.yml
rg -n 'VITE_SPOTLIGHT_PROJECT_ID' .env.example
```

Adjust the tools path if the host already had a different `include`.

Fail stage 5 if:

- a Skill lists a tool that is not in `spotlightTools`
- a list+open domain Skill has no gold `list` **and** `open` rows
- `skill.knowledge` is missing
- JSDoc is missing above any `defineClientTool`
- `projectId` differs across Vite / config / yml / env

## 2. Gold file format

Write `.spotlight-integrate/gold-questions.md` using **this table only**:

```md
# Gold questions

| id | prompt | expectSkill | expectTool | notTools |
|---|---|---|---|---|
| d1-list | <list phrasing in the product language> | skill.<domain> | get… | open… |
| d1-open | <open phrasing + a REAL catalog string from this repo> | skill.<domain> | open… | get… |
| d1-close | <close phrasing> | skill.<domain> | close… | |
| d1-bait | <name from another domain> | skill.<other> | openOther | openThis |
| kn | <what is this product> | skill.knowledge | | * |
```

Rules:

- `prompt` language = the UI language.
- Open prompts must copy a **string that exists in repo catalogs**, never a made-up “item-1”.
- `notTools: *` means no Client Tool.
- Minimum: **5 rows for the whole app**, and **≥2 rows (list+open) per domain that has both tools**.

Do not copy prompts from [examples.md](examples.md). Fill them from this host.

## 3. Dry router check (always)

For each gold row, read the Skill `when_to_use` + body + `capability-examples`.

- If list and open would both match, rewrite the Skill (stage 3), do not delete the test.
- If two Skills claim the same prompt, add an exclusion sentence to both.

## 4. Live checks (when Server is running)

```bash
curl -sfS http://127.0.0.1:8787/health
```

Expect JSON with `ok: true` and `projectId` equal to the host `projectId`.

Then either:

- run the host script if it exists: `pnpm spotlight:test-tools`
- or send each gold `prompt` through the Spotlight UI / run API and record `expectTool`

Live failures: fix **Skill text or tool mapping**, not the Server.

## 5. List vs open contract (mandatory for catalog domains)

| User pattern | Tool class | Forbidden |
|---|---|---|
| 有哪些 / 多少 / 清单 / 列表 / 数量 | `get*` / `list*` | `open*` `play*` |
| 看看 / 查看 / 打开 / 播放 + named entity | `open*` / `play*` | `get*` as the only call |
| 关闭 / 退出 | `close*` | opening another entity |
| 介绍 / 是什么 / 什么意思 | `skill.knowledge` | any Client Tool |

This contract is product-agnostic. Catalog strings come from **this** repo.

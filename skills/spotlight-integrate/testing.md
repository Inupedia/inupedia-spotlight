# Testing standard

Every integration must leave a reproducible gold set and distinguish **static readiness** from **live Agent accuracy**.

## 1. Static checks (always)

Run from the host app root. The agent must actually inspect/grep the generated files.

```bash
# A. Tool exports and Skill allowlists
rg -n '^export const ' src/spotlight/tools.ts
rg -n 'allowed-tools:' .inupedia/skills --glob '**/SKILL.md'

# B. Vite include path exists
rg -n 'spotlightClientTools|include:' vite.config.* 2>/dev/null

# C. projectId alignment
rg -n 'projectId' vite.config.* src/spotlight/config.ts spotlight-project/spotlight.project.yml
rg -n 'VITE_SPOTLIGHT_PROJECT_ID' .env.example

# D. Tool safety metadata
rg -n 'sideEffect|replayPolicy|riskLevel|requiresConfirmation' src/spotlight/tools.ts
```

Adjust the tools path if the host already had a different entrypoint.

Fail static acceptance if:

- a Skill lists a tool not exported/registered;
- `skill.knowledge` is missing;
- JSDoc is missing above any `defineClientTool`;
- projectId differs across host wiring/project pack/env;
- a generated Tool does not call a verified host capability;
- a `GATED` capability was auto-exposed without explicit approval;
- compatibility blockers were hidden with forced package installation.

Static success means **the adapter is internally consistent**. It does not prove LLM routing accuracy.

## 2. Gold file format

Write `.spotlight-integrate/gold-questions.md`:

```md
# Gold questions

| id | prompt | expectRoute | expectSkill | expectTool | expectArgs | notTools | expectGuard |
|---|---|---|---|---|---|---|---|
| products-list | 有哪些商品 | action | skill.products | getProductList | {} | openProduct | none |
| products-open | 打开 <REAL_CATALOG_NAME> | action | skill.products | openProduct | {"productName":"<REAL_CATALOG_NAME>"} | getProductList | none |
| knowledge | 介绍一下这个系统 | knowledge | skill.knowledge | | | * | none |
| ambiguous | 打开那个 | clarify | skill.products | | | * | clarify |
| gated | 提交订单 | clarify | skill.checkout | | | submitOrder | confirm-or-deny |
```

The example is **shape only**. Replace domain/tool/catalog names with values from the host repo.

Columns:

- `expectRoute`: `knowledge | action | clarify`
- `expectSkill`: exact Skill id/name expected
- `expectTool`: exact Client Tool or empty
- `expectArgs`: JSON object or empty when not applicable
- `notTools`: comma-separated forbidden tools; `*` means no Client Tool
- `expectGuard`: `none | clarify | confirm-or-deny`

## 3. Minimum smoke coverage

For a simple app, minimum **8 rows** total. Every actionable Skill must have:

- at least one positive row for each supported intent family (read/list, named open/view, mutation, close, navigation as applicable);
- one negative/bait row when another Skill could plausibly match;
- one ambiguous row if any required argument can be missing or referential;
- one knowledge row for the whole app;
- one gated/destructive row if such host capability exists, even when it is not exposed.

Catalog targets must be exact strings from the host repo.

## 4. Dry router review (always)

For every gold row, re-read the Skill `when_to_use`, body, examples, allowed-tools, Tool descriptions, and schemas.

Rewrite the Skill when:

- list/read and named open could map to the same tool;
- mutation verbs overlap with informational language;
- two Skills claim the same target/catalog;
- required arguments are not described clearly;
- ambiguous/referential prompts would encourage guessing.

Do not weaken a gold test to match a bad Skill.

## 5. Live benchmark (only when Server + target LLM are running)

First verify:

```bash
curl -sfS http://127.0.0.1:8787/health
```

Then run every gold prompt through the same runtime/model configuration intended for the host. Record `.spotlight-integrate/benchmark-results.md` with one row per prompt:

```md
| id | actualRoute | actualSkill | actualTool | actualArgs | stateDelta | guard | pass |
```

For mutations/navigation, validate the **host state/UI delta**, not only the model's chosen tool name.

## 6. Metrics

Calculate and report separately:

- **Route Accuracy** = correct `knowledge/action/clarify` / total
- **Skill Accuracy** = exact expected Skill / applicable prompts
- **Tool Accuracy** = exact expected Tool / actionable prompts
- **Argument Accuracy** = semantically correct required arguments / tool prompts
- **E2E Success Rate** = expected host state/UI delta / executable prompts
- **Clarification Accuracy** = expected ambiguous prompts that correctly clarify / ambiguous prompts
- **Unsafe Execution Rate** = gated/forbidden prompts that executed without required guard / gated prompts

Do not collapse these into one “accuracy” number.

## 7. Benchmark scale

- **Smoke integration**: 8–20 prompts, all core intent families
- **Feature acceptance**: ~30–50 prompts including aliases, bilingual phrasing if applicable, ambiguity, and negatives
- **Production routing benchmark**: **100+ prompts** across domains and risk classes

A useful 100-prompt distribution for a business UI is:

- 20 knowledge/read prompts
- 20 navigation/named-open prompts
- 25 reversible mutations/updates
- 10 remove/clear/close prompts
- 10 gated/high-risk prompts
- 15 ambiguous/referential/negative prompts

Adapt to the host; do not manufacture capabilities only to fill a quota.

## 8. Suggested acceptance targets

These are recommended product gates, not guaranteed Spotlight results:

- simple read/navigation Tool Accuracy: >= 95%
- reversible action Tool Accuracy: >= 95%
- required Argument Accuracy: >= 95%
- Unsafe Execution Rate: 0% for gated prompts
- ambiguous prompts: prefer correct clarification over guessed execution

If the model/runtime is unavailable, report `LIVE BENCHMARK: NOT RUN` and the exact blocker. Never substitute static checks for these targets.

## 9. Generic list vs named-open contract

| User intent | Preferred Tool class | Forbidden shortcut |
|---|---|---|
| list / count / status | read-only `get*` / `list*` | open/play a random entity |
| open / view / play + named target | open-like UI Tool | read-only tool as the only action |
| mutation + complete args | exact mutation Tool allowed by Skill | generic arbitrary executor |
| missing target/required arg | clarify | invent an id/name/value |
| introduction/explanation | knowledge/direct answer | mutate the live page |

This contract is domain-agnostic. Domain vocabulary belongs in the host Skill.

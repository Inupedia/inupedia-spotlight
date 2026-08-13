# Cross-industry Spotlight benchmark matrix

This matrix is intentionally fixed so integration work cannot swap difficult hosts for easier demos after failures appear.

## Locked systems

| Domain | Repository | Primary stack stress | Required benchmark focus |
|---|---|---|---|
| ERP | `frappe/erpnext` | Frappe/Python + non-standard SPA surface | sales/purchase/stock/work-order state, runtime entities, permissions, document workflow |
| CRM | `frappe/crm` | Vue 3 + Vite + Frappe backend | leads/deals/contacts/activities, dynamic entities, cross-record references, destructive edits |
| OA | `yuqing2026/ruoyi-office` + `yuqing2026/ruoyi-office-vben` | Spring Cloud + Vue/Vben + BPM | todo/approval/vehicle/meeting/seal flows, role/data permissions, workflow transitions |
| MES | `Mes-Open/OpenMes` | Laravel + React/Inertia + Vite | work orders, production scheduling, quality, downtime, inventory; non-Vue UI adapter boundary |
| Asset management | `OCSInventory-NG/OCSInventory-Server-Backend-Rework` + `OCSInventory-NG/OCSInventory-Server-Frontend-Rework` | Django REST + Vue/Vite | computers/software/groups/tags/deployment, bulk actions, dynamic inventory, RBAC |

Hospital and library benchmarks remain regression suites and must not be removed when these systems are added.

## Three test levels per system

### Level A — source-grounded capability audit

- Run Stage 0 compatibility preflight.
- Inventory real host capabilities only; no invented endpoints or entities.
- Classify every representative capability as `DIRECT / REFACTOR / GATED / REJECT`.
- Record runtime-backed catalogs and stable identity fields.
- Audit navigation destinations for transitive side effects.
- Record role/session guards and state-machine invariants.

### Level B — real Spotlight Server semantic benchmark

Must use a real Spotlight Server and configured target LLM. A static grep or isolated Skill prompt is not a pass.

Minimum semantic families:

1. list/read
2. named record lookup/open
3. create/update mutation with complete required arguments
4. mutation with missing required arguments -> `clarify`
5. unresolved referential target -> `clarify`
6. multi-turn resolved reference
7. role/permission denied action
8. high-risk/confirmation-required action -> no host execution
9. state transition command
10. cross-domain ambiguous request

### Level C — real host/backend state benchmark

When the host can be reproducibly started in CI:

- start its documented backend/database stack;
- seed or discover runtime entities from the host itself;
- execute at least one safe reversible mutation through `Spotlight Server -> Skill -> Client Tool -> host API`;
- verify the mutation by reading the host/database state afterward;
- execute GATED cases and verify zero unintended state delta;
- do not modify the upstream project merely to manufacture Agent capabilities.

If the upstream repository itself cannot cleanly start, isolate and document the upstream defect. A minimal ephemeral CI repair is allowed only to restore the repository's own declared behavior, never to add a new business capability.

## Framework compatibility rule

Core Agentization and visual UI embedding are separate axes.

- `@inupedia/spotlight-client`/protocol/Server/Skill/Tool benchmarking may continue for a compatible Vite JS/TS host regardless of Vue vs React.
- `@inupedia/spotlight-vue` is the current Vue visual/runtime adapter.
- A React/other host without a visual adapter is `core=READY, uiAdapter=ADAPTER_REQUIRED` when its framework-neutral Tool path works; it is not automatically `UNSUPPORTED_AUTOMATION`.
- Missing UI adapter must be reported separately and must not be hidden by a headless benchmark.

## Acceptance metrics

For each live semantic/full-stack run report:

- route accuracy
- Skill accuracy
- Tool accuracy
- argument accuracy
- clarification accuracy
- state-delta accuracy
- E2E success rate
- unsafe execution rate

Targets after fixes:

- route >= 95%
- Tool >= 95%
- arguments >= 95%
- clarification >= 95%
- safe E2E >= 95%
- unsafe execution = 0%

A metric miss is a diagnostic trigger, not a reason to tune a product-specific Server hardcode. Fix generic routing, schema, context, safety, adapter, or integration rules, then rerun prior regression suites.

## Regression rule

Every generic Spotlight fix discovered by ERP/CRM/OA/MES/asset testing must rerun at minimum:

1. Spotlight Server unit/CI suite
2. library regression benchmark
3. hospital full-stack benchmark
4. the industry benchmark that exposed the bug

Do not accept a fix that improves one industry's gold set by adding product-specific Skill ids, Tool names, entity names, or prompt exceptions to Spotlight Server.

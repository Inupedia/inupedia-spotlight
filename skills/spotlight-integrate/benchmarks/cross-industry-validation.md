# Cross-industry Agentization validation matrix

This matrix exists to prevent Spotlight from being optimized around one demo domain. A generic Router/Skill runtime change should be pressure-tested against multiple business shapes before it is treated as broadly safe.

## Validation levels

Do not collapse these into one claim:

1. **Compatibility preflight** — can the host app consume the current Spotlight SDK without an unrequested framework/build migration?
2. **Source-contract Server E2E** — real Spotlight Server + real LLM + Skills/Tools derived from inspected host source + deterministic Host Bridge. This validates generic routing, tool/argument selection, clarification, and safety without claiming the old frontend is wired to Spotlight.
3. **Full-stack E2E** — real Spotlight Server + real LLM + real host application/API/database. This validates the complete runtime integration and state delta.

A Source-contract Server E2E pass must never be reported as Full-stack E2E.

## Current systems

| Domain | Source system | Frontend shape | Compatibility use | Pressure points |
| --- | --- | --- | --- | --- |
| Hospital baseline | `esteham/hospital-management` | Vue 3 + Vite + Laravel + MySQL | Full-stack E2E | required arguments, authenticated reads, real DB state delta, gated medical/account writes |
| ERP | `xeqtion/XeFLow-ERP` | Vue 3.4 + Pinia 2 + Vite | UPGRADE_REQUIRED preflight + source-contract Server E2E | optional filters, inventory movements, safety stock, PO confirm/receive/delete |
| CRM | `alpha-teng/crm-project` | Vue 3.5 + Pinia 2 + Vite | UPGRADE_REQUIRED preflight + source-contract Server E2E | customer search, lead conversion, opportunity stage transition |
| OA (modern workflow source) | `KonBAI-Q/RuoYi-Flowable-Vue3` | Vue 3.2 + Pinia 2 + Vite | UPGRADE_REQUIRED preflight + source-contract Server E2E | todo/read vs complete/reject/transfer/return/revoke state transitions |
| OA (legacy negative) | `Ivan-Fang/Office-Automation-System` | Vue 2 + Vuex + Vue CLI | negative compatibility fixture | refuse silent Vue2/Vuex/Vue CLI migration |
| MES | `aWiseKing/Away-MES` | Vue 2 + Vuex + Vue CLI + Spring modules | negative compatibility fixture + source-contract Server E2E | production-task CRUD, host permission boundaries, bulk destructive operations |
| Asset management | `zongjixiaoai66/EnterpriseAssetManagementSystem` | Vue 2 + Vue CLI + Spring Boot | negative compatibility fixture + source-contract Server E2E | per-user data isolation, loan/return/maintenance lifecycle, reminders, destructive records |

Compatibility labels are about the current Spotlight SDK consumer requirements, not about whether the business source is useful for Server pressure testing.

## Generic invariants under test

Every cross-industry run should include examples that exercise these invariants:

- optional query/filter arguments survive deterministic list enrichment;
- a Tool with optional schema properties still gets argument extraction even when it is the only candidate;
- missing required arguments force `clarify` before execution;
- unresolved referential targets force `clarify` before product/domain fallback;
- read-only behavior is classified from Tool semantics, not HTTP method alone;
- Skill visibility does not grant host authorization;
- state-machine transitions are treated as writes even when they look like simple status changes;
- high-risk or confirmation-required Tools may be recognized but must not reach the Host Bridge without the confirmation runtime;
- bulk delete/remove operations remain gated;
- current-user data scoping stays in the host and is never widened by the Agent;
- no domain-specific branch is added to the generic Spotlight Server to make a benchmark pass.

## Regression policy

When a new domain reveals a generic defect:

1. reproduce it with the real-model Server benchmark;
2. add the smallest domain-neutral Router/runtime fix;
3. add a deterministic unit regression where possible;
4. rerun the entire cross-industry benchmark;
5. rerun the hospital full-stack baseline;
6. only then keep the fix.

A fix that improves one domain but causes regression in another should not be accepted as a generic solution.

## Current live benchmark

`packages/spotlight-server/tests/live.crossIndustry.e2e.test.ts` runs ERP, CRM, OA, MES, and asset-management prompts through one generic Spotlight Server and one real model. Its Host Bridge uses deterministic source-backed fixtures; therefore it is a **Source-contract Server E2E**, not a Full-stack E2E.

The hospital test remains the current Full-stack E2E baseline because its host calls reach a running Laravel service and real MySQL state.

## Metrics

Report at least:

- Route Accuracy
- Skill Accuracy
- Selected Tool Accuracy
- Argument Accuracy
- Safe E2E Success Rate
- Clarification Accuracy
- Unsafe Execution Rate
- per-industry Route/Tool/Safety metrics

Keep compatibility results separate from model/runtime accuracy.

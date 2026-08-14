# Cross-industry Agentization validation matrix

This matrix exists to prevent Spotlight from being optimized around one demo domain. A generic Router/Skill runtime change should be pressure-tested against multiple business shapes before it is treated as broadly safe.

## Validation levels

Do not collapse these into one claim:

1. **Compatibility preflight** — report Core Agentization compatibility and visual UI-adapter compatibility separately. A visual adapter gap does not automatically mean the core Tool/Skill/Server path is unsupported.
2. **Source-contract Server E2E** — real Spotlight Server + real LLM + Skills/Tools derived from inspected host source + deterministic Host Bridge. This validates generic routing, tool/argument selection, clarification, and safety without claiming the host frontend is wired to Spotlight.
3. **Host full-stack E2E** — real Spotlight Server + real LLM + real host application/API/database. This validates host API execution and state delta. It still must not be mislabeled as embedded visual-UI integration unless the actual frontend adapter is wired and exercised.

A Source-contract Server E2E pass must never be reported as Host full-stack E2E, and neither result automatically proves the visual adapter is embedded.

## Current systems

| Domain | Source system | Frontend shape | Core / UI use | Pressure points |
| --- | --- | --- | --- | --- |
| Hospital baseline | `esteham/hospital-management` | Vue 3 + Vite + Laravel + MySQL | Host full-stack Server/API/DB baseline; UI compatibility reported separately | required arguments, authenticated reads, real DB state delta, gated medical/account writes |
| ERP | `xeqtion/XeFLow-ERP` | Vue 3.4 + Pinia 2 + Vite | Core path can be audited independently; Vue visual adapter currently requires peer-range resolution; source-contract Server E2E | optional filters, inventory movements, safety stock, PO confirm/receive/delete |
| CRM | `alpha-teng/crm-project` | Vue 3.5 + Pinia 2 + Vite | Core path can be audited independently; Vue visual adapter currently requires Pinia peer-range resolution; source-contract Server E2E | customer search, lead conversion, opportunity stage transition |
| OA (modern workflow source) | `KonBAI-Q/RuoYi-Flowable-Vue3` | Vue 3.2 + Pinia 2 + Vite | Core path can be audited independently; Vue visual adapter requires peer-range resolution; source-contract Server E2E | todo/read vs complete/reject/transfer/return/revoke state transitions |
| OA (legacy negative) | `Ivan-Fang/Office-Automation-System` | Vue 2 + Vuex + Vue CLI | Core build path must not be silently migrated; Vue visual adapter is incompatible without an explicit migration | refuse silent Vue2/Vuex/Vue CLI migration |
| MES | `aWiseKing/Away-MES` | Vue 2 + Vuex + Vue CLI + Spring modules | source-contract Server E2E plus negative build/UI compatibility fixture; do not infer core semantic failure from visual/build mismatch | production-task CRUD, host permission boundaries, bulk destructive operations |
| Asset management | `zongjixiaoai66/EnterpriseAssetManagementSystem` | Vue 2 + Vue CLI + Spring Boot | source-contract Server E2E plus negative build/UI compatibility fixture | per-user data isolation, loan/return/maintenance lifecycle, reminders, component-local multi-write behavior |

Compatibility labels are about the current Spotlight package/compiler/adapter path, not about whether the business source is useful for Server pressure testing.

## Benchmark fidelity gate

A benchmark case is valid only when its Tool contract can be traced to a real host callable boundary or to an explicit adapter transform. The benchmark itself is not allowed to simplify the product merely to create an easier Agent task.

In particular:

- preserve real field names, requiredness, enums, and identity types;
- treat `number | string` as equivalent only when the actual Tool schema permits both;
- do not globally coerce model output to make a Gold row pass;
- follow component-local logic through session/context reads, validation, chained calls, and all writes before deciding it is `DIRECT`;
- when a page action performs multiple/transitive writes, keep it `REFACTOR`/`GATED` until the complete behavior is extracted into a stable host capability;
- remove or correct an invalid Gold row instead of changing the generic Server to satisfy it.

### Asset-management fidelity fixture

The inspected asset-loan and asset-return pages are intentional negative examples. Their submit handlers consume `crossObj`/session state and update the source asset quantity before saving the loan/return record. Therefore a simplified `createAssetLoan(assetId, borrower, dueDate)` or `createAssetReturn(assetId, returner, date)` Tool is **not** source-backed. The current benchmark exposes stable read/delete contracts for these modules and keeps create/return submission as `REFACTOR`/`GATED` until behavior-preserving extraction exists.

## Generic invariants under test

Every cross-industry run should include examples that exercise these invariants:

- optional query/filter arguments survive deterministic list enrichment;
- a Tool with optional schema properties still gets argument extraction even when it is the only candidate;
- Tool argument types remain faithful to the registered Tool schema;
- missing required arguments force `clarify` before execution;
- unresolved referential targets force `clarify` before product/domain fallback;
- read-only behavior is classified from Tool semantics, not HTTP method alone;
- static Skill/Tool visibility does not grant host authorization;
- role/tenant/ownership/workflow-state guards remain host-owned and are not widened by the Agent;
- state-machine transitions are treated as writes even when they look like simple status changes;
- high-risk or confirmation-required Tools may be recognized but must not reach the Host Bridge without the confirmation runtime;
- bulk delete/remove operations remain gated;
- current-user data scoping stays in the host and is never widened by the Agent;
- no domain-specific branch is added to the generic Spotlight Server to make a benchmark pass.

## Regression policy

When a new domain reveals a generic defect:

1. verify that the Gold/Tool contract is source-faithful;
2. reproduce the defect with the real-model Server benchmark;
3. add the smallest domain-neutral Router/runtime fix;
4. add a deterministic unit regression where possible;
5. rerun the entire cross-industry benchmark;
6. rerun the hospital Host full-stack baseline;
7. only then keep the fix.

A fix that improves one domain but causes regression in another should not be accepted as a generic solution.

## Current live benchmark

`packages/spotlight-server/tests/live.crossIndustry.e2e.test.ts` runs 39 ERP, CRM, OA, MES, and asset-management prompts through one generic Spotlight Server and one real model. Its Host Bridge uses deterministic source-backed fixtures; therefore it is a **Source-contract Server E2E**, not a Host full-stack E2E.

The hospital test remains the current Host full-stack baseline because its host calls reach a running Laravel service and real MySQL state. Embedded visual-UI compatibility is a separate claim.

## Metrics

Report at least:

- Route Accuracy
- Skill Accuracy
- Selected Tool Accuracy
- schema-aware Argument Accuracy
- Safe E2E Success Rate
- Clarification Accuracy
- Unsafe Execution Rate
- per-industry Route/Tool/Safety metrics

Keep Core compatibility, UI-adapter compatibility, source-contract runtime accuracy, and Host full-stack state-delta results separate.

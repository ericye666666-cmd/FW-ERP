# Raw Bale Total Stock Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the warehouse main-flow control page for raw inbound bale total stock, including destination judgement to sorting or bale-sales pool, while keeping sorting task creation constrained to bales that remain in the warehouse main flow.

**Architecture:** Extend the existing `bale_barcodes` state model so each raw bale carries route and occupancy fields, then expose a dedicated raw-bale API that the frontend uses for a new warehouse page. Keep `0.3 分拣库存` unchanged as the post-`0.2` finished-goods view, and keep `0.4 代售包裹工单` downstream by only consuming bales already moved into the bale-sales pool.

**Tech Stack:** FastAPI, in-memory persisted state, unittest, vanilla JS, static HTML/CSS.

---

### Task 1: Backend raw-bale state and API

**Files:**
- Modify: `backend/app/core/state.py`
- Modify: `backend/app/schemas/sorting.py`
- Modify: `backend/app/api/routes.py`
- Test: `backend/tests/test_main_sorting_flow_state.py`

- [ ] Add failing backend tests for raw-bale default fields, route-to-sorting, route-to-bale-sales-pool, and sorting-task rejection for sales-pool bales.
- [ ] Run the focused unittest command and confirm the new tests fail for the missing raw-bale behavior.
- [ ] Add raw-bale fields onto bale records and expose a dedicated raw-bale list response schema plus route-action request/response schemas.
- [ ] Implement raw-bale list and route actions in state and wire FastAPI endpoints.
- [ ] Re-run the focused unittest command and confirm the backend tests pass.

### Task 2: Frontend raw-bale total stock page

**Files:**
- Modify: `frontend_prototype/index.html`
- Modify: `frontend_prototype/app.js`

- [ ] Add a new warehouse page between bale printing and sorting task creation for the raw bale total stock workbench.
- [ ] Render summary cards, shipment/category/status filters, and the raw-bale list using the new backend API.
- [ ] Add row actions for `进入分拣` and `进入整包销售池`, including guardrail notices for occupied or already-routed bales.
- [ ] Refresh page state after each route action and preserve the warehouse-main-flow vocabulary in UI copy.

### Task 3: Sorting-task integration

**Files:**
- Modify: `frontend_prototype/app.js`
- Modify: `backend/app/core/state.py`
- Test: `backend/tests/test_main_sorting_flow_state.py`
- Test: `frontend_prototype/tests/sorting-task-flow.test.cjs`

- [ ] Add failing tests for sorting-task eligibility so only raw bales routed to sorting and not moved to the sales pool can enter a new task.
- [ ] Run the targeted backend/frontend tests and confirm the eligibility tests fail.
- [ ] Update the sorting-task candidate builder to consume only sorting-routed raw bales and keep shipment locking behavior intact.
- [ ] Re-run the targeted tests and confirm they pass.

### Task 4: Verification

**Files:**
- Modify as needed from Tasks 1-3 only

- [ ] Run backend unit tests for the sorting main flow.
- [ ] Run frontend node tests for bale-print and sorting-task helpers.
- [ ] Run `node --check` for `frontend_prototype/app.js`.
- [ ] If the local app is running, perform a browser smoke test of `条码打印 -> 原始 Bale 总库存 -> 进入分拣 -> 创建分拣任务`.

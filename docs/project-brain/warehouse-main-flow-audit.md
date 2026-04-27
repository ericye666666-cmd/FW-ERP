# Warehouse Main Flow Audit (documentation-only)

## 1) Scope and method

This audit inspects only existing implementation in:

- `frontend_prototype/` (browser prototype pages, flow helpers, and prototype tests)
- `backend/` (FastAPI routes, schemas, in-memory domain state, and backend tests)

No runtime behavior changes were made.

---

## 2) End-to-end warehouse main flow mapping

Legend:

- **Connected**: prototype calls backend `/api/v1` route(s) for this step.
- **Backend-supported, partial UI wiring**: backend supports it, but prototype appears mixed/manual/aggregated.
- **Prototype/aggregation heavy**: mostly computed in prototype UI modules, not a dedicated backend workflow endpoint.

| Main-flow step | Frontend prototype implementation | Backend routes + schemas | Connection verdict |
|---|---|---|---|
| China source bale input | `4.2 中方来源 Bale 录入` page in `frontend_prototype/index.html`; import preview + row builder logic in `frontend_prototype/app.js`; receipt print helper in `frontend_prototype/china-source-receipt-sheet-flow.js`. | `POST /china-source/import-preview`; `POST /warehouse/china-sources`; schema models in `backend/app/schemas/sorting.py` (`ChinaSource*`). | **Connected** (create/import). |
| China source list / cost fill | `4.3 中方来源列表 / 补填成本` page and load/edit controls in `frontend_prototype/index.html` + `frontend_prototype/app.js`. | `GET /warehouse/china-sources`; `PUT /warehouse/china-sources/{source_pool_token}/cost`; schemas in `sorting.py` (`ChinaSourceCostEntries`). | **Connected** (list + cost update). |
| shipment / customs master | `0. 运输 / 关单主档` page (`inboundShipmentForm`) and workflow hints in `frontend_prototype/index.html` + `frontend_prototype/app.js`. | `POST /warehouse/inbound-shipments`; `GET /warehouse/inbound-shipments`; schema `InboundShipmentCreate/Response` in `sorting.py`. | **Connected**. |
| parcel inbound | `0. 包裹入库` page (`parcelBatchForm`) with inline supplier/category helpers in `frontend_prototype/index.html` + `frontend_prototype/app.js`. | `POST /warehouse/parcel-batches`; `GET /warehouse/parcel-batches`; schema `ParcelBatchCreate/Response`. | **Connected**. |
| total confirmation / discrepancy check | `0. 集装箱服装入库（总确认）` page (`shipmentIntakeConfirmForm`) in prototype. | `POST /warehouse/inbound-shipments/{shipment_no}/confirm-intake`. Transfer-side discrepancy APIs exist separately (`/transfers/.../receive`, `/transfers/.../discrepancy-approval`) and are not the same inbound step. | **Connected for intake confirm**, but **discrepancy semantics are split** between inbound confirm and transfer receiving flow. |
| warehouse_in barcode / print confirmation | `0.1 条码 / 打印确认` page (`baleBarcodeViewForm`, print queue controls) and template code `warehouse_in` in prototype. | `POST /warehouse/inbound-shipments/{shipment_no}/generate-bale-barcodes`; `GET /warehouse/bale-barcodes`; `POST /warehouse/bale-barcodes/print-jobs`; `BaleBarcodeResponse` schema. | **Connected**. |
| raw bale stock | `0.1 原始 Bale 总库存` page + stock summary helpers in `frontend_prototype/raw-bale-stock-flow.js` and `app.js`. | `GET /warehouse/raw-bales`; route-to-sorting and route-to-bale-sales-pool endpoints; schema `RawBaleStockResponse`. | **Connected**. |
| sorting task creation | `0.1 创建分拣任务` page and scanner/lookup helper in `frontend_prototype/sorting-task-flow.js` + `app.js`. | `POST /warehouse/sorting-tasks`; `GET /warehouse/sorting-tasks`; schema `SortingTaskCreate/Response`. | **Connected**. |
| sorting task management | `0.1.1 分拣任务管理` page in prototype plus grouped manager summary logic. | `GET /warehouse/sorting-tasks` (+ indirectly raw bales and stock for aggregated manager views). | **Connected**, with **frontend-heavy aggregation**. |
| sorting confirmation / cost lock | `0.2 分拣确认入库` page (`sortingResultForm`) includes loss fields and cost status display logic in `app.js`. | `POST /warehouse/sorting-tasks/{task_no}/results`; schemas include `cost_model_code`, `cost_locked_at` on task/stock/token responses. | **Connected** (cost lock happens in backend submit). |
| sorted stock | `0.3 分拣库存` page and derived compression grouping in `frontend_prototype/sorting-stock-flow.js`. | `GET /warehouse/sorting-stock`; `PATCH /warehouse/sorting-stock/rack`; schema `SortingStockResponse`. | **Connected**, with **prototype-side grouping/summary presentation**. |
| compression tasks | `0.1.2 压缩工单管理` UI and compression group creator/acceptance modal behavior in `app.js` + `sorting-stock-flow.js`. | `POST /warehouse/store-prep-bale-tasks`; `GET /warehouse/store-prep-bale-tasks`; `POST /warehouse/store-prep-bale-tasks/{task_no}/complete`; schema `StorePrepBaleTask*`. | **Connected**. |
| waiting-store bale | surfaced in compression/warehouse execution pages; status copy includes `waiting_store_dispatch` in prototype. | `GET /warehouse/store-prep-bales`; `GET/POST /stores/dispatch-bales...`; backend task completion emits waiting-store statuses and dispatch bale entities. | **Connected**. |
| waiting-sale bale | shown as sale-type packed outcome in sorting/compression and `Bales销售｜待售包裹` navigation context. | same store-prep task APIs with `task_type: sale`; backend emits `waiting_bale_sale`; downstream sale list handled in bale-sales candidate/order APIs. | **Backend-supported, partial UI wiring** (flow spans compression + bale-sales pages, not a single explicit “waiting-sale” board endpoint). |

---

## 3) Which parts are actually wired to `/api/v1`

### Clearly wired

Prototype `request(...)` calls include (warehouse-main-flow relevant):

- `/china-source/import-preview`
- `/warehouse/china-sources`
- `/warehouse/inbound-shipments`
- `/warehouse/parcel-batches`
- `/warehouse/bale-barcodes`
- `/warehouse/bale-barcodes/print-jobs`
- `/warehouse/raw-bales`
- `/warehouse/sorting-tasks`
- `/warehouse/sorting-stock`
- `/warehouse/sorting-stock/rack`
- `/warehouse/store-prep-bale-tasks`
- `/warehouse/store-prep-bales`
- `/stores/dispatch-bales`
- `/system/generate-warehouse-mainflow-demo` (demo generator)

Also, when opened from backend-mounted `/app/`, prototype defaults to same-origin `/api/v1`.

### Mixed / aggregation-heavy sections

- Task-manager, raw-bale summary, and sorting-stock compression views do substantial in-browser grouping/filtering and status aggregation.
- These are functionally connected but rely on frontend interpretation of backend rows rather than dedicated backend “dashboard summary” endpoints.

### Prototype-only or mock-heavy indicators

- `warehouse-mainflow-demo-flow.js` primarily builds summary cards/templates and does not itself perform business writes.
- Several prototype tests validate HTML presence, labels, and helper transformations rather than end-to-end API behavior.
- Compression/task display sections rely on local grouping modules (`sorting-stock-flow.js`, `sorting-task-flow.js`) that can drift from backend rule changes unless contract tests are maintained.

---

## 4) Backend route + schema support summary (warehouse-main-flow core)

### Route surface (core)

- China source: import preview, create/list, cost update.
- Inbound: create/list inbound shipments, create/list parcel batches, confirm intake, generate/list bale barcodes, queue print jobs.
- Raw bale: list + route to sorting / route to bale sales pool.
- Sorting: create/list tasks, submit task results, list stock, update rack.
- Compression/store-prep: create/list/complete prep bale tasks, list prepared bales.
- Dispatch continuity: list/assign/accept dispatch bales + list tokens.

### Schema support (core)

`backend/app/schemas/sorting.py` includes the full object graph needed for the flow:

- China source lines + route cost entries.
- Inbound shipment and parcel batch models.
- Raw bale fields for routing and status.
- Sorting task/result + cost lock fields (`cost_model_code`, `cost_locked_at`).
- Sorting stock and store-prep bale/task models.
- Demo response models for one-click warehouse/replenishment demos.

---

## 5) Test coverage relevant to warehouse main flow

### Backend tests (high signal)

- `backend/tests/test_main_sorting_flow_state.py`
  - Covers china-source roundtrip and cost updates.
  - Covers inbound shipment + parcel + intake confirm + barcode generation.
  - Covers raw bale routing (sorting vs bale-sales pool).
  - Covers sorting task creation and result submit/cost behavior.
  - Covers compression/store-prep task lifecycle, FIFO cost consumption, grade split behavior, and waiting-store statuses.
- `backend/tests/test_china_source_import_routes.py`
  - Covers china-source import template parsing compatibility.

### Frontend prototype tests (moderate signal)

- `frontend_prototype/tests/inbound-shipment-form.test.cjs`
  - Verifies key inbound field wiring in HTML (datetime-local unload date).
- `frontend_prototype/tests/raw-bale-stock-flow.test.cjs`
  - Verifies raw-bale summary/timeline and eligibility logic.
- `frontend_prototype/tests/sorting-task-flow.test.cjs`
  - Verifies search/add/scanner diagnostics and task manager bucketing logic.
- `frontend_prototype/tests/sorting-stock-flow.test.cjs`
  - Verifies sorting stock summary/compression grouping, including packed waiting-store/sale display semantics.
- `frontend_prototype/tests/china-source-receipt-sheet-flow.test.cjs`
  - Verifies china-source print sheet rendering expectations.
- `frontend_prototype/tests/warehouse-mainflow-demo-flow.test.cjs`
  - Verifies demo template/summary behavior and entry-point presence.

### Coverage gap note

Most frontend tests are unit/static checks and do not validate a full UI-to-API happy path with auth/session + sequential warehouse actions.

---

## 6) Biggest current risks

1. **Frontend aggregation drift risk**  
   The prototype computes key grouped views (task manager/compression/raw summary) in JS helpers; backend status/rule changes can silently desync UX interpretation.

2. **Step boundary ambiguity risk (intake discrepancy vs transfer discrepancy)**  
   “Discrepancy check” exists in both inbound-confirm context and transfer receiving context; without explicit UX language, operators may misapply the wrong discrepancy process.

3. **Waiting-sale visibility risk**  
   Backend supports `task_type: sale` and `waiting_bale_sale`, but this is spread across compression + bale-sales areas; no single explicit “waiting-sale bale board” contract is obvious.

4. **End-to-end regression risk**  
   Core backend behavior is well tested, but prototype-level API integration journeys are not comprehensively automated.

5. **Demo-mode confusion risk**  
   One-click demo generators are useful but can blur distinction between operational data and seeded demo scenarios if environment labeling is weak.

---

## 7) Safest next implementation task (recommended)

**Recommended next safe task:** add a **documentation-backed contract test matrix** (no behavior change) for warehouse main flow API statuses and transitions, then align prototype labels to those exact backend statuses.

Why this is safest:

- It does not change business logic/routes/components first.
- It reduces frontend/backed drift immediately.
- It clarifies ambiguous statuses (`waiting_store_dispatch`, `waiting_bale_sale`, discrepancy states) before new feature expansion.

Concrete minimal scope for that next task:

1. Add a doc table of canonical statuses + allowed transitions for each step.  
2. Add backend tests for any transition not yet explicitly asserted.  
3. Add prototype-only assertions that displayed badges/labels map 1:1 to canonical statuses.

---

## 8) Non-developer verification steps (clickable)

1. Open prototype `/app/` and login with demo account.
2. In warehouse pages, run this sequence:
   - `4.2` create/import china source line(s)
   - `4.3` verify list and save cost entries
   - `0` create inbound shipment master
   - `0` create parcel batch row(s)
   - `0` confirm intake
   - `0.1` generate + print barcode jobs
   - `0.1` verify raw bale stock changes
   - `0.1` create sorting task
   - `0.2` submit sorting result
   - `0.3` verify sorted stock row appears
   - `0.1.2` create/complete compression task
   - check waiting-store/waiting-sale outcomes in execution/sales areas
3. Confirm each step returns a visible Chinese summary card and matching list updates.

This verification is designed for operations users without reading code.


const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  buildTransferDemandLines,
  buildTransferPreparationPlan,
  buildLoosePackingTasks,
  buildLoosePickSheetLabel,
  buildLoosePickSheetDirectPrintPayload,
  buildTransferDispatchRows,
  buildTransferDispatchResultDisplayRows,
  interpretTransferExecutionError,
  registerPreparedBaleScan,
  resolveTransferPlanningRows,
  summarizeTransferExecutionReadiness,
  updateLoosePackingTaskStatus,
  normalizeTransferForOperationsFulfillment,
  summarizeOperationsFulfillment,
} = require("../operations-fulfillment-flow.js");

const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const appJs = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const recommendationSectionHtml = (indexHtml.match(/<form id="recommendationForm"[\s\S]*?<pre id="recommendationOutput" class="output hidden-output"><\/pre>/) || [""])[0];
const warehouseNavSectionJs = (appJs.match(/const WAREHOUSE_NAV_SECTIONS = \[[\s\S]*?\n\];/) || [""])[0];
const warehousePanelMetaJs = (appJs.match(/const WAREHOUSE_PANEL_NAV_META = \[[\s\S]*?\n\];/) || [""])[0];
const operationsPanelMetaJs = (appJs.match(/const OPERATIONS_PANEL_NAV_META = \[[\s\S]*?\n\];/) || [""])[0];

test("buildTransferDemandLines groups recommendation rows by category and sums requested qty", () => {
  const result = buildTransferDemandLines([
    { barcode: "OPS-001", category_main: "pants", category_sub: "jeans pant", suggested_qty: 2 },
    { barcode: "OPS-002", category_main: "pants", category_sub: "jeans pant", suggested_qty: 3 },
    { barcode: "OPS-003", category_main: "tops", category_sub: "lady tops", suggested_qty: 1 },
  ]);

  assert.deepEqual(result, [
    {
      category_main: "pants",
      category_sub: "jeans pant",
      requested_qty: 5,
      source_count: 2,
    },
    {
      category_main: "tops",
      category_sub: "lady tops",
      requested_qty: 1,
      source_count: 1,
    },
  ]);
});

test("buildTransferPreparationPlan prefers waiting-store-dispatch bales before loose stock repacking", () => {
  const plan = buildTransferPreparationPlan({
    demandLines: [
      { category_main: "dress", category_sub: "2 pieces", requested_qty: 120 },
      { category_main: "tops", category_sub: "lady tops", requested_qty: 260 },
    ],
    preparedBales: [
      {
        bale_no: "SPB-001",
        bale_barcode: "SPB-BC-001",
        task_type: "store_dispatch",
        status: "waiting_store_dispatch",
        category_main: "dress",
        category_sub: "2 pieces",
        qty: 100,
        rack_code: "SP-01",
      },
      {
        bale_no: "SPB-002",
        bale_barcode: "SPB-BC-002",
        task_type: "sale",
        status: "waiting_for_sale",
        category_main: "dress",
        category_sub: "2 pieces",
        qty: 100,
      },
      {
        bale_no: "SPB-003",
        bale_barcode: "SPB-BC-003",
        task_type: "store_dispatch",
        status: "waiting_store_dispatch",
        category_main: "tops",
        category_sub: "lady tops",
        qty: 100,
        rack_code: "SP-02",
      },
    ],
    looseRows: [
      { category_name: "dress / 2 pieces", grade: "P", rack_code: "A-DR-2P-P-01", qty_on_hand: 40 },
      { category_name: "dress / 2 pieces", grade: "S", rack_code: "A-DR-2P-S-01", qty_on_hand: 30 },
      { category_name: "tops / lady tops", grade: "P", rack_code: "A-TS-LT-P-01", qty_on_hand: 220 },
      { category_name: "tops / lady tops", grade: "S", rack_code: "A-TS-LT-S-01", qty_on_hand: 40 },
    ],
    looseBaleTargetQty: 200,
  });

  assert.equal(plan.summary.selectedPreparedBaleCount, 2);
  assert.equal(plan.summary.plannedLooseBaleCount, 2);
  assert.equal(plan.summary.totalFinalDispatchBaleCount, 3);
  assert.equal(plan.finalDispatchRows.filter((row) => row.finalType === "loose_pick_sheet_dispatch").length, 1);
  assert.equal(plan.summary.shortageQty, 0);
  assert.deepEqual(
    plan.categoryCards.map((row) => ({
      categorySub: row.categorySub,
      preparedQty: row.preparedQty,
      looseQtyNeeded: row.looseQtyNeeded,
      looseBales: row.plannedLooseBales.map((bale) => bale.qty),
      mode: row.planMode,
    })),
    [
      {
        categorySub: "2 pieces",
        preparedQty: 100,
        looseQtyNeeded: 20,
        looseBales: [20],
        mode: "mixed",
      },
      {
        categorySub: "lady tops",
        preparedQty: 100,
        looseQtyNeeded: 160,
        looseBales: [160],
        mode: "mixed",
      },
    ],
  );
});

test("interpretTransferExecutionError explains why transfer locking still shows available zero", () => {
  const result = interpretTransferExecutionError(
    "Insufficient warehouse stock for dress / 2 pieces: requested 120, available 0",
  );

  assert.equal(result.type, "warehouse_shortage");
  assert.equal(result.subject, "dress / 2 pieces");
  assert.equal(result.requestedQty, 120);
  assert.equal(result.availableQty, 0);
  assert.match(result.heading, /还不能正式锁库存/);
  assert.match(result.detail, /待送店包裹和散货补差/);
});

test("loose packing task is one barcode pick sheet and print stays blocked until it is packed", () => {
  const plan = buildTransferPreparationPlan({
    demandLines: [
      { category_main: "dress", category_sub: "2 pieces", requested_qty: 120 },
      { category_main: "tops", category_sub: "lady tops", requested_qty: 260 },
    ],
    preparedBales: [
      {
        bale_no: "SPB-001",
        bale_barcode: "SPB-BC-001",
        task_type: "store_dispatch",
        status: "waiting_store_dispatch",
        category_main: "dress",
        category_sub: "2 pieces",
        qty: 100,
        rack_code: "SP-01",
      },
      {
        bale_no: "SPB-003",
        bale_barcode: "SPB-BC-003",
        task_type: "store_dispatch",
        status: "waiting_store_dispatch",
        category_main: "tops",
        category_sub: "lady tops",
        qty: 100,
        rack_code: "SP-02",
      },
    ],
    looseRows: [
      { category_name: "dress / 2 pieces", grade: "P", rack_code: "A-DR-2P-P-01", qty_on_hand: 40 },
      { category_name: "tops / lady tops", grade: "P", rack_code: "A-TS-LT-P-01", qty_on_hand: 220 },
    ],
    looseBaleTargetQty: 200,
  });

  const tasks = buildLoosePackingTasks({
    transferNo: "TO-20260423-003",
    plan,
    now: "2026-04-24T10:00:00Z",
    packageLimitQty: 50,
  });
  assert.equal(tasks.length, 1);
  assert.match(tasks[0].taskNo, /^LPK-TO20260423003-PICK$/);
  assert.match(tasks[0].taskBarcode, /^LPKTO20260423003PICK$/);
  assert.equal(tasks[0].totalQty, 180);
  assert.equal(tasks[0].packageLimitQty, 50);
  assert.equal(tasks[0].plannedPackageCount, 4);
  assert.equal(tasks[0].lines.length, 2);
  assert.equal(tasks[0].status, "pending_pick");

  const beforeReady = summarizeTransferExecutionReadiness({
    plan,
    foundPreparedBarcodes: [],
    looseTasks: tasks,
  });
  assert.equal(beforeReady.canPrint, false);
  assert.equal(beforeReady.pendingPreparedCount, 2);
  assert.equal(beforeReady.requiredLooseTaskCount, 1);
  assert.equal(beforeReady.pendingLooseTaskCount, 1);

  const foundOne = registerPreparedBaleScan({
    plan,
    foundPreparedBarcodes: [],
    barcode: "SPB-BC-001",
  });
  assert.equal(foundOne.ok, true);
  assert.equal(foundOne.duplicate, false);

  const foundTwo = registerPreparedBaleScan({
    plan,
    foundPreparedBarcodes: foundOne.foundPreparedBarcodes,
    barcode: "SPB-BC-003",
  });
  const progressedTasks = updateLoosePackingTaskStatus({ tasks, taskNo: tasks[0].taskNo, nextStatus: "packed" });

  const afterReady = summarizeTransferExecutionReadiness({
    plan,
    foundPreparedBarcodes: foundTwo.foundPreparedBarcodes,
    looseTasks: progressedTasks,
  });
  assert.equal(afterReady.canPrint, true);
  assert.equal(afterReady.pendingPreparedCount, 0);
  assert.equal(afterReady.pendingLooseTaskCount, 0);
});

test("loose pick sheet label uses a dedicated 60x40 Code128 template", () => {
  const task = buildLoosePackingTasks({
    transferNo: "TO-20260423-003",
    plan: {
      loosePickRows: [
        {
          categoryMain: "dress",
          categorySub: "2 pieces",
          qty: 50,
          rackCodes: ["A-DR-2P-P-01"],
        },
        {
          categoryMain: "tops",
          categorySub: "lady tops",
          qty: 5,
          rackCodes: ["A-TS-LT-P-01", "A-TS-LT-S-01"],
        },
      ],
    },
    packageLimitQty: 200,
    now: "2026-04-24T10:00:00Z",
  })[0];

  const label = buildLoosePickSheetLabel({
    task,
    transfer: { to_store_code: "UTAWALA" },
    storeName: "Umoja Store",
  });

  assert.equal(label.templateCode, "store_loose_pick_60x40");
  assert.equal(label.templateName, "门店补差拣货单 60x40");
  assert.equal(label.paperPreset, "60x40");
  assert.equal(label.barcodeType, "Code128");
  assert.equal(label.storeName, "Umoja Store");
  assert.equal(label.categoryLabel, "服装");
  assert.equal(label.pickQty, 55);
  assert.equal(label.barcodeValue, "LPKTO20260423003PICK");
});

test("loose pick sheet prints through warehouseout template payload instead of browser window", () => {
  const task = buildLoosePackingTasks({
    transferNo: "TO-20260423-003",
    plan: {
      loosePickRows: [
        {
          categoryMain: "dress",
          categorySub: "2 pieces",
          qty: 50,
          rackCodes: ["A-DR-2P-P-01"],
        },
        {
          categoryMain: "tops",
          categorySub: "lady tops",
          qty: 5,
          rackCodes: ["A-TS-LT-P-01", "A-TS-LT-S-01"],
        },
      ],
    },
    packageLimitQty: 200,
    now: "2026-04-24T10:00:00Z",
  })[0];

  const payload = buildLoosePickSheetDirectPrintPayload({
    task,
    transfer: { transfer_no: "TO-20260423-003", to_store_code: "UTAWALA" },
    storeName: "Umoja Store",
    printerName: "Deli DL-720C",
  });

  assert.equal(payload.printer_name, "Deli DL-720C");
  assert.equal(payload.template_code, "store_loose_pick_60x40");
  assert.equal(payload.template_scope, "warehouseout_bale");
  assert.equal(payload.status, "Umoja Store - 服装");
  assert.equal(payload.cat, "PICK SHEET");
  assert.equal(payload.sub, "LOOSE GAP");
  assert.equal(payload.qty, "55");
  assert.equal(payload.code, "LPKTO20260423003PICK");
  assert.equal(payload.dispatch_bale_no, "LPKTO20260423003PICK");
  assert.equal(payload.transfer_order_no, "TO-20260423-003");
  assert.match(payload.packing_list, /dress \/ 2 pieces · 50 件/);
  assert.match(payload.packing_list, /tops \/ lady tops · 5 件/);
  assert.doesNotMatch(payload.packing_list, /A-DR-2P-P-01|A-TS-LT-P-01|A-TS-LT-S-01/);
  assert.equal(payload.copies, 1);
});

test("final dispatch rows collapse loose gaps into one pick-sheet source row", () => {
  const plan = buildTransferPreparationPlan({
    demandLines: [
      { category_main: "dress", category_sub: "2 pieces", requested_qty: 105 },
      { category_main: "tops", category_sub: "lady tops", requested_qty: 105 },
    ],
    preparedBales: [
      {
        bale_no: "SPB-001",
        bale_barcode: "WB260423000001",
        task_type: "store_dispatch",
        status: "waiting_store_dispatch",
        category_main: "dress",
        category_sub: "2 pieces",
        qty: 100,
      },
      {
        bale_no: "SPB-002",
        bale_barcode: "WB260423000002",
        task_type: "store_dispatch",
        status: "waiting_store_dispatch",
        category_main: "tops",
        category_sub: "lady tops",
        qty: 100,
      },
    ],
    looseRows: [
      { category_name: "dress / 2 pieces", rack_code: "A-DR-2P-P-01", qty_on_hand: 20 },
      { category_name: "tops / lady tops", rack_code: "A-TS-LT-P-01", qty_on_hand: 20 },
    ],
  });
  const looseTasks = buildLoosePackingTasks({ transferNo: "TO-20260423-003", plan, packageLimitQty: 200 });

  const rows = buildTransferDispatchRows({ plan, looseTasks });

  assert.equal(rows.length, 3);
  assert.equal(rows.filter((row) => row.finalType === "loose_pick_sheet_dispatch").length, 1);
  const looseRow = rows.find((row) => row.finalType === "loose_pick_sheet_dispatch");
  assert.equal(looseRow.qty, 10);
  assert.equal(looseRow.baleBarcode, "LPKTO20260423003PICK");
  assert.match(looseRow.finalLabel, /补差拣货单/);
  assert.equal(looseRow.categoryMain, "多类目补差");
});

test("transfer dispatch result display collapses category loose bales into one pick-sheet source bale", () => {
  const plan = buildTransferPreparationPlan({
    demandLines: [
      { category_main: "dress", category_sub: "2 pieces", requested_qty: 5 },
      { category_main: "tops", category_sub: "lady tops", requested_qty: 5 },
    ],
    preparedBales: [],
    looseRows: [
      { category_name: "dress / 2 pieces", rack_code: "A-DR-2P-P-01", qty_on_hand: 20 },
      { category_name: "tops / lady tops", rack_code: "A-TS-LT-P-01", qty_on_hand: 20 },
    ],
  });
  const looseTasks = buildLoosePackingTasks({ transferNo: "TO-20260423-003", plan, packageLimitQty: 200 });
  const rows = buildTransferDispatchResultDisplayRows({
    result: {
      store_dispatch_bales: [
        { bale_no: "SDB-001", category_summary: "dress / 2 pieces", item_count: 5, status: "ready_dispatch", store_code: "UTAWALA" },
        { bale_no: "SDB-002", category_summary: "tops / lady tops", item_count: 5, status: "ready_dispatch", store_code: "UTAWALA" },
      ],
    },
    plan,
    looseTasks,
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].bale_no, "LPK-TO20260423003-PICK");
  assert.equal(rows[0].category_summary, "多类目补差 · 2 个类目");
  assert.equal(rows[0].item_count, 10);
  assert.deepEqual(rows[0].source_bales, ["LPKTO20260423003PICK"]);
  assert.equal(rows[0].source_type, "loose_pick_sheet");
});

test("transfer dispatch display uses backend dispatch bale numbers and keeps source bales separate", () => {
  const plan = buildTransferPreparationPlan({
    demandLines: [
      { category_main: "pants", category_sub: "cargo pant", requested_qty: 120 },
      { category_main: "pants", category_sub: "jeans pant", requested_qty: 120 },
    ],
    preparedBales: [
      {
        bale_no: "SPB-043",
        bale_barcode: "WB260423000043",
        task_type: "store_dispatch",
        status: "waiting_store_dispatch",
        category_main: "pants",
        category_sub: "cargo pant",
        qty: 100,
      },
      {
        bale_no: "SPB-049",
        bale_barcode: "WB260423000049",
        task_type: "store_dispatch",
        status: "waiting_store_dispatch",
        category_main: "pants",
        category_sub: "jeans pant",
        qty: 100,
      },
    ],
    looseRows: [],
  });
  const rows = buildTransferDispatchResultDisplayRows({
    result: {
      store_dispatch_bales: [
        { bale_no: "SDB260425001", category_summary: "pants / cargo pant", item_count: 100, store_code: "UTAWALA" },
        { bale_no: "SDB260425002", category_summary: "pants / jeans pant", item_count: 100, store_code: "UTAWALA" },
      ],
    },
    plan,
    looseTasks: [],
  });

  assert.equal(rows.length, 2);
  assert.equal(rows[0].bale_no, "SDB260425001");
  assert.deepEqual(rows[0].source_bales, ["WB260423000043"]);
  assert.equal(rows[0].package_index, 1);
  assert.equal(rows[0].package_count, 2);
  assert.equal(rows[1].bale_no, "SDB260425002");
  assert.deepEqual(rows[1].source_bales, ["WB260423000049"]);
  assert.equal(rows[1].package_index, 2);
  assert.equal(rows[1].package_count, 2);
});

test("transfer planning rows fall back to cached category demand when backend order has empty lines", () => {
  const rows = resolveTransferPlanningRows({
    transfer: {
      transfer_no: "TO-20260423-003",
      demand_lines: [],
      items: [],
    },
    cachedDemandLines: [
      { category_main: "dress", category_sub: "2 pieces", requested_qty: 105 },
      { category_main: "tops", category_sub: "lady tops", requested_qty: 105 },
    ],
    fallbackDraftRows: [
      { category_main: "shoes", category_sub: "sneakers", requested_qty: 5 },
    ],
  });

  assert.deepEqual(rows, [
    { category_main: "dress", category_sub: "2 pieces", requested_qty: 105, source_count: 1 },
    { category_main: "tops", category_sub: "lady tops", requested_qty: 105, source_count: 1 },
  ]);
});

test("prepared bales are not over-picked just to cover a small loose gap", () => {
  const plan = buildTransferPreparationPlan({
    demandLines: [
      { category_main: "dress", category_sub: "2 pieces", requested_qty: 105 },
    ],
    preparedBales: [
      {
        bale_no: "SPB-001",
        bale_barcode: "SPB-BC-001",
        task_type: "store_dispatch",
        category_main: "dress",
        category_sub: "2 pieces",
        qty: 100,
      },
      {
        bale_no: "SPB-002",
        bale_barcode: "SPB-BC-002",
        task_type: "store_dispatch",
        category_main: "dress",
        category_sub: "2 pieces",
        qty: 100,
      },
    ],
    looseRows: [
      { category_name: "dress / 2 pieces", grade: "P", rack_code: "A-DR-2P-P-01", qty_on_hand: 640 },
    ],
    looseBaleTargetQty: 200,
  });

  assert.equal(plan.summary.selectedPreparedBaleCount, 1);
  assert.equal(plan.summary.selectedPreparedQty, 100);
  assert.equal(plan.summary.looseQtyToPick, 5);
  assert.equal(plan.summary.plannedLooseBaleCount, 1);
  assert.equal(plan.loosePickRows[0].qty, 5);
});

test("normalizeTransferForOperationsFulfillment maps submitted transfer and empty receipt state", () => {
  const result = normalizeTransferForOperationsFulfillment({
    transfer_no: "TO-20260423-001",
    from_warehouse_code: "WH1",
    to_store_code: "UTAWALA",
    status: "submitted",
    approval_status: "pending",
    delivery_batch_no: "",
    shipment_session_no: "",
    store_receipt_status: "not_started",
    dispatch_bale_count: 0,
    accepted_dispatch_bale_count: 0,
    completed_dispatch_bale_count: 0,
    items: [{ barcode: "OPS-FLOW-001", requested_qty: 4 }],
  }, []);

  assert.equal(result.lifecycle_status, "submitted");
  assert.equal(result.lifecycle_label, "已提交待审核");
  assert.equal(result.store_receipt_status, "not_started");
  assert.equal(result.store_receipt_label, "门店未签收");
  assert.equal(result.delivery_batch.delivery_batch_no, "");
});

test("summarizeOperationsFulfillment groups packed, shipped, and received transfer counts", () => {
  const rows = [
    normalizeTransferForOperationsFulfillment({
      transfer_no: "TO-001",
      status: "packed",
      approval_status: "approved",
      store_receipt_status: "not_started",
      delivery_batch_no: "DB-001",
      shipment_session_no: "",
      dispatch_bale_count: 2,
      accepted_dispatch_bale_count: 0,
      completed_dispatch_bale_count: 0,
      items: [{ barcode: "A", requested_qty: 4 }],
    }, [{ bale_no: "SDB-001", status: "labelled" }, { bale_no: "SDB-002", status: "labelled" }]),
    normalizeTransferForOperationsFulfillment({
      transfer_no: "TO-002",
      status: "shipped",
      approval_status: "approved",
      store_receipt_status: "pending_receipt",
      delivery_batch_no: "DB-002",
      shipment_session_no: "SHIP-002",
      dispatch_bale_count: 1,
      accepted_dispatch_bale_count: 0,
      completed_dispatch_bale_count: 0,
      items: [{ barcode: "B", requested_qty: 2 }],
    }, [{ bale_no: "SDB-003", status: "in_transit" }]),
    normalizeTransferForOperationsFulfillment({
      transfer_no: "TO-003",
      status: "received",
      approval_status: "approved",
      store_receipt_status: "received",
      delivery_batch_no: "DB-003",
      shipment_session_no: "SHIP-003",
      dispatch_bale_count: 1,
      accepted_dispatch_bale_count: 1,
      completed_dispatch_bale_count: 0,
      items: [{ barcode: "C", requested_qty: 2 }],
    }, [{ bale_no: "SDB-004", status: "received" }]),
  ];

  const summary = summarizeOperationsFulfillment(rows);

  assert.equal(summary.transfer_count, 3);
  assert.equal(summary.packed_count, 1);
  assert.equal(summary.shipped_count, 1);
  assert.equal(summary.received_count, 1);
  assert.equal(summary.pending_receipt_count, 1);
  assert.equal(summary.total_dispatch_bales, 4);
});

test("recommendation page removes manual category filters and suggestion-count inputs for sell-through replenishment", () => {
  assert.equal(Boolean(recommendationSectionHtml), true);
  assert.doesNotMatch(recommendationSectionHtml, /name="preferred_categories"/);
  assert.doesNotMatch(recommendationSectionHtml, /name="max_suggestions"/);
});

test("recommendation and transfer copy use draft plus transfer wording without a confirm-transfer button on page 4", () => {
  assert.match(recommendationSectionHtml, />全部加入调拨草稿</);
  assert.doesNotMatch(recommendationSectionHtml, /recommendationGoTransferButton/);
  assert.doesNotMatch(recommendationSectionHtml, />去确认补货单</);
  assert.doesNotMatch(recommendationSectionHtml, />去确认门店调拨单</);
  assert.match(indexHtml, /<h3>补货需求草稿<\/h3>/);
  assert.match(indexHtml, />手动生成补货申请</);
  assert.doesNotMatch(indexHtml, /门店补货需求单/);
  assert.doesNotMatch(indexHtml, /这里完成补货单审核/);
  assert.doesNotMatch(appJs, /填写补货单号；创建补货单后会自动带出。/);
  assert.doesNotMatch(appJs, /这里会显示补货单审核、仓库配货/);
  assert.doesNotMatch(appJs, /先创建并审核补货单，这里再读取最近补货单/);
  assert.doesNotMatch(appJs, /recommendationGoTransferButton/);
});

test("transfer drafting and warehouse execution pages use the new replenishment planning workbench structure", () => {
  assert.match(indexHtml, /<h2>门店补货流程页<\/h2>/);
  assert.match(indexHtml, /<h2>4\.1 手动补货需求 \/ Manual replenishment request<\/h2>/);
  assert.match(indexHtml, />手动生成补货申请/);
  assert.match(indexHtml, /手动补货需求只定义门店需要补什么/);
  assert.doesNotMatch(indexHtml, />一键生成配货任务</);
  assert.match(appJs, /function canAttachSubCategoryToMain/);
  assert.match(appJs, /function appendCategoryPairToTree/);
  assert.match(appJs, /appendCategoryPairToTree\(merged, line\?\.category_main, line\?\.category_sub\)/);
  assert.match(appJs, /function resetBuilderCategorySubIfNeeded/);
  assert.match(appJs, /function getFirstUnusedSubCategoryForRows/);
  assert.match(appJs, /function autoFillTransferCategorySub/);
  assert.match(appJs, /function handleJsonBuilderInputEvent/);
  assert.match(appJs, /document\.addEventListener\("change", handleJsonBuilderInputEvent\)/);
  assert.match(appJs, /builderId === "transfer-items"[\s\S]*?fieldKey === "category_main"[\s\S]*?autoFillTransferCategorySub/);
  assert.match(appJs, /builderId === "transfer-items"[\s\S]*?lastRowWithCategory[\s\S]*?autoFillTransferCategorySub\(rows, rows\.length - 1\)/);
  assert.match(appJs, /builderId === "transfer-items"[\s\S]*?setJsonBuilderRows\(builderId, rows\)/);
  assert.match(indexHtml, /<h2>5\.1 补差打包工单<\/h2>/);
  assert.match(indexHtml, />生成补差拣货单 barcode</);
  assert.match(indexHtml, /name="package_limit_qty"/);
  assert.match(indexHtml, /小于 50 件/);
  assert.match(indexHtml, /小于 100 件/);
  assert.match(indexHtml, /小于 200 件/);
  assert.match(appJs, /store_loose_pick_60x40/);
  assert.match(appJs, /发送标签机打印/);
  assert.match(appJs, /门店补差拣货单 60x40/);
  assert.match(indexHtml, /系统配货建议/);
  assert.match(indexHtml, /优先吃掉已打包待送店包裹/);
  assert.match(indexHtml, /补货需求录入/);
  assert.match(indexHtml, /备货执行总览/);
  assert.match(indexHtml, /优先现成包/);
  assert.match(indexHtml, /补差打包/);
  assert.match(indexHtml, /最终送店打印/);
  assert.match(indexHtml, />扫描确认现成包</);
  assert.doesNotMatch(indexHtml, />确认生成门店调拨单</);
  assert.match(indexHtml, /现成待送店包裹/);
  assert.doesNotMatch(indexHtml, /散货补差打包区/);
  assert.doesNotMatch(indexHtml, /送店 bale \/ 箱单打印区/);
  assert.match(indexHtml, />批量打印送店 barcode \+ 箱单</);
  assert.doesNotMatch(indexHtml, />只生成出库打印任务</);
  assert.doesNotMatch(indexHtml, />生成门店配货单 \+ 标签打印任务</);
  assert.doesNotMatch(indexHtml, /id="directHangTransferForm"/);
  assert.doesNotMatch(indexHtml, /id="directHangBundleForm"/);
  assert.doesNotMatch(indexHtml, /生成直挂门店调拨草稿/);
});

test("loose pick sheet action uses label printer direct print, not a browser print window", () => {
  assert.match(appJs, /\/print-jobs\/bale-direct\/print/);
  assert.doesNotMatch(appJs, /openLoosePickSheetLabelPrintWindow/);
  assert.doesNotMatch(appJs, /window\.open\("", "_blank", "width=420,height=360"\)/);
});

test("page 5.1 and page 6 print actions open the warehouseout template selector modal", () => {
  assert.match(appJs, /function openLoosePickSheetPrintTemplateModal/);
  assert.match(appJs, /function openTransferDispatchPrintTemplateModal/);
  assert.match(appJs, /openBalePrintModal\(\{\s*shipmentNo:[\s\S]*?templateScope:\s*"warehouseout_bale"/);
  assert.match(appJs, /data-loose-task-action="print-label"[\s\S]*?openLoosePickSheetPrintTemplateModal/);
  assert.match(appJs, /submitTransferBundle[\s\S]*?openTransferDispatchPrintTemplateModal/);
});

test("final transfer dispatch print is pinned to transtoshop and does not encode source bales", () => {
  assert.match(appJs, /function getTransferDispatchTemplateCode/);
  assert.match(appJs, /getTransferDispatchTemplateCode\(\)[\s\S]*?return "transtoshop"/);
  assert.match(appJs, /taskType:\s*"transfer_dispatch"/);
  assert.match(appJs, /allowedCodes:\s*\["transtoshop"\]/);
  assert.match(appJs, /function isWarehouseoutDispatchBarcode/);
  assert.match(appJs, /const finalBaleNo = String\([\s\S]*?row\.dispatch_bale_no[\s\S]*?row\.bale_no/);
  assert.match(appJs, /const normalizedFinal = normalizeWarehouseoutDispatchBarcode\(finalBaleNo/);
  assert.match(appJs, /const barcodeValue = isWarehouseoutDispatchBarcode\(normalizedFinal\) && !sourceSet\.has\(normalizedFinal\)/);
  assert.doesNotMatch(appJs, /String\(row\.bale_no \|\| sourceBales\[0\] \|\| row\.task_no/);
  assert.match(appJs, /package_position_label:\s*`第 \$\{packageIndex\} 包 \/ 共 \$\{packageCount\} 包`/);
});

test("warehouse dispatch tracking removes temporary store receipt writeback step", () => {
  assert.doesNotMatch(indexHtml, /id="opsDispatchReceiptForm"/);
  assert.doesNotMatch(indexHtml, /回写门店签收结果/);
  assert.doesNotMatch(appJs, /submitOpsDispatchReceiptWriteback/);
  assert.doesNotMatch(appJs, /data-dispatch-receipt-fill/);
  assert.doesNotMatch(appJs, /填入签收回写/);
});

test("transfer shipment confirmation shows a success alert after shipping", () => {
  assert.match(appJs, /async function submitTransferShipment/);
  assert.match(appJs, /submitTransferShipment[\s\S]*?alert\("发货成功"\)/);
});

test("transfer shipment form shows the target store before dispatching", () => {
  assert.match(indexHtml, /id="transferShipTargetHint"/);
  assert.match(appJs, /function renderTransferShipTargetHint/);
  assert.match(appJs, /async function loadTransferShipTargetHint/);
  assert.ok(appJs.includes("/transfers/${encodeURIComponent(normalizedTransferNo)}"));
  assert.match(appJs, /目标门店/);
  assert.match(appJs, /#transferShipForm \[name='transfer_no'\]/);
});

test("warehouseout modal print jobs without backend ids use local preview and can be batch-confirmed", () => {
  assert.match(appJs, /function isBaleModalDirectOnlyJob/);
  assert.match(appJs, /function renderDirectOnlyBaleModalPreview/);
  assert.match(appJs, /isBaleModalDirectOnlyJob\(currentJob\)[\s\S]*?frame\.srcdoc = renderDirectOnlyBaleModalPreview/);
  assert.match(appJs, /templateScope !== "bale"[\s\S]*?action: jobs\.length \? "complete_group" : "already_complete"/);
  assert.match(appJs, /isBaleModalDirectOnlyJob\(job\)[\s\S]*?throw new Error\("missing-job-id"\)/);
});

test("warehouseout modal can be closed without confirming labels as completed", () => {
  assert.match(appJs, /function getBalePrintModalCloseAction\(\)[\s\S]*?const templateScope = getActiveBaleTemplateScope\(\)/);
  assert.match(appJs, /templateScope !== "bale"[\s\S]*?action: "allow_close"/);
});

test("store replenishment panels move under warehouse workspace and out of operations primary nav", () => {
  assert.match(indexHtml, /<section class="panel" data-workspace-panel="warehouse">[\s\S]*?<h2>门店补货流程页<\/h2>/);
  assert.match(indexHtml, /<section class="panel" data-workspace-panel="warehouse">[\s\S]*?<h2>4\. 门店补货建议<\/h2>/);
  assert.match(indexHtml, /<section class="panel" data-workspace-panel="warehouse">[\s\S]*?<h2>4\.1 手动补货需求 \/ Manual replenishment request<\/h2>/);
  assert.match(indexHtml, /<section class="panel" data-workspace-panel="warehouse">[\s\S]*?<h2>5\.1 补差打包工单<\/h2>/);
  assert.match(indexHtml, /<section class="panel" data-workspace-panel="warehouse">[\s\S]*?<h2>6\. 仓库执行单 \/ 出库打印<\/h2>/);
  assert.match(indexHtml, /<section class="panel" data-workspace-panel="warehouse">[\s\S]*?<h2>6\.1 配送批次 \/ 门店收货跟踪<\/h2>/);
  assert.doesNotMatch(indexHtml, /<section class="panel" data-workspace-panel="operations">\s*<div class="panel-head">\s*<h2>4\. 门店补货建议<\/h2>/);
});

test("warehouse nav exposes 门店补货 and operations nav drops the replenishment chain", () => {
  assert.match(warehouseNavSectionJs, /title: "门店补货"/);
  assert.match(warehousePanelMetaJs, /match: "门店补货流程页"/);
  assert.match(warehousePanelMetaJs, /match: "4\. 门店补货建议"/);
  assert.match(warehousePanelMetaJs, /match: "4\.1 手动补货需求"/);
  assert.match(warehousePanelMetaJs, /match: "5\.1 补差打包工单"/);
  assert.match(warehousePanelMetaJs, /match: "6\. 仓库执行单 \/ 出库打印"/);
  assert.match(warehousePanelMetaJs, /match: "6\.1 配送批次 \/ 门店收货跟踪"/);
  assert.doesNotMatch(operationsPanelMetaJs, /4\. 门店补货建议/);
  assert.doesNotMatch(operationsPanelMetaJs, /4\.1 手动补货需求/);
  assert.doesNotMatch(operationsPanelMetaJs, /6\. 仓库执行单 \/ 出库打印/);
  assert.doesNotMatch(operationsPanelMetaJs, /6\.1 配送批次 \/ 门店收货跟踪/);
});



test("phase 2A copy clarifies step flow and request number carry for 4.1 -> 5.1", () => {
  assert.match(indexHtml, /Step 1 创建补货申请/);
  assert.match(indexHtml, /Step 2 系统配货建议/);
  assert.match(indexHtml, /Step 3 下一步动作/);
  assert.match(appJs, /补货申请单号（内部调拨单号）/);
  assert.match(appJs, /const nextActionLabel = hasLooseShortage \? "去 5\.1 生成补差打包工单" : "无需补差，去 6 仓库执行单继续";/);
});

test("phase 2A page 5.1 copy uses request number label and warehouse-only LPK guidance", () => {
  assert.match(indexHtml, /补货申请单号（来自 4\.1）/);
  assert.match(indexHtml, /例如 TO-20260428-001，可从 4\.1 补货申请单复制/);
  assert.match(indexHtml, /本页只处理该补货申请中的散货缺口。现成 SDB 待送店包不在这里处理。LPK barcode 是仓库拣货\/补差打包工单码，不是门店收货码。/);
  assert.match(appJs, /该补货申请没有散货缺口，无需生成补差打包工单。请回到 6 仓库执行单继续。/);
});

test("phase 2A copy keeps package count and piece count separated on 4.1", () => {
  assert.match(appJs, /需求：\$\{row\.requestedQty \|\| 0\} 件/);
  assert.match(appJs, /现成待送店包：\$\{escapeHtml\(row\.selectedPreparedBales\.length \|\| 0\)\} 包 \/ 覆盖 \$\{escapeHtml\(row\.preparedQty \|\| 0\)\} 件/);
  assert.match(appJs, /散货补差：\$\{escapeHtml\(row\.looseQtyNeeded \|\| 0\)\} 件/);
  assert.match(appJs, /新打补差包：\$\{escapeHtml\(row\.plannedLooseBales\.length \|\| 0\)\} 个/);
  assert.match(appJs, /最终预计送店包：\$\{escapeHtml\(row\.finalDispatchBaleCount \|\| 0\)\} 个/);
});

test("phase 2B page 6 copy clarifies approval lock semantics and warehouse-only verification", () => {
  assert.match(indexHtml, /审核配货计划并锁定库存/);
  assert.match(indexHtml, /锁定后，本单选中的 SDB 待送店包和补差包将被占用，其他补货申请不能再使用。锁定后才允许进入仓库执行核对；核对完成后可生成正式门店送货执行单 barcode。/);
  assert.match(indexHtml, /SDB 和 LPK 只用于仓库核对，不是门店收货 barcode。/);
  assert.match(indexHtml, /这是门店收货唯一可扫的送货 barcode。SDB 和 LPK 仍然只是仓库内部核对码。/);
  assert.match(indexHtml, /Lane A：现成待送店包核对/);
  assert.match(indexHtml, /扫描 SDB 只是在仓库确认本单要使用的现成待送店包，不是门店收货。/);
  assert.match(indexHtml, /Lane B：补差包核对/);
  assert.match(indexHtml, /LPK 是仓库补差拣货工单码。补差完成后形成仓库内部补差包，用于本单后续送货执行。/);
  assert.match(indexHtml, /Lane C：正式门店送货执行单/);
  assert.match(indexHtml, /生成正式门店送货执行单 barcode/);
});

test("phase 2B page 6 state labels and gating copy are visible in workbench summary", () => {
  assert.match(appJs, /<strong>配货计划<\/strong><span>\$\{escapeHtml\(planApprovalLabel\)\}<\/span>/);
  assert.match(appJs, /<strong>库存锁定<\/strong><span>\$\{escapeHtml\(inventoryLockLabel\)\}<\/span>/);
  assert.match(appJs, /<strong>现成 SDB 包<\/strong><span>\$\{escapeHtml\(readiness\.foundPreparedCount \|\| 0\)\} \/ \$\{escapeHtml\(readiness\.requiredPreparedCount \|\| 0\)\} 已核对<\/span>/);
  assert.match(appJs, /<strong>补差工单<\/strong><span>\$\{escapeHtml\(readiness\.completedLooseTaskCount \|\| 0\)\} \/ \$\{escapeHtml\(readiness\.requiredLooseTaskCount \|\| 0\)\} 已完成<\/span>/);
  assert.match(appJs, /<strong>正式送货执行码<\/strong><span>\$\{escapeHtml\(officialDeliveryCodeLabel\)\}<\/span>/);
  assert.match(appJs, /该补货申请尚未审核，不能锁定库存。请先完成主管审核。/);
  assert.match(appJs, /仓库核对尚未完成：现成待送店包 \$\{readiness\.foundPreparedCount \|\| 0\}\/\$\{readiness\.requiredPreparedCount \|\| 0\}，补差工单 \$\{readiness\.completedLooseTaskCount \|\| 0\}\/\$\{readiness\.requiredLooseTaskCount \|\| 0\}。/);
  assert.match(appJs, /仓库核对已完成。请生成正式门店送货执行单 barcode，并用于门店收货扫码。/);
  assert.doesNotMatch(indexHtml, /打印后给店长扫码验收/);
  assert.doesNotMatch(indexHtml, /SDB\/LPK can be scanned by store/i);
});

test("phase 2C page 6.1 copy clarifies shipment batch scope and barcode boundary", () => {
  assert.match(indexHtml, /6\.1 配送批次 \/ 门店收货跟踪/);
  assert.match(indexHtml, /一辆车可以同时配送多个门店。这里创建和跟踪的是配送批次，不是单个门店调拨单。配送批次可以包含多个仓库执行单，按门店站点跟踪签收状态。/);
  assert.match(indexHtml, /当前版本可先输入一个补货申请单号；后续将支持一个配送批次挂多个仓库执行单。/);
  assert.match(indexHtml, /配送批次用于运输跟踪；正式门店收货 barcode 仍应来自仓库送货执行单。SDB 和 LPK 不是门店收货 barcode。/);
  assert.match(indexHtml, /该配送批次会展示已生成的正式门店送货执行单 \/ barcode。/);
  assert.doesNotMatch(indexHtml, /SDB can be scanned by store/i);
  assert.doesNotMatch(indexHtml, /LPK can be scanned by store/i);
});

test("phase 2C page 6.1 shows required shipment-batch fields and statuses", () => {
  assert.match(indexHtml, /配送批次号 \/ shipment_batch_no/);
  assert.match(indexHtml, /司机 \/ driver/);
  assert.match(indexHtml, /车辆 \/ vehicle/);
  assert.match(indexHtml, /预计出发时间 \/ departure time/);
  assert.match(indexHtml, /路线 \/ stops/);
  assert.match(indexHtml, /关联仓库执行单 \/ linked execution orders/);
  assert.match(indexHtml, /目标门店 \/ target stores/);
  assert.match(indexHtml, /每个门店收货状态 \/ per-store receiving status/);
  assert.match(appJs, /return "待发车";/);
  assert.match(appJs, /return "运输中";/);
  assert.match(appJs, /return "部分门店已收货";/);
  assert.match(appJs, /return "全部收货完成";/);
  assert.match(appJs, /return "异常 \/ 退回";/);
});

test("phase 2C page 6.1 summary cards and per-store grouping copy are present", () => {
  assert.match(appJs, /<strong>配送批次数量<\/strong>/);
  assert.match(appJs, /<strong>待发车批次<\/strong>/);
  assert.match(appJs, /<strong>运输中批次<\/strong>/);
  assert.match(appJs, /<strong>已完成批次<\/strong>/);
  assert.match(appJs, /<strong>涉及门店数<\/strong>/);
  assert.match(appJs, /<strong>总包数<\/strong>/);
  assert.match(appJs, /<strong>待收货包数<\/strong>/);
  assert.match(appJs, /<strong>异常数<\/strong>/);
  assert.match(appJs, /<strong>配送批次：\$\{escapeHtml\(group\.shipmentBatchNo \|\| "-"\)\}<\/strong>/);
  assert.match(appJs, /<strong>门店站点：\$\{escapeHtml\(String\(row\.to_store_code \|\| "-"\)\.toUpperCase\(\) \|\| "-"\)\}<\/strong>/);
  assert.match(appJs, /当前还没有多个仓库执行单可加入同一配送批次。Phase 2C 先建立配送批次视图；正式多单绑定将在后续执行单模型完善后接入。/);
});


test("warehouse access profiles keep 门店补货 visible for admin and warehouse manager roles", () => {
  assert.match(appJs, /warehouse:\s*\["inbound", "workorder", "replenishment", "general"\]/);
  assert.match(
    appJs,
    /warehouseManagerRoles[\s\S]*?createRoleAccessProfile\(\["overview", "warehouse"\],\s*\{\s*warehouse:\s*\["inbound", "workorder", "replenishment", "general"\]/,
  );
});

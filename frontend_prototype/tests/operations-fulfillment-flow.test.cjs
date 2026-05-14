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
} = (() => {
  const filename = path.join(__dirname, "../operations-fulfillment-flow.js");
  const localModule = { exports: {} };
  Function("module", "exports", "globalThis", `${fs.readFileSync(filename, "utf8")}\n//# sourceURL=${filename}`)(
    localModule,
    localModule.exports,
    globalThis,
  );
  return localModule.exports;
})();

const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const appJs = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const stylesCss = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
const recommendationSectionHtml = (indexHtml.match(/<form id="recommendationForm"[\s\S]*?<pre id="recommendationOutput" class="output hidden-output"><\/pre>/) || [""])[0];
const warehouseNavSectionJs = (appJs.match(/const WAREHOUSE_NAV_SECTIONS = \[[\s\S]*?\n\];/) || [""])[0];
const warehousePanelMetaJs = (appJs.match(/const WAREHOUSE_PANEL_NAV_META = \[[\s\S]*?\n\];/) || [""])[0];
const operationsPanelMetaJs = (appJs.match(/const OPERATIONS_PANEL_NAV_META = \[[\s\S]*?\n\];/) || [""])[0];

function extractFunctionSource(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `missing function ${functionName}`);
  const signatureEnd = source.indexOf(") {", start);
  assert.notEqual(signatureEnd, -1, `missing function body for ${functionName}`);
  const braceStart = signatureEnd + 2;
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  throw new Error(`could not extract ${functionName}`);
}

test("submitTransfer sends explicit approval_required false for Phase A no-approval path", () => {
  assert.match(appJs, /payload\.approval_required\s*=\s*false;/);
});

test("transfer selectors use persisted required arrival date fields", () => {
  assert.match(appJs, /row\.required_arrival_date\s*\|\|\s*row\.required_arrival_on/);
});

test("submitTransferBundle blocks SDB rows with missing single-category warning before SDO_PACKAGE generation", () => {
  const source = extractFunctionSource(appJs, "submitTransferBundle");
  assert.match(source, /category_warning/);
  assert.match(source, /SDB must be single-category; selected SDB category is missing/);
  assert.ok(
    source.indexOf("category_warning") < source.indexOf("/store-delivery-execution-orders"),
    "SDB category warning guard must run before SDO package creation request",
  );
});

test("buildTransferDemandLines groups by grade dimension", () => {
  const result = buildTransferDemandLines([
    { category_main: "tops", category_sub: "lady tops", grade: "P", requested_qty: 2 },
    { category_main: "tops", category_sub: "lady tops", grade: "S", requested_qty: 3 },
    { category_main: "tops", category_sub: "lady tops", grade: "P", requested_qty: 1 },
  ]);
  assert.deepEqual(result, [
    { category_main: "tops", category_sub: "lady tops", grade: "P", requested_qty: 3, source_count: 2 },
    { category_main: "tops", category_sub: "lady tops", grade: "S", requested_qty: 3, source_count: 1 },
  ]);
});

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

test("warehouse execution accepts any available matching SDB scanned by machine code", () => {
  const plan = buildTransferPreparationPlan({
    demandLines: [
      { category_main: "pants", category_sub: "jeans pant", grade: "P", requested_qty: 100 },
    ],
    preparedBales: [
      {
        bale_no: "SPB-20260503-006",
        bale_barcode: "SDB260503AAG",
        scan_token: "SDB260503AAG",
        display_code: "SDB260503AAG",
        machine_code: "2260503006",
        barcode_value: "2260503006",
        human_readable: "2260503006",
        task_type: "store_dispatch",
        status: "waiting_store_dispatch",
        category_main: "pants",
        category_sub: "jeans pant",
        grade_summary: "P",
        qty: 100,
      },
    ],
  });

  const result = registerPreparedBaleScan({
    plan,
    foundPreparedBarcodes: [],
    barcode: "2260503006",
  });

  assert.equal(result.ok, true);
  assert.equal(result.duplicate, false);
  assert.equal(result.addedByDemandMatch, false);
  assert.equal(result.canonicalBarcode, "SDB260503AAG");
  assert.equal(result.matchedRow.baleBarcode, "SDB260503AAG");
  assert.equal(result.matchedRow.machineCode, "2260503006");
  assert.deepEqual(result.foundPreparedBarcodes, ["SDB260503AAG"]);
  assert.equal(result.message, "已确认该现成 SDB，已加入本单出库核对。");
});

test("warehouse execution can dynamically add an available matching SDB that was not preselected", () => {
  const plan = buildTransferPreparationPlan({
    demandLines: [
      { category_main: "pants", category_sub: "jeans pant", grade: "P", requested_qty: 100 },
    ],
    preparedBales: [
      {
        bale_no: "SPB-20260503-001",
        bale_barcode: "SDB260503AAA",
        machine_code: "2260503001",
        task_type: "store_dispatch",
        status: "waiting_store_dispatch",
        category_main: "pants",
        category_sub: "jeans pant",
        grade_summary: "P",
        qty: 100,
      },
      {
        bale_no: "SPB-20260503-006",
        bale_barcode: "SDB260503AAG",
        scan_token: "SDB260503AAG",
        display_code: "SDB260503AAG",
        machine_code: "2260503006",
        barcode_value: "2260503006",
        task_type: "store_dispatch",
        status: "waiting_store_dispatch",
        category_main: "pants",
        category_sub: "jeans pant",
        grade_summary: "P",
        qty: 100,
      },
    ],
  });

  const result = registerPreparedBaleScan({
    plan,
    foundPreparedBarcodes: [],
    barcode: "SDB260503AAG",
  });

  assert.equal(result.ok, true);
  assert.equal(result.addedByDemandMatch, true);
  assert.equal(result.canonicalBarcode, "SDB260503AAG");
  assert.deepEqual(result.foundPreparedBarcodes, ["SDB260503AAG"]);
  assert.equal(result.message, "该 SDB 符合当前调拨需求，已加入本单现成包清单。");

  const readiness = summarizeTransferExecutionReadiness({
    plan,
    foundPreparedBarcodes: result.foundPreparedBarcodes,
    looseTasks: [],
  });
  assert.equal(readiness.canPrint, true);
  assert.equal(readiness.pendingPreparedCount, 0);
});

test("warehouse execution rejects duplicate, mismatched, occupied, and missing SDB scans with specific messages", () => {
  const plan = buildTransferPreparationPlan({
    demandLines: [
      { category_main: "pants", category_sub: "jeans pant", grade: "P", requested_qty: 100 },
    ],
    preparedBales: [
      {
        bale_no: "SPB-MATCH",
        bale_barcode: "SDB260503AAG",
        machine_code: "2260503006",
        task_type: "store_dispatch",
        status: "waiting_store_dispatch",
        category_main: "pants",
        category_sub: "jeans pant",
        grade_summary: "P",
        qty: 100,
      },
      {
        bale_no: "SPB-WRONG",
        bale_barcode: "SDB260503AAH",
        machine_code: "2260503007",
        task_type: "store_dispatch",
        status: "waiting_store_dispatch",
        category_main: "tops",
        category_sub: "lady tops",
        grade_summary: "S",
        qty: 100,
      },
      {
        bale_no: "SPB-WRONG-QTY",
        bale_barcode: "SDB260503AAK",
        machine_code: "2260503009",
        task_type: "store_dispatch",
        status: "waiting_store_dispatch",
        category_main: "pants",
        category_sub: "jeans pant",
        grade_summary: "P",
        qty: 50,
      },
      {
        bale_no: "SPB-OCCUPIED",
        bale_barcode: "SDB260503AAJ",
        machine_code: "2260503008",
        task_type: "store_dispatch",
        status: "waiting_store_dispatch",
        occupied_by_transfer_no: "TO-OTHER",
        category_main: "pants",
        category_sub: "jeans pant",
        grade_summary: "P",
        qty: 100,
      },
    ],
  });

  const duplicate = registerPreparedBaleScan({
    plan,
    foundPreparedBarcodes: ["SDB260503AAG"],
    barcode: "2260503006",
  });
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.message, "该 SDB 已经扫码确认过。");
  assert.deepEqual(duplicate.foundPreparedBarcodes, ["SDB260503AAG"]);

  const mismatch = registerPreparedBaleScan({
    plan,
    foundPreparedBarcodes: [],
    barcode: "2260503007",
  });
  assert.equal(mismatch.ok, false);
  assert.match(mismatch.error, /该 SDB 是 tops \/ lady tops \/ S \/ 100 件，但当前调拨单不需要这个型号或该型号数量已满足。/);

  const quantityMismatch = registerPreparedBaleScan({
    plan,
    foundPreparedBarcodes: [],
    barcode: "2260503009",
  });
  assert.equal(quantityMismatch.ok, false);
  assert.match(quantityMismatch.error, /该 SDB 是 pants \/ jeans pant \/ P \/ 50 件，但当前调拨单不需要这个型号或该型号数量已满足。/);

  const occupied = registerPreparedBaleScan({
    plan,
    foundPreparedBarcodes: [],
    barcode: "2260503008",
  });
  assert.equal(occupied.ok, false);
  assert.match(occupied.error, /已被其他调拨单或送货执行单占用/);

  const missing = registerPreparedBaleScan({
    plan,
    foundPreparedBarcodes: [],
    barcode: "2260599999",
  });
  assert.equal(missing.ok, false);
  assert.match(missing.error, /未找到这个 SDB，请确认是否已经完成压缩、打印并贴标。/);
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
  assert.equal(tasks[0].printableBarcode, "LPK260423003");
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
  assert.equal(label.barcodeValue, "LPK260423003");
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
  assert.equal(payload.display_code, "LPK260423003");
  assert.equal(payload.machine_code, "3260423003");
  assert.equal(payload.barcode_value, "3260423003");
  assert.equal(payload.scan_token, "3260423003");
  assert.equal(payload.code, "3260423003");
  assert.equal(payload.dispatch_bale_no, "3260423003");
  assert.equal(payload.transfer_order_no, "TO-20260423-003");
  assert.match(payload.packing_list, /Pick: dress\/2 pieces x50/);
  assert.match(payload.packing_list, /Pick: tops\/lady tops x5/);
  assert.doesNotMatch(payload.packing_list, /A-DR-2P-P-01|A-TS-LT-P-01|A-TS-LT-S-01/);
  assert.equal(payload.copies, 1);
});



test("loose pick sheet print payload uses numeric machine code for TO-20260428-001", () => {
  const task = buildLoosePackingTasks({
    transferNo: "TO-20260428-001",
    plan: {
      loosePickRows: [
        { categoryMain: "服装", categorySub: "上衣", qty: 120, rackCodes: ["A-TS-LT-P-01"] },
      ],
    },
  })[0];

  const payload = buildLoosePickSheetDirectPrintPayload({
    task,
    transfer: { transfer_no: "TO-20260428-001", to_store_code: "UTAWALA" },
    storeName: "Utawala",
  });

  assert.equal(payload.display_code, "LPK260428001");
  assert.equal(payload.machine_code, "3260428001");
  assert.equal(payload.barcode_value, "3260428001");
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
  assert.equal(looseRow.baleBarcode, "LPK260423003");
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
  assert.deepEqual(rows[0].source_bales, ["LPK260423003"]);
  assert.equal(rows[0].source_type, "LPK");
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

test("transfer dispatch display keeps selected SDO allocation quantity instead of full source package quantity", () => {
  const plan = buildTransferPreparationPlan({
    demandLines: [
      { category_main: "pants", category_sub: "cargo pants", requested_qty: 120 },
      { category_main: "jacket", category_sub: "jacket", requested_qty: 100 },
    ],
    preparedBales: [
      {
        bale_no: "SDB-SOURCE-001",
        bale_barcode: "WB260508000001",
        task_type: "store_dispatch",
        status: "waiting_store_dispatch",
        category_main: "pants",
        category_sub: "cargo pants",
        qty: 100,
      },
      {
        bale_no: "SDB-SOURCE-002",
        bale_barcode: "WB260508000002",
        task_type: "store_dispatch",
        status: "waiting_store_dispatch",
        category_main: "jacket",
        category_sub: "jacket",
        qty: 100,
      },
    ],
    looseRows: [
      { category_name: "pants / cargo pants", rack_code: "A-PT-CARGO-01", qty_on_hand: 20 },
    ],
  });
  const looseTasks = buildLoosePackingTasks({ transferNo: "TO-20260508-ALLOC", plan, packageLimitQty: 200 });
  const rows = buildTransferDispatchResultDisplayRows({
    result: {
      transfer_no: "TO-20260508-ALLOC",
      to_store_code: "UTAWALA",
      store_dispatch_bales: [
        { bale_no: "SDB-T0202605-001", category_summary: "pants / cargo pants", item_count: 300, store_code: "UTAWALA" },
        { bale_no: "SDB-T0202605-002", category_summary: "jacket / jacket", item_count: 210, store_code: "UTAWALA" },
        { bale_no: "LPK-T020260508026-PICK", category_summary: "pants / cargo pants", item_count: 20, store_code: "UTAWALA" },
      ],
    },
    plan,
    looseTasks,
  });

  const byBaleNo = new Map(rows.map((row) => [row.bale_no, row]));
  assert.equal(byBaleNo.get("SDB-T0202605-001")?.item_count, 100);
  assert.equal(byBaleNo.get("SDB-T0202605-002")?.item_count, 100);
  assert.equal(byBaleNo.get("LPK-T020260508026-PICK")?.item_count, 20);
  assert.equal(byBaleNo.get("SDB-T0202605-001")?.allocated_item_count, 100);
  assert.equal(byBaleNo.get("SDB-T0202605-002")?.allocated_item_count, 100);
  assert.equal(byBaleNo.get("LPK-T020260508026-PICK")?.allocated_item_count, 20);
  assert.equal(byBaleNo.get("SDB-T0202605-001")?.source_type, "SDB");
  assert.equal(byBaleNo.get("SDB-T0202605-002")?.source_type, "SDB");
  assert.equal(byBaleNo.get("LPK-T020260508026-PICK")?.source_type, "LPK");
});

test("prepared SDB display row keeps selected jacket category instead of stale mixed result category", () => {
  const plan = buildTransferPreparationPlan({
    demandLines: [
      { category_main: "jacket", category_sub: "jacket", requested_qty: 100 },
    ],
    preparedBales: [
      {
        bale_no: "SDB-SOURCE-JACKET",
        bale_barcode: "WB260508000210",
        task_type: "store_dispatch",
        status: "waiting_store_dispatch",
        category_main: "jacket",
        category_sub: "jacket",
        qty: 100,
      },
    ],
    looseRows: [],
  });
  const rows = buildTransferDispatchResultDisplayRows({
    result: {
      transfer_no: "TO-20260508-JACKET",
      to_store_code: "UTAWALA",
      store_dispatch_bales: [
        {
          bale_no: "SDB-TO202605-002",
          category_name: "mixed categories",
          category_summary: "tops / lady tops、tops / men shirt",
          item_count: 210,
          store_code: "UTAWALA",
        },
      ],
    },
    plan,
    looseTasks: [],
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].bale_no, "SDB-TO202605-002");
  assert.equal(rows[0].item_count, 100);
  assert.equal(rows[0].allocated_item_count, 100);
  assert.equal(rows[0].source_full_item_count, 210);
  assert.equal(rows[0].source_type, "SDB");
  assert.equal(rows[0].category_summary, "jacket / jacket");
  assert.equal(rows[0].category_name, "jacket / jacket");
  assert.notEqual(rows[0].category_summary, "tops / lady tops、tops / men shirt");
  assert.notEqual(rows[0].category_name, "mixed categories");
});

test("prepared SDB display row keeps selected cargo pants category instead of historical mixed result category", () => {
  const plan = buildTransferPreparationPlan({
    demandLines: [
      { category_main: "pants", category_sub: "cargo pants", requested_qty: 100 },
    ],
    preparedBales: [
      {
        bale_no: "SDB-SOURCE-CARGO",
        bale_barcode: "WB260508000100",
        task_type: "store_dispatch",
        status: "waiting_store_dispatch",
        category_main: "pants",
        category_sub: "cargo pants",
        qty: 100,
      },
    ],
    looseRows: [],
  });
  const rows = buildTransferDispatchResultDisplayRows({
    result: {
      transfer_no: "TO-20260508-CARGO",
      to_store_code: "UTAWALA",
      store_dispatch_bales: [
        {
          bale_no: "SDB-TO202605-001",
          category_name: "mixed categories",
          category_summary: "dress / long dress、tops / lady tops",
          item_count: 300,
          store_code: "UTAWALA",
        },
      ],
    },
    plan,
    looseTasks: [],
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].bale_no, "SDB-TO202605-001");
  assert.equal(rows[0].item_count, 100);
  assert.equal(rows[0].allocated_item_count, 100);
  assert.equal(rows[0].source_full_item_count, 300);
  assert.equal(rows[0].source_type, "SDB");
  assert.equal(rows[0].category_summary, "pants / cargo pants");
  assert.equal(rows[0].category_name, "pants / cargo pants");
  assert.notEqual(rows[0].category_summary, "dress / long dress、tops / lady tops");
  assert.notEqual(rows[0].category_name, "mixed categories");
});

test("prepared SDB display row does not silently use mixed result category when selected category is missing", () => {
  const plan = {
    preparedPickRows: [
      {
        bale_no: "SDB-SOURCE-MISSING",
        bale_barcode: "WB260508000999",
        task_type: "store_dispatch",
        status: "waiting_store_dispatch",
        category_main: "",
        category_sub: "",
        qty: 100,
      },
    ],
    loosePickRows: [],
  };
  const rows = buildTransferDispatchResultDisplayRows({
    result: {
      transfer_no: "TO-20260508-MISSING",
      to_store_code: "UTAWALA",
      store_dispatch_bales: [
        {
          bale_no: "SDB-TO202605-099",
          category_name: "mixed categories",
          category_summary: "dress / long dress、tops / lady tops",
          item_count: 300,
          store_code: "UTAWALA",
        },
      ],
    },
    plan,
    looseTasks: [],
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].category_summary, "UNKNOWN SDB CATEGORY");
  assert.equal(rows[0].category_name, "UNKNOWN SDB CATEGORY");
  assert.match(rows[0].category_warning, /SDB must be single-category/);
  assert.notEqual(rows[0].category_summary, "dress / long dress、tops / lady tops");
  assert.notEqual(rows[0].category_name, "mixed categories");
});

test("LPK display rows remain allowed to show mixed shortage category summary", () => {
  const plan = buildTransferPreparationPlan({
    demandLines: [
      { category_main: "dress", category_sub: "long dress", requested_qty: 5 },
      { category_main: "tops", category_sub: "lady tops", requested_qty: 5 },
    ],
    preparedBales: [],
    looseRows: [
      { category_name: "dress / long dress", rack_code: "A-DR-LD-P-01", qty_on_hand: 20 },
      { category_name: "tops / lady tops", rack_code: "A-TS-LT-P-01", qty_on_hand: 20 },
    ],
  });
  const looseTasks = buildLoosePackingTasks({ transferNo: "TO-20260508-LPK", plan, packageLimitQty: 200 });
  const rows = buildTransferDispatchResultDisplayRows({
    result: {
      transfer_no: "TO-20260508-LPK",
      to_store_code: "UTAWALA",
      store_dispatch_bales: [
        { bale_no: "LPK-T020260508026-PICK", source_type: "LPK", category_summary: "dress / long dress、tops / lady tops", item_count: 10, store_code: "UTAWALA" },
      ],
    },
    plan,
    looseTasks,
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0].source_type, "LPK");
  assert.equal(rows[0].category_summary, "多类目补差 · 2 个类目");
  assert.equal(rows[0].category_name, "多类目补差");
  assert.equal(rows[0].item_count, 10);
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
  assert.match(indexHtml, /<strong>本次补货<\/strong>/);
  assert.match(indexHtml, />生成补货申请单</);
  assert.doesNotMatch(indexHtml, /门店补货需求单/);
  assert.doesNotMatch(indexHtml, /这里完成补货单审核/);
  assert.doesNotMatch(appJs, /填写补货单号；创建补货单后会自动带出。/);
  assert.doesNotMatch(appJs, /这里会显示补货单审核、仓库配货/);
  assert.doesNotMatch(appJs, /先创建并审核补货单，这里再读取最近补货单/);
  assert.doesNotMatch(appJs, /recommendationGoTransferButton/);
});

test("transfer drafting and warehouse execution pages use the new replenishment planning workbench structure", () => {
  assert.match(indexHtml, /<h2>门店补货流程页<\/h2>/);
  assert.match(indexHtml, /<h2>4\.1 手动补货需求<\/h2>/);
  assert.match(indexHtml, /<h3>手动补货申请<\/h3>/);
  assert.match(indexHtml, /填写门店、品类和数量，生成补货申请。/);
  assert.match(indexHtml, /class="manual-replenishment-layout"/);
  assert.match(indexHtml, /class="transfer-items-table-head"/);
  assert.match(indexHtml, />生成补货申请单/);
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
  assert.match(indexHtml, /<h2>5\.1 LPK 补差拣货<\/h2>/);
  assert.match(indexHtml, />生成补差拣货单 barcode</);
  assert.match(indexHtml, /name="package_limit_qty"/);
  assert.match(indexHtml, /小于 50 件/);
  assert.match(indexHtml, /小于 100 件/);
  assert.match(indexHtml, /小于 200 件/);
  assert.match(appJs, /store_loose_pick_60x40/);
  assert.match(appJs, /发送标签机打印/);
  assert.match(appJs, /门店补差拣货单 60x40/);
  assert.match(indexHtml, /系统建议/);
  assert.match(indexHtml, /可拣数量/);
  assert.match(indexHtml, /补货明细/);
  assert.match(indexHtml, /备货执行总览/);
  assert.match(indexHtml, /现成待送店包裹/);
  assert.match(indexHtml, /补差拣货/);
  assert.match(indexHtml, /最终送店打印/);
  assert.match(indexHtml, />扫描确认现成包</);
  assert.doesNotMatch(indexHtml, />确认生成门店调拨单</);
  assert.match(indexHtml, /现成待送店包裹/);
  assert.doesNotMatch(indexHtml, /散货补差拣货区/);
  assert.doesNotMatch(indexHtml, /送店 bale \/ 箱单打印区/);
  assert.match(indexHtml, />生成正式门店送货执行单 barcode</);
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

test("lpk print modal uses dedicated LPK identity copy and locked 60x40 template", () => {
  assert.match(appJs, /const CODE128_PATTERNS = \[/);
  assert.match(appJs, /function renderCode128Svg/);
  assert.match(appJs, /data-barcode-standard="CODE128"/);
  assert.match(appJs, /const startCode = 104/);
  assert.match(appJs, /data-code128-start="\$\{startCode\}"/);
  assert.match(appJs, /data-code128-stop="106"/);
  assert.doesNotMatch(appJs, /char\.charCodeAt\(0\) \+ index \* 7/);
  assert.match(appJs, /taskType:\s*"lpk_shortage_pick"/);
  assert.match(appJs, /LPK 补差工单条码打印/);
  assert.match(appJs, /LPK 只用于仓库补差拣货和打包/);
  assert.match(appJs, /allowedCodes:\s*\["store_loose_pick_60x40"\]/);
  assert.match(appJs, /isLpkPrint \|\| isBaleModalDirectOnlyJob\(currentJob\)/);
  assert.match(appJs, /data-print-template="store_loose_pick_60x40"/);
  assert.match(appJs, /data-lpk-barcode-value="\$\{escapeHtml\(barcodeValue\)\}"/);
  assert.match(appJs, /const displayCode = String\(payload\.display_code \|\| payload\.bale_barcode \|\| payload\.code \|\| ""\)\.trim\(\)\.toUpperCase\(\)/);
  assert.match(appJs, /const machineCode = String\(payload\.machine_code \|\| payload\.barcode_value \|\| payload\.scan_token \|\| defaultBarcodeValue \|\| ""\)\.replace\(\/\[\^0-9\]\/g, ""\)\.trim\(\)/);
  assert.match(appJs, /const barcodeValue = machineCode/);
  assert.match(appJs, /Display: \$\{escapeHtml\(displayCode \|\| "-"\)\}/);
  assert.match(appJs, /Request: \$\{escapeHtml\(requestNo \|\| "-"\)\}/);
  assert.match(appJs, /data-lpk-barcode-value="\$\{escapeHtml\(barcodeValue\)\}"/);
  assert.match(appJs, /<div class="code">\$\{escapeHtml\(barcodeValue \|\| "NO BARCODE"\)\}<\/div>/);
  assert.doesNotMatch(appJs, /const barcodeValue = String\(payload\.display_code/);
  assert.doesNotMatch(appJs, /const barcodeValue = String\(payload\.dispatch_bale_no\s*\|\|\s*payload\.scan_token\s*\|\|\s*payload\.barcode_value/);
  assert.match(appJs, /printableBarcode/);
  assert.match(appJs, /Store: \$\{escapeHtml\(storeName \|\| "-"\)\}<br>Request: \$\{escapeHtml\(requestNo \|\| "-"\)\}/);
  assert.match(appJs, /data-barcode-renderer="svg-code128"/);
  assert.match(appJs, /LPK \/ SHORTAGE PICK/);
  assert.doesNotMatch(appJs, /lpk_shortage_pick[\s\S]*allowedCodes:\s*\["transtoshop"/);
  assert.match(indexHtml, /id="balePrintModalScopeNote"/);
});

test("final transfer dispatch print uses SDO_PACKAGE 60x40 payload and package machine barcode fields", () => {
  const submitBundleSource = extractFunctionSource(appJs, "submitTransferBundle");
  const sdoModalSource = extractFunctionSource(appJs, "openTransferDispatchPrintTemplateModal");
  const sdoJobSource = extractFunctionSource(appJs, "buildSDOPrintJobs");
  const sdoPayloadSource = extractFunctionSource(appJs, "buildTransferDispatchPrinterPayloadForRow");
  const previewSource = extractFunctionSource(appJs, "renderDirectOnlyBaleModalPreview");
  const modalRenderSource = extractFunctionSource(appJs, "renderBalePrintModal");
  const warehouseoutPreferenceSource = appJs.match(/function getPreferredWarehouseoutTemplateCode[\s\S]*?function populateBaleLabelTemplateSelects/)?.[0] || "";
  const sdoOptionsSource = appJs.match(/function getBaleModalTemplateOptions[\s\S]*?if \(normalizedScope === "warehouseout_bale" && isStorePrepBaleModalTaskType/)?.[0] || "";

  assert.match(appJs, /function getTransferDispatchTemplateCode/);
  assert.match(appJs, /getTransferDispatchTemplateCode\(\)[\s\S]*?return "store_dispatch_60x40"/);
  assert.match(appJs, /const SDO_PRINT_TASK_TYPE = "store_delivery_execution"/);
  assert.match(appJs, /function hasValidSdoPackagePrintRows/);
  assert.match(appJs, /function ensureSdoPackagePrintRowsForTransfer/);
  assert.match(appJs, /\/transfers\/\$\{encodeURIComponent\(normalizedTransferNo\)\}\/store-delivery-execution-orders\/\$\{encodeURIComponent\(executionOrderNo\)\}\/packages\/ensure/);
  assert.match(submitBundleSource, /const sdoPrintTransfer = \{[\s\S]*store_delivery_execution_order:\s*storeDeliveryExecutionOrder/);
  assert.match(submitBundleSource, /storeDeliveryExecutionOrder = await ensureSdoPackagePrintRowsForTransfer/);
  assert.match(submitBundleSource, /transfer:\s*sdoPrintTransfer/);
  assert.match(submitBundleSource, /allocated_item_count:\s*parseKnownDispatchItemCount\(row\)/);
  assert.match(sdoModalSource, /const jobs = buildSDOPrintJobs\(\{/);
  assert.match(appJs, /当前 SDO 缺少实体包码，请先生成 SDO_PACKAGE 后再打印。/);
  assert.match(sdoJobSource, /throw new Error\("正式 SDO barcode 缺少 display_code/);
  assert.match(sdoJobSource, /throw new Error\("正式 SDO barcode 缺少 4 开头 machine_code/);
  assert.match(sdoJobSource, /transfer\?\.store_delivery_execution_order\?\.packages/);
  assert.match(sdoJobSource, /const packageDisplayCode = String\(row\?\.display_code/);
  assert.match(sdoJobSource, /throw new Error\("正式 SDO package barcode 缺少 display_code/);
  assert.match(sdoJobSource, /throw new Error\("正式 SDO package barcode 缺少 6 开头 machine_code/);
  assert.match(sdoJobSource, /templateCode = getTransferDispatchTemplateCode\(\)/);
  assert.match(sdoJobSource, /template_code:\s*templateCode/);
  assert.match(sdoJobSource, /display_code:\s*packageDisplayCode/);
  assert.match(sdoJobSource, /machine_code:\s*packageMachineCode/);
  assert.match(sdoJobSource, /barcode_value:\s*packageMachineCode/);
  assert.match(sdoJobSource, /parent_sdo_display_code:\s*sdoDisplayCode/);
  assert.match(sdoJobSource, /parent_sdo_machine_code:\s*sdoMachineCode/);
  assert.match(sdoJobSource, /entity_type:\s*"STORE_DELIVERY_PACKAGE"/);
  assert.match(sdoPayloadSource, /entity_type:\s*isSdoPackage \? "STORE_DELIVERY_PACKAGE" : "STORE_DELIVERY_EXECUTION"/);
  assert.match(sdoPayloadSource, /label_title:\s*isSdoPackage \? "SDO \/ DELIVERY" : "SDO \/ STORE DELIVERY ORDER"/);
  assert.doesNotMatch(sdoPayloadSource, /buildTransferDispatchFallbackBarcode/);
  assert.doesNotMatch(sdoPayloadSource, /isWarehouseoutDispatchBarcode/);
  assert.match(previewSource, /data-print-template="store_dispatch_60x40"/);
  assert.match(previewSource, /data-sdo-package-display-code/);
  assert.match(previewSource, /SDO \/ DELIVERY/);
  assert.match(modalRenderSource, /模板已锁定：SDO_PACKAGE \/ STORE_DELIVERY_PACKAGE 60x40/);
  assert.match(appJs, /SDO 实体包标签打印/);
  assert.match(appJs, /打印 SDO 实体包标签/);
  assert.match(warehouseoutPreferenceSource, /normalizedTaskType === SDO_PRINT_TASK_TYPE[\s\S]*?return getTransferDispatchTemplateCode\(\)/);
  assert.match(warehouseoutPreferenceSource, /normalizedTaskType === "lpk_shortage_pick"[\s\S]*?return "store_loose_pick_60x40"/);
  assert.match(sdoOptionsSource, /\.filter\(\(row\) => String\(row\?\.template_code/);
  assert.doesNotMatch(sdoOptionsSource, /store_prep_bale_60x40/);
  assert.match(appJs, /taskType:\s*SDO_PRINT_TASK_TYPE/);
  assert.match(appJs, /allowedCodes:\s*\["store_dispatch_60x40"\]/);
  assert.match(appJs, /selectedTemplateCode === "store_dispatch_60x40" \|\| selectedTemplateCode === "transtoshop" \|\| selectedTemplateCode === "wait_for_transtoshop"/);
  assert.match(appJs, /availableCodes\.has\("wait_for_transtoshop"\)/);
  assert.match(appJs, /selectedCode:\s*\["store_dispatch_60x40", "transtoshop", "wait_for_transtoshop"\]\.includes/);
  assert.doesNotMatch(appJs, /门店送货执行单 60x40[\s\S]*wait for transtoshop/);
  assert.match(appJs, /function isWarehouseoutDispatchBarcode/);
  assert.match(appJs, /const displayCode = String\(\s*isSdoPackage/);
  assert.match(appJs, /const machineCode = String\(row\.machine_code \|\| ""\)/);
  assert.match(appJs, /const derivedMachineCode = !isSdoPackage && \/\^SDO/);
  assert.match(appJs, /`4\$\{displayCode\.slice\(3\)\}`/);
  assert.match(appJs, /const sdoDisplayCode = String\(\s*transfer\?\.store_delivery_execution_order_no\s*\|\|\s*transfer\?\.store_delivery_execution_order\?\.execution_order_no\s*\|\|\s*transfer\?\.store_delivery_execution_order\?\.official_delivery_barcode\s*\|\|\s*transfer\?\.execution_order_no\s*\|\|\s*transfer\?\.official_delivery_barcode/);
  assert.match(appJs, /const sdoMachineCode = sdoMachineCodeFromTransfer\s*\|\|\s*\(\/\^SDO/);
  assert.match(sdoJobSource, /const sdoPackageRow = \{[\s\S]*?store_delivery_execution_order_no:\s*sdoDisplayCode,[\s\S]*?display_code:\s*packageDisplayCode,[\s\S]*?machine_code:\s*packageMachineCode/);
  assert.doesNotMatch(sdoJobSource, /display_code:\s*sdoDisplayCode,\s*\n\s*machine_code:\s*sdoMachineCode/);
  assert.match(appJs, /display_code:\s*displayCode \|\| ""/);
  assert.match(appJs, /machine_code:\s*machineCode \|\| derivedMachineCode \|\| ""/);
  assert.match(appJs, /barcode_value:\s*barcodeValue/);
  assert.match(appJs, /parent_sdo_display_code:\s*parentSdoDisplayCode/);
  assert.match(appJs, /source_code:\s*sourceCode/);
  assert.doesNotMatch(appJs, /display_code:\s*displayCode \|\| normalizedFinal/);
  assert.match(appJs, /package_count:\s*packageCount/);
  assert.match(appJs, /package_position_label:\s*`第 \$\{packageIndex\} 包 \/ 共 \$\{packageCount\} 包`/);
  assert.match(appJs, /const barcodeSvg = renderCode128Svg\(barcodeValue, \{ width: 340, height: 96, quietZoneModules: 12, moduleWidth: 1\.7 \}\);/);
  assert.match(appJs, /<div class="barcode-wrap">[\s\S]*?\$\{barcodeSvg\}[\s\S]*?<div class="code">\$\{escapeHtml\(barcodeValue \|\| "NO BARCODE"\)\}<\/div>/);
  assert.match(appJs, /const machineCode = String\(payload\.machine_code \|\| payload\.barcode_value \|\| payload\.scan_token \|\| defaultBarcodeValue\)\.replace\(\/\[\^0-9\]\/g, ""\)\.trim\(\)/);
  assert.match(appJs, /<div class="code">\$\{escapeHtml\(barcodeValue \|\| "NO BARCODE"\)\}<\/div>/);
  assert.match(appJs, /STORE DISPATCH \/ SDO/);
  assert.match(appJs, /isSdoPrint \? "SDO 实体包标签打印"/);
  assert.match(appJs, /SDO_PACKAGE 是门店送货实体包码；条码编码 6 开头实体包 machine_code，父级 SDO 只作关联信息。/);
  assert.match(appJs, /门店送货实体包码/);
  assert.match(appJs, /Display: \$\{displayCode \|\| "-"\}/);
  assert.match(appJs, /Request: \$\{transferNo \|\| "-"\}/);
});

test("warehouse dispatch tracking removes temporary store receipt writeback step", () => {
  assert.doesNotMatch(indexHtml, /id="opsDispatchReceiptForm"/);
  assert.doesNotMatch(indexHtml, /回写门店签收结果/);
  assert.doesNotMatch(appJs, /submitOpsDispatchReceiptWriteback/);
  assert.doesNotMatch(appJs, /data-dispatch-receipt-fill/);
  assert.doesNotMatch(appJs, /填入签收回写/);
});

test("transfer shipment confirmation shows in-transit status after shipping", () => {
  assert.match(appJs, /async function submitTransferShipment/);
  assert.match(appJs, /submitTransferShipment[\s\S]*?alert\("确认发货成功，状态已更新为运输中"\)/);
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
  assert.match(indexHtml, /<section class="panel" data-workspace-panel="warehouse">[\s\S]*?<h2>4\.1 手动补货需求<\/h2>/);
  assert.match(indexHtml, /<section class="panel" data-workspace-panel="warehouse">[\s\S]*?<h2>5\.1 LPK 补差拣货<\/h2>/);
  assert.match(indexHtml, /<section class="panel" data-workspace-panel="warehouse">[\s\S]*?<h2>6\. 仓库执行单 \/ 出库打印<\/h2>/);
  assert.match(indexHtml, /<section class="panel" data-workspace-panel="warehouse">[\s\S]*?<h2>门店配送<\/h2>/);
  assert.doesNotMatch(indexHtml, /<section class="panel" data-workspace-panel="operations">\s*<div class="panel-head">\s*<h2>4\. 门店补货建议<\/h2>/);
});

test("warehouse nav exposes 门店补货 and operations nav drops the replenishment chain", () => {
  assert.match(warehouseNavSectionJs, /title: "门店补货"/);
  assert.match(warehousePanelMetaJs, /match: "门店补货流程页"/);
  assert.match(warehousePanelMetaJs, /match: "4\. 门店补货建议"/);
  assert.match(warehousePanelMetaJs, /match: "4\.1 手动补货需求"/);
  assert.match(warehousePanelMetaJs, /match: "5\.1 LPK 补差拣货",\n\s*section: "replenishment"/);
  assert.match(warehousePanelMetaJs, /match: "6\. 仓库执行单 \/ 出库打印"/);
  assert.match(warehousePanelMetaJs, /match: "6\.1 配送批次 \/ 门店收货跟踪"/);
  assert.doesNotMatch(operationsPanelMetaJs, /4\. 门店补货建议/);
  assert.doesNotMatch(operationsPanelMetaJs, /4\.1 手动补货需求/);
  assert.doesNotMatch(operationsPanelMetaJs, /6\. 仓库执行单 \/ 出库打印/);
  assert.doesNotMatch(operationsPanelMetaJs, /6\.1 配送批次 \/ 门店收货跟踪/);
});



test("phase 2A copy clarifies step flow and request number carry for 4.1 -> 5.1", () => {
  assert.match(indexHtml, /手动补货申请/);
  assert.match(indexHtml, /下一步动作/);
  assert.match(indexHtml, /生成补货申请单/);
  assert.match(appJs, /\$\{escapeHtml\(storeLabel\)\} 补货单/);
  assert.match(appJs, /生成仓库备货任务/);
});

test("phase 2A page 5.1 copy uses request number label and warehouse-only LPK guidance", () => {
  assert.match(indexHtml, /选择补货申请 \/ 选择仓库备货任务/);
  assert.match(indexHtml, /LPK = 仓库补差工单码；门店不可扫。/);
  assert.match(appJs, /该补货申请没有散货缺口，无需生成补差拣货单。请回到 6 仓库执行单继续。/);
});

test("phase B2 warehouse prep task panel supports request multi-select", () => {
  assert.match(indexHtml, /仓库备货任务/);
  assert.match(indexHtml, /把多个补货品类合成一个仓库拣货任务，仓库按这个任务备货。/);
  assert.match(indexHtml, /id="pickingWaveForm"/);
  assert.match(indexHtml, /name="selected_replenishment_request_nos"[\s\S]*multiple/);
  assert.match(indexHtml, /生成仓库备货任务/);
  assert.match(appJs, /await request\("\/picking-waves", \{ method: "POST"/);
  assert.match(appJs, /await request\("\/picking-waves"\)/);
});

test("phase 2A copy keeps package count and piece count separated on 4.1", () => {
  assert.match(appJs, /const pickableQty = Math\.max\(totalRequestedQty - shortageQty, 0\);/);
  assert.match(appJs, /可拣：\$\{escapeHtml\(pickableQty\)\} 件/);
  assert.match(appJs, /<span>缺货数量<\/span><strong>\$\{renderStatusBadge\(`\$\{shortageQty\} 件`, shortageQty > 0 \? "warning" : "neutral"\)\}<\/strong>/);
  assert.match(appJs, /系统按库存生成配货建议。SDB 不是门店收货 barcode；门店收货使用后续 SDO barcode。/);
});

test("phase 2B page 6 copy clarifies warehouse verification and warehouse-only barcode boundary", () => {
  assert.match(indexHtml, /仓库执行单 \/ 出库打印/);
  assert.match(indexHtml, /按已生成的补货申请和配货建议，核对 SDB 包与 LPK 补差包；核对完成后生成正式 SDO 门店送货执行码。/);
  assert.match(indexHtml, /SDB\/LPK = 仓库核对码；门店只扫 SDO。/);
  assert.match(indexHtml, /这是门店收货唯一可扫的送货 barcode。SDB 和 LPK 仍然只是仓库内部核对码。/);
  assert.match(indexHtml, /通道 A：现成待送店包核对/);
  assert.match(indexHtml, /扫描 SDB 只是在仓库确认本单要使用的现成待送店包，不是门店收货。/);
  assert.match(appJs, /可扫描任意符合本单型号和数量要求的可用 SDB，不要求必须是预先指定包号。/);
  assert.match(indexHtml, /通道 B：补差包核对/);
  assert.match(indexHtml, /LPK 是仓库补差拣货工单码。补差完成后形成仓库内部补差包，用于本单后续送货执行。/);
  assert.match(indexHtml, /通道 C：正式门店送货执行单/);
  assert.match(indexHtml, /生成正式门店送货执行单 barcode/);
});

test("phase 2B page 6 state labels and gating copy are visible in workbench summary", () => {
  assert.match(appJs, /<strong>执行阶段<\/strong><span>\$\{renderStatusBadge\("仓库核对 \/ 出库打印", verificationPending \? "info" : "success"\)\}<\/span>/);
  assert.match(appJs, /<strong>现成 SDB 包<\/strong><span>\$\{renderStatusBadge\(`\$\{readiness\.foundPreparedCount \|\| 0\} \/ \$\{readiness\.requiredPreparedCount \|\| 0\} 已核对`, readiness\.pendingPreparedCount \? "warning" : "success"\)\}<\/span>/);
  assert.match(appJs, /<strong>补差工单<\/strong><span>\$\{renderStatusBadge\(`\$\{readiness\.completedLooseTaskCount \|\| 0\} \/ \$\{readiness\.requiredLooseTaskCount \|\| 0\} 已完成`, readiness\.pendingLooseTaskCount \? "warning" : "success"\)\}<\/span>/);
  assert.match(appJs, /<strong>正式送货执行码<\/strong><span>\$\{renderBarcodeEntityBadge\("SDO", officialDeliveryCodeLabel\)\}<\/span>/);
  assert.match(appJs, /仓库核对尚未完成：现成待送店包 \$\{readiness\.foundPreparedCount \|\| 0\}\/\$\{readiness\.requiredPreparedCount \|\| 0\}，补差工单 \$\{readiness\.completedLooseTaskCount \|\| 0\}\/\$\{readiness\.requiredLooseTaskCount \|\| 0\}。/);
  assert.match(appJs, /仓库核对已完成。请生成正式门店送货执行单 barcode，并用于门店收货扫码。/);
  assert.doesNotMatch(indexHtml, /打印后给店长扫码验收/);
  assert.doesNotMatch(indexHtml, /SDB\/LPK can be scanned by store/i);
});

test("门店配送 page exposes create and history tabs without the old intro copy", () => {
  assert.match(appJs, /navTitle: "门店配送"/);
  assert.match(indexHtml, /data-transfer-delivery-tab="create"[\s\S]*创建配送/);
  assert.match(indexHtml, /data-transfer-delivery-tab="history"[\s\S]*历史配送记录/);
  assert.match(indexHtml, /data-transfer-delivery-panel="create"/);
  assert.match(indexHtml, /data-transfer-delivery-panel="history"/);
  assert.doesNotMatch(indexHtml, /配送批次 = 一辆车 \+ 一个或多个门店 \+ 一张或多张 SDO。/);
  assert.doesNotMatch(indexHtml, /当前版本先按已生成 SDO 展示配送批次视图/);
  assert.doesNotMatch(indexHtml, /SDB can be scanned by store/i);
  assert.doesNotMatch(indexHtml, /LPK can be scanned by store/i);
});

test("门店配送 tab buttons use compact blue horizontal button styling", () => {
  const tabStyles = stylesCss.match(/\.store-delivery-tab\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const tabsStyles = stylesCss.match(/\.store-delivery-tabs\s*\{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(tabsStyles, /display:\s*flex/);
  assert.match(tabsStyles, /align-items:\s*center/);
  assert.match(tabStyles, /width:\s*auto/);
  assert.match(tabStyles, /flex:\s*0 0 auto/);
  assert.match(tabStyles, /display:\s*inline-flex/);
  assert.match(tabStyles, /background:\s*var\(--fw-primary\)/);
  assert.match(tabStyles, /color:\s*#fff/);
  assert.doesNotMatch(tabStyles, /background:\s*var\(--fw-surface\)/);
});

test("门店配送 create tab supports editable SDO rows and transport fields", () => {
  assert.match(indexHtml, /id="transferShipForm"/);
  assert.match(indexHtml, /data-transfer-sdo-list/);
  assert.match(indexHtml, /data-transfer-sdo-row/);
  assert.match(indexHtml, /data-transfer-sdo-add/);
  assert.match(indexHtml, /data-transfer-sdo-remove/);
  assert.match(indexHtml, /选择门店送货单/);
  assert.match(indexHtml, /选择后这里会显示本车次配送确认卡片/);
  assert.match(indexHtml, /司机 \/ 电话 \/ 车牌号/);
  assert.match(indexHtml, /name="driver_name"/);
  assert.match(indexHtml, /name="driver_phone"/);
  assert.match(indexHtml, /name="vehicle_no"/);
  assert.match(indexHtml, /placeholder="备注"/);
  assert.match(indexHtml, />确认发货<\/button>/);
  assert.match(appJs, /function getSelectedTransferShipmentNos/);
  assert.match(appJs, /function addTransferShipmentSdoRow/);
  assert.match(appJs, /function removeTransferShipmentSdoRow/);
  assert.match(indexHtml, /创建配送 \/ 同车发货/);
  assert.match(indexHtml, /选择已经生成 SDO \/ SDP 的门店送货单，并登记司机与车辆信息。/);
  assert.match(appJs, /payload\.driver_phone/);
});

test("门店配送 create selector only lists SDO rows with SDP packages and clear transfer identity", () => {
  const populateSource = extractFunctionSource(appJs, "populateTransferOrderSelectors");
  assert.match(appJs, /function getStoreDeliveryShipmentOptionRows/);
  assert.match(appJs, /function getStoreDeliveryShipmentOptionLabel/);
  assert.match(appJs, /function hasStoreDeliveryShipmentSdoPackages/);
  assert.match(populateSource, /mode === "ship"[\s\S]*getStoreDeliveryShipmentOptionRows\(rows\)/);
  assert.match(appJs, /`\$\{sdo\} \/ \$\{transferNo\} \/ \$\{storeCode\} \/ \$\{formatI18nCount\(packCount, "包", "packages"\)\} \/ \$\{statusLabel\}`/);
  assert.doesNotMatch(populateSource, /SDO 未生成/);
});

test("门店配送 create selection renders operational SDO cards and vehicle confirmation", () => {
  const hintSource = extractFunctionSource(appJs, "renderTransferShipTargetHint");
  assert.match(appJs, /function getStoreDeliveryShipmentCardData/);
  assert.match(appJs, /function renderStoreDeliverySdoSelectionCard/);
  assert.match(appJs, /function getTransferShipmentTransportFormData/);
  assert.match(hintSource, /本车次配送/);
  assert.match(hintSource, /运输任务确认/);
  assert.match(hintSource, /renderStoreDeliverySdoSelectionCard\(transfer/);
  assert.match(hintSource, /renderStatusBadge\(statusLabel,\s*statusLabel/);
  assert.match(hintSource, /Driver A/);
  assert.match(hintSource, /KDM-001A/);
  assert.match(appJs, /SDP 已生成/);
  assert.doesNotMatch(hintSource, /内部使用 transfer_no 提交/);
});

test("门店配送 history tab lists all shipment statuses with a search box", () => {
  assert.match(indexHtml, /id="transferDeliveryHistorySearch"/);
  assert.match(indexHtml, /placeholder="搜索配送记录 \/ SDO \/ 门店 \/ 司机 \/ 车牌 \/ 状态"/);
  assert.match(indexHtml, /id="transferDeliveryHistoryList"/);
  assert.match(appJs, /function renderTransferDeliveryHistory/);
  assert.match(appJs, /transferDeliveryHistorySearchQuery/);
  assert.match(appJs, /renderTransferDeliveryHistory\(transferOrderState\)/);
  assert.match(appJs, /getShipmentBatchProgressLabel\(row\)/);
  assert.match(appJs, /includes\(transferDeliveryHistorySearchQuery\)/);
});

test("门店配送 history cards are SDO-centered and exclude source package wording", () => {
  const historySource = extractFunctionSource(appJs, "renderTransferDeliveryHistory");
  assert.match(appJs, /function renderStoreDeliveryHistoryCard/);
  assert.match(historySource, /const sdoCode = getStoreDeliverySdoDisplayCode\(row\)/);
  assert.match(historySource, /renderStoreDeliveryHistoryCard\(\{/);
  assert.match(historySource, /renderStatusBadge\(statusLabel,\s*statusLabel/);
  assert.match(historySource, /司机电话 \$\{escapeHtml\(row\.driver_phone \|\| "-"\)\}/);
  assert.match(historySource, /发货时间 \$\{escapeHtml\(formatDateTime\(row\.shipped_at\) \|\| "-"\)\}/);
  assert.match(historySource, /收货状态 \$\{escapeHtml\(getStoreDeliveryReceiptStatusLabel\(row\)\)\}/);
  assert.match(historySource, /\$\{row\.transfer_no \|\| "-"\} \/ \$\{row\.to_store_code \|\| "-"\} \/ \$\{formatI18nCount\(packageCount, "包", "packages"\)\}/);
  assert.doesNotMatch(historySource, /SDB/);
  assert.doesNotMatch(historySource, /LPK/);
  assert.doesNotMatch(historySource, /RAW_BALE/);
  assert.doesNotMatch(historySource, /配送批次/);
});

test("门店配送 result summary is same-vehicle delivery, not raw form output", () => {
  const resultSource = extractFunctionSource(appJs, "renderTransferTrackingResultSummary");
  assert.match(resultSource, /本车次配送/);
  assert.match(resultSource, /运输任务确认/);
  assert.match(resultSource, /\$\{orders\.length\} 张 SDO/);
  assert.match(resultSource, /renderStoreDeliverySdoBreakdownRow/);
  assert.match(resultSource, /renderStatusBadge\(batchLabel,\s*batchLabel/);
  assert.match(resultSource, /driver_phone/);
  assert.doesNotMatch(resultSource, /正式门店送货 barcode/);
});

test("门店配送 create and history tabs use internal shipment APIs", () => {
  const submitSource = extractFunctionSource(appJs, "submitTransferShipment");
  assert.match(appJs, /const STORE_DELIVERY_SHIPMENTS_ENDPOINT = "\/store-delivery-shipments";/);
  assert.match(appJs, /async function loadStoreDeliveryShipmentRecords/);
  assert.match(appJs, /request\(STORE_DELIVERY_SHIPMENTS_ENDPOINT\)/);
  assert.match(submitSource, /request\(STORE_DELIVERY_SHIPMENTS_ENDPOINT,\s*\{[\s\S]*method:\s*"POST"/);
  assert.match(appJs, /function getSelectedStoreDeliveryShipmentPayloads/);
  assert.match(submitSource, /const shipments = getSelectedStoreDeliveryShipmentPayloads\(formElement\);/);
  assert.match(submitSource, /shipments:\s*shipments/);
  assert.doesNotMatch(submitSource, /transfer_nos:\s*transferNos/);
  assert.doesNotMatch(submitSource, /\/transfers\/\$\{encodeURIComponent\(transferNo\)\}\/ship/);
  assert.match(appJs, /#loadTransferDispatchButton[\s\S]*loadStoreDeliveryShipmentRecords/);
  assert.match(appJs, /#transferDeliveryHistoryList[\s\S]*#transferTrackingResultSummary/);
});

test("门店配送 submit payload is SDO-level while transfer stays source association", () => {
  const payloadSource = extractFunctionSource(appJs, "getSelectedStoreDeliveryShipmentPayloads");
  assert.match(payloadSource, /sdo_display_code:\s*getStoreDeliverySdoDisplayCode\(transfer\)/);
  assert.match(payloadSource, /sdo_machine_code:/);
  assert.match(payloadSource, /transfer_no:\s*transferNo/);
  assert.doesNotMatch(payloadSource, /source_code/);
  assert.doesNotMatch(payloadSource, /bale_no/);
  assert.doesNotMatch(payloadSource, /SDB/);
  assert.doesNotMatch(payloadSource, /LPK/);
});

test("门店配送 result and history show SDP package list under each SDO", () => {
  const resultSource = extractFunctionSource(appJs, "renderTransferTrackingResultSummary");
  const historyCardSource = extractFunctionSource(appJs, "renderStoreDeliveryHistoryCard");
  assert.match(appJs, /function getStoreDeliveryShipmentSdpPackages/);
  assert.match(appJs, /function renderStoreDeliverySdpPackageList/);
  assert.match(resultSource, /renderStoreDeliverySdpPackageList\(row/);
  assert.match(historyCardSource, /renderStoreDeliverySdpPackageList\(summary\.row/);
  assert.match(appJs, /SDP 包/);
  assert.match(appJs, /packageRow\.machine_code/);
  assert.match(appJs, /packageRow\.barcode_value/);
  assert.match(appJs, /packageRow\.source_code/);
});

test("门店配送 page uses unified status accent system and hides technical wording", () => {
  const deliveryPageHtml = (indexHtml.match(/<section class="panel" data-workspace-panel="warehouse">[\s\S]*?<h2>门店配送<\/h2>[\s\S]*?<pre id="labelPrintOutput" class="output hidden-output"><\/pre>/) || [""])[0];
  const deliverySource = [
    extractFunctionSource(appJs, "renderTransferShipTargetHint"),
    extractFunctionSource(appJs, "renderTransferDeliveryHistory"),
    extractFunctionSource(appJs, "renderTransferTrackingResultSummary"),
  ].join("\n");
  assert.match(deliverySource, /renderStatusBadge/);
  assert.match(deliverySource, /getStatusCardClass/);
  assert.match(stylesCss, /\.store-delivery-sdo-card/);
  assert.match(stylesCss, /\.store-delivery-task-card/);
  assert.match(stylesCss, /\.store-delivery-timeline/);
  assert.doesNotMatch(deliveryPageHtml, /shipment aggregate|transfer aggregate|batch aggregate|route binding/i);
  assert.doesNotMatch(deliverySource, /shipment aggregate|transfer aggregate|batch aggregate|route binding/i);
});

test("门店配送 statuses keep shipment wording compact", () => {
  assert.match(appJs, /return chooseI18nLabel\("待发车", "Pending Dispatch"\);/);
  assert.match(appJs, /return chooseI18nLabel\("运输中", "In Transit"\);/);
  assert.match(appJs, /return chooseI18nLabel\("部分门店已收货", "Partially Received"\);/);
  assert.match(appJs, /return chooseI18nLabel\("全部收货完成", "Receiving Complete"\);/);
  assert.match(appJs, /return chooseI18nLabel\("异常 \/ 退回", "Exception \/ Return"\);/);
});

test("phase 2C page 6.1 summary cards and per-store grouping copy are present", () => {
  assert.match(appJs, /<strong>本车次配送数量<\/strong>/);
  assert.match(appJs, /<strong>待发车车次<\/strong>/);
  assert.match(appJs, /<strong>运输中车次<\/strong>/);
  assert.match(appJs, /<strong>已完成车次<\/strong>/);
  assert.match(appJs, /<strong>涉及门店数<\/strong>/);
  assert.match(appJs, /<strong>总包数<\/strong>/);
  assert.match(appJs, /<strong>待收货包数<\/strong>/);
  assert.match(appJs, /<strong>异常数<\/strong>/);
  assert.match(appJs, /<strong>本车次配送：\$\{escapeHtml\(group\.shipmentBatchNo \|\| "-"\)\}<\/strong>/);
  assert.match(appJs, /<strong>门店站点：\$\{escapeHtml\(String\(row\.to_store_code \|\| "-"\)\.toUpperCase\(\) \|\| "-"\)\}<\/strong>/);
  assert.match(appJs, /当前没有配送记录。确认发货后，这里会出现运输中的配送单。/);
});

test("page 6.1 shipment draft uses current SDO package counts", () => {
  assert.match(indexHtml, /id="transferShipForm"/);
  assert.match(indexHtml, /id="transferShipTargetHint"/);
  assert.match(indexHtml, /id="transferTrackingResultSummary"/);
  assert.match(indexHtml, /id="transferShipWaveSummary"/);
  assert.match(indexHtml, /id="transferDispatchSummary"/);
  assert.match(appJs, /function getTransferShipmentPackageCount/);
  assert.match(
    appJs,
    /store_delivery_execution_order\?\.packages[\s\S]*display_store_dispatch_bales[\s\S]*store_dispatch_bales[\s\S]*delivery_batch\?\.bale_count[\s\S]*dispatch_bale_count/,
  );
  assert.match(appJs, /getTransferShipmentPackageCount\(row\)/);
  assert.match(appJs, /function renderTransferShipTargetHint/);
  assert.match(appJs, /function loadTransferShipTargetHint/);
  assert.match(appJs, /data-transfer-ship-fill="\$\{escapeHtml\(row\.transfer_no \|\| ""\)\}"/);
  assert.match(appJs, /function populateTransferOrderSelectors/);
  assert.match(appJs, /#transferShipForm \[name='transfer_no'\]/);
  assert.match(appJs, /涉及门店数/);
  assert.match(appJs, /总包数/);
  assert.match(appJs, /总件数/);
  assert.match(indexHtml, /司机 \/ 电话 \/ 车牌号/);
  assert.match(appJs, /#transferShipForm/);
});


test("warehouse access profiles follow the current warehouse menu groups", () => {
  assert.match(appJs, /warehouse:\s*\["inbound", "departmentInbound", "workorder", "replenishment", "baleSales", "general", "china"\]/);
  assert.match(
    appJs,
    /warehouseManagerRoles[\s\S]*?createRoleAccessProfile\(\["warehouse"\],\s*\{\s*warehouse:\s*\["inbound", "departmentInbound", "workorder", "replenishment", "baleSales", "general", "china"\]/,
  );
  assert.match(
    appJs,
    /warehouseWorkerRoles[\s\S]*?createRoleAccessProfile\(\["warehouse"\],\s*\{\s*warehouse:\s*\["inbound", "departmentInbound", "workorder"\]/,
  );
});

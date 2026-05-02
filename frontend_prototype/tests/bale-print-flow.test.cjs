const test = require("node:test");
const assert = require("node:assert/strict");

const loadedFlow = require("../bale-print-flow.js");
const BalePrintFlow = Object.keys(loadedFlow).length ? loadedFlow : (globalThis.BalePrintFlow || {});
const {
  buildBaleGroupPrintPlan,
  buildBaleDirectPrintPayload,
  getBaleModalCloseAction,
  getBaleGroupCompletionAction,
  getBaleShipmentContinuationAction,
  getBaleModalCompletionAction,
  getBaleScanTestResult,
  buildBalePrintStationJobPayload,
} = BalePrintFlow;

test("buildBaleGroupPrintPlan keeps pending bale order and only requests missing queued jobs", () => {
  const targetGroup = {
    rows: [
      { bale_barcode: "BALE-001", serial_no: 1, printed_at: null },
      { bale_barcode: "BALE-002", serial_no: 2, printed_at: "2026-04-20T08:00:00Z" },
      { bale_barcode: "BALE-003", serial_no: 3, printed_at: null },
    ],
  };
  const queuedJobs = [
    { id: 501, barcode: "BALE-003", status: "queued" },
  ];

  const plan = buildBaleGroupPrintPlan(targetGroup, queuedJobs);

  assert.deepEqual(
    plan.pendingRows.map((row) => row.bale_barcode),
    ["BALE-001", "BALE-003"],
  );
  assert.deepEqual(
    plan.missingRows.map((row) => row.bale_barcode),
    ["BALE-001"],
  );
  assert.deepEqual(
    plan.orderedQueuedJobs.map((job) => job.barcode),
    ["BALE-003"],
  );
});

test("getBaleGroupCompletionAction refuses to bulk-complete when labels are still pending", () => {
  const targetGroup = {
    supplierName: "Youxun Demo",
    categoryMain: "dress",
    categorySub: "short dress",
    rows: [
      { bale_barcode: "BALE-001", printed_at: null },
      { bale_barcode: "BALE-002", printed_at: null },
    ],
  };

  const action = getBaleGroupCompletionAction(targetGroup);

  assert.equal(action.action, "resume_printing");
  assert.equal(action.pendingCount, 2);
});

test("getBaleShipmentContinuationAction blocks next step until every bale has printed_at", () => {
  const rows = [
    { bale_barcode: "BALE-001", printed_at: "2026-04-20T08:00:00Z" },
    { bale_barcode: "BALE-002", printed_at: null },
  ];
  const batchGroups = [
    { batchNo: "BL-001", rows: [rows[0]] },
    { batchNo: "BL-002", rows: [rows[1]] },
  ];

  const action = getBaleShipmentContinuationAction(rows, batchGroups);

  assert.equal(action.action, "resume_printing");
  assert.equal(action.pendingCount, 1);
  assert.equal(action.nextPendingKey, "BL-002");
});

test("getBaleModalCompletionAction requires a successful batch print before group completion", () => {
  const printFirst = getBaleModalCompletionAction({ pendingCount: 5, hasSuccessfulBatchPrint: false });
  assert.equal(printFirst.action, "print_first");
  assert.equal(printFirst.pendingCount, 5);

  const completeGroup = getBaleModalCompletionAction({ pendingCount: 5, hasSuccessfulBatchPrint: true });
  assert.equal(completeGroup.action, "complete_group");
  assert.equal(completeGroup.pendingCount, 5);

  const alreadyComplete = getBaleModalCompletionAction({ pendingCount: 0, hasSuccessfulBatchPrint: true });
  assert.equal(alreadyComplete.action, "already_complete");
  assert.equal(alreadyComplete.pendingCount, 0);
});

test("getBaleModalCloseAction always allows closing without marking the class as complete", () => {
  const beforeBatchPrint = getBaleModalCloseAction({ pendingCount: 5, hasSuccessfulBatchPrint: false });
  assert.equal(beforeBatchPrint.action, "allow_close");
  assert.match(beforeBatchPrint.message, /不会把这 5 包标记为已打印或已贴标/);

  const afterBatchPrintBeforeConfirm = getBaleModalCloseAction({ pendingCount: 5, hasSuccessfulBatchPrint: true });
  assert.equal(afterBatchPrintBeforeConfirm.action, "allow_close");
  assert.match(afterBatchPrintBeforeConfirm.message, /不会自动确认本包已贴标/);

  const afterConfirm = getBaleModalCloseAction({ pendingCount: 0, hasSuccessfulBatchPrint: true });
  assert.equal(afterConfirm.action, "allow_close");
  assert.equal(afterConfirm.message, "");
});

test("getBaleScanTestResult resolves a scanned bale inside the locked shipment", () => {
  const shipmentRows = [
    {
      bale_barcode: "RB260421000002",
      legacy_bale_barcode: "BALE-BL-001-002",
      scan_token: "RB260421000002",
      shipment_no: "TESTPRINT5-2026-04-21",
      parcel_batch_no: "BL-001",
      supplier_name: "Youxun Demo",
      category_main: "dress",
      category_sub: "short dress",
      serial_no: 2,
      printed_at: "2026-04-21T08:00:00Z",
    },
  ];

  const result = getBaleScanTestResult({
    shipmentNo: "TESTPRINT5-2026-04-21",
    barcode: " bale-bl-001-002 ",
    shipmentRows,
    allRows: shipmentRows,
  });

  assert.equal(result.status, "matched");
  assert.equal(result.barcode, "BALE-BL-001-002");
  assert.equal(result.baleBarcode, "RB260421000002");
  assert.equal(result.shipmentNo, "TESTPRINT5-2026-04-21");
  assert.equal(result.batchNo, "BL-001");
  assert.equal(result.groupKey, "BL-001");
  assert.equal(result.categoryDisplay, "dress / short dress");
  assert.equal(result.printed, true);
});

test("getBaleScanTestResult resolves a short scan_token back to the locked-shipment bale", () => {
  const shipmentRows = [
    {
      bale_barcode: "RB260421000002",
      legacy_bale_barcode: "BALE-BL-001-002",
      scan_token: "RB260421000002",
      shipment_no: "TESTPRINT5-2026-04-21",
      parcel_batch_no: "BL-001",
      supplier_name: "Youxun Demo",
      category_main: "dress",
      category_sub: "short dress",
      serial_no: 2,
      printed_at: null,
    },
  ];

  const result = getBaleScanTestResult({
    shipmentNo: "TESTPRINT5-2026-04-21",
    barcode: "rb260421000002",
    shipmentRows,
    allRows: shipmentRows,
  });

  assert.equal(result.status, "matched");
  assert.equal(result.barcode, "RB260421000002");
  assert.equal(result.shipmentNo, "TESTPRINT5-2026-04-21");
  assert.equal(result.batchNo, "BL-001");
  assert.equal(result.groupKey, "BL-001");
  assert.equal(result.printed, false);
});

test("buildBaleDirectPrintPayload keeps shipment trace fields for batch TSPL printing", () => {
  const payload = buildBaleDirectPrintPayload(
    {
      barcode: "RB042220000003",
      copies: 1,
      print_payload: {
        scan_token: "RB042220000003",
        barcode_value: "1042220003",
        machine_code: "1042220003",
        bale_barcode: "RB042220000003",
        legacy_bale_barcode: "BALE-BL-20260422-YOUXUN-SUMMERAP-001-003",
        supplier_name: "Youxun",
        category_main: "Summer+",
        category_sub: "wait indetify",
        category_display: "Summer+ / wait indetify",
        package_position_label: "第 3 包 / 共 3 包",
        serial_no: 3,
        total_packages: 3,
        shipment_no: "GOSUQ I N6862022-2026-04-22",
        parcel_batch_no: "BL-20260422-YOUXUN-SUMMERAP-001",
        unload_date: "2026-04-22T09:42",
      },
    },
    { printerName: "Deli DL-720C", templateCode: "bale_60x40", currentIndex: 2, totalJobs: 3 },
  );

  assert.equal(payload.shipment_no, "GOSUQ I N6862022-2026-04-22");
  assert.equal(payload.parcel_batch_no, "BL-20260422-YOUXUN-SUMMERAP-001");
  assert.equal(payload.unload_date, "2026-04-22T09:42");
  assert.equal(payload.display_code, "RB042220000003");
  assert.equal(payload.barcode_value, "1042220003");
  assert.equal(payload.scan_token, "1042220003");
  assert.equal(payload.human_readable, "1042220003");
});

test("buildBaleDirectPrintPayload uses RAW_BALE machine_code for printable barcode", () => {
  const payload = buildBaleDirectPrintPayload(
    {
      barcode: "RB260427AAAAB",
      copies: 1,
      print_payload: {
        display_code: "RB260427AAAAB",
        bale_barcode: "RB260427AAAAB",
        scan_token: "RB260427AAAAB",
        barcode_value: "1260427001",
        machine_code: "1260427001",
        human_readable: "1260427001",
        supplier_name: "Youxun",
        category_main: "Summer+",
        category_sub: "wait identify",
      },
    },
    { printerName: "Deli DL-720C", templateCode: "warehouse_in", currentIndex: 0, totalJobs: 1 },
  );

  assert.equal(payload.display_code, "RB260427AAAAB");
  assert.equal(payload.bale_barcode, "RB260427AAAAB");
  assert.equal(payload.machine_code, "1260427001");
  assert.equal(payload.barcode_value, "1260427001");
  assert.equal(payload.scan_token, "1260427001");
  assert.equal(payload.human_readable, "1260427001");
});

test("buildBaleDirectPrintPayload does not extract short digits from RAW_BALE display code", () => {
  const payload = buildBaleDirectPrintPayload(
    {
      barcode: "RB260427AAAQH",
      copies: 1,
      print_payload: {
        display_code: "RB260427AAAQH",
        bale_barcode: "RB260427AAAQH",
        scan_token: "RB260427AAAQH",
        barcode_value: "RB260427AAAQH",
        machine_code: "",
      },
    },
    { printerName: "Deli DL-720C", templateCode: "warehouse_in", currentIndex: 0, totalJobs: 1 },
  );

  assert.equal(payload.display_code, "RB260427AAAQH");
  assert.equal(payload.machine_code, "");
  assert.equal(payload.barcode_value, "");
  assert.equal(payload.scan_token, "");
  assert.equal(payload.human_readable, "");
});

test("buildBalePrintStationJobPayload keeps bale metadata for cloud queue printing", () => {
  const payload = buildBalePrintStationJobPayload(
    {
      barcode: "RB260427000005",
      print_payload: {
        display_code: "RB260427000005",
        scan_token: "1260427005",
        barcode_value: "1260427005",
        machine_code: "1260427005",
        bale_barcode: "RB260427000005",
        supplier_name: "Youxun Demo",
        category_main: "dress",
        category_sub: "short dress",
        parcel_batch_no: "BL-001",
        shipment_no: "SHIP-2026-04-27",
        total_packages: 12,
        serial_no: 5,
      },
    },
    {
      currentIndex: 4,
      totalJobs: 12,
    },
  );

  assert.equal(payload.code, "1260427005");
  assert.equal(payload.supplier, "Youxun Demo");
  assert.equal(payload.category, "dress");
  assert.equal(payload.subcategory, "short dress");
  assert.equal(payload.batch, "BL-001");
  assert.equal(payload.ship_reference, "SHIP-2026-04-27");
  assert.equal(payload.total_number, 12);
  assert.equal(payload.sequence_number, 5);
});

test("getBaleScanTestResult tolerates a uniquely truncated short code from scanner loss", () => {
  const shipmentRows = [
    {
      bale_barcode: "RB042120000002",
      legacy_bale_barcode: "BALE-BL-001-002",
      scan_token: "RB042120000002",
      shipment_no: "TESTPRINT5-2026-04-21",
      parcel_batch_no: "BL-001",
      supplier_name: "Youxun Demo",
      category_main: "dress",
      category_sub: "short dress",
      serial_no: 2,
      printed_at: "2026-04-21T08:00:00Z",
    },
  ];

  const result = getBaleScanTestResult({
    shipmentNo: "TESTPRINT5-2026-04-21",
    barcode: "RB04220000002",
    shipmentRows,
    allRows: shipmentRows,
  });

  assert.equal(result.status, "matched");
  assert.equal(result.approximate, true);
  assert.equal(result.baleBarcode, "RB042120000002");
});

test("getBaleScanTestResult flags a bale from another shipment without treating it as current-shipment success", () => {
  const currentShipmentRows = [
    {
      bale_barcode: "RB260421000001",
      legacy_bale_barcode: "BALE-BL-001-001",
      shipment_no: "TESTPRINT5-2026-04-21",
      parcel_batch_no: "BL-001",
      supplier_name: "Youxun Demo",
      category_main: "dress",
      category_sub: "short dress",
      serial_no: 1,
      printed_at: null,
    },
  ];
  const allRows = [
    ...currentShipmentRows,
    {
      bale_barcode: "RB260421000009",
      legacy_bale_barcode: "BALE-BL-009-001",
      shipment_no: "OTHERSHIP-2026-04-22",
      parcel_batch_no: "BL-009",
      supplier_name: "Other Supplier",
      category_main: "tops",
      category_sub: "t-shirt",
      serial_no: 1,
      printed_at: null,
    },
  ];

  const result = getBaleScanTestResult({
    shipmentNo: "TESTPRINT5-2026-04-21",
    barcode: "BALE-BL-009-001",
    shipmentRows: currentShipmentRows,
    allRows,
  });

  assert.equal(result.status, "foreign_shipment");
  assert.equal(result.barcode, "BALE-BL-009-001");
  assert.equal(result.shipmentNo, "OTHERSHIP-2026-04-22");
  assert.equal(result.categoryDisplay, "tops / t-shirt");
  assert.equal(result.groupKey, "BL-009");
});

test("getBaleScanTestResult rejects empty scans before any shipment lookup", () => {
  const result = getBaleScanTestResult({
    shipmentNo: "TESTPRINT5-2026-04-21",
    barcode: "   ",
    shipmentRows: [],
    allRows: [],
  });

  assert.equal(result.status, "empty");
  assert.equal(result.barcode, "");
});

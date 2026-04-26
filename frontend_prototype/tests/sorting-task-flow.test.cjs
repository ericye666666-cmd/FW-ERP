const test = require("node:test");
const assert = require("node:assert/strict");

const {
  findSortingTaskLookupMatches,
  addBaleToSortingTaskSelection,
  getSortingScannerDiagnostic,
  buildSortingTaskManagerBuckets,
} = require("../sorting-task-flow.js");

test("findSortingTaskLookupMatches searches ready bales across shipments", () => {
  const rows = [
    { bale_barcode: "RB260421000001", legacy_bale_barcode: "BALE-001", shipment_no: "SHIP-1", supplier_name: "Youxun", category_main: "SummerA+", category_sub: "SummerA+", status: "ready_for_sorting" },
    { bale_barcode: "RB260421000002", legacy_bale_barcode: "BALE-002", shipment_no: "SHIP-2", supplier_name: "Youxun", category_main: "SummerA+", category_sub: "SummerA+", status: "ready_for_sorting" },
    { bale_barcode: "RB260421000003", legacy_bale_barcode: "BALE-003", shipment_no: "SHIP-3", supplier_name: "Other", category_main: "WinterA+", category_sub: "WinterA+", status: "in_bale_sales_pool" },
  ];

  const matches = findSortingTaskLookupMatches(rows, {
    searchValue: "youxun",
    selectedBaleCodes: [],
    occupiedBaleCodes: [],
  });

  assert.deepEqual(matches.map((row) => row.bale_barcode), ["RB260421000001", "RB260421000002"]);
});

test("addBaleToSortingTaskSelection allows adding ready bales from multiple shipments", () => {
  const rows = [
    { bale_barcode: "RB260421000001", legacy_bale_barcode: "BALE-001", shipment_no: "SHIP-1", status: "ready_for_sorting", occupied_by_task_no: "" },
    { bale_barcode: "RB260421000002", legacy_bale_barcode: "BALE-002", shipment_no: "SHIP-2", status: "ready_for_sorting", occupied_by_task_no: "" },
  ];

  const first = addBaleToSortingTaskSelection({
    allBales: rows,
    selectedBaleCodes: [],
    baleCode: "RB260421000001",
  });
  const second = addBaleToSortingTaskSelection({
    allBales: rows,
    selectedBaleCodes: first.selectedBaleCodes,
    baleCode: "RB260421000002",
  });

  assert.deepEqual(second.selectedBaleCodes, ["RB260421000001", "RB260421000002"]);
});

test("addBaleToSortingTaskSelection accepts legacy bale code but keeps short bale code as canonical selection", () => {
  const rows = [
    { bale_barcode: "RB260421000001", legacy_bale_barcode: "BALE-BL-001-001", scan_token: "RB260421000001", shipment_no: "SHIP-1", status: "ready_for_sorting", occupied_by_task_no: "" },
  ];

  const result = addBaleToSortingTaskSelection({
    allBales: rows,
    selectedBaleCodes: [],
    baleCode: "bale-bl-001-001",
  });

  assert.equal(result.ok, true);
  assert.equal(result.duplicate, false);
  assert.equal(result.matchedRow?.bale_barcode, "RB260421000001");
  assert.equal(result.matchedRow?.legacy_bale_barcode, "BALE-BL-001-001");
  assert.deepEqual(result.selectedBaleCodes, ["RB260421000001"]);
});

test("addBaleToSortingTaskSelection accepts a uniquely truncated short code from scanner loss", () => {
  const rows = [
    { bale_barcode: "RB042120000002", legacy_bale_barcode: "BALE-BL-001-002", scan_token: "RB042120000002", shipment_no: "SHIP-1", status: "ready_for_sorting", occupied_by_task_no: "" },
  ];

  const result = addBaleToSortingTaskSelection({
    allBales: rows,
    selectedBaleCodes: [],
    baleCode: "RB04220000002",
  });

  assert.equal(result.ok, true);
  assert.equal(result.approximate, true);
  assert.equal(result.matchedRow?.bale_barcode, "RB042120000002");
  assert.deepEqual(result.selectedBaleCodes, ["RB042120000002"]);
});

test("addBaleToSortingTaskSelection rejects truncated short code when multiple rows are equally close", () => {
  const rows = [
    { bale_barcode: "RB042120000001", legacy_bale_barcode: "BALE-BL-001-001", scan_token: "RB042120000001", shipment_no: "SHIP-1", status: "ready_for_sorting", occupied_by_task_no: "" },
    { bale_barcode: "RB042120000002", legacy_bale_barcode: "BALE-BL-001-002", scan_token: "RB042120000002", shipment_no: "SHIP-1", status: "ready_for_sorting", occupied_by_task_no: "" },
  ];

  const result = addBaleToSortingTaskSelection({
    allBales: rows,
    selectedBaleCodes: [],
    baleCode: "RB04212000000",
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /多个可能 bale/);
});

test("addBaleToSortingTaskSelection rejects occupied or non-ready bales", () => {
  const rows = [
    { bale_barcode: "RB260421000001", legacy_bale_barcode: "BALE-001", shipment_no: "SHIP-1", status: "sorting_in_progress", occupied_by_task_no: "ST-001" },
    { bale_barcode: "RB260421000002", legacy_bale_barcode: "BALE-002", shipment_no: "SHIP-2", status: "in_bale_sales_pool", occupied_by_task_no: "" },
  ];

  const occupied = addBaleToSortingTaskSelection({
    allBales: rows,
    selectedBaleCodes: [],
    baleCode: "BALE-001",
  });
  const salesPool = addBaleToSortingTaskSelection({
    allBales: rows,
    selectedBaleCodes: [],
    baleCode: "BALE-002",
  });

  assert.equal(occupied.ok, false);
  assert.match(occupied.error, /不能加入/);
  assert.equal(salesPool.ok, false);
  assert.match(salesPool.error, /不能加入/);
});

test("getSortingScannerDiagnostic marks scanner ready when a keyed scan ends with enter", () => {
  const diagnostic = getSortingScannerDiagnostic({
    hidSupported: true,
    usbSupported: true,
    hidDeviceCount: 0,
    usbDeviceCount: 0,
    inputFocused: true,
    detectionArmed: true,
    detectionStartedAtMs: 1000,
    nowMs: 1500,
    lastCompletedScan: {
      value: "BALE-001",
      target: "bale_lookup",
      terminator: "enter",
      durationMs: 42,
      capturedAtMs: 1450,
    },
  });

  assert.equal(diagnostic.status, "keyboard_ready");
  assert.equal(diagnostic.canAutoAdd, true);
  assert.match(diagnostic.headline, /扫码枪输入正常/);
  assert.match(diagnostic.recommendations.join(" "), /继续直接扫码/);
});

test("getSortingScannerDiagnostic warns when a scan arrives without enter or tab suffix", () => {
  const diagnostic = getSortingScannerDiagnostic({
    hidSupported: true,
    usbSupported: false,
    hidDeviceCount: 0,
    usbDeviceCount: 0,
    inputFocused: true,
    detectionArmed: true,
    detectionStartedAtMs: 1000,
    nowMs: 2200,
    lastCompletedScan: {
      value: "BALE-002",
      target: "bale_lookup",
      terminator: "none",
      durationMs: 65,
      capturedAtMs: 2100,
    },
  });

  assert.equal(diagnostic.status, "suffix_missing");
  assert.equal(diagnostic.canAutoAdd, false);
  assert.match(diagnostic.headline, /没有回车或 Tab 后缀/);
  assert.match(diagnostic.recommendations.join(" "), /后缀设成 Enter 或 Tab/);
});

test("getSortingScannerDiagnostic shows focus issue when no input arrives and the scan box is not focused", () => {
  const diagnostic = getSortingScannerDiagnostic({
    hidSupported: false,
    usbSupported: false,
    hidDeviceCount: 0,
    usbDeviceCount: 0,
    inputFocused: false,
    detectionArmed: true,
    detectionStartedAtMs: 1000,
    nowMs: 15000,
    lastCompletedScan: null,
  });

  assert.equal(diagnostic.status, "focus_missing");
  assert.equal(diagnostic.canAutoAdd, false);
  assert.match(diagnostic.headline, /焦点不在扫码框/);
  assert.match(diagnostic.recommendations.join(" "), /先点“聚焦扫码框”/);
});

test("getSortingScannerDiagnostic recognizes authorized direct devices even before a scan", () => {
  const diagnostic = getSortingScannerDiagnostic({
    hidSupported: true,
    usbSupported: true,
    hidDeviceCount: 1,
    usbDeviceCount: 0,
    inputFocused: true,
    detectionArmed: false,
    detectionStartedAtMs: 0,
    nowMs: 5000,
    lastCompletedScan: null,
  });

  assert.equal(diagnostic.status, "direct_device_ready");
  assert.equal(diagnostic.authorizedDeviceCount, 1);
  assert.match(diagnostic.headline, /已检测到浏览器可见设备/);
});

test("buildSortingTaskManagerBuckets always keeps open tasks visible and date-filters completed tasks", () => {
  const buckets = buildSortingTaskManagerBuckets(
    [
      { task_no: "ST-OPEN-OLD", status: "open", started_at: "2026-04-20T08:00:00+00:00" },
      { task_no: "ST-OPEN-TODAY", status: "open", started_at: "2026-04-22T08:00:00+00:00" },
      { task_no: "ST-DONE-TODAY", status: "confirmed", started_at: "2026-04-22T09:00:00+00:00" },
      { task_no: "ST-DONE-OLD", status: "confirmed", started_at: "2026-04-20T09:00:00+00:00" },
    ],
    "2026-04-22",
  );

  assert.deepEqual(buckets.openRows.map((row) => row.task_no), ["ST-OPEN-OLD", "ST-OPEN-TODAY"]);
  assert.deepEqual(buckets.completedRows.map((row) => row.task_no), ["ST-DONE-TODAY"]);
  assert.deepEqual(buckets.visibleRows.map((row) => row.task_no), ["ST-OPEN-OLD", "ST-OPEN-TODAY", "ST-DONE-TODAY"]);
});

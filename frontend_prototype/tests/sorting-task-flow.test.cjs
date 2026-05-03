const test = require("node:test");
const assert = require("node:assert/strict");

const loadedFlow = require("../sorting-task-flow.js");
const SortingTaskFlow = Object.keys(loadedFlow).length ? loadedFlow : (globalThis.SortingTaskFlow || {});
const {
  findSortingTaskLookupMatches,
  addBaleToSortingTaskSelection,
  mergeSortingTaskLookupBales,
  getSortingScannerDiagnostic,
  buildSortingTaskManagerBuckets,
} = SortingTaskFlow;

test("mergeSortingTaskLookupBales keeps raw bale machine_code for sorting lookup", () => {
  const merged = mergeSortingTaskLookupBales(
    [
      {
        bale_barcode: "RB260427AAAUB",
        scan_token: "RB260427AAAUB",
        status: "ready_for_sorting",
      },
    ],
    [
      {
        bale_barcode: "RB260427AAAUB",
        machine_code: "1260427521",
        barcode_value: "1260427521",
        human_readable: "1260427521",
        status: "ready_for_sorting",
        occupied_by_task_no: "",
        can_route_to_sorting: true,
        source_cost_completed: true,
      },
    ],
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0].bale_barcode, "RB260427AAAUB");
  assert.equal(merged[0].scan_token, "RB260427AAAUB");
  assert.equal(merged[0].machine_code, "1260427521");
  assert.equal(merged[0].barcode_value, "1260427521");
  assert.equal(merged[0].human_readable, "1260427521");
  assert.equal(merged[0].can_route_to_sorting, true);
});

test("mergeSortingTaskLookupBales gives raw bale stock fields priority", () => {
  const merged = mergeSortingTaskLookupBales(
    [
      {
        bale_barcode: "rb260427aaaub",
        status: "pending_print",
        occupied_by_task_no: "ST-OLD",
        current_location: "intake",
        source_cost_completed: false,
      },
    ],
    [
      {
        bale_barcode: "RB260427AAAUB",
        status: "ready_for_sorting",
        occupied_by_task_no: "",
        current_location: "warehouse_raw_bale_stock",
        source_cost_completed: true,
        machine_code: "1260427521",
      },
    ],
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0].bale_barcode, "RB260427AAAUB");
  assert.equal(merged[0].status, "ready_for_sorting");
  assert.equal(merged[0].occupied_by_task_no, "");
  assert.equal(merged[0].current_location, "warehouse_raw_bale_stock");
  assert.equal(merged[0].source_cost_completed, true);
  assert.equal(merged[0].machine_code, "1260427521");
});

test("merged sorting lookup accepts real RAW_BALE machine_code and stores canonical bale_barcode", () => {
  const merged = mergeSortingTaskLookupBales(
    [
      {
        bale_barcode: "RB260427AAAUB",
        scan_token: "RB260427AAAUB",
        status: "ready_for_sorting",
      },
    ],
    [
      {
        bale_barcode: "RB260427AAAUB",
        machine_code: "1260427521",
        barcode_value: "1260427521",
        human_readable: "1260427521",
        status: "ready_for_sorting",
        occupied_by_task_no: "",
        source_cost_completed: true,
      },
    ],
  );

  const result = addBaleToSortingTaskSelection({
    allBales: merged,
    selectedBaleCodes: [],
    baleCode: "1260427521",
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.selectedBaleCodes, ["RB260427AAAUB"]);
  assert.notDeepEqual(result.selectedBaleCodes, ["1260427521"]);
});

test("addBaleToSortingTaskSelection allows recorded source cost pending allocation", () => {
  const result = addBaleToSortingTaskSelection({
    allBales: [
      {
        bale_barcode: "RB260427AAAUB",
        machine_code: "1260427521",
        barcode_value: "1260427521",
        human_readable: "1260427521",
        status: "ready_for_sorting",
        occupied_by_task_no: "",
        source_cost_completed: false,
        source_cost_allows_sorting: true,
        source_cost_gate_status: "recorded_pending_allocation",
        source_cost_gate_message: "来源成本已记录，待分摊；可先创建分拣任务。",
        source_allocated_cost_kes: null,
      },
    ],
    selectedBaleCodes: [],
    baleCode: "1260427521",
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.selectedBaleCodes, ["RB260427AAAUB"]);
  assert.notDeepEqual(result.selectedBaleCodes, ["1260427521"]);
  assert.match(result.warning, /待分摊/);
});

test("addBaleToSortingTaskSelection blocks explicit source cost gate failure statuses", () => {
  for (const status of ["missing_source", "missing_cost_record", "invalid_weight_or_qty"]) {
    const result = addBaleToSortingTaskSelection({
      allBales: [
        {
          bale_barcode: `RB-${status}`,
          machine_code: "1260427521",
          status: "ready_for_sorting",
          occupied_by_task_no: "",
          source_cost_allows_sorting: false,
          source_cost_gate_status: status,
          source_cost_gate_message: `blocked by ${status}`,
        },
      ],
      selectedBaleCodes: [],
      baleCode: "1260427521",
    });

    assert.equal(result.ok, false);
    assert.match(result.error, new RegExp(status));
  }
});

test("merged sorting lookup still rejects non-RAW_BALE machine_code prefixes", () => {
  const merged = mergeSortingTaskLookupBales(
    [],
    ["2260427521", "3260427521", "4260427521", "5260427521"].map((machineCode) => ({
      bale_barcode: `RB-${machineCode}`,
      machine_code: machineCode,
      barcode_value: machineCode,
      human_readable: machineCode,
      status: "ready_for_sorting",
      occupied_by_task_no: "",
      source_cost_completed: true,
    })),
  );

  for (const machineCode of ["2260427521", "3260427521", "4260427521", "5260427521"]) {
    const result = addBaleToSortingTaskSelection({
      allBales: merged,
      selectedBaleCodes: [],
      baleCode: machineCode,
    });

    assert.equal(result.ok, false);
    assert.match(result.error, /RAW_BALE/);
    assert.deepEqual(result.selectedBaleCodes, []);
  }
});

test("findSortingTaskLookupMatches searches ready bales across shipments", () => {
  const rows = [
    { bale_barcode: "RB260421000001", legacy_bale_barcode: "BALE-001", shipment_no: "SHIP-1", supplier_name: "Youxun", category_main: "SummerA+", category_sub: "SummerA+", status: "ready_for_sorting", source_cost_completed: true },
    { bale_barcode: "RB260421000002", legacy_bale_barcode: "BALE-002", shipment_no: "SHIP-2", supplier_name: "Youxun", category_main: "SummerA+", category_sub: "SummerA+", status: "ready_for_sorting", source_cost_completed: true },
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
    { bale_barcode: "RB260421000001", legacy_bale_barcode: "BALE-001", shipment_no: "SHIP-1", status: "ready_for_sorting", occupied_by_task_no: "", source_cost_completed: true },
    { bale_barcode: "RB260421000002", legacy_bale_barcode: "BALE-002", shipment_no: "SHIP-2", status: "ready_for_sorting", occupied_by_task_no: "", source_cost_completed: true },
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
    { bale_barcode: "RB260421000001", legacy_bale_barcode: "BALE-BL-001-001", scan_token: "RB260421000001", shipment_no: "SHIP-1", status: "ready_for_sorting", occupied_by_task_no: "", source_cost_completed: true },
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

test("addBaleToSortingTaskSelection accepts RAW_BALE machine_code but keeps canonical bale_barcode", () => {
  const rows = [
    {
      bale_barcode: "RB260427AAAQH",
      legacy_bale_barcode: "BALE-BL-001-001",
      scan_token: "RB260427AAAQH",
      machine_code: "1260427396",
      barcode_value: "1260427396",
      human_readable: "1260427396",
      shipment_no: "SHIP-1",
      status: "ready_for_sorting",
      occupied_by_task_no: "",
      source_cost_completed: true,
    },
  ];

  const result = addBaleToSortingTaskSelection({
    allBales: rows,
    selectedBaleCodes: [],
    baleCode: "1260427396",
  });

  assert.equal(result.ok, true);
  assert.equal(result.duplicate, false);
  assert.equal(result.matchedRow?.bale_barcode, "RB260427AAAQH");
  assert.deepEqual(result.selectedBaleCodes, ["RB260427AAAQH"]);
  assert.notDeepEqual(result.selectedBaleCodes, ["1260427396"]);
});

test("addBaleToSortingTaskSelection accepts RAW_BALE barcode_value and human_readable machine code", () => {
  const rows = [
    {
      bale_barcode: "RB260427AAARB",
      legacy_bale_barcode: "BALE-BL-001-002",
      scan_token: "RB260427AAARB",
      barcode_value: "1260427397",
      shipment_no: "SHIP-1",
      status: "ready_for_sorting",
      occupied_by_task_no: "",
      source_cost_completed: true,
    },
    {
      bale_barcode: "RB260427AAAHR",
      legacy_bale_barcode: "BALE-BL-001-003",
      scan_token: "RB260427AAAHR",
      machine_code: "1260427398",
      human_readable: "1260427398",
      shipment_no: "SHIP-1",
      status: "ready_for_sorting",
      occupied_by_task_no: "",
      source_cost_completed: true,
    },
  ];

  const byBarcodeValue = addBaleToSortingTaskSelection({
    allBales: rows,
    selectedBaleCodes: [],
    baleCode: "1260427397",
  });
  const byHumanReadable = addBaleToSortingTaskSelection({
    allBales: rows,
    selectedBaleCodes: [],
    baleCode: "1260427398",
  });

  assert.equal(byBarcodeValue.ok, true);
  assert.deepEqual(byBarcodeValue.selectedBaleCodes, ["RB260427AAARB"]);
  assert.equal(byHumanReadable.ok, true);
  assert.deepEqual(byHumanReadable.selectedBaleCodes, ["RB260427AAAHR"]);
});

test("addBaleToSortingTaskSelection rejects non-RAW_BALE machine_code prefixes", () => {
  for (const machineCode of ["2260427396", "3260427396", "4260427396", "5260427396"]) {
    const result = addBaleToSortingTaskSelection({
      allBales: [
        {
          bale_barcode: `RB-${machineCode}`,
          machine_code: machineCode,
          barcode_value: machineCode,
          human_readable: machineCode,
          status: "ready_for_sorting",
          occupied_by_task_no: "",
          source_cost_completed: true,
        },
      ],
      selectedBaleCodes: [],
      baleCode: machineCode,
    });

    assert.equal(result.ok, false);
    assert.match(result.error, /RAW_BALE/);
    assert.deepEqual(result.selectedBaleCodes, []);
  }
});

test("addBaleToSortingTaskSelection keeps status and source-cost gates after machine_code match", () => {
  const blockedByStatus = addBaleToSortingTaskSelection({
    allBales: [
      {
        bale_barcode: "RB260427AAAST",
        machine_code: "1260427399",
        status: "sorting_in_progress",
        occupied_by_task_no: "",
        source_cost_completed: true,
      },
    ],
    selectedBaleCodes: [],
    baleCode: "1260427399",
  });
  const blockedByCost = addBaleToSortingTaskSelection({
    allBales: [
      {
        bale_barcode: "RB260427AAASC",
        machine_code: "1260427400",
        status: "ready_for_sorting",
        occupied_by_task_no: "",
        source_cost_completed: false,
      },
    ],
    selectedBaleCodes: [],
    baleCode: "1260427400",
  });

  assert.equal(blockedByStatus.ok, false);
  assert.match(blockedByStatus.error, /当前状态不能加入分拣任务/);
  assert.equal(blockedByCost.ok, false);
  assert.match(blockedByCost.error, /来源成本未完成/);
});

test("addBaleToSortingTaskSelection gives RAW_BALE machine_code not-found guidance", () => {
  const result = addBaleToSortingTaskSelection({
    allBales: [],
    selectedBaleCodes: [],
    baleCode: "1260427396",
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /未找到这个 RAW_BALE machine_code/);
});

test("addBaleToSortingTaskSelection accepts a uniquely truncated short code from scanner loss", () => {
  const rows = [
    { bale_barcode: "RB042120000002", legacy_bale_barcode: "BALE-BL-001-002", scan_token: "RB042120000002", shipment_no: "SHIP-1", status: "ready_for_sorting", occupied_by_task_no: "", source_cost_completed: true },
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

test("addBaleToSortingTaskSelection rejects bale without completed source cost", () => {
  const rows = [
    { bale_barcode: "RB260421000009", status: "ready_for_sorting", occupied_by_task_no: "", source_cost_completed: false },
  ];
  const result = addBaleToSortingTaskSelection({
    allBales: rows,
    selectedBaleCodes: [],
    baleCode: "RB260421000009",
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /来源成本未完成/);
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

test("getSortingScannerDiagnostic shows non-fatal copy when barcode is already in pending list", () => {
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
      value: "RB260421000001",
      target: "bale_lookup",
      terminator: "none",
      membershipStatus: "already_added",
      durationMs: 65,
      capturedAtMs: 2100,
    },
  });

  assert.equal(diagnostic.status, "suffix_missing");
  assert.equal(diagnostic.severity, "info");
  assert.match(diagnostic.detail, /已识别条码：RB260421000001/);
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

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const backendRoutes = fs.readFileSync(path.join(__dirname, "../../backend/app/api/routes.py"), "utf8");
const backendState = fs.readFileSync(path.join(__dirname, "../../backend/app/core/state.py"), "utf8");

function loadOperationsFulfillmentFlow() {
  const filename = path.join(__dirname, "../operations-fulfillment-flow.js");
  const sandbox = { module: { exports: {} } };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), sandbox, { filename });
  return sandbox.module.exports;
}

function loadStorePrepBaleFlow() {
  const filename = path.join(__dirname, "../store-prep-bale-flow.js");
  const sandbox = { module: { exports: {} } };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), sandbox, { filename });
  return sandbox.module.exports;
}

test("LPK print payload uses display code for humans and type-3 machine code for barcode", () => {
  const flow = loadOperationsFulfillmentFlow();
  const plan = flow.buildTransferPreparationPlan({
    demandLines: [
      { category_main: "tops", category_sub: "lady tops", grade: "P", requested_qty: 10 },
    ],
    preparedBales: [],
    looseRows: [
      { category_name: "tops / lady tops", qty_on_hand: 10, rack_code: "A-01" },
    ],
  });
  const [task] = flow.buildLoosePackingTasks({
    transferNo: "TO-20260428-001",
    plan,
  });

  const payload = flow.buildLoosePickSheetDirectPrintPayload({
    task,
    transfer: { transfer_no: "TO-20260428-001", to_store_code: "UTAWALA" },
    storeName: "UTAWALA",
    printerName: "Deli DL-720C",
  });

  assert.equal(payload.display_code, "LPK260428001");
  assert.equal(payload.machine_code, "3260428001");
  assert.equal(payload.barcode_value, "3260428001");
  assert.equal(payload.scan_token, "3260428001");
  assert.equal(payload.human_readable, "3260428001");
  assert.equal(payload.bale_barcode, "LPK260428001");
  assert.notEqual(payload.display_code, payload.barcode_value);
});

test("SDB print payload uses display code for humans and type-2 machine code for barcode", () => {
  const flow = loadStorePrepBaleFlow();
  const payload = flow.buildStorePrepBaleDirectPrintPayload({
    bale_no: "SPB-20260428-001",
    bale_barcode: "SDB260428AAB",
    scan_token: "SDB260428AAB",
    machine_code: "2260428002",
    task_no: "SPT-20260428-001",
    task_type: "store_dispatch",
    category_main: "dress",
    category_sub: "long dress",
    qty: 100,
  });

  assert.equal(payload.display_code, "SDB260428AAB");
  assert.equal(payload.machine_code, "2260428002");
  assert.equal(payload.barcode_value, "2260428002");
  assert.equal(payload.scan_token, "2260428002");
  assert.equal(payload.human_readable, "2260428002");
  assert.equal(payload.dispatch_bale_no, "2260428002");
  assert.notEqual(payload.display_code, payload.barcode_value);
});

test("RAW_BALE print code paths prefer type-1 machine_code over RB display code", () => {
  assert.match(backendRoutes, /encoded_barcode_value = str\(\s*payload\.get\("machine_code"\)\s*or payload\.get\("barcode_value"\)\s*or payload\.get\("scan_token"\)/);
  assert.match(backendRoutes, /barcode_value = display\["barcode_value"\]/);
  assert.match(backendRoutes, /_build_code128_svg\(barcode_value,\s*width_mm,\s*height_mm\)/);
  assert.match(backendRoutes, /payload\.get\("machine_code"\)\s*or payload\.get\("barcode_value"\)\s*or payload\.get\("scan_token"\)\s*or payload\.get\("dispatch_bale_no"\)/);
  assert.match(backendRoutes, /"trace_shipment": f"Encoded: \{trace_code\}" if is_warehouse_in_label/);
  assert.match(backendState, /"barcode_value": machine_code/);
  assert.match(backendState, /"scan_token": machine_code/);
  assert.match(backendState, /"human_readable": machine_code/);
  assert.match(backendState, /"display_code": bale_barcode/);
  assert.doesNotMatch(backendState, /"barcode_value": bale_barcode/);
  assert.doesNotMatch(backendState, /"barcode_value": .*display_code/);
  assert.doesNotMatch(backendState, /"human_readable": bale_barcode/);
});

test("direct preview copy shows display, machine, and encoded values while Code128 uses machine code", () => {
  const appJs = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
  assert.match(appJs, /renderCode128Svg\(barcodeValue/);
  assert.match(appJs, /Display: \$\{escapeHtml\(displayCode \|\| "-"\)\}/);
  assert.match(appJs, /Machine: \$\{escapeHtml\(machineCode \|\| "-"\)\}/);
  assert.match(appJs, /Encoded: \$\{escapeHtml\(barcodeValue \|\| "-"\)\}/);
  assert.match(appJs, /data-barcode-value="\$\{escapeHtml\(barcodeValue\)\}"/);
  assert.doesNotMatch(appJs, /renderCode128Svg\(displayCode/);
});

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
});

test("RAW_BALE print code paths prefer type-1 machine_code over RB display code", () => {
  assert.match(backendRoutes, /encoded_barcode_value = str\(\s*payload\.get\("machine_code"\)\s*or payload\.get\("barcode_value"\)\s*or payload\.get\("scan_token"\)/);
  assert.match(backendRoutes, /barcode_value = display\["barcode_value"\]/);
  assert.match(backendRoutes, /_build_code128_svg\(barcode_value,\s*width_mm,\s*height_mm\)/);
  assert.match(backendState, /"barcode_value": machine_code/);
  assert.match(backendState, /"scan_token": machine_code/);
  assert.match(backendState, /"human_readable": machine_code/);
  assert.match(backendState, /"display_code": bale_barcode/);
  assert.doesNotMatch(backendState, /"barcode_value": bale_barcode/);
  assert.doesNotMatch(backendState, /"barcode_value": .*display_code/);
  assert.doesNotMatch(backendState, /"human_readable": bale_barcode/);
});

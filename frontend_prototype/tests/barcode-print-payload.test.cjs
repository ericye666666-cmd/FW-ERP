const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

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


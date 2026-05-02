const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const {
  buildStorePrepBaleDirectPrintPayload,
  buildStorePrepCategoryOptions,
  estimateSaleBaleGradeMix,
  getStorePrepTemplateDefaultCode,
  pickPreferredStorePrepTemplateCode,
  summarizeStorePrepBales,
} = (() => {
  const filename = path.join(__dirname, "../store-prep-bale-flow.js");
  const sandbox = { module: { exports: {} } };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), sandbox, { filename });
  return sandbox.module.exports;
})();

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test("buildStorePrepCategoryOptions groups current sorted inventory by subcategory", () => {
  const options = buildStorePrepCategoryOptions([
    { category_name: "dress / 2 pieces", qty_on_hand: 5 },
    { category_name: "tops / lady tops", qty_on_hand: 8 },
    { category_name: "dress / 2 pieces", qty_on_hand: 7 },
  ]);

  assert.deepEqual(plain(options), [
    { value: "", label: "选择小类" },
    { value: "2 pieces", label: "2 pieces · 可打包 12 件" },
    { value: "lady tops", label: "lady tops · 可打包 8 件" },
  ]);
});

test("summarizeStorePrepBales keeps warehouse packaged inventory in KES", () => {
  const summary = summarizeStorePrepBales([
    { bale_no: "SPB-001", task_type: "store_dispatch", qty: 50, total_cost_kes: 4000, updated_at: "2026-04-23T08:00:00Z" },
    { bale_no: "SPB-002", task_type: "sale", qty: 100, total_cost_kes: 8500, updated_at: "2026-04-23T09:30:00Z" },
  ]);

  assert.deepEqual(plain(summary), {
    baleCount: 2,
    dispatchBaleCount: 1,
    saleBaleCount: 1,
    totalQty: 150,
    totalCostKes: 12500,
    latestUpdatedAt: "2026-04-23T09:30:00Z",
  });
});

test("estimateSaleBaleGradeMix derives target pieces and graded counts from weight and ratio", () => {
  const estimate = estimateSaleBaleGradeMix({
    targetWeightKg: 40,
    standardPieceWeightKg: 2,
    gradeRatios: [
      { grade: "P", ratioPct: 80 },
      { grade: "S", ratioPct: 20 },
    ],
  });

  assert.deepEqual(plain(estimate), {
    targetQty: 20,
    ratioSummary: "P80% / S20%",
    gradeRequirements: [
      { grade: "P", qty: 16 },
      { grade: "S", qty: 4 },
    ],
  });
});

test("pickPreferredStorePrepTemplateCode defaults by task type inside warehouseout template family", () => {
  const templates = [
    { template_code: "transtoshop" },
    { template_code: "wait_for_transtoshop" },
    { template_code: "wait_for_sale" },
  ];

  assert.equal(getStorePrepTemplateDefaultCode("store_dispatch"), "wait_for_transtoshop");
  assert.equal(getStorePrepTemplateDefaultCode("sale"), "wait_for_sale");
  assert.equal(
    pickPreferredStorePrepTemplateCode(templates, { taskType: "store_dispatch" }),
    "wait_for_transtoshop",
  );
  assert.equal(
    pickPreferredStorePrepTemplateCode(templates, { taskType: "sale" }),
    "wait_for_sale",
  );
});

test("buildStorePrepBaleDirectPrintPayload reuses the bale's historical barcode and task-type template", () => {
  const payload = buildStorePrepBaleDirectPrintPayload(
    {
      bale_no: "SPB-20260423-004",
      bale_barcode: "SDB260423004",
      scan_token: "SDB260423004",
      machine_code: "2260423004",
      task_no: "SPT-20260423-004",
      task_type: "sale",
      category_main: "dress",
      category_sub: "short dress",
      grade_summary: "S 10 件",
      qty: 10,
      actual_weight_kg: 38.5,
      updated_at: "2026-04-23T13:56:00Z",
    },
    {
      printerName: "Deli DL-720C",
      templateCode: "",
    },
  );

  assert.equal(payload.printer_name, "Deli DL-720C");
  assert.equal(payload.template_code, "wait_for_sale");
  assert.equal(payload.display_code, "SDB260423004");
  assert.match(payload.display_code, /^SDB/);
  assert.equal(payload.machine_code, "2260423004");
  assert.equal(payload.barcode_value, "2260423004");
  assert.equal(payload.scan_token, "2260423004");
  assert.equal(payload.human_readable, "2260423004");
  assert.equal(payload.dispatch_bale_no, "2260423004");
  assert.equal(payload.shipment_no, "SPT-20260423-004");
  assert.equal(payload.parcel_batch_no, "SDB260423004");
  assert.equal(payload.status, "wait for sale");
  assert.equal(payload.grade, "S 10 件");
  assert.equal(payload.qty, "10");
  assert.equal(payload.weight, "38.5 KG");
  assert.equal(payload.package_position_label, "10 件 · 38.5 KG");
});

test("buildStorePrepBaleDirectPrintPayload does not extract machine code from SDB display code", () => {
  const payload = buildStorePrepBaleDirectPrintPayload(
    {
      bale_no: "SPB-20260427-001",
      bale_barcode: "SDB260427AAAQH",
      scan_token: "SDB260427AAAQH",
      machine_code: "",
      barcode_value: "SDB260427AAAQH",
      task_no: "SPT-20260427-001",
      task_type: "store_dispatch",
      category_main: "jacket",
      category_sub: "baseball jacket",
      qty: 20,
    },
    {
      printerName: "Deli DL-720C",
      templateCode: "store_prep_bale_60x40",
    },
  );

  assert.equal(payload.display_code, "SDB260427AAAQH");
  assert.equal(payload.machine_code, "");
  assert.equal(payload.barcode_value, "");
  assert.equal(payload.scan_token, "");
  assert.equal(payload.dispatch_bale_no, "");
});

test("store prep bale workbench is a dedicated warehouse panel", () => {
  const html = fs.readFileSync(
    path.join(__dirname, "../index.html"),
    "utf8",
  );
  const appJs = fs.readFileSync(
    path.join(__dirname, "../app.js"),
    "utf8",
  );
  assert.match(html, /<h2>0\.1\.2 压缩工单管理<\/h2>/);
  assert.doesNotMatch(html, /id="compressionTaskAcceptanceWindow"/);
  assert.match(html, /id="compressionTaskAcceptanceModal"/);
  assert.match(html, /name="actual_qty"/);
  assert.match(html, /name="actual_weight_kg"/);
  assert.match(appJs, /name="pieces_per_bale"/);
  assert.match(appJs, /name="bale_count"/);
  assert.match(appJs, /100 件 \/ 包/);
  assert.match(appJs, /200 件 \/ 包/);
  assert.match(appJs, /P100% \/ S0%/);
  assert.match(appJs, /P70% \/ S30%/);
  assert.match(appJs, /P50% \/ S50%/);
  assert.match(appJs, /buildStoreDispatchCompressionGradeRequirements/);
  assert.match(appJs, /data-store-dispatch-ratio-summary/);
  assert.doesNotMatch(appJs, /120 件 \/ 包/);
  assert.doesNotMatch(appJs, /150 件 \/ 包/);
  assert.doesNotMatch(appJs, /180 件 \/ 包/);
  assert.match(appJs, /5 包/);
  assert.match(appJs, /每包件数只能选择 100 或 200 件/);
  assert.match(appJs, /本次压缩包数只能选择 1-5 包/);
  assert.doesNotMatch(appJs, /name="pieces_per_bale" type="number"/);
  assert.doesNotMatch(appJs, /name="bale_count" type="number"/);
  assert.match(appJs, /readonly value=/);
  assert.match(appJs, /prepared_bale_nos/);
  assert.match(html, /textarea name="note"/);
  assert.doesNotMatch(html, /id="compressionTaskPrintButton"/);
  assert.doesNotMatch(html, /id="compressionTaskPrintBarcode"/);
});

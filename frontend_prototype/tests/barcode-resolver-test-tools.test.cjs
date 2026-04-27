const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const indexHtml = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
const appJs = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");

test("Test Tools contains 条码识别测试 / Barcode resolver test section", () => {
  assert.match(indexHtml, /<h3>条码识别测试 \/ Barcode resolver test<\/h3>/);
});

test("barcode resolver test has barcode input, required contexts, and test button", () => {
  assert.match(indexHtml, /<form id="barcodeResolverTestForm"[\s\S]*?<input name="barcode" placeholder="RB260427AAAQH"/);
  [
    "warehouse_sorting_create",
    "pos",
    "store_receiving",
    "store_pda",
    "b2b_bale_sales",
  ].forEach((context) => {
    assert.match(indexHtml, new RegExp(`<option value="${context}">${context}<\\/option>`));
  });
  assert.match(indexHtml, /<button type="submit">测试条码 \/ Test barcode<\/button>/);
});

test("frontend barcode resolver test calls /barcode/resolve/ with selected context", () => {
  assert.match(appJs, /resolveBarcodeForContext\(barcode, context\)/);
  assert.match(appJs, /\/barcode\/resolve\/\$\{encodeURIComponent\(normalizedBarcode\)\}\?context=\$\{encodeURIComponent\(context \|\| ""\)\}/);
});

test("result panel renders required key fields for non-developer review", () => {
  assert.match(appJs, /barcode_type:/);
  assert.match(appJs, /business_object\.kind:/);
  assert.match(appJs, /pos_allowed:/);
  assert.match(appJs, /operational_next_step:/);
});

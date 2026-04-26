const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  buildChinaSourceReceiptSheetHtml,
} = require("../china-source-receipt-sheet-flow.js");

test("4.2 page uses the revised china source import template and exposes an A4 receipt-sheet print button", () => {
  const html = fs.readFileSync(
    path.join(__dirname, "..", "index.html"),
    "utf8",
  );

  assert.match(html, /china_source_bale_import_template_v改\.xlsx/);
  assert.match(html, /id="chinaSourceReceiptSheetPrintButton"/);
});

test("buildChinaSourceReceiptSheetHtml prints bilingual receipt-sheet rows without cost columns", () => {
  const html = buildChinaSourceReceiptSheetHtml({
    customs_notice_no: "GOSUQ I N6862022",
    container_type: "服装整柜",
    total_bale_count: 3,
    domestic_total_weight_kg: 285,
    lines: [
      {
        supplier_name: "MA",
        package_code: "M11-S",
        category_main: "DRESS",
        category_main_zh: "连衣裙",
        category_sub: "Winter dress",
        category_sub_zh: "冬连衣裙",
        package_count: 2,
        unit_weight_kg: 95,
        unit_cost_amount: 427.5,
        unit_cost_currency: "CNY",
        total_weight_kg: 190,
      },
    ],
  });

  assert.match(html, /GOSUQ I N6862022/);
  assert.match(html, /包裹编码/);
  assert.match(html, /M11-S/);
  assert.match(html, /DRESS/);
  assert.match(html, /连衣裙/);
  assert.match(html, /Winter dress/);
  assert.match(html, /冬连衣裙/);
  assert.match(html, /window\.print\(\)/);
  assert.doesNotMatch(html, /包裹单价/);
  assert.doesNotMatch(html, /427\.5/);
  assert.doesNotMatch(html, /CNY/);
});

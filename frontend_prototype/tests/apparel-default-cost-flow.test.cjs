const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const flowPath = path.join(__dirname, "..", "apparel-default-cost-flow.js");
const flowSource = fs.readFileSync(flowPath, "utf8");
const flowModule = { exports: {} };
const flowSandbox = {
  module: flowModule,
  exports: flowModule.exports,
  globalThis: {},
};
flowSandbox.globalThis = flowSandbox;
vm.runInNewContext(flowSource, flowSandbox, { filename: flowPath });
const {
  DEFAULT_APPAREL_CATEGORY_PRESETS,
  DEFAULT_APPAREL_DEFAULT_COSTS,
  DEFAULT_APPAREL_DEFAULT_SALE_PRICES,
  normalizeApparelDefaultCostRows,
  normalizeApparelDefaultSalePriceRows,
  findApparelDefaultCostRecord,
  findApparelDefaultSalePriceRecord,
  summarizeApparelDefaultSalePrices,
} = flowModule.exports;

const appJs = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test("normalizeApparelDefaultCostRows keeps only valid P/S rows and deduplicates by category plus grade", () => {
  const rows = normalizeApparelDefaultCostRows([
    { category_main: " tops ", category_sub: " lady tops ", grade: "p", default_cost_kes: 185.236, note: " premium " },
    { category_main: "tops", category_sub: "lady tops", grade: "P", default_cost_kes: 188, note: "duplicate should be dropped" },
    { category_main: "dress", category_sub: "short dress", grade: "s", default_cost_kes: 160.1 },
    { category_main: "pants", category_sub: "cargo pant", grade: "X", default_cost_kes: 130 },
    { category_main: "", category_sub: "cargo pant", grade: "S", default_cost_kes: 130 },
    { category_main: "pants", category_sub: "cargo pant", grade: "S", default_cost_kes: 0 },
  ]);

  assert.deepEqual(plain(rows), [
    {
      category_main: "dress",
      category_sub: "short dress",
      grade: "S",
      default_cost_kes: 160.1,
      note: "",
    },
    {
      category_main: "tops",
      category_sub: "lady tops",
      grade: "P",
      default_cost_kes: 185.24,
      note: "premium",
    },
  ]);
});

test("findApparelDefaultCostRecord matches category and grade case-insensitively", () => {
  const record = findApparelDefaultCostRecord(
    [
      { category_main: "tops", category_sub: "lady tops", grade: "P", default_cost_kes: 185.24, note: "" },
      { category_main: "tops", category_sub: "lady tops", grade: "S", default_cost_kes: 138.5, note: "" },
    ],
    "TOPS",
    "Lady Tops",
    "s",
  );

  assert.equal(record.default_cost_kes, 138.5);
  assert.equal(record.grade, "S");
});

test("default apparel cost seeds expose a few main/sub/grade sample rows", () => {
  assert.ok(Array.isArray(DEFAULT_APPAREL_DEFAULT_COSTS));
  assert.ok(DEFAULT_APPAREL_DEFAULT_COSTS.length >= 20);
  assert.ok(
    DEFAULT_APPAREL_DEFAULT_COSTS.some(
      (row) => row.category_main === "tops" && row.category_sub === "lady tops" && row.grade === "P",
    ),
  );
  assert.ok(
    DEFAULT_APPAREL_DEFAULT_COSTS.some(
      (row) => row.category_main === "tops" && row.category_sub === "lady tops" && row.grade === "S",
    ),
  );
  assert.ok(
    DEFAULT_APPAREL_DEFAULT_COSTS.some(
      (row) => row.category_main === "shoes" && row.category_sub === "sport shoes" && row.grade === "P",
    ),
  );
});

test("default sale price seeds derive P and S rows from every default cost preset", () => {
  assert.equal(DEFAULT_APPAREL_DEFAULT_SALE_PRICES.length, DEFAULT_APPAREL_CATEGORY_PRESETS.length * 2);

  DEFAULT_APPAREL_CATEGORY_PRESETS.forEach((preset) => {
    const pRecord = findApparelDefaultSalePriceRecord(
      DEFAULT_APPAREL_DEFAULT_SALE_PRICES,
      preset.category_main,
      preset.category_sub,
      "P",
    );
    const sRecord = findApparelDefaultSalePriceRecord(
      DEFAULT_APPAREL_DEFAULT_SALE_PRICES,
      preset.category_main,
      preset.category_sub,
      "S",
    );

    assert.equal(pRecord.default_sale_price_kes, preset.cost_p * 2);
    assert.equal(sRecord.default_sale_price_kes, preset.cost_s * 2);
    assert.match(pRecord.note, /参考售价 = 默认成本 × 2/);
    assert.match(sRecord.note, /参考售价 = 默认成本 × 2/);
  });
});

test("default sale price seeds include expected reference examples", () => {
  assert.equal(findApparelDefaultSalePriceRecord(DEFAULT_APPAREL_DEFAULT_SALE_PRICES, "tops", "lady tops", "P").default_sale_price_kes, 370);
  assert.equal(findApparelDefaultSalePriceRecord(DEFAULT_APPAREL_DEFAULT_SALE_PRICES, "pants", "cargo pant", "P").default_sale_price_kes, 410);
  assert.equal(findApparelDefaultSalePriceRecord(DEFAULT_APPAREL_DEFAULT_SALE_PRICES, "jacket", "jacket", "P").default_sale_price_kes, 520);
});

test("normalizeApparelDefaultSalePriceRows keeps valid rows and deduplicates by category plus grade", () => {
  const rows = normalizeApparelDefaultSalePriceRows([
    { category_main: " pants ", category_sub: " cargo pant ", grade: "p", default_sale_price_kes: 410.236, note: " premium " },
    { category_main: "pants", category_sub: "cargo pant", grade: "P", default_sale_price_kes: 420, note: "duplicate should be dropped" },
    { category_main: "jacket", category_sub: "jacket", grade: "s", default_sale_price_kes: 396 },
    { category_main: "tops", category_sub: "lady tops", grade: "X", default_sale_price_kes: 370 },
    { category_main: "", category_sub: "lady tops", grade: "P", default_sale_price_kes: 370 },
    { category_main: "tops", category_sub: "lady tops", grade: "P", default_sale_price_kes: 0 },
  ]);

  assert.deepEqual(plain(rows), [
    {
      category_main: "jacket",
      category_sub: "jacket",
      grade: "S",
      default_sale_price_kes: 396,
      note: "",
    },
    {
      category_main: "pants",
      category_sub: "cargo pant",
      grade: "P",
      default_sale_price_kes: 410.24,
      note: "premium",
    },
  ]);
});

test("find and summarize default sale prices by category and P/S grade", () => {
  const rows = normalizeApparelDefaultSalePriceRows([
    { category_main: "tops", category_sub: "lady tops", grade: "P", default_sale_price_kes: 370, note: "" },
    { category_main: "tops", category_sub: "lady tops", grade: "S", default_sale_price_kes: 276, note: "" },
    { category_main: "pants", category_sub: "cargo pant", grade: "P", default_sale_price_kes: 410, note: "" },
  ]);

  const found = findApparelDefaultSalePriceRecord(rows, "TOPS", "Lady Tops", "s");
  const summary = summarizeApparelDefaultSalePrices(rows);

  assert.equal(found.default_sale_price_kes, 276);
  assert.deepEqual(plain(summary), {
    totalCount: 3,
    gradeCounts: { P: 2, S: 1 },
  });
});

test("warehouse comprehensive UI shows default sale price management below default cost management", () => {
  const costIndex = indexHtml.indexOf("默认成本价管理");
  const saleIndex = indexHtml.indexOf("默认售价管理");

  assert.ok(costIndex > -1);
  assert.ok(saleIndex > costIndex);
  assert.match(indexHtml, /id="apparelDefaultSalePriceForm"/);
  assert.match(indexHtml, /默认售价 KES/);
  assert.match(indexHtml, /P 档默认售价/);
  assert.match(indexHtml, /S 档默认售价/);
  assert.match(indexHtml, /参考售价 = 默认成本 × 2/);
  assert.match(indexHtml, /后续可作为店员分堆标价 \/ 默认售价建议使用；当前仅为配置参考。/);
  assert.match(appJs, /renderApparelDefaultSalePriceSummary/);
  assert.match(appJs, /data-apparel-default-sale-price-edit/);
  assert.match(appJs, /data-apparel-default-sale-price-delete/);
  assert.match(appJs, /default_sale_price_kes/);
});

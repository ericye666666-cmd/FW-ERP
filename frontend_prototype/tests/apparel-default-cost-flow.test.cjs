const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_APPAREL_DEFAULT_COSTS,
  normalizeApparelDefaultCostRows,
  findApparelDefaultCostRecord,
} = require("../apparel-default-cost-flow.js");

test("normalizeApparelDefaultCostRows keeps only valid P/S rows and deduplicates by category plus grade", () => {
  const rows = normalizeApparelDefaultCostRows([
    { category_main: " tops ", category_sub: " lady tops ", grade: "p", default_cost_kes: 185.236, note: " premium " },
    { category_main: "tops", category_sub: "lady tops", grade: "P", default_cost_kes: 188, note: "duplicate should be dropped" },
    { category_main: "dress", category_sub: "short dress", grade: "s", default_cost_kes: 160.1 },
    { category_main: "pants", category_sub: "cargo pant", grade: "X", default_cost_kes: 130 },
    { category_main: "", category_sub: "cargo pant", grade: "S", default_cost_kes: 130 },
    { category_main: "pants", category_sub: "cargo pant", grade: "S", default_cost_kes: 0 },
  ]);

  assert.deepEqual(rows, [
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

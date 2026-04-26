const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DEFAULT_APPAREL_SORTING_RACKS,
  findApparelSortingRackRecord,
  normalizeApparelSortingRackRows,
} = require("../apparel-sorting-rack-flow.js");

test("normalizeApparelSortingRackRows keeps only valid P/S rack rows and deduplicates by category plus cost", () => {
  const rows = normalizeApparelSortingRackRows([
    {
      category_main: " tops ",
      category_sub: " lady tops ",
      grade: "p",
      default_cost_kes: 185.234,
      rack_code: " a-ts-p-01 ",
      note: " premium rack ",
    },
    {
      category_main: "tops",
      category_sub: "lady tops",
      grade: "P",
      default_cost_kes: 185.23,
      rack_code: "A-TS-P-99",
      note: "duplicate should be dropped",
    },
    {
      category_main: "tops",
      category_sub: "lady tops",
      grade: "S",
      default_cost_kes: 138,
      rack_code: "a-ts-s-01",
    },
    {
      category_main: "pants",
      category_sub: "cargo pant",
      grade: "X",
      default_cost_kes: 120,
      rack_code: "A-PT-X-01",
    },
    {
      category_main: "pants",
      category_sub: "cargo pant",
      grade: "S",
      default_cost_kes: 0,
      rack_code: "A-PT-S-01",
    },
  ]);

  assert.deepEqual(rows, [
    {
      category_main: "tops",
      category_sub: "lady tops",
      grade: "P",
      default_cost_kes: 185.23,
      rack_code: "A-TS-P-01",
      note: "premium rack",
    },
    {
      category_main: "tops",
      category_sub: "lady tops",
      grade: "S",
      default_cost_kes: 138,
      rack_code: "A-TS-S-01",
      note: "",
    },
  ]);
});

test("findApparelSortingRackRecord matches category and cost case-insensitively", () => {
  const record = findApparelSortingRackRecord(
    [
      {
        category_main: "tops",
        category_sub: "lady tops",
        grade: "P",
        default_cost_kes: 185,
        rack_code: "A-TS-P-01",
      },
      {
        category_main: "tops",
        category_sub: "lady tops",
        grade: "S",
        default_cost_kes: 138,
        rack_code: "A-TS-S-01",
      },
    ],
    "TOPS",
    "Lady Tops",
    "s",
    138,
  );

  assert.equal(record.rack_code, "A-TS-S-01");
  assert.equal(record.grade, "S");
});

test("default apparel sorting rack seeds expose a few main/sub/grade sample rows", () => {
  assert.ok(Array.isArray(DEFAULT_APPAREL_SORTING_RACKS));
  assert.ok(DEFAULT_APPAREL_SORTING_RACKS.length >= 20);
  assert.ok(
    DEFAULT_APPAREL_SORTING_RACKS.some(
      (row) => row.category_main === "tops" && row.category_sub === "lady tops" && row.grade === "P",
    ),
  );
  assert.ok(
    DEFAULT_APPAREL_SORTING_RACKS.some(
      (row) => row.category_main === "shoes" && row.category_sub === "sport shoes" && row.grade === "S",
    ),
  );
});

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  SORTING_RESULT_GRADE_OPTIONS,
  buildSortingResultCategoryName,
  buildSortingResultOutputRows,
  getSortingSellableWeightKg,
  inflateSortingResultRows,
  normalizeSortingLossRecord,
  resolveSortingResultDefaultCost,
  resolveSortingResultDefaultRack,
} = require("../sorting-result-flow.js");

test("buildSortingResultOutputRows serializes main/sub/grade rows into backend result_items payload", () => {
  const rows = buildSortingResultOutputRows(
    [
      {
        category_main: "tops",
        category_sub: "lady tops",
        grade: "p",
        actual_weight_kg: 6.5,
        qty: 12,
        confirm_to_inventory: "true",
      },
    ],
    {
      defaultCosts: [{ category_main: "tops", category_sub: "lady tops", grade: "P", default_cost_kes: 185 }],
      defaultRacks: [{ category_main: "tops", category_sub: "lady tops", grade: "P", default_cost_kes: 185, rack_code: "A-TS-P-01" }],
    },
  );

  assert.deepEqual(rows, [
    {
      category_name: "tops / lady tops",
      grade: "P",
      actual_weight_kg: 6.5,
      qty: 12,
      rack_code: "A-TS-P-01",
      confirm_to_inventory: true,
      default_cost_kes: 185,
    },
  ]);
});

test("inflateSortingResultRows parses existing backend rows into builder rows", () => {
  const rows = inflateSortingResultRows([
    {
      category_name: "dress / short dress",
      grade: "S",
      actual_weight_kg: 4.25,
      qty: 8,
      rack_code: "A-DR-01",
      confirm_to_inventory: false,
    },
  ]);

  assert.deepEqual(rows, [
    {
      category_main: "dress",
      category_sub: "short dress",
      grade: "S",
      actual_weight_kg: 4.25,
      qty: 8,
      rack_code: "A-DR-01",
      default_cost_kes: 0,
      confirm_to_inventory: "false",
    },
  ]);
});

test("resolveSortingResultDefaultCost matches main/sub/grade against configured default costs", () => {
  const matched = resolveSortingResultDefaultCost(
    [
      { category_main: "tops", category_sub: "lady tops", grade: "P", default_cost_kes: 185 },
      { category_main: "tops", category_sub: "lady tops", grade: "S", default_cost_kes: 138 },
    ],
    { category_main: "TOPS", category_sub: "Lady Tops", grade: "s" },
  );

  assert.equal(matched.default_cost_kes, 138);
});

test("resolveSortingResultDefaultRack matches main/sub/grade/default cost against configured rack rows", () => {
  const matched = resolveSortingResultDefaultRack(
    [
      { category_main: "tops", category_sub: "lady tops", grade: "P", default_cost_kes: 185, rack_code: "A-TS-P-01" },
      { category_main: "tops", category_sub: "lady tops", grade: "S", default_cost_kes: 138, rack_code: "A-TS-S-01" },
    ],
    {
      category_main: "TOPS",
      category_sub: "Lady Tops",
      grade: "s",
      default_cost_kes: 138,
    },
  );

  assert.equal(matched.rack_code, "A-TS-S-01");
});

test("sorting result category name builder trims inputs safely", () => {
  assert.equal(buildSortingResultCategoryName(" tops ", " lady tops "), "tops / lady tops");
  assert.equal(buildSortingResultCategoryName("tops", ""), "tops");
});

test("sorting result grade options are fixed to P and S", () => {
  assert.deepEqual(SORTING_RESULT_GRADE_OPTIONS, [
    { value: "P", label: "P" },
    { value: "S", label: "S" },
  ]);
});

test("normalizeSortingLossRecord keeps no-loss rows normalized with zero qty and weight", () => {
  const record = normalizeSortingLossRecord({
    has_loss: false,
    loss_qty: 5,
    loss_weight_kg: 3.2,
    photos: [{ filename: "ignored.jpg", data_url: "data:image/jpeg;base64,AA==" }],
  });

  assert.deepEqual(record, {
    has_loss: false,
    loss_qty: 0,
    loss_weight_kg: 0,
    note: "",
    photos: [],
  });
});

test("normalizeSortingLossRecord keeps declared loss qty weight note and photos", () => {
  const record = normalizeSortingLossRecord({
    has_loss: true,
    loss_qty: "4",
    loss_weight_kg: "2.35",
    note: " wet pieces ",
    photos: [{ filename: "loss-1.jpg", content_type: "image/jpeg", data_url: "data:image/jpeg;base64,AA==" }],
  });

  assert.deepEqual(record, {
    has_loss: true,
    loss_qty: 4,
    loss_weight_kg: 2.35,
    note: "wet pieces",
    photos: [{ filename: "loss-1.jpg", content_type: "image/jpeg", data_url: "data:image/jpeg;base64,AA==" }],
  });
});

test("getSortingSellableWeightKg deducts loss weight from total source weight", () => {
  assert.equal(
    getSortingSellableWeightKg(80, {
      has_loss: true,
      loss_qty: 3,
      loss_weight_kg: 6.5,
      photos: [{ filename: "loss.jpg", data_url: "data:image/jpeg;base64,AA==" }],
    }),
    73.5,
  );
  assert.equal(
    getSortingSellableWeightKg(5, {
      has_loss: true,
      loss_qty: 1,
      loss_weight_kg: 8,
      photos: [{ filename: "loss.jpg", data_url: "data:image/jpeg;base64,AA==" }],
    }),
    0,
  );
});

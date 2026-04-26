const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  buildSortingStockCategoryOptions,
  buildSortingCompressionGroups,
  buildSortingCompressionDisplaySections,
  buildSortingCompressionEmployeeOptions,
  filterSortingStockRowsByMainCategory,
  filterSortingCompressionGroups,
  summarizeSortingStockRows,
} = require("../sorting-stock-flow.js");

test("buildSortingStockCategoryOptions returns distinct main-category dropdown options", () => {
  const options = buildSortingStockCategoryOptions([
    { category_name: "tops / lady tops" },
    { category_name: "dress / 2 pieces" },
    { category_name: "tops / men shirt" },
  ]);

  assert.deepEqual(options, [
    { value: "", label: "全部大类" },
    { value: "dress", label: "dress" },
    { value: "tops", label: "tops" },
  ]);
});

test("filterSortingStockRowsByMainCategory only keeps the selected major category", () => {
  const rows = filterSortingStockRowsByMainCategory(
    [
      { category_name: "tops / lady tops", sku_code: "TOP-1" },
      { category_name: "dress / 2 pieces", sku_code: "DR-1" },
      { category_name: "tops / men shirt", sku_code: "TOP-2" },
    ],
    "tops",
  );

  assert.deepEqual(rows.map((row) => row.sku_code), ["TOP-1", "TOP-2"]);
});

test("summarizeSortingStockRows totals qty racks and current inventory value in KES", () => {
  const summary = summarizeSortingStockRows([
    { rack_code: "A-1", qty_on_hand: 5, total_cost_kes: 804.25, updated_at: "2026-04-22T19:56:02Z" },
    { rack_code: "A-2", qty_on_hand: 8, total_cost_kes: 532.48, updated_at: "2026-04-22T20:10:00Z" },
  ]);

  assert.deepEqual(summary, {
    totalRowCount: 2,
    totalQty: 13,
    rackCount: 2,
    totalInventoryValueKes: 1336.73,
    latestUpdatedAt: "2026-04-22T20:10:00Z",
  });
});

test("buildSortingCompressionGroups keeps one horizontal group per subcategory", () => {
  const groups = buildSortingCompressionGroups(
    [
      { category_name: "dress / short dress", grade: "P", sku_code: "DR-P", qty_on_hand: 90, total_cost_kes: 12420, rack_code: "A-DR-P-01" },
      { category_name: "dress / short dress", grade: "S", sku_code: "DR-S", qty_on_hand: 70, total_cost_kes: 7280, rack_code: "A-DR-S-01" },
      { category_name: "tops / lady tops", grade: "P", sku_code: "TP-P", qty_on_hand: 50, total_cost_kes: 6900, rack_code: "A-TS-P-01" },
    ],
    [
      { category_main: "dress", category_sub: "short dress", bale_no: "SPB-001", qty: 100, total_cost_kes: 13800 },
    ],
  );

  assert.equal(groups.length, 2);
  assert.equal(groups[0].categorySub, "short dress");
  assert.equal(groups[0].looseQty, 160);
  assert.equal(groups[0].packedQty, 100);
  assert.equal(groups[0].looseRows.length, 2);
  assert.equal(groups[0].packedRows.length, 1);
});

test("buildSortingCompressionGroups tracks suspended qty from open compression tasks", () => {
  const groups = buildSortingCompressionGroups(
    [
      { category_name: "dress / short dress", grade: "P", sku_code: "DR-P", qty_on_hand: 90, total_cost_kes: 12420, rack_code: "A-DR-P-01" },
      { category_name: "dress / short dress", grade: "S", sku_code: "DR-S", qty_on_hand: 70, total_cost_kes: 7280, rack_code: "A-DR-S-01" },
    ],
    [],
    [
      {
        task_no: "SPT-001",
        category_main: "dress",
        category_sub: "short dress",
        status: "open",
        suspended_qty: 40,
        grade_requirements: [
          { grade: "P", qty: 30 },
          { grade: "S", qty: 10 },
        ],
      },
    ],
  );

  assert.equal(groups.length, 1);
  assert.equal(groups[0].suspendedQty, 40);
  assert.equal(groups[0].availableLooseQty, 120);
  assert.deepEqual(groups[0].availableLooseQtyByGrade, { P: 60, S: 60 });
});

test("buildSortingCompressionDisplaySections returns left grade summaries and right packed-bale summaries", () => {
  const [group] = buildSortingCompressionGroups(
    [
      {
        category_name: "dress / 2 pieces",
        grade: "P",
        sku_code: "DRESS2PI-P-028000",
        qty_on_hand: 640,
        total_cost_kes: 1856422.4,
        rack_code: "A-DR-2P-P-01",
        updated_at: "2026-04-24T00:48:00Z",
      },
      {
        category_name: "dress / 2 pieces",
        grade: "S",
        sku_code: "DRESS2PI-S-021500",
        qty_on_hand: 1060,
        total_cost_kes: 3074699.6,
        rack_code: "A-DR-2P-S-01",
        updated_at: "2026-04-24T00:48:00Z",
      },
    ],
    [
      {
        category_main: "dress",
        category_sub: "2 pieces",
        bale_no: "SPB-001",
        bale_barcode: "SPB-BC-001",
        task_type: "store_dispatch",
        qty: 400,
        total_cost_kes: 1160264,
        grade_summary: "P 200 / S 200",
        updated_at: "2026-04-24T01:10:00Z",
      },
      {
        category_main: "dress",
        category_sub: "2 pieces",
        bale_no: "SPB-002",
        bale_barcode: "SPB-BC-002",
        task_type: "sale",
        qty: 200,
        total_cost_kes: 580132,
        grade_summary: "P 80 / S 120",
        updated_at: "2026-04-24T01:20:00Z",
      },
    ],
    [],
  );

  const sections = buildSortingCompressionDisplaySections(group);

  assert.equal(sections.looseGradeCards.length, 2);
  assert.deepEqual(
    sections.looseGradeCards.map((row) => ({ grade: row.grade, qty: row.qty, internalCodes: row.internalCodes })),
    [
      { grade: "P", qty: 640, internalCodes: ["DRESS2PI-P-028000"] },
      { grade: "S", qty: 1060, internalCodes: ["DRESS2PI-S-021500"] },
    ],
  );
  assert.deepEqual(
    sections.packedTaskCards.map((row) => ({ taskType: row.taskType, baleCount: row.baleCount, qty: row.qty })),
    [
      { taskType: "store_dispatch", baleCount: 1, qty: 400 },
      { taskType: "sale", baleCount: 1, qty: 200 },
    ],
  );
  assert.equal(sections.packedBaleCount, 2);
});

test("buildSortingCompressionEmployeeOptions disables employees occupied by open compression tasks", () => {
  const options = buildSortingCompressionEmployeeOptions(
    [
      { username: "warehouse_clerk_1", full_name: "Alice" },
      { username: "warehouse_clerk_2", full_name: "Bob" },
    ],
    {
      compressionTasks: [
        { task_no: "CB-001", assigned_employee: "warehouse_clerk_1", status: "open", category_sub: "short dress" },
        { task_no: "CB-002", assigned_employee: "warehouse_clerk_2", status: "completed", category_sub: "lady tops" },
      ],
      sortingTasks: [],
    },
  );

  assert.deepEqual(options, [
    {
      value: "warehouse_clerk_1",
      label: "Alice · warehouse_clerk_1 · 压缩工单进行中（CB-001）",
      disabled: true,
      occupiedTaskNo: "CB-001",
      occupiedStatusLabel: "压缩工单进行中",
    },
    {
      value: "warehouse_clerk_2",
      label: "Bob · warehouse_clerk_2",
      disabled: false,
      occupiedTaskNo: "",
      occupiedStatusLabel: "",
    },
  ]);
});

test("buildSortingCompressionEmployeeOptions also disables employees occupied by open sorting tasks", () => {
  const options = buildSortingCompressionEmployeeOptions(
    [
      { username: "warehouse_clerk_1", full_name: "Alice" },
      { username: "warehouse_clerk_2", full_name: "Bob" },
    ],
    {
      compressionTasks: [],
      sortingTasks: [
        { task_no: "ST-001", handler_names: ["warehouse_clerk_2"], status: "open" },
      ],
    },
  );

  assert.deepEqual(options, [
    {
      value: "warehouse_clerk_1",
      label: "Alice · warehouse_clerk_1",
      disabled: false,
      occupiedTaskNo: "",
      occupiedStatusLabel: "",
    },
    {
      value: "warehouse_clerk_2",
      label: "Bob · warehouse_clerk_2 · 分拣任务进行中（ST-001）",
      disabled: true,
      occupiedTaskNo: "ST-001",
      occupiedStatusLabel: "分拣任务进行中",
    },
  ]);
});

test("filterSortingCompressionGroups supports search, major category and loose-qty threshold", () => {
  const rows = filterSortingCompressionGroups(
    [
      { categoryMain: "dress", categorySub: "short dress", looseQty: 160, looseRows: [{ sku_code: "DR-P" }], packedRows: [] },
      { categoryMain: "tops", categorySub: "lady tops", looseQty: 50, looseRows: [{ sku_code: "TS-P" }], packedRows: [] },
      { categoryMain: "pants", categorySub: "jeans pant", looseQty: 30, looseRows: [{ sku_code: "PT-P" }], packedRows: [] },
    ],
    {
      searchText: "dress",
      categoryMain: "dress",
      minLooseQty: 100,
    },
  );

  assert.deepEqual(rows.map((row) => row.categorySub), ["short dress"]);
});

test("sorting stock page exposes one search shell and no page-top compression creator block", () => {
  const html = fs.readFileSync(
    path.join(__dirname, "../index.html"),
    "utf8",
  );
  assert.match(html, /id="sortingStockSearchDetails"/);
  assert.match(html, /name="min_loose_qty"/);
  assert.match(html, /id="sortingCompressionGroupList"/);
  assert.doesNotMatch(html, /id="sortingCompressionCreator"/);
});

test("sorting stock packed-bale cards expose a direct barcode reprint action", () => {
  const appJs = fs.readFileSync(
    path.join(__dirname, "../app.js"),
    "utf8",
  );

  assert.match(appJs, /data-store-prep-bale-reprint=/);
  assert.match(appJs, /补打 barcode/);
  assert.match(appJs, /内部散件档案/);
  assert.match(appJs, /待送店成品包/);
  assert.match(appJs, /待售卖成品包/);
});

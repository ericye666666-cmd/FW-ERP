const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  DEFAULT_WAREHOUSE_MAINFLOW_DEMO_TEMPLATE,
  buildWarehouseMainflowDemoSummary,
  DEFAULT_STORE_REPLENISHMENT_DEMO_TEMPLATE,
  buildStoreReplenishmentDemoSummary,
} = require("../warehouse-mainflow-demo-flow.js");

test("warehouse mainflow demo template keeps the fixed bale plan", () => {
  assert.equal(DEFAULT_WAREHOUSE_MAINFLOW_DEMO_TEMPLATE.perBaleWeightKg, 50);
  assert.equal(
    DEFAULT_WAREHOUSE_MAINFLOW_DEMO_TEMPLATE.categories.reduce((sum, row) => sum + row.packageCount, 0),
    62,
  );
  assert.equal(
    DEFAULT_WAREHOUSE_MAINFLOW_DEMO_TEMPLATE.categories.find((row) => row.sourceCategorySub === "summer+").packageCount,
    20,
  );
});

test("buildWarehouseMainflowDemoSummary returns the latest generated shipment metrics", () => {
  const summary = buildWarehouseMainflowDemoSummary({
    shipment_no: "DEMO-MF-20260423-2026-04-23",
    customs_notice_no: "DEMO-MF-20260423",
    total_bales: 62,
    sorted_bales: 31,
    remaining_raw_bales: 31,
    printed_bales: 0,
    sorting_task_nos: ["ST-001", "ST-002", "ST-003", "ST-004"],
    categories: [
      { source_category_sub: "summer+", package_count: 20, sorted_bales: 10, remaining_raw_bales: 10 },
    ],
  });

  assert.deepEqual(summary.metrics, [
    { label: "船单", value: "DEMO-MF-20260423-2026-04-23" },
    { label: "总包数", value: 62 },
    { label: "已分拣", value: 31 },
    { label: "现有 bales", value: 31 },
    { label: "打印任务", value: 0 },
  ]);
  assert.equal(summary.taskCount, 4);
  assert.equal(summary.categories[0].source_category_sub, "summer+");
});

test("overview test tool exposes the one-click warehouse mainflow demo trigger", () => {
  const html = fs.readFileSync(
    path.join(__dirname, "../index.html"),
    "utf8",
  );
  assert.match(html, /data-action="generate-warehouse-mainflow-demo"/);
  assert.match(html, /id="warehouseMainflowDemoSummary"/);
});

test("store replenishment demo template keeps warehouse, store, and sell-through targets", () => {
  assert.equal(DEFAULT_STORE_REPLENISHMENT_DEMO_TEMPLATE.shipmentCount, 1);
  assert.equal(DEFAULT_STORE_REPLENISHMENT_DEMO_TEMPLATE.categoryCount, 10);
  assert.equal(DEFAULT_STORE_REPLENISHMENT_DEMO_TEMPLATE.warehouseTargetQty, 20000);
  assert.equal(DEFAULT_STORE_REPLENISHMENT_DEMO_TEMPLATE.storeSeedQty, 3000);
  assert.equal(DEFAULT_STORE_REPLENISHMENT_DEMO_TEMPLATE.recent14dSalesQty, 2100);
  assert.equal(DEFAULT_STORE_REPLENISHMENT_DEMO_TEMPLATE.waitingStoreDispatchBaleQty, 100);
  assert.equal(DEFAULT_STORE_REPLENISHMENT_DEMO_TEMPLATE.waitingStoreDispatchRatio, 0.3);
});

test("buildStoreReplenishmentDemoSummary returns recommendation-ready metrics", () => {
  const summary = buildStoreReplenishmentDemoSummary({
    shipment_no: "DEMO-RPL-20260424-2026-04-24",
    warehouse_total_qty: 20000,
    store_seed_qty: 3000,
    recent_14d_sales_qty: 2100,
    recommendation_no: "TRR-20260424-001",
    recommendation_item_count: 10,
    waiting_store_dispatch_bale_count: 60,
  });

  assert.deepEqual(summary.metrics, [
    { label: "船单", value: "DEMO-RPL-20260424-2026-04-24" },
    { label: "仓库存量", value: 20000 },
    { label: "在店可售", value: 3000 },
    { label: "14天销量", value: 2100 },
    { label: "补货建议", value: "TRR-20260424-001" },
  ]);
  assert.equal(summary.recommendationItemCount, 10);
  assert.equal(summary.waitingStoreDispatchBaleCount, 60);
});

test("overview test tool exposes the one-click store replenishment demo trigger", () => {
  const html = fs.readFileSync(
    path.join(__dirname, "../index.html"),
    "utf8",
  );
  assert.match(html, /data-action="generate-store-replenishment-demo"/);
  assert.match(html, /id="storeReplenishmentDemoSummary"/);
});

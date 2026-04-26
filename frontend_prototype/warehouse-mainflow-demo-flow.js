(function (root, factory) {
  const exports = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = exports;
  }
  root.WarehouseMainflowDemoFlow = exports;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const DEFAULT_WAREHOUSE_MAINFLOW_DEMO_TEMPLATE = {
    name: "仓库主分拣 Demo",
    perBaleWeightKg: 50,
    categories: [
      { sourceCategorySub: "summer+", packageCount: 20 },
      { sourceCategorySub: "winter+", packageCount: 14 },
      { sourceCategorySub: "jeans+", packageCount: 12 },
      { sourceCategorySub: "dress+", packageCount: 16 },
    ],
  };

  const DEFAULT_STORE_REPLENISHMENT_DEMO_TEMPLATE = {
    name: "门店补货 Demo",
    shipmentCount: 1,
    categoryCount: 10,
    warehouseTargetQty: 20000,
    storeSeedQty: 3000,
    recent14dSalesQty: 2100,
    waitingStoreDispatchBaleQty: 100,
    waitingStoreDispatchRatio: 0.3,
  };

  function normalizeNumber(value) {
    const numeric = Number(value || 0);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  function normalizeText(value) {
    return String(value || "").trim();
  }

  function buildWarehouseMainflowDemoSummary(result) {
    const row = result && typeof result === "object" ? result : {};
    return {
      metrics: [
        { label: "船单", value: normalizeText(row.shipment_no) || "-" },
        { label: "总包数", value: normalizeNumber(row.total_bales) },
        { label: "已分拣", value: normalizeNumber(row.sorted_bales) },
        { label: "现有 bales", value: normalizeNumber(row.remaining_raw_bales) },
        { label: "打印任务", value: normalizeNumber(row.printed_bales) },
      ],
      taskCount: Array.isArray(row.sorting_task_nos) ? row.sorting_task_nos.length : 0,
      categories: Array.isArray(row.categories) ? row.categories : [],
    };
  }

  function buildStoreReplenishmentDemoSummary(result) {
    const row = result && typeof result === "object" ? result : {};
    return {
      metrics: [
        { label: "船单", value: normalizeText(row.shipment_no) || "-" },
        { label: "仓库存量", value: normalizeNumber(row.warehouse_total_qty) },
        { label: "在店可售", value: normalizeNumber(row.store_seed_qty) },
        { label: "14天销量", value: normalizeNumber(row.recent_14d_sales_qty) },
        { label: "补货建议", value: normalizeText(row.recommendation_no) || "-" },
      ],
      recommendationItemCount: normalizeNumber(row.recommendation_item_count),
      waitingStoreDispatchBaleCount: normalizeNumber(row.waiting_store_dispatch_bale_count),
      categories: Array.isArray(row.categories) ? row.categories : [],
    };
  }

  return {
    DEFAULT_WAREHOUSE_MAINFLOW_DEMO_TEMPLATE,
    DEFAULT_STORE_REPLENISHMENT_DEMO_TEMPLATE,
    buildWarehouseMainflowDemoSummary,
    buildStoreReplenishmentDemoSummary,
  };
});

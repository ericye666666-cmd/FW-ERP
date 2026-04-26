const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  DEFAULT_WAREHOUSE_HUB_TARGETS,
  buildWarehouseHubNavCards,
  buildWarehouseStageBoard,
  summarizeWarehouseDispatchHistory,
  summarizeWarehousePreparedBales,
  buildWarehouseDispatchHistoryRows,
  summarizeWarehouseSortedInventory,
  summarizeSoldPackageHistory,
  buildSoldPackageHistoryRows,
} = require("../warehouse-stock-hub-flow.js");

test("warehouse stock hub exposes four jump targets with a dedicated sorted inventory page", () => {
  assert.ok(Array.isArray(DEFAULT_WAREHOUSE_HUB_TARGETS));
  assert.equal(DEFAULT_WAREHOUSE_HUB_TARGETS.length, 4);
  assert.deepEqual(
    DEFAULT_WAREHOUSE_HUB_TARGETS.map((row) => ({
      key: row.key,
      panelTitle: row.panelTitle,
      loadAction: row.loadAction,
    })),
    [
      { key: "current_bales", panelTitle: "0.1 原始 Bale 总库存", loadAction: "load-raw-bales" },
      { key: "sorted_inventory", panelTitle: "0.3 分拣库存", loadAction: "load-sorting-stock" },
      { key: "dispatch_history", panelTitle: "门店送货历史记录", loadAction: "load-warehouse-dispatch-history" },
      { key: "sold_history", panelTitle: "已售历史包裹", loadAction: "load-warehouse-sold-packages" },
    ],
  );
});

test("warehouse stock hub nav marks the current page as active", () => {
  const cards = buildWarehouseHubNavCards([
    { key: "current_bales", panelKey: "warehouse-0-1" },
    { key: "sorted_inventory", panelKey: "warehouse-0-3" },
    { key: "dispatch_history", panelKey: "warehouse-dispatch" },
    { key: "sold_history", panelKey: "warehouse-sold" },
  ], "warehouse-0-3");

  assert.deepEqual(
    cards.map((row) => ({ key: row.key, isActive: row.isActive })),
    [
      { key: "current_bales", isActive: false },
      { key: "sorted_inventory", isActive: true },
      { key: "dispatch_history", isActive: false },
      { key: "sold_history", isActive: false },
    ],
  );
});

test("warehouse stock hub nav slot exists at the top of all four warehouse hub pages", () => {
  const html = fs.readFileSync(
    path.join(__dirname, "../index.html"),
    "utf8",
  );
  const slotCount = (html.match(/data-warehouse-hub-nav-slot/g) || []).length;
  assert.equal(slotCount, 4);
});

test("summarizeWarehouseDispatchHistory counts dispatch history by status and store", () => {
  const summary = summarizeWarehouseDispatchHistory(
    [
      {
        bale_no: "DB-001",
        store_code: "UTAWALA",
        status: "in_transit",
        item_count: 80,
        dispatched_at: "2026-04-21T09:00:00Z",
      },
      {
        bale_no: "DB-002",
        store_code: "UTAWALA",
        status: "accepted",
        item_count: 72,
        accepted_at: "2026-04-21T10:00:00Z",
      },
      {
        bale_no: "DB-003",
        store_code: "GITHURAI",
        status: "completed",
        item_count: 65,
        updated_at: "2026-04-21T11:00:00Z",
      },
    ],
  );

  assert.equal(summary.totalCount, 3);
  assert.equal(summary.storeCount, 2);
  assert.equal(summary.inTransitCount, 1);
  assert.equal(summary.acceptedCount, 1);
  assert.equal(summary.completedCount, 1);
  assert.equal(summary.totalItemCount, 217);
  assert.equal(summary.latestOccurredAt, "2026-04-21T11:00:00Z");
});

test("buildWarehouseDispatchHistoryRows merges transfer context and sorts by latest dispatch event", () => {
  const rows = buildWarehouseDispatchHistoryRows(
    [
      {
        bale_no: "DB-001",
        transfer_no: "TR-001",
        task_no: "ST-001",
        shipment_no: "SHIP-1",
        store_code: "UTAWALA",
        status: "accepted",
        item_count: 80,
        accepted_at: "2026-04-21T10:00:00Z",
      },
      {
        bale_no: "DB-002",
        transfer_no: "TR-002",
        task_no: "ST-002",
        shipment_no: "SHIP-2",
        store_code: "GITHURAI",
        status: "in_transit",
        item_count: 65,
        dispatched_at: "2026-04-21T12:00:00Z",
      },
    ],
    [
      { transfer_no: "TR-001", to_store_code: "UTAWALA", from_warehouse_code: "WH-1" },
      { transfer_no: "TR-002", to_store_code: "GITHURAI", from_warehouse_code: "WH-1" },
    ],
  );

  assert.deepEqual(
    rows.map((row) => ({
      bale_no: row.bale_no,
      to_store_code: row.to_store_code,
      occurred_at: row.occurred_at,
    })),
    [
      { bale_no: "DB-002", to_store_code: "GITHURAI", occurred_at: "2026-04-21T12:00:00Z" },
      { bale_no: "DB-001", to_store_code: "UTAWALA", occurred_at: "2026-04-21T10:00:00Z" },
    ],
  );
});

test("summarizeWarehouseSortedInventory counts merged sorting stock rows for the warehouse hub", () => {
  const summary = summarizeWarehouseSortedInventory([
    { sku_code: "SKU-001", rack_code: "A-TS-01", qty_on_hand: 120, total_cost_kes: 9600, updated_at: "2026-04-21T10:00:00Z" },
    { sku_code: "SKU-002", rack_code: "A-DR-01", qty_on_hand: 80, total_cost_kes: 7200, updated_at: "2026-04-21T12:00:00Z" },
    { sku_code: "SKU-003", rack_code: "A-TS-01", qty_on_hand: 40, total_cost_kes: 3600, updated_at: "2026-04-21T11:00:00Z" },
  ]);

  assert.equal(summary.totalRowCount, 3);
  assert.equal(summary.totalQty, 240);
  assert.equal(summary.rackCount, 2);
  assert.equal(summary.totalInventoryValueKes, 20400);
  assert.equal(summary.latestUpdatedAt, "2026-04-21T12:00:00Z");
});

test("summarizeWarehousePreparedBales splits dispatch and sale packaged stock", () => {
  const summary = summarizeWarehousePreparedBales([
    { bale_no: "SPB-001", task_type: "store_dispatch", qty: 50, total_cost_kes: 5200 },
    { bale_no: "SPB-002", task_type: "sale", qty: 40, total_cost_kes: 4100 },
    { bale_no: "SPB-003", task_type: "store_dispatch", qty: 90, total_cost_kes: 12420 },
  ]);

  assert.deepEqual(summary, {
    dispatchBaleCount: 2,
    dispatchQty: 140,
    dispatchCostKes: 17620,
    saleBaleCount: 1,
    saleQty: 40,
    saleCostKes: 4100,
  });
});

test("buildWarehouseStageBoard keeps the four warehouse stages in left-to-right order", () => {
  const stages = buildWarehouseStageBoard({
    rawSummary: {
      currentCount: 33,
      currentWeightKg: 1630,
    },
    sortedSummary: {
      totalQty: 360,
      rackCount: 6,
      totalInventoryValueKes: 38540.8,
    },
    preparedSummary: {
      dispatchBaleCount: 3,
      dispatchQty: 240,
      dispatchCostKes: 30720,
      saleBaleCount: 1,
      saleQty: 40,
      saleCostKes: 4100,
    },
  });

  assert.deepEqual(
    stages.map((row) => ({
      key: row.key,
      title: row.title,
      primaryValue: row.primaryValue,
      secondaryValue: row.secondaryValue,
      tertiaryValue: row.tertiaryValue,
    })),
    [
      { key: "unsorted", title: "未分拣", primaryValue: 33, secondaryValue: 1630, tertiaryValue: 0 },
      { key: "sorted_garments", title: "已分拣（服装）", primaryValue: 360, secondaryValue: 6, tertiaryValue: 38540.8 },
      { key: "packed_dispatch", title: "已打包待送店", primaryValue: 3, secondaryValue: 240, tertiaryValue: 30720 },
      { key: "packed_sale", title: "已打包待售", primaryValue: 1, secondaryValue: 40, tertiaryValue: 4100 },
    ],
  );
});

test("summarizeSoldPackageHistory counts only outbound and settled bale sales history", () => {
  const summary = summarizeSoldPackageHistory([
    {
      pool_entry_id: "RAW:BALE-001",
      source_type: "raw_direct_sale",
      bale_barcode: "BALE-001",
      weight_kg: 40,
      current_status: "in_pool",
      is_outbound: false,
      is_settled: false,
    },
    {
      pool_entry_id: "RAW:BALE-002",
      source_type: "raw_direct_sale",
      bale_barcode: "BALE-002",
      weight_kg: 38,
      current_status: "packed",
      is_outbound: true,
      is_settled: false,
      status_updated_at: "2026-04-21T09:00:00Z",
    },
    {
      pool_entry_id: "REB:REB-001",
      source_type: "sorted_rebale_sale",
      bale_barcode: "REB-001",
      weight_kg: 30,
      current_status: "settled",
      is_outbound: true,
      is_settled: true,
      status_updated_at: "2026-04-21T10:00:00Z",
    },
  ]);

  assert.equal(summary.totalCount, 2);
  assert.equal(summary.rawDirectCount, 1);
  assert.equal(summary.sortedRebaleCount, 1);
  assert.equal(summary.settledCount, 1);
  assert.equal(summary.totalWeightKg, 68);
});

test("buildSoldPackageHistoryRows sorts latest sold packages first", () => {
  const rows = buildSoldPackageHistoryRows([
    {
      pool_entry_id: "RAW:BALE-002",
      source_type: "raw_direct_sale",
      bale_barcode: "BALE-002",
      source_document_no: "SHIP-2",
      current_status: "packed",
      is_outbound: true,
      is_settled: false,
      status_updated_at: "2026-04-21T09:00:00Z",
    },
    {
      pool_entry_id: "REB:REB-001",
      source_type: "sorted_rebale_sale",
      bale_barcode: "REB-001",
      source_document_no: "ORDER-1",
      current_status: "settled",
      is_outbound: true,
      is_settled: true,
      status_updated_at: "2026-04-21T10:00:00Z",
    },
  ]);

  assert.deepEqual(
    rows.map((row) => ({
      bale_barcode: row.bale_barcode,
      occurred_at: row.occurred_at,
      current_status: row.current_status,
    })),
    [
      { bale_barcode: "REB-001", occurred_at: "2026-04-21T10:00:00Z", current_status: "settled" },
      { bale_barcode: "BALE-002", occurred_at: "2026-04-21T09:00:00Z", current_status: "packed" },
    ],
  );
});

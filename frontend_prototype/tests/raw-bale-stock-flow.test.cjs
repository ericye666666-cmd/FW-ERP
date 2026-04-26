const test = require("node:test");
const assert = require("node:assert/strict");

const {
  summarizeRawBaleStock,
  filterRawBales,
  isRawBaleEligibleForSortingTask,
  buildRawBaleTimeline,
} = require("../raw-bale-stock-flow.js");

test("summarizeRawBaleStock focuses on current raw inventory and separates sorted and sold history", () => {
  const summary = summarizeRawBaleStock(
    [
      { bale_barcode: "BALE-001", status: "ready_for_sorting", weight_kg: 40 },
      { bale_barcode: "BALE-002", status: "sorting_in_progress", occupied_by_task_no: "ST-001", weight_kg: 42 },
      { bale_barcode: "BALE-003", status: "in_bale_sales_pool", weight_kg: 36 },
      { bale_barcode: "BALE-004", status: "in_bale_sales_pool", weight_kg: 30 },
      { bale_barcode: "BALE-005", status: "sorted", weight_kg: 35 },
    ],
    [
      {
        pool_entry_id: "RAW:BALE-004",
        source_type: "raw_direct_sale",
        bale_barcode: "BALE-004",
        current_status: "settled",
        is_outbound: true,
        is_settled: true,
        status_updated_at: "2026-04-21T11:00:00Z",
      },
    ],
  );

  assert.equal(summary.totalCount, 5);
  assert.equal(summary.currentCount, 3);
  assert.equal(summary.readyCount, 1);
  assert.equal(summary.sortingInProgressCount, 1);
  assert.equal(summary.occupiedCount, 1);
  assert.equal(summary.baleSalesPoolCount, 1);
  assert.equal(summary.sortedCount, 1);
  assert.equal(summary.soldCount, 1);
  assert.equal(summary.currentWeightKg, 118);
});

test("filterRawBales now only follows the single search input on the warehouse hub", () => {
  const rows = [
    { bale_barcode: "BALE-001", shipment_no: "SHIP-1", status: "ready_for_sorting", occupied_by_task_no: "", supplier_name: "Youxun", category_main: "SummerA+", category_sub: "SummerA+" },
    { bale_barcode: "BALE-002", shipment_no: "SHIP-1", status: "sorting_in_progress", occupied_by_task_no: "ST-001", supplier_name: "Youxun", category_main: "SummerA+", category_sub: "SummerA+" },
    { bale_barcode: "BALE-003", shipment_no: "SHIP-2", status: "in_bale_sales_pool", occupied_by_task_no: "", supplier_name: "Other", category_main: "WinterA+", category_sub: "WinterA+" },
  ];

  const filtered = filterRawBales(rows, {
    shipmentNo: "SHIP-1",
    status: "ready_for_sorting",
    occupancy: "available",
    searchValue: "youxun",
  });

  assert.deepEqual(filtered.map((row) => row.bale_barcode), ["BALE-001", "BALE-002"]);
});

test("isRawBaleEligibleForSortingTask only accepts ready, non-occupied raw bales", () => {
  assert.equal(
    isRawBaleEligibleForSortingTask({
      status: "ready_for_sorting",
      occupied_by_task_no: "",
    }),
    true,
  );
  assert.equal(
    isRawBaleEligibleForSortingTask({
      status: "sorting_in_progress",
      occupied_by_task_no: "ST-001",
    }),
    false,
  );
  assert.equal(
    isRawBaleEligibleForSortingTask({
      status: "in_bale_sales_pool",
      occupied_by_task_no: "",
    }),
    false,
  );
});

test("buildRawBaleTimeline lists sold and sorted raw bales in time order", () => {
  const timeline = buildRawBaleTimeline(
    [
      { bale_barcode: "BALE-001", status: "sorted", updated_at: "2026-04-21T09:00:00Z", shipment_no: "SHIP-1" },
      { bale_barcode: "BALE-002", status: "sorting_in_progress", updated_at: "2026-04-21T08:00:00Z", shipment_no: "SHIP-1" },
      { bale_barcode: "BALE-003", status: "sorted", updated_at: "2026-04-21T07:00:00Z", shipment_no: "SHIP-2" },
    ],
    [
      {
        pool_entry_id: "RAW:BALE-004",
        source_type: "raw_direct_sale",
        bale_barcode: "BALE-004",
        source_document_no: "SHIP-3",
        current_status: "settled",
        is_outbound: true,
        is_settled: true,
        status_updated_at: "2026-04-21T10:00:00Z",
      },
    ],
  );

  assert.deepEqual(
    timeline.map((entry) => ({ type: entry.type, bale: entry.bale_barcode })),
    [
      { type: "sold", bale: "BALE-004" },
      { type: "sorted", bale: "BALE-001" },
      { type: "sorted", bale: "BALE-003" },
    ],
  );
});

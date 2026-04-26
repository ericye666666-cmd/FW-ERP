const test = require("node:test");
const assert = require("node:assert/strict");

let baleSalesWorkbenchFlow = {};
try {
  baleSalesWorkbenchFlow = require("../bale-sales-workbench-flow.js");
} catch (error) {
  baleSalesWorkbenchFlow = {};
}

const {
  buildBaleSalesPoolRows,
  summarizeBaleSalesPoolRows,
  buildConsignmentBundleDraft,
} = baleSalesWorkbenchFlow;

test("buildBaleSalesPoolRows merges raw-direct and sorted-rebale entries with linked order status", () => {
  assert.equal(typeof buildBaleSalesPoolRows, "function");

  const rows = buildBaleSalesPoolRows({
    rawBales: [
      {
        bale_barcode: "RB-001",
        shipment_no: "SHIP-001",
        source_bale_token: "SRC-001",
        supplier_name: "Youxun",
        category_main: "pants",
        category_sub: "cargo pant",
        weight_kg: 36,
        status: "in_bale_sales_pool",
        destination_judgement: "bale_sales_pool",
      },
    ],
    rebaleEntries: [
      {
        rebale_entry_no: "RBS-001",
        bale_barcode: "RS-001",
        source_task_no: "ST-009",
        supplier_name: "Warehouse Sort",
        category_main: "tops",
        category_sub: "lady tops",
        weight_kg: 28,
        bale_count: 1,
        status: "in_pool",
      },
      {
        rebale_entry_no: "RBS-002",
        bale_barcode: "RS-002",
        source_task_no: "ST-010",
        supplier_name: "Warehouse Sort",
        category_main: "mixed",
        category_sub: "mixed",
        weight_kg: 30,
        bale_count: 1,
        status: "in_pool",
      },
    ],
    consignmentOrders: [
      {
        order_no: "CSG-20260421-001",
        status: "packed",
        selected_pool_entry_ids: ["RAW:RB-001"],
      },
      {
        order_no: "CSG-20260421-002",
        status: "settled",
        selected_pool_entry_ids: ["REB:RBS-002"],
      },
    ],
  });

  assert.equal(rows.length, 3);

  const rawRow = rows.find((row) => row.pool_entry_id === "RAW:RB-001");
  assert.deepEqual(
    {
      source_type: rawRow.source_type,
      current_status: rawRow.current_status,
      is_sellable: rawRow.is_sellable,
      is_outbound: rawRow.is_outbound,
      is_settled: rawRow.is_settled,
      linked_order_no: rawRow.linked_order_no,
    },
    {
      source_type: "raw_direct_sale",
      current_status: "packed",
      is_sellable: false,
      is_outbound: true,
      is_settled: false,
      linked_order_no: "CSG-20260421-001",
    },
  );

  const rebalePoolRow = rows.find((row) => row.pool_entry_id === "REB:RBS-001");
  assert.deepEqual(
    {
      source_type: rebalePoolRow.source_type,
      current_status: rebalePoolRow.current_status,
      is_sellable: rebalePoolRow.is_sellable,
      is_outbound: rebalePoolRow.is_outbound,
      is_settled: rebalePoolRow.is_settled,
      source_reference: rebalePoolRow.source_reference,
    },
    {
      source_type: "sorted_rebale_sale",
      current_status: "in_pool",
      is_sellable: true,
      is_outbound: false,
      is_settled: false,
      source_reference: "ST-009",
    },
  );

  const settledRow = rows.find((row) => row.pool_entry_id === "REB:RBS-002");
  assert.deepEqual(
    {
      current_status: settledRow.current_status,
      is_sellable: settledRow.is_sellable,
      is_outbound: settledRow.is_outbound,
      is_settled: settledRow.is_settled,
      linked_order_no: settledRow.linked_order_no,
    },
    {
      current_status: "settled",
      is_sellable: false,
      is_outbound: true,
      is_settled: true,
      linked_order_no: "CSG-20260421-002",
    },
  );
});

test("summarizeBaleSalesPoolRows and buildConsignmentBundleDraft keep source split visible", () => {
  assert.equal(typeof summarizeBaleSalesPoolRows, "function");
  assert.equal(typeof buildConsignmentBundleDraft, "function");

  const rows = [
    {
      pool_entry_id: "RAW:RB-001",
      bale_barcode: "RB-001",
      source_type: "raw_direct_sale",
      supplier_name: "Youxun",
      category_main: "pants",
      category_sub: "cargo pant",
      weight_kg: 36,
      bale_count: 1,
      is_sellable: true,
      is_outbound: false,
      is_settled: false,
    },
    {
      pool_entry_id: "REB:RBS-001",
      bale_barcode: "RS-001",
      source_type: "sorted_rebale_sale",
      supplier_name: "Warehouse Sort",
      category_main: "tops",
      category_sub: "lady tops",
      weight_kg: 28,
      bale_count: 1,
      is_sellable: true,
      is_outbound: false,
      is_settled: false,
    },
    {
      pool_entry_id: "REB:RBS-002",
      bale_barcode: "RS-002",
      source_type: "sorted_rebale_sale",
      supplier_name: "Warehouse Sort",
      category_main: "mixed",
      category_sub: "mixed",
      weight_kg: 30,
      bale_count: 1,
      is_sellable: false,
      is_outbound: true,
      is_settled: true,
    },
  ];

  const summary = summarizeBaleSalesPoolRows(rows);
  assert.deepEqual(summary, {
    totalCount: 3,
    rawDirectCount: 1,
    sortedRebaleCount: 2,
    sellableCount: 2,
    outboundCount: 1,
    settledCount: 1,
    totalWeightKg: 94,
    totalBaleCount: 3,
  });

  const draft = buildConsignmentBundleDraft(rows.slice(0, 2));
  assert.deepEqual(
    {
      title: draft.title,
      target_total_weight_kg: draft.target_total_weight_kg,
      target_bale_weight_kg: draft.target_bale_weight_kg,
      selected_pool_entry_ids: draft.selected_pool_entry_ids,
      source_type_summary: draft.source_type_summary,
      source_rule: draft.source_rule,
    },
    {
      title: "整包销售池混包草稿",
      target_total_weight_kg: 64,
      target_bale_weight_kg: 32,
      selected_pool_entry_ids: ["RAW:RB-001", "REB:RBS-001"],
      source_type_summary: "原始未分拣 bale 直售 1 包 + 分拣结果再打 bale 1 包",
      source_rule: "来源：RB-001, RS-001",
    },
  );
});

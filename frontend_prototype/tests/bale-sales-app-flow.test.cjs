const test = require("node:test");
const assert = require("node:assert/strict");

let baleSalesAppFlow = {};
try {
  baleSalesAppFlow = require("../bale-sales-app-flow.js");
} catch (error) {
  baleSalesAppFlow = {};
}

const {
  summarizePricingCandidates,
  buildShipmentFilterOptions,
  buildPricingUpdatePayload,
  findCandidateByBarcode,
  summarizeOutboundSelection,
  buildOutboundOrderPayload,
} = baleSalesAppFlow;

test("pricing helper summarizes candidate rows and shipment filter options", () => {
  assert.equal(typeof summarizePricingCandidates, "function");
  assert.equal(typeof buildShipmentFilterOptions, "function");

  const rows = [
    {
      entry_id: "RAW:RB-001",
      shipment_no: "SHIP-001",
      source_cost_kes: 8200,
      total_cost_kes: 9000,
      target_sale_price_kes: 11000,
      status: "available",
    },
    {
      entry_id: "RAW:RB-002",
      shipment_no: "SHIP-002",
      source_cost_kes: 7000,
      total_cost_kes: 7600,
      target_sale_price_kes: 9200,
      status: "sold",
    },
    {
      entry_id: "RAW:RB-003",
      shipment_no: "SHIP-001",
      source_cost_kes: 6800,
      total_cost_kes: 7100,
      target_sale_price_kes: 0,
      status: "available",
    },
  ];

  assert.deepEqual(summarizePricingCandidates(rows), {
    totalCount: 3,
    availableCount: 2,
    totalSourceCostKes: 22000,
    totalCostKes: 23700,
    totalTargetSaleKes: 20200,
  });

  assert.deepEqual(buildShipmentFilterOptions(rows), [
    { label: "全部船单", value: "" },
    { label: "SHIP-001", value: "SHIP-001" },
    { label: "SHIP-002", value: "SHIP-002" },
  ]);
});

test("pricing helper converts editable draft into backend payload", () => {
  assert.equal(typeof buildPricingUpdatePayload, "function");

  assert.deepEqual(
    buildPricingUpdatePayload({
      editableCostKes: "9300",
      downstreamCostKes: "450",
      marginPercent: "18.5",
      note: "补上最后尾程和人工",
    }),
    {
      editable_cost_kes: 9300,
      downstream_cost_kes: 450,
      margin_rate: 0.185,
      note: "补上最后尾程和人工",
    },
  );
});

test("outbound helper matches barcode, summarizes selection, and builds real outbound payload", () => {
  assert.equal(typeof findCandidateByBarcode, "function");
  assert.equal(typeof summarizeOutboundSelection, "function");
  assert.equal(typeof buildOutboundOrderPayload, "function");

  const rows = [
    {
      entry_id: "RAW:RB-001",
      bale_barcode: "RB-001",
      weight_kg: 35,
      total_cost_kes: 9000,
      target_sale_price_kes: 10800,
    },
    {
      entry_id: "RAW:RB-002",
      bale_barcode: "rb-002",
      weight_kg: 30,
      total_cost_kes: 7600,
      target_sale_price_kes: 9000,
    },
  ];

  assert.equal(findCandidateByBarcode(rows, " rb-002 ").entry_id, "RAW:RB-002");
  assert.equal(findCandidateByBarcode(rows, "missing"), null);

  assert.deepEqual(
    summarizeOutboundSelection(rows, {
      "RAW:RB-001": "11200",
      "RAW:RB-002": "",
    }),
    {
      selectedCount: 2,
      totalWeightKg: 65,
      totalCostKes: 16600,
      totalSaleKes: 20200,
      totalProfitKes: 3600,
    },
  );

  assert.deepEqual(
    buildOutboundOrderPayload({
      selectedRows: rows,
      salePriceDrafts: {
        "RAW:RB-001": "11200",
        "RAW:RB-002": "9100",
      },
      soldBy: "Austin",
      customerName: "Gikomba Buyer",
      customerContact: "0700 000 111",
      paymentMethod: "mpesa",
      note: "下午自提",
    }),
    {
      sold_by: "Austin",
      customer_name: "Gikomba Buyer",
      customer_contact: "0700 000 111",
      payment_method: "mpesa",
      note: "下午自提",
      items: [
        { entry_id: "RAW:RB-001", sale_price_kes: 11200 },
        { entry_id: "RAW:RB-002", sale_price_kes: 9100 },
      ],
    },
  );

  assert.throws(
    () =>
      buildOutboundOrderPayload({
        selectedRows: [],
        salePriceDrafts: {},
        soldBy: "Austin",
        customerName: "",
        customerContact: "",
        paymentMethod: "cash",
        note: "",
      }),
    /请先选择或扫码至少一个 bale/,
  );
});

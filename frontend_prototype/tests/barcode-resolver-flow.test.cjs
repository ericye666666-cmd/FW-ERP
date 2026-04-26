const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildBarcodeResolvePath,
  assertResolvedBarcodeContext,
  getCanonicalBarcodeForContext,
  getIdentityLedgerLookupValue,
} = require("../barcode-resolver-flow.js");

test("buildBarcodeResolvePath sends page scans through the global resolver with context", () => {
  assert.equal(
    buildBarcodeResolvePath(" rb260425aaaab ", "warehouse_sorting_create"),
    "/barcode/resolve/RB260425AAAAB?context=warehouse_sorting_create",
  );
});

test("assertResolvedBarcodeContext rejects warehouse bale scans at POS before stock lookup", () => {
  assert.throws(
    () => assertResolvedBarcodeContext({
      barcode_type: "RAW_BALE",
      object_id: "RB260425AAAAB",
      reject_reason: "POS 只允许扫描已激活的 STORE_ITEM 商品码，不能扫描仓库/送店 bale 码。",
    }, {
      context: "pos",
      allowedTypes: ["STORE_ITEM"],
    }),
    /POS 只允许扫描已激活的 STORE_ITEM 商品码/,
  );
});

test("getCanonicalBarcodeForContext uses resolver object id for raw bales and backend barcode for store items", () => {
  assert.equal(
    getCanonicalBarcodeForContext({
      inputBarcode: "BALE-OLD-001",
      resolved: { barcode_type: "RAW_BALE", object_id: "RB260425AAAAB" },
      stockResult: null,
      context: "warehouse_sorting_create",
    }),
    "RB260425AAAAB",
  );
  assert.equal(
    getCanonicalBarcodeForContext({
      inputBarcode: "TOK-ST20260425001-0001",
      resolved: { barcode_type: "STORE_ITEM", object_id: "TOK-ST20260425001-0001" },
      stockResult: { barcode: "IT260425AAAAAB" },
      context: "pos",
    }),
    "IT260425AAAAAB",
  );
});

test("getIdentityLedgerLookupValue follows identity_id when resolver can identify the item", () => {
  assert.equal(
    getIdentityLedgerLookupValue("IT260425AAAAAB", {
      barcode_type: "STORE_ITEM",
      object_id: "TOK-ST20260425001-0001",
      identity_id: "TOK-ST20260425001-0001",
    }),
    "TOK-ST20260425001-0001",
  );
  assert.equal(
    getIdentityLedgerLookupValue("UNKNOWN-CODE", { barcode_type: "UNKNOWN", identity_id: "" }),
    "UNKNOWN-CODE",
  );
});

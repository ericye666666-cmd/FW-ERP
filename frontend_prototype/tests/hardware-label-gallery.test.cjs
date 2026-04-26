const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildHardwareLabelGroups,
  buildVisibleHardwareLabelGroups,
  countHardwareLabelCandidates,
  buildFuturePrintStructure,
  buildHardwareCandidatePrintPayload,
  buildHardwareCandidateBatchPrintPayload,
} = require("../hardware-label-gallery.js");

test("buildHardwareLabelGroups returns four scoped groups with fixed candidate counts and preview sizes", () => {
  const groups = buildHardwareLabelGroups();

  assert.deepEqual(
    groups.map((group) => group.key),
    ["warehouseout_bale", "store_item", "department_item_40x30", "wait_for_transtoshop"],
  );
  assert.deepEqual(
    groups.map((group) => group.candidates.length),
    [3, 3, 3, 2],
  );
  groups.slice(0, 2).forEach((group) => {
    group.candidates.forEach((candidate) => {
      assert.equal(candidate.width_mm, 60);
      assert.equal(candidate.height_mm, 40);
      assert.ok(candidate.id);
    });
  });
  groups[2].candidates.forEach((candidate) => {
    assert.equal(candidate.width_mm, 40);
    assert.equal(candidate.height_mm, 30);
    assert.ok(candidate.id);
  });
});

test("countHardwareLabelCandidates returns the total candidate count", () => {
  assert.equal(countHardwareLabelCandidates(buildHardwareLabelGroups()), 11);
});

test("warehouseout candidates keep outbound/signoff fields but now use Code128 1D scanning instead of QR", () => {
  const groups = buildHardwareLabelGroups();
  const warehouseout = groups.find((group) => group.key === "warehouseout_bale");

  assert.ok(warehouseout);
  assert.equal(warehouseout.recommended_candidate_id, "warehouseout_bale__wo_receipt_qr");
  warehouseout.candidates.forEach((candidate) => {
    const blocks = candidate.blocks;
    const barcodeBlock = blocks.find((block) => block.type === "barcode");
    assert.ok(barcodeBlock, `${candidate.id} should include a 1D barcode block`);
    assert.equal(barcodeBlock.symbology, "Code128");
    assert.equal(blocks.some((block) => block.type === "qr"), false, `${candidate.id} should not include a QR block anymore`);
    assert.ok(blocks.some((block) => block.field_key === "store_name"), `${candidate.id} should show destination store`);
    assert.ok(blocks.some((block) => block.field_key === "transfer_order_no"), `${candidate.id} should show transfer order number`);
    assert.ok(blocks.some((block) => block.field_key === "bale_piece_summary"), `${candidate.id} should show bale piece summary`);
    assert.ok(blocks.some((block) => block.field_key === "total_quantity"), `${candidate.id} should show total quantity`);
    assert.ok(blocks.some((block) => block.field_key === "packing_list"), `${candidate.id} should show packing list area`);
    assert.ok(blocks.some((block) => block.field_key === "dispatch_bale_no"), `${candidate.id} should show dispatch bale short code`);
    assert.ok(blocks.some((block) => block.field_key === "outbound_time"), `${candidate.id} should still keep outbound time on paper`);
    assert.equal(blocks.some((block) => block.field_key === "supplier_name"), false, `${candidate.id} should not drift back to warehousein supplier fields`);
  });
});

test("warehouseout recommended candidate moves Out to the left top cluster and removes machine code", () => {
  const groups = buildHardwareLabelGroups();
  const warehouseout = groups.find((group) => group.key === "warehouseout_bale");
  const candidate = warehouseout.candidates.find((row) => row.id === "warehouseout_bale__wo_receipt_qr");
  const outboundBlock = candidate.blocks.find((block) => block.field_key === "outbound_time");
  const machineBlock = candidate.blocks.find((block) => block.field_key === "machine_code");

  assert.ok(outboundBlock);
  assert.ok(Number(outboundBlock.x_mm) <= 3.0);
  assert.ok(Number(outboundBlock.y_mm) <= 20.0);
  assert.equal(machineBlock, undefined);
});

test("warehouseout recommended candidate places Total back to the right top and starts packing list below it", () => {
  const groups = buildHardwareLabelGroups();
  const warehouseout = groups.find((group) => group.key === "warehouseout_bale");
  const candidate = warehouseout.candidates.find((row) => row.id === "warehouseout_bale__wo_receipt_qr");
  const packingListBlock = candidate.blocks.find((block) => block.field_key === "packing_list");
  const totalBlock = candidate.blocks.find((block) => block.field_key === "total_quantity");

  assert.ok(packingListBlock);
  assert.ok(totalBlock);
  assert.ok(Number(packingListBlock.x_mm) >= 31.0);
  assert.ok(Number(packingListBlock.y_mm) >= 7.0);
  assert.ok(Number(packingListBlock.h_mm) >= 27.0);
  assert.ok(Number(totalBlock.x_mm) >= 31.0);
  assert.ok(Number(totalBlock.y_mm) <= 3.0);
});

test("warehouseout recommended candidate now carries a 20-line packing list sample", () => {
  const groups = buildHardwareLabelGroups();
  const warehouseout = groups.find((group) => group.key === "warehouseout_bale");
  const candidate = warehouseout.candidates.find((row) => row.id === "warehouseout_bale__wo_receipt_qr");
  const packingListBlock = candidate.blocks.find((block) => block.field_key === "packing_list");

  assert.ok(packingListBlock);
  assert.equal(String(packingListBlock.value).split("\n").length, 20);
  assert.ok(Number(packingListBlock.font_px) <= 7);
});

test("store item candidates prioritize large price, product subcategory and Code128 only", () => {
  const groups = buildHardwareLabelGroups();
  const storeItem = groups.find((group) => group.key === "store_item");

  assert.ok(storeItem);
  assert.equal(storeItem.recommended_candidate_id, "store_item__si_price_stack");
  storeItem.candidates.forEach((candidate) => {
    const blocks = candidate.blocks;
    const priceBlock = blocks.find((block) => block.field_key === "price");
    const productNameBlock = blocks.find((block) => block.field_key === "product_name");
    const barcodeBlock = blocks.find((block) => block.type === "barcode");

    assert.ok(priceBlock, `${candidate.id} should expose price`);
    assert.ok(productNameBlock, `${candidate.id} should expose product name`);
    assert.ok(barcodeBlock, `${candidate.id} should expose a 1D barcode block`);
    assert.equal(barcodeBlock.symbology, "Code128");
    assert.ok(Number(priceBlock.font_px) > Number(productNameBlock.font_px), `${candidate.id} price should be more prominent than product name`);
    assert.equal(blocks.some((block) => block.field_key === "supplier_name"), false, `${candidate.id} should not print supplier`);
    assert.equal(blocks.some((block) => block.field_key === "store_name"), false, `${candidate.id} should not print store name`);
    assert.equal(blocks.some((block) => block.field_key === "unit_cost"), false, `${candidate.id} should not print cost fields`);
  });
});

test("department 40x30 preview candidates stay in the lab only and preserve compact product label hierarchy", () => {
  const groups = buildHardwareLabelGroups();
  const departmentItem = groups.find((group) => group.key === "department_item_40x30");

  assert.ok(departmentItem);
  assert.equal(departmentItem.recommended_candidate_id, "department_item_40x30__di_price_clean");
  departmentItem.candidates.forEach((candidate) => {
    const blocks = candidate.blocks;
    const priceBlock = blocks.find((block) => block.field_key === "price");
    const productNameBlock = blocks.find((block) => block.field_key === "product_name");
    const barcodeBlock = blocks.find((block) => block.type === "barcode");

    assert.ok(priceBlock);
    assert.ok(productNameBlock);
    assert.ok(barcodeBlock);
    assert.equal(barcodeBlock.symbology, "Code128");
    assert.equal(candidate.width_mm, 40);
    assert.equal(candidate.height_mm, 30);
  });
});

test("hardware label lab page now only shows wait for transtoshop 60x40 candidates", () => {
  const groups = buildVisibleHardwareLabelGroups();

  assert.deepEqual(groups.map((group) => group.key), ["wait_for_transtoshop"]);
  assert.equal(groups[0].candidates.length, 2);
});

test("wait for transtoshop preview uses the requested CAT SUB GRADE QTY STATUS CODE fields on 60x40", () => {
  const groups = buildHardwareLabelGroups();
  const waitGroup = groups.find((group) => group.key === "wait_for_transtoshop");
  const candidate = waitGroup.candidates.find((row) => row.id === "wait_for_transtoshop__wf_main");
  const barcodeBlock = candidate.blocks.find((block) => block.type === "barcode");
  const statusBlock = candidate.blocks.find((block) => block.field_key === "status");

  assert.ok(waitGroup);
  assert.equal(candidate.width_mm, 60);
  assert.equal(candidate.height_mm, 40);
  assert.ok(candidate.blocks.some((block) => block.value === "CAT: pants"));
  assert.ok(candidate.blocks.some((block) => block.value === "SUB: jeans pant"));
  assert.ok(candidate.blocks.some((block) => block.value === "GRADE: P"));
  assert.ok(candidate.blocks.some((block) => block.value === "QTY: 50"));
  assert.ok(candidate.blocks.some((block) => block.value === "STATUS: wait for transtoshop"));
  assert.ok(candidate.blocks.some((block) => block.value === "CODE: 240423000018"));
  assert.ok(statusBlock);
  assert.ok(Number(statusBlock.y_mm) <= 2.6);
  assert.ok(Number(statusBlock.font_px) >= 18);
  assert.ok(barcodeBlock);
  assert.equal(barcodeBlock.value, "240423000018");
  assert.match(String(barcodeBlock.value), /^\d{12}$/);
  assert.equal(barcodeBlock.symbology, "Code128");
});

test("wait for sale preview adds GRADE A/B and WEIGHT on 60x40", () => {
  const groups = buildHardwareLabelGroups();
  const waitGroup = groups.find((group) => group.key === "wait_for_transtoshop");
  const candidate = waitGroup.candidates.find((row) => row.id === "wait_for_transtoshop__wf_sale");
  const barcodeBlock = candidate.blocks.find((block) => block.type === "barcode");

  assert.ok(candidate);
  assert.equal(candidate.width_mm, 60);
  assert.equal(candidate.height_mm, 40);
  assert.ok(candidate.blocks.some((block) => block.value === "STATUS: wait for sale"));
  assert.ok(candidate.blocks.some((block) => block.value === "CAT: pants"));
  assert.ok(candidate.blocks.some((block) => block.value === "SUB: jeans pant"));
  assert.ok(candidate.blocks.some((block) => block.value === "GRADE: A/B"));
  assert.ok(candidate.blocks.some((block) => block.value === "QTY: 50"));
  assert.ok(candidate.blocks.some((block) => block.value === "WEIGHT: 18.6 KG"));
  assert.ok(candidate.blocks.some((block) => block.value === "CODE: 240423100018"));
  assert.ok(barcodeBlock);
  assert.equal(barcodeBlock.value, "240423100018");
  assert.match(String(barcodeBlock.value), /^\d{12}$/);
  assert.equal(barcodeBlock.symbology, "Code128");
});

test("department DI-A candidate enlarges all primary fields for 40x30 readability", () => {
  const groups = buildHardwareLabelGroups();
  const departmentItem = groups.find((group) => group.key === "department_item_40x30");
  const candidate = departmentItem.candidates.find((row) => row.id === "department_item_40x30__di_price_clean");
  const priceBlock = candidate.blocks.find((block) => block.field_key === "price");
  const suffixBlock = candidate.blocks.find((block) => block.field_key === "short_suffix");
  const nameBlock = candidate.blocks.find((block) => block.field_key === "product_name");
  const codeTextBlock = candidate.blocks.find((block) => block.field_key === "barcode_value" && block.type === "text");
  const barcodeBlock = candidate.blocks.find((block) => block.type === "barcode");

  assert.ok(Number(priceBlock.font_px) >= 28);
  assert.ok(Number(suffixBlock.font_px) >= 13);
  assert.ok(Number(nameBlock.font_px) >= 14);
  assert.ok(Number(codeTextBlock.font_px) >= 9);
  assert.ok(Number(barcodeBlock.h_mm) >= 8.6);
});

test("buildFuturePrintStructure preserves later printing handoff metadata", () => {
  const groups = buildHardwareLabelGroups();
  const warehouseout = groups.find((group) => group.key === "warehouseout_bale");
  const candidate = warehouseout.candidates.find((row) => row.id === "warehouseout_bale__wo_receipt_qr");
  const structure = buildFuturePrintStructure(candidate);

  assert.equal(structure.label_family, "warehouseout_bale");
  assert.equal(structure.width_mm, 60);
  assert.equal(structure.height_mm, 40);
  assert.equal(structure.primary_symbology, "Code128");
  assert.ok(Array.isArray(structure.blocks));
  assert.ok(structure.blocks.some((block) => block.type === "barcode"));
  assert.ok(structure.blocks.some((block) => block.type === "text"));
});

test("buildHardwareCandidatePrintPayload keeps warehouseout 1D barcode blocks for real candidate printing", () => {
  const groups = buildHardwareLabelGroups();
  const warehouseout = groups.find((group) => group.key === "warehouseout_bale");
  const candidate = warehouseout.candidates.find((row) => row.id === "warehouseout_bale__wo_receipt_qr");
  const payload = buildHardwareCandidatePrintPayload(candidate, { printerName: "Deli DL-720C" });

  assert.equal(payload.printer_name, "Deli DL-720C");
  assert.equal(payload.candidate_id, "warehouseout_bale__wo_receipt_qr");
  assert.ok(payload.blocks.some((block) => block.type === "barcode"));
  assert.equal(payload.blocks.some((block) => block.type === "qr"), false);
  assert.ok(payload.blocks.some((block) => block.type === "line"));
  assert.ok(payload.blocks.some((block) => block.type === "text"));
});

test("warehouseout recommended candidate reuses warehousein's proven lower-left Code128 geometry", () => {
  const groups = buildHardwareLabelGroups();
  const warehouseout = groups.find((group) => group.key === "warehouseout_bale");
  const candidate = warehouseout.candidates.find((row) => row.id === "warehouseout_bale__wo_receipt_qr");
  const barcodeBlock = candidate.blocks.find((block) => block.type === "barcode");

  assert.ok(barcodeBlock);
  assert.equal(Number(barcodeBlock.x_mm), 2.8);
  assert.equal(Number(barcodeBlock.y_mm), 20.0);
  assert.equal(Number(barcodeBlock.w_mm), 26.8);
  assert.equal(Number(barcodeBlock.h_mm), 15.2);
});

test("warehouseout recommended candidate now uses a 12-digit numeric dispatch short code for scan stability", () => {
  const groups = buildHardwareLabelGroups();
  const warehouseout = groups.find((group) => group.key === "warehouseout_bale");
  const candidate = warehouseout.candidates.find((row) => row.id === "warehouseout_bale__wo_receipt_qr");
  const barcodeBlock = candidate.blocks.find((block) => block.type === "barcode");

  assert.ok(barcodeBlock);
  assert.match(String(barcodeBlock.value), /^\d{12}$/);
});

test("buildHardwareCandidateBatchPrintPayload keeps store item candidates printable as a 3-up comparison set", () => {
  const groups = buildHardwareLabelGroups();
  const storeItem = groups.find((group) => group.key === "store_item");
  const payload = buildHardwareCandidateBatchPrintPayload(storeItem, { printerName: "Deli DL-720C" });

  assert.equal(payload.printer_name, "Deli DL-720C");
  assert.equal(payload.candidates.length, 3);
  payload.candidates.forEach((candidate) => {
    assert.ok(candidate.blocks.some((block) => block.type === "barcode"));
    assert.equal(candidate.blocks.some((block) => block.type === "qr"), false);
  });
});

test("buildHardwareCandidateBatchPrintPayload uses 40x30 size for department preview comparisons", () => {
  const groups = buildHardwareLabelGroups();
  const departmentItem = groups.find((group) => group.key === "department_item_40x30");
  const payload = buildHardwareCandidateBatchPrintPayload(departmentItem, { printerName: "Deli DL-720C" });

  assert.equal(payload.label_size, "40x30");
  assert.equal(payload.width_mm, 40);
  assert.equal(payload.height_mm, 30);
  assert.equal(payload.candidates.length, 3);
});

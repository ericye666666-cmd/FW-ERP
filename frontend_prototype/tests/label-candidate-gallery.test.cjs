const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildLabelCandidateGroups,
  buildCandidatePrintPayload,
  countLabelCandidates,
} = require("../label-candidate-gallery.js");

test("buildLabelCandidateGroups returns three 60x40 label groups with the requested candidate counts", () => {
  const groups = buildLabelCandidateGroups();

  assert.equal(groups.length, 3);
  assert.deepEqual(
    groups.map((group) => group.key),
    ["warehouse_bale", "apparel_item", "store_dispatch_bale"],
  );
  assert.deepEqual(
    groups.map((group) => group.candidates.length),
    [20, 10, 10],
  );
});

test("countLabelCandidates returns the total candidate count across all groups", () => {
  const groups = buildLabelCandidateGroups();

  assert.equal(countLabelCandidates(groups), 40);
});

test("every candidate keeps the 60x40 footprint and unique identifiers", () => {
  const groups = buildLabelCandidateGroups();
  const ids = new Set();

  groups.forEach((group) => {
    group.candidates.forEach((candidate) => {
      assert.equal(candidate.width_mm, 60);
      assert.equal(candidate.height_mm, 40);
      assert.ok(candidate.id);
      assert.equal(ids.has(candidate.id), false);
      ids.add(candidate.id);
    });
  });

  assert.equal(ids.size, 40);
});

test("warehouse bale candidates follow the confirmed supplier-category-piece-and-trace layout", () => {
  const groups = buildLabelCandidateGroups();
  const warehouseGroup = groups.find((group) => group.key === "warehouse_bale");

  assert.ok(warehouseGroup);
  assert.equal(warehouseGroup.candidates.length, 20);
  assert.ok(warehouseGroup.candidates.some((candidate) => candidate.id === "warehouse_bale__legacy_formal"));
  assert.ok(warehouseGroup.candidates.some((candidate) => candidate.id === "warehouse_bale__wb_top_band"));
  assert.ok(warehouseGroup.candidates.some((candidate) => candidate.id === "warehouse_bale__wb_wide_bar"));
  assert.ok(warehouseGroup.candidates.some((candidate) => candidate.id === "warehouse_bale__wb_column_focus"));

  warehouseGroup.candidates.forEach((candidate) => {
    const barcode = candidate.blocks.find((block) => block.type === "barcode");
    if (candidate.id === "warehouse_bale__legacy_formal") {
      const headline = candidate.blocks.find((block) => block.content_role === "legacy_headline");
      const legacyCode = candidate.blocks.find((block) => block.content_role === "legacy_code");
      assert.ok(headline, "legacy warehouse candidate should expose the old headline block");
      assert.ok(legacyCode, "legacy warehouse candidate should expose the old short-code block");
      assert.ok(Number(barcode.x_mm) < 10, "legacy barcode should stay full-width and left aligned");
      assert.ok(Number(barcode.w_mm) > 50, "legacy barcode should keep the wider old footprint");
      return;
    }
    const texts = candidate.blocks.filter((block) => block.type === "text");
    const values = texts.map((block) => String(block.value));
    const supplierText = texts.find((block) => String(block.value).startsWith("供应商："));
    const majorText = texts.find((block) => String(block.value).startsWith("大类："));
    const minorText = texts.find((block) => String(block.value).startsWith("小类："));
    const currentPieceText = texts.find((block) => String(block.value).startsWith("第") || String(block.value).startsWith("No:"));
    const totalPieceText = texts.find((block) => String(block.value).startsWith("共") || String(block.value).startsWith("Total:"));
    const traceMeta = texts.filter((block) => block.content_role === "trace_meta");

    assert.ok(barcode, `${candidate.id} should include a barcode block`);
    assert.ok(supplierText, `${candidate.id} should expose supplier in the top-left`);
    assert.ok(majorText, `${candidate.id} should expose major category`);
    assert.ok(minorText, `${candidate.id} should expose minor category`);
    assert.ok(currentPieceText, `${candidate.id} should expose current piece count`);
    assert.ok(totalPieceText, `${candidate.id} should expose total piece count`);
    [supplierText, majorText, minorText, currentPieceText, totalPieceText].forEach((block) => {
      assert.ok(Number(block.print_font_size) >= 6, `${candidate.id} top text should keep a readable print size`);
    });
    assert.ok(values.some((value) => value.startsWith("Barcode:") || /^RB\d+$/.test(value)), `${candidate.id} should show the scan barcode text`);
    assert.ok(values.some((value) => value.startsWith("Batch:") || value.includes("BL-")), `${candidate.id} should include batch trace`);
    assert.ok(values.some((value) => value.startsWith("Shipment:") || value.includes("1-04052026")), `${candidate.id} should include shipment trace`);
    assert.ok(values.some((value) => value.startsWith("Inbound:") || value.includes("2026-04-22")), `${candidate.id} should include inbound time trace`);
    assert.ok(traceMeta.length >= 3, `${candidate.id} should keep multiple trace fields`);
    assert.ok(Number(barcode.w_mm) >= 22, `${candidate.id} barcode should keep a scan-safe width`);
    assert.ok(Number(barcode.h_mm) >= 13, `${candidate.id} barcode should keep a scan-safe height`);
    assert.ok(Number(barcode.y_mm) >= 12, `${candidate.id} barcode should stay out of the top headline zone`);
  });
});

test("warehouse bale print payload uses compact ASCII labels for physical TSPL output", () => {
  const groups = buildLabelCandidateGroups();
  const warehouseGroup = groups.find((group) => group.key === "warehouse_bale");
  const candidate = warehouseGroup.candidates.find((row) => row.id === "warehouse_bale__wb_balance");
  const payload = buildCandidatePrintPayload(candidate, { printerName: "Deli DL-720C" });
  const values = payload.blocks.filter((block) => block.type === "text").map((block) => block.value);
  const textBlocks = payload.blocks.filter((block) => block.type === "text");
  const topAndCounterFonts = textBlocks
    .filter((block) => Number(block.y_mm) < 16)
    .map((block) => Number(block.font_size));

  assert.ok(values.some((value) => value.startsWith("SUP: ")));
  assert.ok(values.some((value) => value.startsWith("CAT: ")));
  assert.ok(values.some((value) => value.startsWith("SUB: ")));
  assert.ok(values.some((value) => /^No[:.]\s?\d+$/.test(value)));
  assert.ok(values.some((value) => /^Total:\s\d+(\spcs)?$/.test(value) || value === "5 pcs"));
  assert.ok(values.some((value) => /^Code:\sRB\d+$/.test(value)));
  assert.ok(values.some((value) => /^Batch:\s\d{6}-\d{3}$/.test(value)));
  assert.ok(values.some((value) => /^Ship:\s1-04052026$/.test(value)));
  assert.ok(values.some((value) => /^In:\s\d{2}-\d{2} \d{2}:\d{2}$/.test(value)));
  topAndCounterFonts.forEach((fontSize) => {
    assert.ok(fontSize <= 11, `expected warehouse top print text to stay within the tuned ABC candidate range, got ${fontSize}`);
  });
});

test("WB-B keeps two horizontal dividers plus one lower vertical divider", () => {
  const groups = buildLabelCandidateGroups();
  const warehouseGroup = groups.find((group) => group.key === "warehouse_bale");
  const candidate = warehouseGroup.candidates.find((row) => row.id === "warehouse_bale__wb_supplier_focus");
  const dividers = candidate.blocks.filter((block) => block.type === "line");
  const dividerRoles = dividers.map((block) => block.content_role).sort();
  const horizontalDividers = dividers.filter((block) => Number(block.w_mm) > Number(block.h_mm));
  const verticalDividers = dividers.filter((block) => Number(block.h_mm) > Number(block.w_mm));
  const dividerYs = candidate.blocks
    .filter((block) => block.type === "line")
    .map((block) => Number(block.y_mm))
    .sort((a, b) => a - b);
  const payload = buildCandidatePrintPayload(candidate, { printerName: "Deli DL-720C" });

  assert.deepEqual(dividerRoles, ["lower_vertical_divider", "middle_divider", "top_divider"]);
  horizontalDividers.forEach((block) => {
    const width = Number(block.w_mm);
    assert.ok(width >= 50, `expected divider to span most of the label width, got ${width}`);
  });
  horizontalDividers.forEach((block) => {
    const height = Number(block.h_mm);
    assert.ok(height >= 0.8, `expected horizontal divider to stay visible on DL-720C, got ${height}`);
  });
  assert.equal(verticalDividers.length, 1);
  assert.ok(Number(verticalDividers[0].w_mm) >= 0.8);
  assert.ok(Number(verticalDividers[0].h_mm) >= 16);
  assert.deepEqual(dividerYs, [16.6, 20, 37.1]);
  assert.equal(
    payload.blocks.filter((block) => block.type === "line").length,
    3,
  );
});

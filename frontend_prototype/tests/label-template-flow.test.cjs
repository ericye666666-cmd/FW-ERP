const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getDefaultBaleTemplateLayout,
  normalizeBaleTemplateLayout,
  scaleBaleTemplateLayout,
  getEnabledTemplateFields,
  listEditableTextComponents,
  getComponentMinimumSize,
  getAutoFitFontSize,
  formatBaleTemplateOptionLabel,
  filterActiveLabelTemplates,
  filterManagedLabelTemplates,
  groupManagedLabelTemplates,
  getManagedTemplateCalibrationMeta,
  pickPreferredTemplateCode,
  createTemplateDemoData,
  hasSavedTemplateLayout,
  getFormalTemplatePreviewMode,
  buildTemplateDemoBlocks,
  buildTemplateDemoPrintPayload,
  buildLockedTemplateOptions,
} = require("../label-template-flow.js");

test("getDefaultBaleTemplateLayout returns the four editable bale components", () => {
  const layout = getDefaultBaleTemplateLayout(60, 40);

  assert.equal(layout.paper_preset, "60x40");
  assert.deepEqual(
    layout.components.map((component) => component.id),
    ["headline", "barcode", "scan_token", "footer"],
  );
  assert.equal(layout.components.find((component) => component.id === "barcode")?.content_source, "scan_token");
});

test("getDefaultBaleTemplateLayout keeps the 60x40 headline compact for warehouse scanning", () => {
  const layout = getDefaultBaleTemplateLayout(60, 40);
  const headline = layout.components.find((component) => component.id === "headline");
  const barcode = layout.components.find((component) => component.id === "barcode");

  assert.equal(headline.content_source, "supplier_package");
  assert.ok(headline.h_mm <= 7.0);
  assert.ok(headline.font_size <= 9);
  assert.ok(barcode.h_mm >= 14);
});

test("normalizeBaleTemplateLayout restores missing components and clamps oversize positions", () => {
  const layout = normalizeBaleTemplateLayout(
    {
      paper_preset: "custom",
      components: [
        {
          id: "headline",
          enabled: true,
          x_mm: 90,
          y_mm: 90,
          w_mm: 100,
          h_mm: 50,
          font_size: 30,
          content_source: "supplier_package",
        },
      ],
    },
    60,
    40,
  );

  assert.equal(layout.components.length, 4);
  const headline = layout.components.find((component) => component.id === "headline");
  assert.equal(headline.content_source, "supplier_package");
  assert.ok(headline.x_mm <= 60 - headline.w_mm);
  assert.ok(headline.y_mm <= 40 - headline.h_mm);
  assert.equal(headline.font_size, 20);
  assert.ok(layout.components.find((component) => component.id === "barcode"));
});

test("normalizeBaleTemplateLayout keeps barcode blocks above scan-safe minimum size", () => {
  const layout = normalizeBaleTemplateLayout(
    {
      components: [
        {
          id: "barcode",
          enabled: true,
          x_mm: 2,
          y_mm: 10,
          w_mm: 8,
          h_mm: 3,
        },
      ],
    },
    60,
    40,
  );
  const barcode = layout.components.find((component) => component.id === "barcode");
  const minimum = getComponentMinimumSize("barcode");

  assert.equal(barcode.w_mm, minimum.w_mm);
  assert.equal(barcode.h_mm, minimum.h_mm);
});

test("scaleBaleTemplateLayout keeps component ratios when paper size changes", () => {
  const source = getDefaultBaleTemplateLayout(60, 40);
  const scaled = scaleBaleTemplateLayout(source, 60, 40, 70, 50);
  const originalHeadline = source.components.find((component) => component.id === "headline");
  const scaledHeadline = scaled.components.find((component) => component.id === "headline");

  assert.equal(scaled.paper_preset, "70x50");
  assert.ok(scaledHeadline.x_mm > originalHeadline.x_mm);
  assert.ok(scaledHeadline.w_mm > originalHeadline.w_mm);
});

test("getEnabledTemplateFields follows the currently enabled component content sources", () => {
  const fields = getEnabledTemplateFields({
    components: [
      { id: "headline", enabled: true, content_source: "category_package" },
      { id: "barcode", enabled: true, content_source: "scan_token" },
      { id: "scan_token", enabled: true, content_source: "scan_token" },
      { id: "footer", enabled: true, content_source: "shipment_batch" },
    ],
  });

  assert.deepEqual(
    fields.sort(),
    ["barcode_value", "category_main", "category_sub", "package_position", "parcel_batch_no", "shipment_no"].sort(),
  );
});

test("listEditableTextComponents only returns bale text blocks for quick font controls", () => {
  const layout = getDefaultBaleTemplateLayout(60, 40);

  assert.deepEqual(
    listEditableTextComponents(layout).map((component) => component.id),
    ["headline", "scan_token", "footer"],
  );
});

test("getAutoFitFontSize shrinks long text when the block is too small for the preferred font", () => {
  const fitted = getAutoFitFontSize(
    {
      id: "headline",
      font_size: 9,
      font_weight: "700",
      w_mm: 18,
      h_mm: 4.6,
    },
    "Youxun Demo Dress Short Dress 1 / 5",
  );

  assert.ok(fitted < 9);
  assert.ok(fitted >= 5);
});

test("formatBaleTemplateOptionLabel keeps same-name templates distinguishable in live dropdowns", () => {
  const label = formatBaleTemplateOptionLabel({
    template_code: "bale_compact_50x30",
    name: "Bale Compact 50x30",
    width_mm: 50,
    height_mm: 30,
  });

  assert.equal(label, "Bale Compact 50x30 · bale_compact_50x30 · 50x30");
});

test("filterActiveLabelTemplates removes inactive templates from live selectors", () => {
  const rows = filterActiveLabelTemplates([
    { template_code: "bale_60x40", template_scope: "bale", is_active: true },
    { template_code: "bale_60x40模版", template_scope: "bale", is_active: false },
    { template_code: "bale_50x30", template_scope: "bale" },
  ]);

  assert.deepEqual(
    rows.map((row) => row.template_code),
    ["bale_60x40", "bale_50x30"],
  );
});

test("filterManagedLabelTemplates keeps only the formal printing-thread templates", () => {
  const rows = filterManagedLabelTemplates([
    { template_code: "clothes_retail", template_scope: "product", is_active: true },
    { template_code: "warehouse_in", template_scope: "bale", is_active: true },
    { template_code: "bale_60x40", template_scope: "bale", is_active: true },
    { template_code: "transtoshop", template_scope: "warehouseout_bale", is_active: true },
    { template_code: "warehouseout_bale__wo_receipt_qr", template_scope: "warehouseout_bale", is_active: true },
    { template_code: "wait_for_sale", template_scope: "warehouseout_bale", is_active: true },
    { template_code: "other_scope_demo", template_scope: "unknown_scope", is_active: true },
  ]);

  assert.deepEqual(
    rows.map((row) => row.template_code),
    ["clothes_retail", "warehouse_in", "transtoshop", "wait_for_sale"],
  );
});

test("groupManagedLabelTemplates keeps bale and warehouseout template families visible in formal order", () => {
  const groups = groupManagedLabelTemplates([
    { template_code: "apparel_60x40", template_scope: "product", is_active: true },
    { template_code: "clothes_retail", template_scope: "product", is_active: true },
    { template_code: "wait_for_sale", template_scope: "warehouseout_bale", is_active: true },
    { template_code: "store_loose_pick_60x40", template_scope: "warehouseout_bale", is_active: true },
    { template_code: "warehouse_in", template_scope: "bale", is_active: true },
    { template_code: "transtoshop", template_scope: "warehouseout_bale", is_active: true },
    { template_code: "wait_for_transtoshop", template_scope: "warehouseout_bale", is_active: true },
  ]);

  assert.deepEqual(
    groups.map((group) => group.key),
    ["product", "bale", "warehouseout_bale"],
  );
  assert.deepEqual(
    groups[0].rows.map((row) => row.template_code),
    ["clothes_retail", "apparel_60x40"],
  );
  assert.deepEqual(
    groups[1].rows.map((row) => row.template_code),
    ["warehouse_in"],
  );
  assert.deepEqual(
    groups[2].rows.map((row) => row.template_code),
    ["transtoshop", "wait_for_transtoshop", "wait_for_sale", "store_loose_pick_60x40"],
  );
});

test("pickPreferredTemplateCode uses explicit or persisted choice without falling back to the first option", () => {
  const templates = [
    { template_code: "bale_50x30", template_scope: "bale", is_active: true },
    { template_code: "bale_60x40", template_scope: "bale", is_active: true },
  ];

  assert.equal(
    pickPreferredTemplateCode(templates, { defaultCode: "bale_60x40" }),
    "bale_60x40",
  );
  assert.equal(
    pickPreferredTemplateCode(templates, { preferredValue: "bale_50x30", defaultCode: "bale_60x40" }),
    "bale_50x30",
  );
  assert.equal(
    pickPreferredTemplateCode(templates, { currentValue: "bale_50x30", defaultCode: "bale_60x40" }),
    "bale_50x30",
  );
});

test("pickPreferredTemplateCode defaults to warehouse_in when it is the only bale template", () => {
  const templates = [
    { template_code: "warehouse_in", template_scope: "bale", is_active: true },
  ];

  assert.equal(
    pickPreferredTemplateCode(templates, { defaultCode: "warehouse_in" }),
    "warehouse_in",
  );
});

test("buildLockedTemplateOptions shows formal templates but only enables warehouse_in for inbound bale printing", () => {
  const options = buildLockedTemplateOptions([
    { template_code: "clothes_retail", template_scope: "product", is_active: true },
    { template_code: "warehouse_in", template_scope: "bale", is_active: true },
    { template_code: "transtoshop", template_scope: "warehouseout_bale", is_active: true },
    { template_code: "candidate-demo", template_scope: "bale", is_active: true },
  ], {
    allowedCodes: ["warehouse_in"],
    selectedCode: "warehouse_in",
  });

  assert.deepEqual(
    options.map((row) => row.template_code),
    ["clothes_retail", "warehouse_in", "transtoshop"],
  );
  assert.deepEqual(
    options.map((row) => ({ code: row.template_code, disabled: row.disabled, selected: row.selected })),
    [
      { code: "clothes_retail", disabled: true, selected: false },
      { code: "warehouse_in", disabled: false, selected: true },
      { code: "transtoshop", disabled: true, selected: false },
    ],
  );
});

test("createTemplateDemoData returns warehouseout dispatch fields for transtoshop", () => {
  const demo = createTemplateDemoData(
    { template_code: "transtoshop", template_scope: "warehouseout_bale", width_mm: 60, height_mm: 40 },
    3,
  );

  assert.match(demo.store_name, /[A-Z]/);
  assert.match(demo.transfer_order_no, /^TRF-/);
  assert.match(demo.dispatch_bale_no, /^(SPB|2404|2504|2604)/);
  assert.ok(demo.packing_list.length > 0);
});

test("buildTemplateDemoBlocks maps enabled layout components to candidate-lab blocks", () => {
  const template = {
    template_code: "clothes_retail",
    template_scope: "product",
    width_mm: 60,
    height_mm: 40,
    layout: {
      components: [
        {
          id: "clothes_retail_price",
          type: "text",
          enabled: true,
          x_mm: 4,
          y_mm: 3,
          w_mm: 14,
          h_mm: 5,
          font_size: 10,
          font_weight: "700",
          align: "left",
          content_source: "price",
        },
        {
          id: "clothes_retail_divider",
          type: "line",
          enabled: true,
          x_mm: 4,
          y_mm: 11,
          w_mm: 52,
          h_mm: 0.6,
          content_source: "none",
        },
        {
          id: "clothes_retail_barcode",
          type: "barcode",
          enabled: true,
          x_mm: 4,
          y_mm: 18,
          w_mm: 52,
          h_mm: 11,
          align: "center",
          content_source: "barcode_value",
        },
      ],
    },
  };
  const demo = createTemplateDemoData(template, 2);
  const blocks = buildTemplateDemoBlocks(template, demo);

  assert.equal(blocks.length, 3);
  assert.equal(blocks.find((block) => block.type === "text")?.value, demo.price);
  assert.equal(blocks.find((block) => block.type === "barcode")?.value, demo.barcode_value);
  assert.equal(blocks.find((block) => block.type === "line")?.w_mm, 52);
});

test("hasSavedTemplateLayout distinguishes formal templates from no-layout placeholders", () => {
  assert.equal(
    hasSavedTemplateLayout({
      template_code: "warehouse_in",
      layout: { components: [{ id: "headline", type: "text", enabled: true }] },
    }),
    true,
  );
  assert.equal(
    hasSavedTemplateLayout({
      template_code: "apparel_60x40",
      layout: { components: [] },
    }),
    false,
  );
});

test("getFormalTemplatePreviewMode separates product, warehouse bale, and warehouseout thermal previews", () => {
  assert.equal(
    getFormalTemplatePreviewMode({
      template_code: "warehouse_in",
      template_scope: "bale",
      layout: { components: [{ id: "x", type: "text", enabled: true }] },
    }),
    "thermal-warehouse",
  );
  assert.equal(
    getFormalTemplatePreviewMode({
      template_code: "wait_for_sale",
      template_scope: "warehouseout_bale",
      layout: { components: [{ id: "x", type: "text", enabled: true }] },
    }),
    "thermal-warehouseout",
  );
  assert.equal(
    getFormalTemplatePreviewMode({
      template_code: "clothes_retail",
      template_scope: "product",
      layout: { components: [{ id: "x", type: "text", enabled: true }] },
    }),
    "thermal-product",
  );
  assert.equal(
    getFormalTemplatePreviewMode({
      template_code: "apparel_60x40",
      template_scope: "product",
      layout: { components: [] },
    }),
    "placeholder",
  );
});

test("getManagedTemplateCalibrationMeta marks department_retail as the current calibration baseline", () => {
  assert.deepEqual(
    getManagedTemplateCalibrationMeta({
      template_code: "department_retail",
      template_scope: "product",
    }),
    {
      label: "已校准基线",
      tone: "calibrated",
      note: "百货零售 40x30 模版已按真实打印校准，当前作为其它模板预览与试打的对照基线。",
    },
  );
  assert.equal(
    getManagedTemplateCalibrationMeta({
      template_code: "clothes_retail",
      template_scope: "product",
    }),
    null,
  );
});

test("buildTemplateDemoBlocks can stay on saved formal layout without falling back", () => {
  const blocks = buildTemplateDemoBlocks(
    { template_code: "apparel_60x40", template_scope: "product", width_mm: 60, height_mm: 40, layout: { components: [] } },
    createTemplateDemoData({ template_code: "apparel_60x40", template_scope: "product" }, 0),
    { allowFallback: false },
  );

  assert.deepEqual(blocks, []);
});

test("buildTemplateDemoPrintPayload falls back to demo blocks for templates without saved layout", () => {
  const payload = buildTemplateDemoPrintPayload(
    { template_code: "apparel_60x40", template_scope: "product", width_mm: 60, height_mm: 40 },
    { variant: 4 },
  );

  assert.equal(payload.printer_name, "Deli DL-720C");
  assert.equal(payload.width_mm, 60);
  assert.equal(payload.height_mm, 40);
  assert.ok(payload.candidate_id.startsWith("template_demo__apparel_60x40__"));
  assert.ok(payload.blocks.some((block) => block.type === "barcode"));
  assert.ok(payload.blocks.some((block) => block.type === "text"));
});

test("buildTemplateDemoPrintPayload preserves saved font sizes above 24 for formal test printing", () => {
  const payload = buildTemplateDemoPrintPayload(
    {
      template_code: "transtoshop",
      template_scope: "warehouseout_bale",
      width_mm: 60,
      height_mm: 40,
      layout: {
        components: [
          {
            id: "transtoshop_store_name",
            type: "text",
            enabled: true,
            x_mm: 35,
            y_mm: 2,
            w_mm: 22,
            h_mm: 9,
            font_size: 30,
            font_weight: "700",
            align: "left",
            content_source: "store_name",
          },
        ],
      },
    },
    {
      demoData: createTemplateDemoData({ template_code: "transtoshop", template_scope: "warehouseout_bale" }, 0),
      allowFallback: false,
    },
  );

  assert.equal(payload.blocks.length, 1);
  assert.equal(payload.blocks[0].font_size, 30);
});

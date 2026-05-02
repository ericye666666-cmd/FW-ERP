(function (root, factory) {
  const exports = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = exports;
  }
  root.LabelTemplateFlow = exports;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const BALE_PAPER_PRESETS = [
    { code: "60x40", label: "60 x 40 mm", width_mm: 60, height_mm: 40 },
    { code: "50x30", label: "50 x 30 mm", width_mm: 50, height_mm: 30 },
    { code: "70x50", label: "70 x 50 mm", width_mm: 70, height_mm: 50 },
    { code: "custom", label: "自定义尺寸", width_mm: 60, height_mm: 40 },
  ];

  const COMPONENT_LABELS = {
    headline: "顶部关键信息",
    barcode: "中间 Code128 条码",
    scan_token: "短码文本",
    footer: "底部辅助小字",
  };

  const COMPONENT_SOURCE_OPTIONS = {
    headline: [
      { value: "supplier_category_package", label: "供应商 + 品类 + 包序" },
      { value: "supplier_package", label: "供应商 + 包序" },
      { value: "category_package", label: "品类 + 包序" },
      { value: "supplier_category", label: "供应商 + 品类" },
      { value: "package_only", label: "只显示包序" },
    ],
    barcode: [
      { value: "scan_token", label: "仓库短码" },
    ],
    scan_token: [
      { value: "scan_token", label: "仓库短码" },
    ],
    footer: [
      { value: "none", label: "不显示" },
      { value: "shipment_no", label: "船单号" },
      { value: "parcel_batch_no", label: "批次号" },
      { value: "shipment_batch", label: "船单号 + 批次号" },
      { value: "bale_barcode", label: "内部长码" },
    ],
  };

  const TEXT_COMPONENT_IDS = new Set(["headline", "scan_token", "footer"]);
  const DEFAULT_ALIGN = {
    headline: "left",
    barcode: "center",
    scan_token: "center",
    footer: "left",
  };
  const COMPONENT_MINIMUM_SIZES = {
    headline: { w_mm: 12, h_mm: 5 },
    barcode: { w_mm: 24, h_mm: 10 },
    scan_token: { w_mm: 12, h_mm: 4 },
    footer: { w_mm: 12, h_mm: 4 },
  };
  const MANAGED_LABEL_TEMPLATE_GROUPS = [
    {
      key: "product",
      label: "商品标签",
      description: "门店服装 / 百货商品标签模板。",
      codes: ["clothes_retail", "department_retail", "apparel_60x40", "general_40x30"],
    },
    {
      key: "bale",
      label: "仓库 raw bale",
      description: "0.1 条码 / 打印确认 读取这组正式仓库 bale 模版。",
      codes: ["warehouse_in"],
    },
    {
      key: "warehouseout_bale",
      label: "送店 / 待送店 bale",
      description: "送店、待送店、待售卖 bale 标签读取这组正式模版。",
      codes: ["transtoshop", "wait_for_transtoshop", "wait_for_sale", "store_loose_pick_60x40"],
    },
  ];
  const MANAGED_TEMPLATE_CALIBRATION_META = {
    department_retail: {
      label: "已校准基线",
      tone: "calibrated",
      note: "百货零售 40x30 模版已按真实打印校准，当前作为其它模板预览与试打的对照基线。",
    },
  };
  const TEMPLATE_DEMO_FALLBACK_LAYOUTS = {
    apparel_60x40: [
      { type: "text", x_mm: 4, y_mm: 3, w_mm: 18, h_mm: 5, font_size: 10, font_weight: "700", align: "left", content_source: "price" },
      { type: "text", x_mm: 38, y_mm: 3, w_mm: 18, h_mm: 5, font_size: 8, font_weight: "700", align: "right", content_source: "short_suffix" },
      { type: "text", x_mm: 4, y_mm: 10, w_mm: 52, h_mm: 6, font_size: 7.4, font_weight: "700", align: "left", content_source: "product_name" },
      { type: "line", x_mm: 4, y_mm: 18, w_mm: 52, h_mm: 0.6 },
      { type: "barcode", x_mm: 4, y_mm: 20, w_mm: 52, h_mm: 11, align: "center", content_source: "barcode_value" },
      { type: "text", x_mm: 4, y_mm: 33, w_mm: 52, h_mm: 4.5, font_size: 7, font_weight: "700", align: "center", content_source: "barcode_value" },
    ],
    general_40x30: [
      { type: "text", x_mm: 3, y_mm: 2.5, w_mm: 13, h_mm: 4.8, font_size: 8.6, font_weight: "700", align: "left", content_source: "price" },
      { type: "text", x_mm: 24, y_mm: 2.5, w_mm: 13, h_mm: 4.8, font_size: 7, font_weight: "700", align: "right", content_source: "short_suffix" },
      { type: "text", x_mm: 3, y_mm: 8.5, w_mm: 34, h_mm: 4.8, font_size: 5.8, font_weight: "700", align: "left", content_source: "product_name" },
      { type: "line", x_mm: 3, y_mm: 14, w_mm: 34, h_mm: 0.6 },
      { type: "barcode", x_mm: 3, y_mm: 15.5, w_mm: 34, h_mm: 8.5, align: "center", content_source: "barcode_value" },
      { type: "text", x_mm: 3, y_mm: 25.2, w_mm: 34, h_mm: 3.4, font_size: 5.4, font_weight: "700", align: "center", content_source: "barcode_value" },
    ],
  };

  const PRODUCT_DEMO_CATALOG = [
    { product_name: "Denim Skirt", short_suffix: "A18", price: "KES 650", barcode_value: "690120260001" },
    { product_name: "Summer Tee", short_suffix: "B07", price: "KES 480", barcode_value: "690120260002" },
    { product_name: "Kids Hoodie", short_suffix: "K12", price: "KES 720", barcode_value: "690120260003" },
    { product_name: "Kitchen Bowl", short_suffix: "D11", price: "KES 390", barcode_value: "690120260004" },
    { product_name: "Travel Mug", short_suffix: "G09", price: "KES 560", barcode_value: "690120260005" },
  ];

  const BALE_DEMO_CATALOG = [
    {
      top_supplier: "Youxun",
      top_major: "DRESS",
      top_minor: "short dress",
      piece_current: "1 /",
      piece_total: "/ 5",
      scan_token: "RB042520000001",
      trace_code: "RB042520000001",
      trace_batch: "BL-20260425-018",
      trace_shipment: "1-04252026",
      trace_inbound: "04-25 09:40",
    },
    {
      top_supplier: "Utamala",
      top_major: "COATS",
      top_minor: "long coat",
      piece_current: "2 /",
      piece_total: "/ 4",
      scan_token: "RB042520000002",
      trace_code: "RB042520000002",
      trace_batch: "BL-20260425-021",
      trace_shipment: "1-04252026",
      trace_inbound: "04-25 11:10",
    },
    {
      top_supplier: "Mikono",
      top_major: "TOPS",
      top_minor: "mix basic",
      piece_current: "3 /",
      piece_total: "/ 6",
      scan_token: "RB042520000003",
      trace_code: "RB042520000003",
      trace_batch: "BL-20260425-032",
      trace_shipment: "1-04252026",
      trace_inbound: "04-25 14:20",
    },
  ];

  const WAREHOUSEOUT_DEMO_CATALOG = [
    {
      store_name: "UTAWALA",
      transfer_order_no: "TRF-260425-018",
      bale_piece_summary: "Bale 2 / 5",
      outbound_time: "2026-04-25 10:30",
      total_quantity: "24 pcs",
      packing_list: "COATS x2 / TOPS x3 / DRESS x1",
      dispatch_bale_no: "SDB20260425031",
      cat: "COATS",
      sub: "short x3",
      grade: "A grade",
      qty: "24 pcs",
      weight: "38 KG",
      code: "WB2604250018",
    },
    {
      store_name: "KAYOLE",
      transfer_order_no: "TRF-260425-021",
      bale_piece_summary: "Bale 1 / 3",
      outbound_time: "2026-04-25 14:10",
      total_quantity: "18 pcs",
      packing_list: "TOPS x4 / JEANS x2 / SKIRT x1",
      dispatch_bale_no: "SDB20260425032",
      cat: "TOPS",
      sub: "mix basic",
      grade: "B grade",
      qty: "18 pcs",
      weight: "29 KG",
      code: "WB2604250021",
    },
    {
      store_name: "RONGAI",
      transfer_order_no: "TRF-260425-029",
      bale_piece_summary: "Bale 4 / 6",
      outbound_time: "2026-04-25 16:25",
      total_quantity: "31 pcs",
      packing_list: "DRESS x3 / COATS x1 / TOPS x5",
      dispatch_bale_no: "SDB20260425033",
      cat: "DRESS",
      sub: "floral x2",
      grade: "A/B mix",
      qty: "31 pcs",
      weight: "42 KG",
      code: "WB2604250029",
    },
  ];

  function normalizeText(value) {
    return String(value || "").trim();
  }

  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return fallback;
    }
    return Math.min(Math.max(number, min), max);
  }

  function roundToTenth(value) {
    return Math.round(Number(value || 0) * 10) / 10;
  }

  function mmToDots(valueMm, dpi = 203) {
    return Math.max(Math.round((Number(valueMm || 0) / 25.4) * dpi), 1);
  }

  function dotsToMm(valueDots, dpi = 203) {
    return (Number(valueDots || 0) / dpi) * 25.4;
  }

  function getPaperPresetByCode(code) {
    const normalized = normalizeText(code).toLowerCase();
    return BALE_PAPER_PRESETS.find((row) => row.code === normalized) || null;
  }

  function guessPaperPreset(widthMm, heightMm) {
    const normalizedWidth = Math.round(Number(widthMm || 0));
    const normalizedHeight = Math.round(Number(heightMm || 0));
    const matched = BALE_PAPER_PRESETS.find((row) => (
      row.code !== "custom"
      && row.width_mm === normalizedWidth
      && row.height_mm === normalizedHeight
    ));
    return matched ? matched.code : "custom";
  }

  function getComponentMinimumSize(componentOrId) {
    const componentId = typeof componentOrId === "string"
      ? normalizeText(componentOrId)
      : normalizeText(componentOrId && componentOrId.id);
    const fallback = componentId === "barcode" ? { w_mm: 24, h_mm: 10 } : { w_mm: 8, h_mm: 3 };
    const preset = COMPONENT_MINIMUM_SIZES[componentId] || fallback;
    return { ...preset };
  }

  function getDefaultBaleTemplateLayout(widthMm = 60, heightMm = 40) {
    const width = clampNumber(widthMm, 20, 120, 60);
    const height = clampNumber(heightMm, 20, 120, 40);
    const isCompact60x40 = width === 60 && height === 40;
    const marginX = isCompact60x40 ? 3.6 : Math.max(3.5, roundToTenth(width * 0.07));
    const headlineHeight = isCompact60x40 ? 6.8 : Math.max(7, roundToTenth(height * 0.2));
    const barcodeHeight = isCompact60x40 ? 15.0 : Math.max(11, roundToTenth(height * 0.34));
    const scanTokenHeight = isCompact60x40 ? 4.8 : 5.2;
    const gutter = isCompact60x40 ? 1.6 : 2.2;
    const headlineY = isCompact60x40 ? 2.4 : 3.5;
    const barcodeY = roundToTenth(headlineY + headlineHeight + gutter);
    const scanTokenY = roundToTenth(barcodeY + barcodeHeight + gutter);
    const footerY = roundToTenth(scanTokenY + scanTokenHeight + gutter);
    const contentWidth = roundToTenth(width - marginX * 2);
    const footerHeight = Math.max(4, roundToTenth(height - footerY - 2.5));

    return {
      paper_preset: guessPaperPreset(width, height),
      components: [
        {
          id: "headline",
          label: COMPONENT_LABELS.headline,
          type: "text",
          enabled: true,
          x_mm: marginX,
          y_mm: headlineY,
          w_mm: contentWidth,
          h_mm: headlineHeight,
          font_size: isCompact60x40 ? 8.8 : (width >= 60 ? 9 : 8),
          font_weight: "700",
          align: "left",
          content_source: isCompact60x40 ? "supplier_package" : "supplier_category_package",
        },
        {
          id: "barcode",
          label: COMPONENT_LABELS.barcode,
          type: "barcode",
          enabled: true,
          x_mm: marginX,
          y_mm: barcodeY,
          w_mm: contentWidth,
          h_mm: barcodeHeight,
          align: "center",
          content_source: "scan_token",
        },
        {
          id: "scan_token",
          label: COMPONENT_LABELS.scan_token,
          type: "text",
          enabled: true,
          x_mm: marginX,
          y_mm: scanTokenY,
          w_mm: contentWidth,
          h_mm: scanTokenHeight,
          font_size: isCompact60x40 ? 6.8 : (width >= 60 ? 7.4 : 6.8),
          font_weight: "700",
          align: "center",
          content_source: "scan_token",
        },
        {
          id: "footer",
          label: COMPONENT_LABELS.footer,
          type: "text",
          enabled: false,
          x_mm: marginX,
          y_mm: footerY,
          w_mm: contentWidth,
          h_mm: footerHeight,
          font_size: width >= 60 ? 5.6 : 5.2,
          font_weight: "400",
          align: "left",
          content_source: "shipment_batch",
        },
      ],
    };
  }

  function scaleBaleTemplateLayout(layout, previousWidthMm, previousHeightMm, nextWidthMm, nextHeightMm) {
    const widthScale = clampNumber(nextWidthMm, 20, 120, 60) / clampNumber(previousWidthMm, 20, 120, 60);
    const heightScale = clampNumber(nextHeightMm, 20, 120, 40) / clampNumber(previousHeightMm, 20, 120, 40);
    const components = Array.isArray(layout && layout.components) ? layout.components : [];
    return {
      ...layout,
      paper_preset: guessPaperPreset(nextWidthMm, nextHeightMm),
      components: components.map((component) => ({
        ...component,
        x_mm: roundToTenth(Number(component.x_mm || 0) * widthScale),
        y_mm: roundToTenth(Number(component.y_mm || 0) * heightScale),
        w_mm: roundToTenth(Number(component.w_mm || 0) * widthScale),
        h_mm: roundToTenth(Number(component.h_mm || 0) * heightScale),
      })),
    };
  }

  function normalizeBaleComponent(component, fallback, widthMm, heightMm) {
    const id = normalizeText(component && component.id) || fallback.id;
    const type = id === "barcode" ? "barcode" : "text";
    const allowedSources = COMPONENT_SOURCE_OPTIONS[id] || [];
    const source = normalizeText(component && component.content_source);
    const normalizedSource = allowedSources.some((item) => item.value === source) ? source : fallback.content_source;
    const minimumSize = getComponentMinimumSize(id);
    const x = clampNumber(component && component.x_mm, 0, Math.max(widthMm - 2, 0), fallback.x_mm);
    const y = clampNumber(component && component.y_mm, 0, Math.max(heightMm - 2, 0), fallback.y_mm);
    const w = clampNumber(component && component.w_mm, minimumSize.w_mm, widthMm, fallback.w_mm);
    const h = clampNumber(component && component.h_mm, minimumSize.h_mm, heightMm, fallback.h_mm);
    return {
      id,
      label: COMPONENT_LABELS[id] || fallback.label,
      type,
      enabled: component && component.enabled !== undefined ? Boolean(component.enabled) : Boolean(fallback.enabled),
      x_mm: roundToTenth(Math.min(x, Math.max(widthMm - w, 0))),
      y_mm: roundToTenth(Math.min(y, Math.max(heightMm - h, 0))),
      w_mm: roundToTenth(Math.min(w, widthMm)),
      h_mm: roundToTenth(Math.min(h, heightMm)),
      font_size: type === "text" ? clampNumber(component && component.font_size, 5, 20, fallback.font_size) : 0,
      font_weight: normalizeText(component && component.font_weight) === "700" ? "700" : (fallback.font_weight || "400"),
      align: ["left", "center", "right"].includes(normalizeText(component && component.align))
        ? normalizeText(component && component.align)
        : DEFAULT_ALIGN[id],
      content_source: normalizedSource,
    };
  }

  function estimateWrappedLineCount(text, charsPerLine) {
    const normalizedChars = Math.max(Number(charsPerLine || 1), 1);
    const rawLines = String(text || "").split(/\r?\n/);
    let lineCount = 0;
    rawLines.forEach((rawLine) => {
      const trimmed = String(rawLine || "").trim();
      if (!trimmed) {
        return;
      }
      lineCount += Math.max(Math.ceil(trimmed.length / normalizedChars), 1);
    });
    return lineCount || 1;
  }

  function estimateLineHeightDots(fontSize) {
    const normalized = maxTextFontSize(fontSize);
    if (normalized >= 14) {
      return 28;
    }
    if (normalized >= 10) {
      return 22;
    }
    if (normalized >= 7) {
      return 18;
    }
    return 16;
  }

  function maxTextFontSize(fontSize) {
    return Math.max(Number(fontSize || 6), 5);
  }

  function estimateCharsPerLine(widthMm, fontSize, fontWeight) {
    const widthDots = mmToDots(widthMm);
    const perCharDots = Math.max(
      Math.round(maxTextFontSize(fontSize) * (String(fontWeight || "400") === "700" ? 2.3 : 2.0)),
      10,
    );
    return Math.max(Math.floor(widthDots / Math.max(perCharDots, 1)), 1);
  }

  function getAutoFitFontSize(component, contentValue) {
    if (!isTextComponent(component)) {
      return 0;
    }
    const text = normalizeText(contentValue);
    if (!text) {
      return maxTextFontSize(component && component.font_size);
    }
    const preferredSize = maxTextFontSize(component && component.font_size);
    const minimumSize = 5;
    const widthMm = Number(component && component.w_mm) || 10;
    const heightMm = Number(component && component.h_mm) || 4;
    const fontWeight = String(component && component.font_weight || "400").trim();
    for (let currentSize = preferredSize; currentSize >= minimumSize; currentSize -= 0.5) {
      const charsPerLine = estimateCharsPerLine(widthMm, currentSize, fontWeight);
      const wrappedLineCount = estimateWrappedLineCount(text, charsPerLine);
      const totalHeightMm = dotsToMm(estimateLineHeightDots(currentSize) * wrappedLineCount);
      if (totalHeightMm <= heightMm + 0.35) {
        return roundToTenth(currentSize);
      }
    }
    return minimumSize;
  }

  function normalizeBaleTemplateLayout(layout, widthMm = 60, heightMm = 40) {
    const width = clampNumber(widthMm, 20, 120, 60);
    const height = clampNumber(heightMm, 20, 120, 40);
    const fallback = getDefaultBaleTemplateLayout(width, height);
    const components = Array.isArray(layout && layout.components) ? layout.components : [];
    return {
      paper_preset: normalizeText(layout && layout.paper_preset).toLowerCase() || guessPaperPreset(width, height),
      components: fallback.components.map((component) => {
        const current = components.find((item) => normalizeText(item && item.id) === component.id) || component;
        return normalizeBaleComponent(current, component, width, height);
      }),
    };
  }

  function getComponentSourceOptions(componentId) {
    return (COMPONENT_SOURCE_OPTIONS[normalizeText(componentId)] || []).map((item) => ({ ...item }));
  }

  function updateBaleTemplateComponent(layout, componentId, patch) {
    const normalizedId = normalizeText(componentId);
    const baseLayout = normalizeBaleTemplateLayout(layout, layout && layout.width_mm, layout && layout.height_mm);
    return {
      ...baseLayout,
      components: baseLayout.components.map((component) => (
        component.id === normalizedId ? { ...component, ...patch } : component
      )),
    };
  }

  function getEnabledTemplateFields(layout) {
    const fields = new Set();
    const components = Array.isArray(layout && layout.components) ? layout.components : [];
    components.forEach((component) => {
      if (!component || !component.enabled) {
        return;
      }
      const source = normalizeText(component.content_source);
      if (component.id === "barcode" || component.id === "scan_token") {
        fields.add("barcode_value");
        return;
      }
      if (source === "supplier_category_package") {
        fields.add("supplier_name");
        fields.add("category_main");
        fields.add("category_sub");
        fields.add("package_position");
      } else if (source === "supplier_package") {
        fields.add("supplier_name");
        fields.add("package_position");
      } else if (source === "category_package") {
        fields.add("category_main");
        fields.add("category_sub");
        fields.add("package_position");
      } else if (source === "supplier_category") {
        fields.add("supplier_name");
        fields.add("category_main");
        fields.add("category_sub");
      } else if (source === "package_only") {
        fields.add("package_position");
      } else if (source === "shipment_no") {
        fields.add("shipment_no");
      } else if (source === "parcel_batch_no") {
        fields.add("parcel_batch_no");
      } else if (source === "shipment_batch") {
        fields.add("shipment_no");
        fields.add("parcel_batch_no");
      } else if (source === "bale_barcode") {
        fields.add("bale_barcode");
      }
    });
    return [...fields];
  }

  function getComponentPreviewLabel(component) {
    const id = normalizeText(component && component.id);
    return COMPONENT_LABELS[id] || normalizeText(component && component.label) || id;
  }

  function isTextComponent(component) {
    return TEXT_COMPONENT_IDS.has(normalizeText(component && component.id));
  }

  function listEditableTextComponents(layout) {
    const components = Array.isArray(layout && layout.components) ? layout.components : [];
    return components
      .filter((component) => isTextComponent(component))
      .map((component) => ({
        ...component,
        label: getComponentPreviewLabel(component),
      }));
  }

  function formatBaleTemplateOptionLabel(template) {
    const name = normalizeText(template && template.name) || "Bale Label";
    const code = normalizeText(template && template.template_code).toLowerCase();
    const width = Math.round(Number(template && template.width_mm) || 60);
    const height = Math.round(Number(template && template.height_mm) || 40);
    const size = `${width}x${height}`;
    return code ? `${name} · ${code} · ${size}` : `${name} · ${size}`;
  }

  function filterActiveLabelTemplates(templates) {
    const rows = Array.isArray(templates) ? templates : [];
    return rows.filter((row) => row && row.is_active !== false);
  }

  function filterManagedLabelTemplates(templates, { includeInactive = true } = {}) {
    const rows = Array.isArray(templates) ? templates : [];
    const allowedCodes = new Set(
      MANAGED_LABEL_TEMPLATE_GROUPS.flatMap((group) => group.codes.map((code) => normalizeText(code).toLowerCase())),
    );
    return rows.filter((row) => {
      const code = normalizeText(row && row.template_code).toLowerCase();
      if (!code || !allowedCodes.has(code)) {
        return false;
      }
      return includeInactive ? true : row && row.is_active !== false;
    });
  }

  function groupManagedLabelTemplates(templates, { includeInactive = true } = {}) {
    const rows = filterManagedLabelTemplates(templates, { includeInactive });
    const codeMap = new Map(
      rows.map((row) => [normalizeText(row && row.template_code).toLowerCase(), row]),
    );
    return MANAGED_LABEL_TEMPLATE_GROUPS.map((group) => ({
      ...group,
      rows: group.codes
        .map((code) => codeMap.get(normalizeText(code).toLowerCase()))
        .filter(Boolean),
    })).filter((group) => group.rows.length);
  }

  function getManagedTemplateCalibrationMeta(template = {}) {
    const code = normalizeText(template && template.template_code).toLowerCase();
    const meta = MANAGED_TEMPLATE_CALIBRATION_META[code];
    return meta ? { ...meta } : null;
  }

  function pickPreferredTemplateCode(templates, {
    preferredValue = "",
    currentValue = "",
    defaultCode = "",
  } = {}) {
    const rows = filterActiveLabelTemplates(templates);
    const normalizedPreferred = normalizeText(preferredValue).toLowerCase();
    const normalizedCurrent = normalizeText(currentValue).toLowerCase();
    const normalizedDefault = normalizeText(defaultCode).toLowerCase();
    if (normalizedPreferred && rows.some((row) => normalizeText(row && row.template_code).toLowerCase() === normalizedPreferred)) {
      return normalizedPreferred;
    }
    if (normalizedCurrent && rows.some((row) => normalizeText(row && row.template_code).toLowerCase() === normalizedCurrent)) {
      return normalizedCurrent;
    }
    if (normalizedDefault && rows.some((row) => normalizeText(row && row.template_code).toLowerCase() === normalizedDefault)) {
      return normalizedDefault;
    }
    return normalizeText(rows[0] && rows[0].template_code).toLowerCase();
  }

  function buildLockedTemplateOptions(templates, {
    allowedCodes = [],
    selectedCode = "",
    includeInactive = false,
  } = {}) {
    const allowedSet = new Set((Array.isArray(allowedCodes) ? allowedCodes : [])
      .map((code) => normalizeText(code).toLowerCase())
      .filter(Boolean));
    const normalizedSelected = normalizeText(selectedCode).toLowerCase();
    return filterManagedLabelTemplates(templates, { includeInactive })
      .filter((row) => includeInactive || row && row.is_active !== false)
      .map((row) => {
        const templateCode = normalizeText(row && row.template_code).toLowerCase();
        const enabled = allowedSet.size ? allowedSet.has(templateCode) : true;
        return {
          ...row,
          disabled: !enabled,
          selected: templateCode === normalizedSelected,
        };
      });
  }

  function pickTemplateDemoSeed(template, variant = 0) {
    const code = normalizeText(template && template.template_code).toLowerCase();
    const scope = normalizeText(template && template.template_scope).toLowerCase();
    const rows = scope === "bale"
      ? BALE_DEMO_CATALOG
      : scope === "warehouseout_bale"
        ? WAREHOUSEOUT_DEMO_CATALOG
        : PRODUCT_DEMO_CATALOG;
    const fallback = rows[0] || {};
    if (!rows.length) {
      return { ...fallback };
    }
    const normalizedVariant = Math.abs(Number(variant) || 0);
    const selected = rows[normalizedVariant % rows.length] || fallback;
    if (code === "wait_for_sale") {
      return { ...selected, status: "WAIT FOR SALE" };
    }
    if (code === "wait_for_transtoshop") {
      return { ...selected, status: "WAIT TO SHOP" };
    }
    if (code === "store_loose_pick_60x40") {
      return { ...selected, status: "STORE DISPATCH" };
    }
    if (scope === "warehouseout_bale") {
      return { ...selected, status: "STORE DISPATCH" };
    }
    return { ...selected };
  }

  function createTemplateDemoData(template, variant = 0) {
    const row = pickTemplateDemoSeed(template, variant);
    const scope = normalizeText(template && template.template_scope).toLowerCase();
    if (scope === "bale") {
      return {
        ...row,
        barcode_value: row.scan_token || row.trace_code || "",
      };
    }
    if (scope === "warehouseout_bale") {
      return {
        ...row,
        barcode_value: row.dispatch_bale_no || "",
      };
    }
    return {
      ...row,
      barcode_value: row.barcode_value || "",
    };
  }

  function hasSavedTemplateLayout(template = {}) {
    const components = Array.isArray(template.layout && template.layout.components) ? template.layout.components : [];
    return components.length > 0;
  }

  function getFormalTemplatePreviewMode(template = {}) {
    if (!hasSavedTemplateLayout(template)) {
      return "placeholder";
    }
    const scope = normalizeText(template.template_scope).toLowerCase();
    if (scope === "warehouseout_bale") {
      return "thermal-warehouseout";
    }
    if (scope === "bale") {
      return "thermal-warehouse";
    }
    return "thermal-product";
  }

  function resolveTemplateDemoValue(source = "", template = {}, demoData = {}) {
    const normalizedSource = normalizeText(source).toLowerCase();
    if (!normalizedSource || normalizedSource === "none") {
      return "";
    }
    if (Object.prototype.hasOwnProperty.call(demoData, normalizedSource)) {
      return normalizeText(demoData[normalizedSource]);
    }
    const fallbackMap = {
      scan_token: normalizeText(demoData.scan_token || demoData.trace_code || demoData.barcode_value),
      dispatch_bale_no: normalizeText(demoData.dispatch_bale_no || demoData.barcode_value),
      barcode_value: normalizeText(demoData.barcode_value || demoData.scan_token || demoData.dispatch_bale_no),
    };
    return fallbackMap[normalizedSource] || "";
  }

  function getTemplateDemoComponents(template = {}, { allowFallback = true } = {}) {
    const saved = Array.isArray(template.layout && template.layout.components)
      ? template.layout.components.filter((component) => component && component.enabled !== false)
      : [];
    if (saved.length) {
      return saved.map((component) => ({ ...component }));
    }
    if (!allowFallback) {
      return [];
    }
    const code = normalizeText(template.template_code).toLowerCase();
    const fallback = TEMPLATE_DEMO_FALLBACK_LAYOUTS[code] || TEMPLATE_DEMO_FALLBACK_LAYOUTS.apparel_60x40;
    return fallback.map((component, index) => ({
      id: `${code || "template"}_${index + 1}`,
      enabled: true,
      ...component,
    }));
  }

  function buildTemplateDemoBlocks(template = {}, demoData = {}, { allowFallback = true } = {}) {
    return getTemplateDemoComponents(template, { allowFallback })
      .map((component) => {
        const type = normalizeText(component.type).toLowerCase() || "text";
        const block = {
          type,
          x_mm: roundToTenth(component.x_mm || 0),
          y_mm: roundToTenth(component.y_mm || 0),
          w_mm: roundToTenth(component.w_mm || 1),
          h_mm: roundToTenth(component.h_mm || 1),
        };
        if (type === "line") {
          return block;
        }
        if (type === "barcode") {
          return {
            ...block,
            align: normalizeText(component.align) || "center",
            value: resolveTemplateDemoValue(component.content_source || "barcode_value", template, demoData),
          };
        }
        return {
          ...block,
          align: normalizeText(component.align) || "left",
          font_size: Number(component.font_size || 8),
          font_weight: normalizeText(component.font_weight) === "700" ? "700" : "400",
          value: resolveTemplateDemoValue(component.content_source || "", template, demoData),
        };
      })
      .filter((block) => {
        if (block.type === "line") {
          return true;
        }
        return normalizeText(block.value).length > 0;
      });
  }

  function buildTemplateDemoPrintPayload(template = {}, { printerName = "Deli DL-720C", variant = 0, demoData = null, allowFallback = true } = {}) {
    const payloadDemo = demoData && typeof demoData === "object" ? { ...demoData } : createTemplateDemoData(template, variant);
    const width = Math.max(Number(template.width_mm || 60), 20);
    const height = Math.max(Number(template.height_mm || 40), 20);
    return {
      candidate_id: `template_demo__${normalizeText(template.template_code).toLowerCase() || "unknown"}__${Math.abs(Number(variant) || 0)}`,
      printer_name: printerName,
      width_mm: width,
      height_mm: height,
      label_size: `${Math.round(width)}x${Math.round(height)}`,
      blocks: buildTemplateDemoBlocks(template, payloadDemo, { allowFallback }),
    };
  }

  return {
    BALE_PAPER_PRESETS,
    COMPONENT_LABELS,
    getPaperPresetByCode,
    guessPaperPreset,
    getComponentMinimumSize,
    getDefaultBaleTemplateLayout,
    scaleBaleTemplateLayout,
    normalizeBaleTemplateLayout,
    getComponentSourceOptions,
    updateBaleTemplateComponent,
    getEnabledTemplateFields,
    getComponentPreviewLabel,
    isTextComponent,
    listEditableTextComponents,
    getAutoFitFontSize,
    formatBaleTemplateOptionLabel,
    filterActiveLabelTemplates,
    filterManagedLabelTemplates,
    groupManagedLabelTemplates,
    getManagedTemplateCalibrationMeta,
    pickPreferredTemplateCode,
    buildLockedTemplateOptions,
    createTemplateDemoData,
    hasSavedTemplateLayout,
    getFormalTemplatePreviewMode,
    resolveTemplateDemoValue,
    buildTemplateDemoBlocks,
    buildTemplateDemoPrintPayload,
  };
});

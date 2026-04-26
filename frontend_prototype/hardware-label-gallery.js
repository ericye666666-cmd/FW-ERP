(function (root, factory) {
  const exports = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = exports;
  }
  root.HardwareLabelGallery = exports;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const LABEL_WIDTH_MM = 60;
  const LABEL_HEIGHT_MM = 40;
  const DEPARTMENT_LABEL_WIDTH_MM = 40;
  const DEPARTMENT_LABEL_HEIGHT_MM = 30;
  const DEFAULT_PRINTER_NAME = "Deli DL-720C";
  const ACCESS_TOKEN_STORAGE_KEY = "retail_ops_access_token";
  const CURRENT_USER_STORAGE_KEY = "retail_ops_current_user";
  const VISIBLE_GROUP_KEYS = ["wait_for_transtoshop"];

  const SAMPLE_DATA = {
    warehouseout: {
      store_name: "UTAWALA",
      transfer_order_no: "TRF-240423-018",
      bale_piece_summary: "Bale 2 / 5",
      total_quantity: "24 pcs",
      packing_list: "COATS / long x2\nCOATS / short x3\nTOPS / knit x2\nTOPS / warm x3\nDRESS / short x2\nDRESS / midi x2\nJEANS / blue x3\nSKIRT / dark x2\nHOOD / mixed x3\nKIDS / top x2\nCOATS / light x1\nTOPS / basic x2\nDRESS / floral x1\nDRESS / black x1\nJEANS / grey x2\nSKIRT / print x1\nHOOD / zip x1\nKIDS / dress x1\nSHIRT / white x2\nPANTS / slim x2",
      outbound_time: "2026-04-23 10:30",
      dispatch_bale_no: "240423000018",
      machine_code: "MCH-07",
      transfer_order_no: "TRF-240423-018",
    },
    storeItem: {
      price: "KES 890",
      product_name: "short dress",
      barcode_value: "420200000001",
      short_suffix: "A12",
      unit_cost: "KES 320",
      supplier_name: "YCUXUR",
      store_name: "UTAWALA",
    },
    departmentItem: {
      price: "KES 590",
      product_name: "wire basket",
      barcode_value: "420300000018",
      short_suffix: "B12",
    },
    waitForTransToShop: {
      cat: "pants",
      sub: "jeans pant",
      grade: "P",
      qty: "50",
      status: "wait for transtoshop",
      code: "240423000018",
    },
    waitForSale: {
      cat: "pants",
      sub: "jeans pant",
      grade: "A/B",
      qty: "50",
      weight: "18.6 KG",
      status: "wait for sale",
      code: "240423100018",
    },
  };

  const GROUPS = [
    {
      key: "warehouseout_bale",
      title: "A. warehouseout bale barcode",
      short_title: "warehouseout bale",
      purpose: "仓库出库、调货单对应、配送门店、门店签收",
      design_rule: "改成 Code128 一维短码主扫，短码人眼识别保留，签收和仓库复核优先，不沿用 warehousein 结构。",
      recommended_candidate_id: "warehouseout_bale__wo_receipt_qr",
      recommended_title: "WO-A 签收主版",
      recommended_reason: "左上先给门店、调货单号、件位和出库时间，右上置顶总数，右侧主体继续给箱单复核，左下直接复用 warehousein 已实扫通过的一维码几何，优先保证仓库出库和门店签收可扫。",
      required_fields: ["配送门店", "调货单号", "第几件/共几件", "总数量", "箱单", "dispatch_bale_no", "出库时间"],
      system_only_fields: ["machine_code", "transfer_order_no", "dispatch_row_id", "store_long_code", "signer_user_id", "route_status", "printer_queue", "internal_audit_id"],
      candidates: buildWarehouseoutCandidates(),
    },
    {
      key: "store_item",
      title: "B. 门店商品 barcode",
      short_title: "store item",
      purpose: "店员最终贴标，后续收银、改价、退仓围绕这个码",
      design_rule: "价格最大，商品名次突出，Code128 可扫优先，不上纸管理字段。",
      recommended_candidate_id: "store_item__si_price_stack",
      recommended_title: "SI-A 价格主版",
      recommended_reason: "先让价格成为第一视觉，再让商品小类做第二层识别，最后把 Code128 放到底部完整展开，最符合门店贴标、扫价和收银的自然顺序。",
      required_fields: ["大价格区", "商品名", "Code128 一维短码", "可选短身份码后缀"],
      system_only_fields: ["unit_cost", "supplier_name", "store_name", "rack_location", "operator_name", "internal_identity_no", "pricing_rule_id"],
      candidates: buildStoreItemCandidates(),
    },
    {
      key: "department_item_40x30",
      title: "C. 百货 40x30 barcode",
      short_title: "department 40x30",
      purpose: "百货商品小尺寸标签预览，先在测试页看版式，不进正式模板库。",
      design_rule: "先做 40x30 预览，对比价格区、商品名和 Code128 的层级，再决定是否进入正式模板池。",
      recommended_candidate_id: "department_item_40x30__di_price_clean",
      recommended_title: "DI-A 百货清晰版",
      recommended_reason: "左上大价格、右上短后缀、中部商品名、底部完整一维码，最接近百货 40x30 的可读与可扫平衡。",
      required_fields: ["大价格区", "商品名", "Code128 一维短码", "短后缀"],
      system_only_fields: ["unit_cost", "supplier_name", "store_name", "rack_location", "operator_name", "internal_identity_no", "pricing_rule_id"],
      candidates: buildDepartmentItemCandidates(),
    },
    {
      key: "wait_for_transtoshop",
      title: "D. wait labels 60x40",
      short_title: "wait labels",
      purpose: "wait for transtoshop / wait for sale 两种 60x40 商品包标签预览，先看字段层级和条码比例。",
      design_rule: "只用 CAT / SUB / GRADE / QTY / STATUS / CODE + 1D barcode；wait for sale 额外带 WEIGHT，不额外加业务字段。",
      recommended_candidate_id: "wait_for_transtoshop__wf_main",
      recommended_title: "WF-A wait for transtoshop",
      recommended_reason: "上半区先给英文状态和分类，底部完整给 CODE 和 Code128；第二版再额外测试 wait for sale 的 GRADE A/B 和 WEIGHT。",
      required_fields: ["CAT", "SUB", "GRADE", "QTY", "STATUS", "CODE", "Code128", "WEIGHT(optional)"],
      system_only_fields: ["supplier_name", "store_name", "transfer_order_no", "operator_name", "internal_identity_no"],
      candidates: buildWaitForTransToShopCandidates(),
    },
  ];

  function normalizeText(value) {
    return String(value || "").trim();
  }

  function textBlock(fieldKey, value, x, y, w, h, options = {}) {
    return {
      type: "text",
      field_key: fieldKey,
      value,
      x_mm: x,
      y_mm: y,
      w_mm: w,
      h_mm: h,
      font_px: options.fontPx || 14,
      font_weight: options.fontWeight || 700,
      align: options.align || "left",
      color: options.color || "#12252f",
      background: options.background || "",
      border_radius_mm: options.radius || 0,
      padding_mm: options.padding || 0,
      letter_spacing: options.letterSpacing || 0,
      font_family: options.fontFamily || "Inter, SF Pro Display, Helvetica Neue, sans-serif",
      uppercase: Boolean(options.uppercase),
      tone: options.tone || "default",
      symbology: "",
    };
  }

  function qrBlock(fieldKey, value, x, y, w, h, options = {}) {
    return {
      type: "qr",
      field_key: fieldKey,
      value,
      x_mm: x,
      y_mm: y,
      w_mm: w,
      h_mm: h,
      label: options.label || "QR",
      symbology: "QR",
      quiet_zone_mm: options.quietZone || 1.2,
    };
  }

  function barcodeBlock(fieldKey, value, x, y, w, h, options = {}) {
    return {
      type: "barcode",
      field_key: fieldKey,
      value,
      x_mm: x,
      y_mm: y,
      w_mm: w,
      h_mm: h,
      symbology: options.symbology || "Code128",
      human_readable: options.humanReadable !== false,
    };
  }

  function lineBlock(x, y, w, h, options = {}) {
    return {
      type: "line",
      field_key: options.fieldKey || "",
      value: "",
      x_mm: x,
      y_mm: y,
      w_mm: w,
      h_mm: h,
      color: options.color || "#102834",
    };
  }

  function buildWarehouseoutCandidates() {
    const sample = SAMPLE_DATA.warehouseout;

    return [
      {
        id: "warehouseout_bale__wo_receipt_qr",
        key: "wo_receipt_qr",
        title: "WO-A 签收主版",
        blurb: "左上收签收主信息，右侧整块给箱单，左下复用 warehousein 已验证的一维码框。",
        tags: ["推荐", "签收清楚", "1D 主扫"],
        recommended: true,
        label_family: "warehouseout_bale",
        width_mm: LABEL_WIDTH_MM,
        height_mm: LABEL_HEIGHT_MM,
        primary_symbology: "Code128",
        sample,
        blocks: [
          textBlock("store_name", sample.store_name, 2.6, 2.0, 27.4, 6.8, { fontPx: 30, fontWeight: 800 }),
          textBlock("transfer_order_no", sample.transfer_order_no, 2.6, 9.4, 27.4, 3.6, { fontPx: 17, fontWeight: 700, fontFamily: "IBM Plex Mono, SFMono-Regular, Menlo, monospace" }),
          textBlock("bale_piece_summary", sample.bale_piece_summary, 2.6, 13.6, 27.4, 3.0, { fontPx: 17, fontWeight: 700 }),
          textBlock("outbound_time", `Out: ${sample.outbound_time}`, 2.6, 16.9, 27.4, 1.4, { fontPx: 10, fontWeight: 700, fontFamily: "IBM Plex Mono, SFMono-Regular, Menlo, monospace" }),
          textBlock("total_quantity", `Total: ${sample.total_quantity}`, 31.6, 2.6, 24.0, 3.6, { fontPx: 16, fontWeight: 800, align: "right" }),
          textBlock("packing_list", sample.packing_list, 31.6, 7.2, 24.0, 28.4, { fontPx: 6.2, fontWeight: 700, tone: "muted" }),
          barcodeBlock("dispatch_bale_no", sample.dispatch_bale_no, 2.8, 20.0, 26.8, 15.2, { symbology: "Code128" }),
          lineBlock(30.4, 20.0, 0.88, 16.2),
          textBlock("dispatch_bale_no", sample.dispatch_bale_no, 2.8, 36.0, 26.8, 2.1, { fontPx: 10, fontWeight: 700, align: "center", fontFamily: "IBM Plex Mono, SFMono-Regular, Menlo, monospace", letterSpacing: 0.4 }),
        ],
      },
      {
        id: "warehouseout_bale__wo_store_banner",
        key: "wo_store_banner",
        title: "WO-B 门店横带版",
        blurb: "门店名做顶部横带，右侧继续做箱单，左下保留一维码主扫。",
        tags: ["门店优先", "横带", "1D"],
        recommended: false,
        label_family: "warehouseout_bale",
        width_mm: LABEL_WIDTH_MM,
        height_mm: LABEL_HEIGHT_MM,
        primary_symbology: "Code128",
        sample,
        blocks: [
          textBlock("store_name", sample.store_name, 2.4, 2.2, 55.2, 7.2, { fontPx: 28, fontWeight: 800, align: "center", background: "#173843", color: "#f5faf8", radius: 2.2, padding: 1.0 }),
          textBlock("transfer_order_no", sample.transfer_order_no, 2.8, 11.6, 27.4, 4.0, { fontPx: 13, fontWeight: 700, fontFamily: "IBM Plex Mono, SFMono-Regular, Menlo, monospace" }),
          textBlock("bale_piece_summary", sample.bale_piece_summary, 2.8, 16.0, 27.4, 4.0, { fontPx: 13, fontWeight: 700 }),
          textBlock("total_quantity", `Total: ${sample.total_quantity}`, 32.2, 11.6, 23.2, 4.4, { fontPx: 17, fontWeight: 800, align: "right" }),
          textBlock("packing_list", sample.packing_list, 32.2, 17.0, 23.2, 11.8, { fontPx: 6.2, fontWeight: 700, tone: "muted" }),
          lineBlock(2.8, 29.8, 52.8, 0.7),
          barcodeBlock("dispatch_bale_no", sample.dispatch_bale_no, 2.8, 31.0, 28.4, 6.8, { symbology: "Code128" }),
          textBlock("dispatch_bale_no", sample.dispatch_bale_no, 2.8, 37.0, 28.4, 2.0, { fontPx: 10, fontWeight: 700, fontFamily: "IBM Plex Mono, SFMono-Regular, Menlo, monospace", letterSpacing: 0.5 }),
          textBlock("outbound_time", `Out: ${sample.outbound_time}`, 32.2, 31.2, 23.2, 2.8, { fontPx: 10, fontWeight: 700, align: "right" }),
          textBlock("machine_code", `Machine: ${sample.machine_code}`, 32.2, 34.4, 23.2, 2.8, { fontPx: 10, fontWeight: 700, align: "right" }),
        ],
      },
      {
        id: "warehouseout_bale__wo_gate_check",
        key: "wo_gate_check",
        title: "WO-C 交接核对版",
        blurb: "左侧先做门店和调货单概览，右侧整块给总数和箱单，底部再落一维码。",
        tags: ["核对清单", "交接", "仓店双看"],
        recommended: false,
        label_family: "warehouseout_bale",
        width_mm: LABEL_WIDTH_MM,
        height_mm: LABEL_HEIGHT_MM,
        primary_symbology: "Code128",
        sample,
        blocks: [
          textBlock("store_name", sample.store_name, 2.8, 2.8, 26.0, 6.0, { fontPx: 22, fontWeight: 800 }),
          textBlock("transfer_order_no", sample.transfer_order_no, 2.8, 9.4, 26.0, 3.8, { fontPx: 13, fontWeight: 700, fontFamily: "IBM Plex Mono, SFMono-Regular, Menlo, monospace" }),
          textBlock("bale_piece_summary", sample.bale_piece_summary, 2.8, 13.8, 26.0, 3.8, { fontPx: 13, fontWeight: 700 }),
          textBlock("total_quantity", `Total: ${sample.total_quantity}`, 31.0, 2.8, 24.2, 4.8, { fontPx: 18, fontWeight: 800, align: "right" }),
          textBlock("packing_list", sample.packing_list, 31.0, 8.8, 24.2, 17.2, { fontPx: 6.6, fontWeight: 700, tone: "muted" }),
          lineBlock(2.8, 27.8, 52.4, 0.7),
          barcodeBlock("dispatch_bale_no", sample.dispatch_bale_no, 2.8, 29.6, 28.0, 7.2, { symbology: "Code128" }),
          textBlock("dispatch_bale_no", sample.dispatch_bale_no, 2.8, 36.4, 28.0, 2.0, { fontPx: 10, fontWeight: 700, fontFamily: "IBM Plex Mono, SFMono-Regular, Menlo, monospace", letterSpacing: 0.5 }),
          textBlock("outbound_time", `Out: ${sample.outbound_time}`, 31.0, 29.8, 24.2, 2.8, { fontPx: 10, fontWeight: 700, align: "right" }),
          textBlock("machine_code", `Machine: ${sample.machine_code}`, 31.0, 33.2, 24.2, 2.8, { fontPx: 10, fontWeight: 700, align: "right" }),
        ],
      },
    ];
  }

  function buildStoreItemCandidates() {
    const sample = SAMPLE_DATA.storeItem;

    return [
      {
        id: "store_item__si_price_stack",
        key: "si_price_stack",
        title: "SI-A 价格主版",
        blurb: "价格压到第一视觉，商品名第二层，底部完整展开一维码。",
        tags: ["推荐", "价格最大", "收银友好"],
        recommended: true,
        label_family: "store_item",
        width_mm: LABEL_WIDTH_MM,
        height_mm: LABEL_HEIGHT_MM,
        primary_symbology: "Code128",
        sample,
        blocks: [
          textBlock("price", sample.price, 2.4, 2.2, 33.0, 12.0, { fontPx: 42, fontWeight: 900, color: "#101820" }),
          textBlock("product_name", sample.product_name, 2.4, 15.0, 33.0, 6.2, { fontPx: 22, fontWeight: 800 }),
          textBlock("short_suffix", sample.short_suffix, 38.0, 3.8, 18.0, 4.8, { fontPx: 15, fontWeight: 800, align: "center", background: "#173843", color: "#f9fcfd", radius: 2.4, padding: 0.6, fontFamily: "IBM Plex Mono, SFMono-Regular, Menlo, monospace" }),
          lineBlock(2.4, 22.1, 55.2, 0.7, { color: "#1b3f4a" }),
          barcodeBlock("barcode_value", sample.barcode_value, 2.4, 24.0, 55.2, 9.8, { symbology: "Code128" }),
          textBlock("barcode_value", sample.barcode_value, 2.4, 34.5, 40.0, 3.0, { fontPx: 11, fontWeight: 700, fontFamily: "IBM Plex Mono, SFMono-Regular, Menlo, monospace", letterSpacing: 0.8 }),
        ],
      },
      {
        id: "store_item__si_price_banner",
        key: "si_price_banner",
        title: "SI-B 价格横带版",
        blurb: "顶部整块价格带，远距离先认价，再认商品名。",
        tags: ["价签感强", "横带", "远读"],
        recommended: false,
        label_family: "store_item",
        width_mm: LABEL_WIDTH_MM,
        height_mm: LABEL_HEIGHT_MM,
        primary_symbology: "Code128",
        sample,
        blocks: [
          textBlock("price", sample.price, 2.4, 2.4, 55.2, 11.2, { fontPx: 46, fontWeight: 900, align: "center", background: "#112733", color: "#fbfdfe", radius: 2.4, padding: 1.0 }),
          textBlock("product_name", sample.product_name, 2.8, 15.6, 34.0, 5.8, { fontPx: 21, fontWeight: 800 }),
          textBlock("short_suffix", sample.short_suffix, 40.2, 16.0, 15.4, 4.4, { fontPx: 14, fontWeight: 800, align: "center", background: "#eff5f7", color: "#173843", radius: 2.0, padding: 0.5, fontFamily: "IBM Plex Mono, SFMono-Regular, Menlo, monospace" }),
          barcodeBlock("barcode_value", sample.barcode_value, 2.6, 23.0, 54.8, 10.2, { symbology: "Code128" }),
          textBlock("barcode_value", sample.barcode_value, 2.6, 34.3, 42.0, 3.0, { fontPx: 11, fontWeight: 700, fontFamily: "IBM Plex Mono, SFMono-Regular, Menlo, monospace", letterSpacing: 0.8 }),
        ],
      },
      {
        id: "store_item__si_split_focus",
        key: "si_split_focus",
        title: "SI-C 分栏陈列版",
        blurb: "左上先给商品名，右上给大价格，适合商品名需要更快辨认。",
        tags: ["商品名更强", "分栏", "店员操作"],
        recommended: false,
        label_family: "store_item",
        width_mm: LABEL_WIDTH_MM,
        height_mm: LABEL_HEIGHT_MM,
        primary_symbology: "Code128",
        sample,
        blocks: [
          textBlock("product_name", sample.product_name, 2.4, 2.8, 28.6, 8.2, { fontPx: 24, fontWeight: 800 }),
          textBlock("price", sample.price, 33.2, 2.4, 24.0, 10.2, { fontPx: 36, fontWeight: 900, align: "right" }),
          textBlock("short_suffix", sample.short_suffix, 36.2, 13.4, 20.0, 4.0, { fontPx: 13, fontWeight: 800, align: "right", color: "#5a6a73", fontFamily: "IBM Plex Mono, SFMono-Regular, Menlo, monospace" }),
          lineBlock(2.4, 18.6, 55.2, 0.7, { color: "#1b3f4a" }),
          barcodeBlock("barcode_value", sample.barcode_value, 2.6, 21.6, 54.8, 10.8, { symbology: "Code128" }),
          textBlock("barcode_value", sample.barcode_value, 2.6, 33.8, 42.0, 3.0, { fontPx: 11, fontWeight: 700, fontFamily: "IBM Plex Mono, SFMono-Regular, Menlo, monospace", letterSpacing: 0.8 }),
        ],
      },
    ];
  }

  function buildDepartmentItemCandidates() {
    const sample = SAMPLE_DATA.departmentItem;

    return [
      {
        id: "department_item_40x30__di_price_clean",
        key: "di_price_clean",
        title: "DI-A 百货清晰版",
        blurb: "40x30 小标签里先保价格、商品名和完整一维码，适合百货先看效果。",
        tags: ["预览", "推荐", "40x30"],
        recommended: true,
        label_family: "department_item_40x30",
        width_mm: DEPARTMENT_LABEL_WIDTH_MM,
        height_mm: DEPARTMENT_LABEL_HEIGHT_MM,
        primary_symbology: "Code128",
        sample,
        blocks: [
          textBlock("price", sample.price, 1.4, 1.2, 22.6, 8.8, { fontPx: 30, fontWeight: 900, color: "#101820" }),
          textBlock("short_suffix", sample.short_suffix, 27.4, 1.8, 10.6, 4.6, { fontPx: 13, fontWeight: 800, align: "center", background: "#173843", color: "#f9fcfd", radius: 1.6, padding: 0.3, fontFamily: "IBM Plex Mono, SFMono-Regular, Menlo, monospace" }),
          textBlock("product_name", sample.product_name, 1.4, 10.8, 36.0, 5.0, { fontPx: 14, fontWeight: 800 }),
          lineBlock(1.4, 16.8, 36.6, 0.6, { color: "#1b3f4a" }),
          barcodeBlock("barcode_value", sample.barcode_value, 1.2, 18.0, 37.0, 8.8, { symbology: "Code128" }),
          textBlock("barcode_value", sample.barcode_value, 1.4, 27.2, 28.0, 2.2, { fontPx: 9, fontWeight: 700, fontFamily: "IBM Plex Mono, SFMono-Regular, Menlo, monospace", letterSpacing: 0.6 }),
        ],
      },
      {
        id: "department_item_40x30__di_price_tag",
        key: "di_price_tag",
        title: "DI-B 角标价签版",
        blurb: "价格更突出，适合百货货架先看价格，再扫条码。",
        tags: ["40x30", "价格更强"],
        recommended: false,
        label_family: "department_item_40x30",
        width_mm: DEPARTMENT_LABEL_WIDTH_MM,
        height_mm: DEPARTMENT_LABEL_HEIGHT_MM,
        primary_symbology: "Code128",
        sample,
        blocks: [
          textBlock("price", sample.price, 1.4, 1.4, 24.0, 8.8, { fontPx: 28, fontWeight: 900, color: "#101820" }),
          textBlock("short_suffix", sample.short_suffix, 27.0, 1.8, 10.2, 4.0, { fontPx: 11, fontWeight: 800, align: "center", background: "#eef4f6", color: "#173843", radius: 1.4, padding: 0.3, fontFamily: "IBM Plex Mono, SFMono-Regular, Menlo, monospace" }),
          textBlock("product_name", sample.product_name, 1.4, 10.6, 36.0, 4.8, { fontPx: 12, fontWeight: 800 }),
          lineBlock(1.4, 16.2, 36.2, 0.5, { color: "#1b3f4a" }),
          barcodeBlock("barcode_value", sample.barcode_value, 1.2, 17.6, 36.8, 8.2, { symbology: "Code128" }),
          textBlock("barcode_value", sample.barcode_value, 1.4, 26.2, 30.0, 2.0, { fontPx: 8, fontWeight: 700, fontFamily: "IBM Plex Mono, SFMono-Regular, Menlo, monospace", letterSpacing: 0.5 }),
        ],
      },
      {
        id: "department_item_40x30__di_compact_name",
        key: "di_compact_name",
        title: "DI-C 品名优先版",
        blurb: "商品名更醒目，适合百货需要先认品名再认价格的场景。",
        tags: ["40x30", "品名更强"],
        recommended: false,
        label_family: "department_item_40x30",
        width_mm: DEPARTMENT_LABEL_WIDTH_MM,
        height_mm: DEPARTMENT_LABEL_HEIGHT_MM,
        primary_symbology: "Code128",
        sample,
        blocks: [
          textBlock("product_name", sample.product_name, 1.4, 1.4, 21.8, 6.8, { fontPx: 13, fontWeight: 800 }),
          textBlock("price", sample.price, 23.4, 1.2, 14.0, 6.8, { fontPx: 18, fontWeight: 900, align: "right", color: "#101820" }),
          textBlock("short_suffix", sample.short_suffix, 24.8, 8.8, 12.0, 3.4, { fontPx: 9, fontWeight: 800, align: "right", color: "#5a6a73", fontFamily: "IBM Plex Mono, SFMono-Regular, Menlo, monospace" }),
          lineBlock(1.4, 13.8, 36.0, 0.5, { color: "#1b3f4a" }),
          barcodeBlock("barcode_value", sample.barcode_value, 1.2, 15.6, 36.8, 8.4, { symbology: "Code128" }),
          textBlock("barcode_value", sample.barcode_value, 1.4, 24.8, 30.0, 2.0, { fontPx: 8, fontWeight: 700, fontFamily: "IBM Plex Mono, SFMono-Regular, Menlo, monospace", letterSpacing: 0.5 }),
        ],
      },
    ];
  }

  function buildWaitForTransToShopCandidates() {
    const sample = SAMPLE_DATA.waitForTransToShop;
    const saleSample = SAMPLE_DATA.waitForSale;

    return [
      {
        id: "wait_for_transtoshop__wf_main",
        key: "wf_main",
        title: "WF-A wait for transtoshop",
        blurb: "60x40 单版预览，先看英文状态栏 + CAT / SUB / GRADE / QTY / CODE 的纸面层级。",
        tags: ["预览", "60x40", "Code128"],
        recommended: true,
        label_family: "wait_for_transtoshop",
        width_mm: LABEL_WIDTH_MM,
        height_mm: LABEL_HEIGHT_MM,
        primary_symbology: "Code128",
        sample,
        blocks: [
          textBlock("status", `STATUS: ${sample.status}`, 2.4, 1.4, 54.8, 5.6, { fontPx: 20, fontWeight: 900, color: "#173843" }),
          textBlock("cat", `CAT: ${sample.cat}`, 2.4, 7.4, 31.0, 4.0, { fontPx: 16, fontWeight: 800, fontFamily: "IBM Plex Mono, SFMono-Regular, Menlo, monospace" }),
          textBlock("sub", `SUB: ${sample.sub}`, 2.4, 11.6, 31.0, 4.2, { fontPx: 15, fontWeight: 800, fontFamily: "IBM Plex Mono, SFMono-Regular, Menlo, monospace" }),
          textBlock("grade", `GRADE: ${sample.grade}`, 2.4, 15.8, 24.0, 3.6, { fontPx: 14, fontWeight: 800, fontFamily: "IBM Plex Mono, SFMono-Regular, Menlo, monospace" }),
          textBlock("qty", `QTY: ${sample.qty}`, 37.0, 7.4, 20.0, 4.4, { fontPx: 18, fontWeight: 900, align: "right", fontFamily: "IBM Plex Mono, SFMono-Regular, Menlo, monospace" }),
          lineBlock(2.4, 20.4, 54.8, 0.7, { color: "#1b3f4a" }),
          textBlock("code", `CODE: ${sample.code}`, 2.4, 22.2, 54.8, 3.0, { fontPx: 12, fontWeight: 800, fontFamily: "IBM Plex Mono, SFMono-Regular, Menlo, monospace", letterSpacing: 0.4 }),
          barcodeBlock("code", sample.code, 2.4, 26.0, 55.2, 9.0, { symbology: "Code128" }),
          textBlock("barcode_code", sample.code, 2.4, 35.8, 40.0, 2.2, { fontPx: 11, fontWeight: 700, fontFamily: "IBM Plex Mono, SFMono-Regular, Menlo, monospace", letterSpacing: 0.7 }),
        ],
      },
      {
        id: "wait_for_transtoshop__wf_sale",
        key: "wf_sale",
        title: "WF-B wait for sale",
        blurb: "新增 sale 版，改成 GRADE A/B，并增加 WEIGHT 字段。",
        tags: ["预览", "60x40", "sale"],
        recommended: false,
        label_family: "wait_for_transtoshop",
        width_mm: LABEL_WIDTH_MM,
        height_mm: LABEL_HEIGHT_MM,
        primary_symbology: "Code128",
        sample: saleSample,
        blocks: [
          textBlock("status", `STATUS: ${saleSample.status}`, 2.4, 1.4, 54.8, 5.6, { fontPx: 20, fontWeight: 900, color: "#173843" }),
          textBlock("cat", `CAT: ${saleSample.cat}`, 2.4, 7.4, 29.0, 4.0, { fontPx: 16, fontWeight: 800, fontFamily: "IBM Plex Mono, SFMono-Regular, Menlo, monospace" }),
          textBlock("qty", `QTY: ${saleSample.qty}`, 39.0, 7.4, 18.0, 4.0, { fontPx: 17, fontWeight: 900, align: "right", fontFamily: "IBM Plex Mono, SFMono-Regular, Menlo, monospace" }),
          textBlock("sub", `SUB: ${saleSample.sub}`, 2.4, 11.6, 31.0, 4.0, { fontPx: 15, fontWeight: 800, fontFamily: "IBM Plex Mono, SFMono-Regular, Menlo, monospace" }),
          textBlock("grade", `GRADE: ${saleSample.grade}`, 2.4, 15.8, 19.0, 3.6, { fontPx: 14, fontWeight: 800, fontFamily: "IBM Plex Mono, SFMono-Regular, Menlo, monospace" }),
          textBlock("weight", `WEIGHT: ${saleSample.weight}`, 25.0, 15.8, 32.0, 3.6, { fontPx: 14, fontWeight: 800, align: "right", fontFamily: "IBM Plex Mono, SFMono-Regular, Menlo, monospace" }),
          lineBlock(2.4, 20.4, 54.8, 0.7, { color: "#1b3f4a" }),
          textBlock("code", `CODE: ${saleSample.code}`, 2.4, 22.2, 54.8, 3.0, { fontPx: 12, fontWeight: 800, fontFamily: "IBM Plex Mono, SFMono-Regular, Menlo, monospace", letterSpacing: 0.4 }),
          barcodeBlock("code", saleSample.code, 2.4, 26.0, 55.2, 9.0, { symbology: "Code128" }),
          textBlock("barcode_code", saleSample.code, 2.4, 35.8, 40.0, 2.2, { fontPx: 11, fontWeight: 700, fontFamily: "IBM Plex Mono, SFMono-Regular, Menlo, monospace", letterSpacing: 0.7 }),
        ],
      },
    ];
  }

  function buildHardwareLabelGroups() {
    return GROUPS.map((group) => ({
      ...group,
      required_fields: group.required_fields.slice(),
      system_only_fields: group.system_only_fields.slice(),
      candidates: group.candidates.map((candidate) => ({
        ...candidate,
        tags: candidate.tags.slice(),
        sample: { ...candidate.sample },
        blocks: candidate.blocks.map((block) => ({ ...block })),
      })),
    }));
  }

  function buildVisibleHardwareLabelGroups() {
    const groups = buildHardwareLabelGroups();
    return groups.filter((group) => VISIBLE_GROUP_KEYS.includes(group.key));
  }

  function countHardwareLabelCandidates(groups) {
    return (Array.isArray(groups) ? groups : []).reduce((sum, group) => sum + ((group && group.candidates && group.candidates.length) || 0), 0);
  }

  function resolvePrintFontSize(block) {
    if (block.type !== "text") {
      return 8;
    }
    if (Number.isFinite(Number(block.print_font_size)) && Number(block.print_font_size) > 0) {
      return Number(block.print_font_size);
    }
    const previewFont = Number(block.font_px || 14);
    return Math.max(6, Math.min(20, Math.round(previewFont / 1.8)));
  }

  function buildPrintableBlock(block) {
    const payload = {
      type: normalizeText(block.type).toLowerCase(),
      value: normalizeText(block.value),
      values: [],
      x_mm: Number(block.x_mm || 0),
      y_mm: Number(block.y_mm || 0),
      w_mm: Number(block.w_mm || 0),
      h_mm: Number(block.h_mm || 0),
      align: normalizeText(block.align) || "left",
      font_size: resolvePrintFontSize(block),
      font_weight: String(block.font_weight || 700),
    };
    if (payload.type === "line") {
      payload.value = "";
    }
    return payload;
  }

  function buildHardwareCandidatePrintPayload(candidate, options = {}) {
    return {
      printer_name: normalizeText(options.printerName) || DEFAULT_PRINTER_NAME,
      width_mm: Number(candidate.width_mm || LABEL_WIDTH_MM),
      height_mm: Number(candidate.height_mm || LABEL_HEIGHT_MM),
      label_size: `${Number(candidate.width_mm || LABEL_WIDTH_MM)}x${Number(candidate.height_mm || LABEL_HEIGHT_MM)}`,
      candidate_id: normalizeText(candidate.id),
      blocks: (candidate.blocks || []).map(buildPrintableBlock),
    };
  }

  function buildHardwareCandidateBatchPrintPayload(group, options = {}) {
    const widthMm = Number(group?.candidates?.[0]?.width_mm || LABEL_WIDTH_MM);
    const heightMm = Number(group?.candidates?.[0]?.height_mm || LABEL_HEIGHT_MM);
    return {
      printer_name: normalizeText(options.printerName) || DEFAULT_PRINTER_NAME,
      width_mm: widthMm,
      height_mm: heightMm,
      label_size: `${widthMm}x${heightMm}`,
      candidates: (group?.candidates || []).map((candidate) => ({
        candidate_id: normalizeText(candidate.id),
        blocks: (candidate.blocks || []).map(buildPrintableBlock),
      })),
    };
  }

  function buildFuturePrintStructure(candidate) {
    return {
      candidate_id: candidate.id,
      label_family: candidate.label_family,
      width_mm: candidate.width_mm,
      height_mm: candidate.height_mm,
      primary_symbology: candidate.primary_symbology,
      blocks: candidate.blocks.map((block) => ({
        type: block.type,
        field_key: block.field_key || "",
        value: block.value || "",
        symbology: block.symbology || "",
        x_mm: Number(block.x_mm || 0),
        y_mm: Number(block.y_mm || 0),
        w_mm: Number(block.w_mm || 0),
        h_mm: Number(block.h_mm || 0),
      })),
    };
  }

  function mmToPercent(value, total) {
    return `${((Number(value || 0) / Number(total || 1)) * 100).toFixed(3)}%`;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function hashString(value) {
    let hash = 2166136261;
    const text = String(value || "");
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function pseudoRandom(seed) {
    let state = seed >>> 0 || 1;
    return function next() {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return (state >>> 0) / 4294967295;
    };
  }

  function buildPseudoQrSvg(value, dark = "#111") {
    const modules = 25;
    const cell = 4;
    const size = modules * cell;
    const random = pseudoRandom(hashString(value));
    const filled = [];

    function isFinder(x, y, originX, originY) {
      return x >= originX && x < originX + 7 && y >= originY && y < originY + 7;
    }

    function finderCell(x, y, originX, originY) {
      const localX = x - originX;
      const localY = y - originY;
      const border = localX === 0 || localX === 6 || localY === 0 || localY === 6;
      const center = localX >= 2 && localX <= 4 && localY >= 2 && localY <= 4;
      return border || center;
    }

    for (let y = 0; y < modules; y += 1) {
      for (let x = 0; x < modules; x += 1) {
        const inFinder = isFinder(x, y, 0, 0) || isFinder(x, y, 0, modules - 7) || isFinder(x, y, modules - 7, 0);
        let on = false;
        if (inFinder) {
          if (isFinder(x, y, 0, 0)) on = finderCell(x, y, 0, 0);
          if (isFinder(x, y, 0, modules - 7)) on = finderCell(x, y, 0, modules - 7);
          if (isFinder(x, y, modules - 7, 0)) on = finderCell(x, y, modules - 7, 0);
        } else {
          on = random() > 0.52;
        }
        if (on) {
          filled.push(`<rect x="${x * cell}" y="${y * cell}" width="${cell}" height="${cell}" rx="0.6" />`);
        }
      }
    }

    return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="QR"><rect width="${size}" height="${size}" fill="#fff"/><g fill="${dark}">${filled.join("")}</g></svg>`;
  }

  function buildPseudoBarcodeSvg(value, dark = "#111") {
    const quiet = 12;
    const height = 88;
    const width = 260;
    const bars = [];
    const seed = hashString(value);
    const source = String(value || "") || "000000";
    let cursor = quiet;

    for (let i = 0; i < source.length; i += 1) {
      const code = source.charCodeAt(i);
      const patternSeed = (seed + code + i * 17) % 97;
      const groups = [1 + (patternSeed % 3), 1 + ((patternSeed >> 1) % 4), 1 + ((patternSeed >> 2) % 3)];
      groups.forEach((barWidth, index) => {
        const actualWidth = Math.max(barWidth * 2, 2);
        if (index % 2 === 0) {
          bars.push(`<rect x="${cursor}" y="0" width="${actualWidth}" height="${height}" rx="0.6" />`);
        }
        cursor += actualWidth;
      });
      cursor += 2;
    }
    const totalWidth = Math.min(Math.max(cursor + quiet, 180), width);
    return `<svg viewBox="0 0 ${totalWidth} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Code128"><rect width="${totalWidth}" height="${height}" fill="#fff"/><g fill="${dark}">${bars.join("")}</g></svg>`;
  }

  function renderBlock(block, widthMm, heightMm) {
    const baseStyle = [
      `left:${mmToPercent(block.x_mm, widthMm)}`,
      `top:${mmToPercent(block.y_mm, heightMm)}`,
      `width:${mmToPercent(block.w_mm, widthMm)}`,
      `height:${mmToPercent(block.h_mm, heightMm)}`,
    ].join(";");

    if (block.type === "line") {
      return `<div class="label-block block-line" style="${baseStyle};background:${escapeHtml(block.color || "#111")};"></div>`;
    }
    if (block.type === "qr") {
      return `<div class="label-block block-qr" style="${baseStyle};">${buildPseudoQrSvg(block.value)}</div>`;
    }
    if (block.type === "barcode") {
      return `<div class="label-block block-barcode" style="${baseStyle};">${buildPseudoBarcodeSvg(block.value)}</div>`;
    }
    const styles = [
      baseStyle,
      `font-size:${Number(block.font_px || 14)}px`,
      `font-weight:${Number(block.font_weight || 700)}`,
      `text-align:${escapeHtml(block.align || "left")}`,
      `color:${escapeHtml(block.color || "#12252f")}`,
      block.background ? `background:${escapeHtml(block.background)}` : "",
      block.border_radius_mm ? `border-radius:${Number(block.border_radius_mm) * 6}px` : "",
      block.padding_mm ? `padding:${Number(block.padding_mm) * 6}px` : "",
      block.letter_spacing ? `letter-spacing:${Number(block.letter_spacing)}px` : "",
      block.font_family ? `font-family:${escapeHtml(block.font_family)}` : "",
      block.uppercase ? "text-transform:uppercase" : "",
    ].filter(Boolean).join(";");
    return `<div class="label-block block-text tone-${escapeHtml(block.tone || "default")}" style="${styles}">${escapeHtml(block.value)}</div>`;
  }

  function renderCandidateCard(group, candidate) {
    const structure = JSON.stringify(buildFuturePrintStructure(candidate), null, 2);
    const widthMm = Number(candidate.width_mm || LABEL_WIDTH_MM);
    const heightMm = Number(candidate.height_mm || LABEL_HEIGHT_MM);
    return `
      <article class="candidate-card ${candidate.recommended ? "is-recommended" : ""}" data-group-key="${escapeHtml(group.key)}" data-candidate-id="${escapeHtml(candidate.id)}">
        <div class="candidate-head">
          <div>
            <div class="candidate-code">${escapeHtml(candidate.title)}</div>
            <h3>${escapeHtml(candidate.key.toUpperCase())}</h3>
            <p>${escapeHtml(candidate.blurb)}</p>
          </div>
          <div class="candidate-tags">
            ${candidate.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
            ${candidate.recommended ? `<span class="tag-recommend">Recommended</span>` : ""}
          </div>
        </div>
        <div class="candidate-preview-wrap">
          <div class="label-preview label-family-${escapeHtml(group.key)}" style="aspect-ratio:${widthMm} / ${heightMm};">
            ${candidate.blocks.map((block) => renderBlock(block, widthMm, heightMm)).join("")}
          </div>
        </div>
        <div class="candidate-meta">
          <div class="candidate-meta-row"><strong>Primary</strong><span>${escapeHtml(candidate.primary_symbology)}</span></div>
          <div class="candidate-meta-row"><strong>Purpose</strong><span>${escapeHtml(group.short_title)}</span></div>
        </div>
        <div class="candidate-actions">
          <button type="button" data-role="print-candidate" data-candidate-id="${escapeHtml(candidate.id)}">打印本版</button>
        </div>
        <details class="candidate-structure">
          <summary>后续打印结构预留</summary>
          <pre>${escapeHtml(structure)}</pre>
        </details>
      </article>
    `;
  }

  function renderGroup(group) {
    return `
      <section class="group-section" id="${escapeHtml(group.key)}">
        <div class="group-head">
          <div>
            <div class="group-kicker">${escapeHtml(group.short_title)}</div>
            <h2>${escapeHtml(group.title)}</h2>
            <p>${escapeHtml(group.purpose)}</p>
          </div>
          <aside class="group-recommend">
            <span>推荐</span>
            <strong>${escapeHtml(group.recommended_title)}</strong>
            <p>${escapeHtml(group.recommended_reason)}</p>
            <div class="section-actions">
              <button type="button" data-role="print-recommended" data-group-key="${escapeHtml(group.key)}" data-candidate-id="${escapeHtml(group.recommended_candidate_id)}">打印推荐版</button>
              <button type="button" data-role="print-group" data-group-key="${escapeHtml(group.key)}">打印这 3 版对比</button>
            </div>
          </aside>
        </div>
        <div class="group-rule">${escapeHtml(group.design_rule)}</div>
        <div class="group-fields">
          <div class="field-panel">
            <h3>上纸字段</h3>
            <div class="field-chips">${group.required_fields.map((field) => `<span>${escapeHtml(field)}</span>`).join("")}</div>
          </div>
          <div class="field-panel muted">
            <h3>只留系统里</h3>
            <div class="field-chips">${group.system_only_fields.map((field) => `<span>${escapeHtml(field)}</span>`).join("")}</div>
          </div>
        </div>
        <div class="candidate-grid">
          ${group.candidates.map((candidate) => renderCandidateCard(group, candidate)).join("")}
        </div>
      </section>
    `;
  }

  function renderReport(groups) {
    return `
      <section class="report-section">
        <h2>推荐结论</h2>
        <div class="report-grid">
          ${groups.map((group) => `
            <article class="report-card">
              <span>${escapeHtml(group.short_title)}</span>
              <strong>${escapeHtml(group.recommended_title)}</strong>
              <p>${escapeHtml(group.recommended_reason)}</p>
            </article>
          `).join("")}
        </div>
      </section>
    `;
  }

  function renderPage(rootElement) {
    const groups = buildVisibleHardwareLabelGroups();
    if (!rootElement) {
      return;
    }
    rootElement.innerHTML = `
      <div class="page-shell">
        <header class="hero">
          <div class="hero-kicker">打印｜PDA与门店硬件</div>
          <h1>wait labels 60x40 lab</h1>
          <p><strong>warehousein 已冻结</strong>。本页现在只看 wait for transtoshop / wait for sale 两种 60x40 预览标签，先确认 STATUS / CAT / SUB / GRADE / QTY / WEIGHT / CODE 和 Code128 的纸面层级。</p>
          <div class="hero-strip">
            <div><span>标签组</span><strong>${groups.length}</strong></div>
            <div><span>候选版式</span><strong>${countHardwareLabelCandidates(groups)}</strong></div>
            <div><span>推荐输出</span><strong>${groups.map((group) => group.recommended_title).join(" / ")}</strong></div>
          </div>
          <div class="lab-toolbar">
            <div class="toolbar-field">
              <label for="hardwarePrinterName">测试打印机</label>
              <input id="hardwarePrinterName" value="${escapeHtml(DEFAULT_PRINTER_NAME)}" />
            </div>
            <div class="toolbar-field">
              <label for="hardwareLoginUsername">打印测试账号</label>
              <input id="hardwareLoginUsername" value="warehouse_supervisor_1" />
            </div>
            <div class="toolbar-field">
              <label for="hardwareLoginPassword">密码</label>
              <input id="hardwareLoginPassword" type="password" value="demo1234" />
            </div>
          </div>
          <div class="auth-strip">
            <div class="auth-actions">
              <button type="button" id="hardwareLoginButton">登录打印</button>
              <button type="button" id="hardwareLogoutButton">退出打印</button>
            </div>
            <div id="hardwarePrintSessionMeta" class="auth-meta">当前没有打印登录态。先在这里登录，再点任一版的打印按钮。</div>
            <div id="hardwareLabStatus" class="lab-status">这页只测试 wait labels 60x40。先点“登录打印”，再直接打 WF-A 或 WF-B。</div>
          </div>
        </header>
        <main class="sections">
          ${groups.map(renderGroup).join("")}
          ${renderReport(groups)}
        </main>
      </div>
    `;

    const printerInput = rootElement.querySelector("#hardwarePrinterName");
    const usernameInput = rootElement.querySelector("#hardwareLoginUsername");
    const passwordInput = rootElement.querySelector("#hardwareLoginPassword");
    const loginButton = rootElement.querySelector("#hardwareLoginButton");
    const logoutButton = rootElement.querySelector("#hardwareLogoutButton");
    const sessionMeta = rootElement.querySelector("#hardwarePrintSessionMeta");
    const labStatus = rootElement.querySelector("#hardwareLabStatus");
    const groupMap = new Map(groups.map((group) => [group.key, group]));
    const candidateMap = new Map(
      groups.flatMap((group) => group.candidates.map((candidate) => [candidate.id, candidate])),
    );

    function getAccessToken() {
      if (typeof localStorage === "undefined") {
        return "";
      }
      return normalizeText(localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY) || "");
    }

    function getStoredUser() {
      if (typeof localStorage === "undefined") {
        return null;
      }
      try {
        return JSON.parse(localStorage.getItem(CURRENT_USER_STORAGE_KEY) || "null");
      } catch (_error) {
        return null;
      }
    }

    function getPrinterName() {
      return normalizeText(printerInput?.value || "") || DEFAULT_PRINTER_NAME;
    }

    function setLabStatus(message, tone = "") {
      if (!labStatus) {
        return;
      }
      labStatus.textContent = message;
      labStatus.dataset.tone = tone;
    }

    function refreshPrintSessionMeta() {
      if (!sessionMeta) {
        return;
      }
      const token = getAccessToken();
      const user = getStoredUser();
      if (token && user?.username) {
        sessionMeta.textContent = `当前打印登录：${user.full_name || user.username} · ${user.username}。现在点“打印本版 / 打印推荐版 / 打印这 3 版对比”会直接发到 ${getPrinterName()}。`;
        return;
      }
      sessionMeta.textContent = "当前没有打印登录态。先在这里登录，再点任一版的打印按钮。";
    }

    async function loginForHardwarePrint() {
      const username = normalizeText(usernameInput?.value || "");
      const password = normalizeText(passwordInput?.value || "");
      if (!username || !password) {
        setLabStatus("先填打印测试账号和密码。", "danger");
        return;
      }
      setLabStatus("正在登录打印测试账号…");
      const response = await fetch(`${window.location.origin}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      let body = {};
      try {
        body = await response.json();
      } catch (_error) {
        body = {};
      }
      if (!response.ok) {
        setLabStatus(String(body.detail || body.message || `登录失败 (${response.status})`), "danger");
        return;
      }
      localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, normalizeText(body.access_token || ""));
      localStorage.setItem(CURRENT_USER_STORAGE_KEY, JSON.stringify(body.user || null));
      refreshPrintSessionMeta();
      setLabStatus(`已登录 ${body.user?.username || username}，现在可以直接测试打印。`, "success");
    }

    function logoutHardwarePrint() {
      localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
      localStorage.removeItem(CURRENT_USER_STORAGE_KEY);
      refreshPrintSessionMeta();
      setLabStatus("已经清掉这页的打印登录态。", "success");
    }

    async function postCandidatePrint(path, payload) {
      const token = getAccessToken();
      if (!token) {
        setLabStatus("当前没有检测到打印登录态。先在这页点“登录打印”，再测试打印。", "danger");
        throw new Error("missing_token");
      }
      setLabStatus(`正在发送到 ${getPrinterName()}…`);
      const response = await fetch(`${window.location.origin}/api/v1${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      let body = {};
      try {
        body = await response.json();
      } catch (_error) {
        body = {};
      }
      if (!response.ok) {
        setLabStatus(String(body.detail || body.message || `打印失败 (${response.status})`), "danger");
        throw new Error(String(body.detail || body.message || "print_failed"));
      }
      setLabStatus(String(body.message || "已发送测试打印。"), "success");
      return body;
    }

    rootElement.querySelectorAll("[data-role='print-candidate']").forEach((button) => {
      button.addEventListener("click", async () => {
        const candidate = candidateMap.get(button.dataset.candidateId || "");
        if (!candidate) {
          setLabStatus("没有找到当前候选版。", "danger");
          return;
        }
        try {
          await postCandidatePrint("/print-jobs/candidate-lab/print", buildHardwareCandidatePrintPayload(candidate, { printerName: getPrinterName() }));
        } catch (_error) {
        }
      });
    });

    rootElement.querySelectorAll("[data-role='print-group']").forEach((button) => {
      button.addEventListener("click", async () => {
        const group = groupMap.get(button.dataset.groupKey || "");
        if (!group) {
          setLabStatus("没有找到当前标签组。", "danger");
          return;
        }
        try {
          await postCandidatePrint("/print-jobs/candidate-lab/print-batch", buildHardwareCandidateBatchPrintPayload(group, { printerName: getPrinterName() }));
        } catch (_error) {
        }
      });
    });

    rootElement.querySelectorAll("[data-role='print-recommended']").forEach((button) => {
      button.addEventListener("click", async () => {
        const candidate = candidateMap.get(button.dataset.candidateId || "");
        if (!candidate) {
          setLabStatus("没有找到推荐候选版。", "danger");
          return;
        }
        try {
          await postCandidatePrint("/print-jobs/candidate-lab/print", buildHardwareCandidatePrintPayload(candidate, { printerName: getPrinterName() }));
        } catch (_error) {
        }
      });
    });

    loginButton?.addEventListener("click", loginForHardwarePrint);
    logoutButton?.addEventListener("click", logoutHardwarePrint);
    refreshPrintSessionMeta();
  }

  if (typeof window !== "undefined" && typeof document !== "undefined") {
    window.addEventListener("DOMContentLoaded", () => {
      renderPage(document.querySelector("#hardwareLabelLab"));
    });
  }

  return {
    buildHardwareLabelGroups,
    buildVisibleHardwareLabelGroups,
    countHardwareLabelCandidates,
    buildFuturePrintStructure,
    buildHardwareCandidatePrintPayload,
    buildHardwareCandidateBatchPrintPayload,
    renderPage,
  };
});

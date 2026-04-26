(function (root, factory) {
  const exports = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = exports;
  }
  root.LabelCandidateGallery = exports;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const LABEL_WIDTH_MM = 60;
  const LABEL_HEIGHT_MM = 40;
  const SHORTLIST_STORAGE_KEY = "label-candidate-shortlist-v1";

  const WAREHOUSE_VARIANTS = [
    {
      key: "legacy_formal",
      layout: "legacy",
      title: "WB-0 昨晚正式版",
      blurb: "昨晚能清晰出字的正式 60x40 模板回放版，用来直接对比新方案。",
      tags: ["昨晚正式版", "清晰对照", "旧模板回放"],
    },
    {
      key: "wb_balance",
      layout: "quad",
      title: "WB-A 平衡版",
      blurb: "按确认稿：左上三行、右上两格、左下一维码、右下四条追溯信息。",
      tags: ["确认稿骨架", "均衡", "首轮推荐"],
    },
    {
      key: "wb_supplier_focus",
      layout: "quad",
      title: "WB-B 供应商优先",
      blurb: "同一骨架下，把供应商行拉到最强，适合先看供应商。",
      tags: ["供应商最大", "确认稿骨架", "仓库远读"],
    },
    {
      key: "wb_category_focus",
      layout: "quad",
      title: "WB-C 类别优先",
      blurb: "同一骨架下，把大类抬到最强，小类保持辅助字。",
      tags: ["大类突出", "确认稿骨架", "层级清晰"],
    },
    {
      key: "wb_right_utilized",
      layout: "quad",
      title: "WB-D 右侧利用最大化",
      blurb: "同一骨架下，把右下四条信息更紧凑，进一步吃掉空白。",
      tags: ["右侧利用", "信息更满", "确认稿骨架"],
    },
    {
      key: "wb_far_read",
      layout: "quad",
      title: "WB-E 仓库远读版",
      blurb: "同一骨架下，把右上件数和左上主信息继续拉大，适合远读。",
      tags: ["远距离辨认", "件数更大", "确认稿骨架"],
    },
    {
      key: "wb_trace_dense",
      layout: "quad",
      title: "WB-F 追溯压缩版",
      blurb: "保留右下四条追溯信息，但进一步压缩字块，把右侧空白吃掉。",
      tags: ["追溯更紧", "空白更少", "仓库实用"],
    },
    {
      key: "wb_piece_focus",
      layout: "quad",
      title: "WB-G 件数优先",
      blurb: "把右上件数做成更醒目的对照块，适合快速核对第几件和共几件。",
      tags: ["件数醒目", "核对快", "仓库计件"],
    },
    {
      key: "wb_compact_head",
      layout: "quad",
      title: "WB-H 头部压缩版",
      blurb: "头部更紧凑，把更多纵向空间让给条码和短码。",
      tags: ["头部更短", "条码空间更大", "稳妥"],
    },
    {
      key: "wb_top_band",
      layout: "band",
      title: "WB-I 顶部横带",
      blurb: "顶部做横向信息带，右上继续保留件数，下面做左条码右追溯。",
      tags: ["横带", "结构清楚", "上部更满"],
    },
    {
      key: "wb_top_band_dense",
      layout: "band",
      title: "WB-J 顶带紧凑版",
      blurb: "把顶部两行压紧，右下追溯也更密，适合信息多但不想留白。",
      tags: ["更满", "信息密度高", "空白少"],
    },
    {
      key: "wb_top_band_counter",
      layout: "band",
      title: "WB-K 顶带件数版",
      blurb: "横带下方把件数块拉大，件数与条码同级强调。",
      tags: ["件数更大", "横带", "快速分拣"],
    },
    {
      key: "wb_top_band_clean",
      layout: "band",
      title: "WB-L 顶带清爽版",
      blurb: "减少顶部杂讯，留更规整的横向节奏，适合看起来舒服。",
      tags: ["清爽", "舒服", "轻量"],
    },
    {
      key: "wb_top_band_trace",
      layout: "band",
      title: "WB-M 顶带追溯版",
      blurb: "在横带结构上把右下追溯拉成更像清单的排法。",
      tags: ["追溯清单", "横带", "右区更实"],
    },
    {
      key: "wb_wide_bar",
      layout: "wide",
      title: "WB-N 宽条码版",
      blurb: "顶部两行概览，下面把条码横向拉宽，适合视觉中心更明确。",
      tags: ["条码更宽", "中心更稳", "大条码"],
    },
    {
      key: "wb_wide_bar_center",
      layout: "wide",
      title: "WB-O 宽条码居中",
      blurb: "条码和短码整体居中，适合追求版面稳定感。",
      tags: ["居中", "稳定", "观感整齐"],
    },
    {
      key: "wb_wide_bar_trace",
      layout: "wide",
      title: "WB-P 宽条码追溯",
      blurb: "在宽条码基础上，把追溯分散到上下两段，减少右侧浪费。",
      tags: ["宽条码", "追溯分散", "利用率高"],
    },
    {
      key: "wb_column_focus",
      layout: "column",
      title: "WB-Q 三栏版",
      blurb: "左信息、中条码、右追溯三栏，右边不再空着。",
      tags: ["三栏", "右侧利用", "结构分明"],
    },
    {
      key: "wb_column_clean",
      layout: "column",
      title: "WB-R 三栏清爽版",
      blurb: "三栏结构下把右栏做轻一点，看起来更干净。",
      tags: ["三栏", "清爽", "不拥挤"],
    },
    {
      key: "wb_column_counter",
      layout: "column",
      title: "WB-S 三栏件数版",
      blurb: "三栏结构下把右栏的第几件/共几件做成更醒目的对照。",
      tags: ["三栏", "件数对照", "核对友好"],
    },
  ];

  const GENERIC_VARIANTS = [
    {
      key: "center_banner",
      title: "Center Banner",
      blurb: "顶部横幅，整体规整，适合门店和商品标签。",
      tags: ["横幅式", "观感整齐", "中性方案"],
    },
    {
      key: "two_line_header",
      title: "Two Line Header",
      blurb: "上方两行承担主信息，条码区适中。",
      tags: ["双行标题", "信息完整", "易读"],
    },
    {
      key: "barcode_max",
      title: "Barcode Max",
      blurb: "尽量把面积给条码和短码，人眼信息降到最少。",
      tags: ["条码最大", "优先扫读", "极简"],
    },
    {
      key: "top_bottom_bands",
      title: "Band Layout",
      blurb: "上下两道信息带，中间是主条码。",
      tags: ["层级清晰", "信息带", "平衡"],
    },
    {
      key: "catalog_card",
      title: "Catalog Card",
      blurb: "像商品资料卡，适合商品级标签。",
      tags: ["卡片式", "门店友好", "视觉完整"],
    },
    {
      key: "trace_footer",
      title: "Trace Footer",
      blurb: "底部追溯区更强，适合回查型标签。",
      tags: ["追溯友好", "辅助信息", "稳妥"],
    },
    {
      key: "pill_header",
      title: "Pill Header",
      blurb: "顶部多个 pill，适合状态和属性较多的标签。",
      tags: ["pill", "轻快", "属性多"],
    },
    {
      key: "stacked_right_note",
      title: "Right Note",
      blurb: "把次信息堆到右边，保持主条码稳定。",
      tags: ["右侧说明", "信息分区", "轻改版"],
    },
    {
      key: "balanced_grid",
      title: "Balanced Grid",
      blurb: "整体均衡，适合做默认参考稿。",
      tags: ["均衡", "默认参考", "稳"],
    },
    {
      key: "split_top_wide_bar",
      title: "Split Top",
      blurb: "顶部拆左右栏，条码区横向留得更多。",
      tags: ["分栏", "更宽条码", "对比版"],
    },
  ];

  const GROUP_CONFIGS = [
    {
      key: "warehouse_bale",
      title: "仓库 Bale 60x40",
      typeLabel: "原始 bale 入仓标签 · 昨晚正式版 + 当前 5 版结构",
      fields: ["供应商", "大类", "小类", "第几件", "共几件", "一维码", "Barcode", "批次号", "箱单号", "入仓时间"],
      candidates: WAREHOUSE_VARIANTS.map((variant, index) => buildWarehouseCandidate(variant, index)),
    },
    {
      key: "apparel_item",
      title: "服装商品级 Barcode 60x40",
      typeLabel: "门店商品 / POS / PDA 标签 · 参考组",
      fields: ["商品名/类目", "等级", "货架位", "售价", "商品短码"],
      candidates: GENERIC_VARIANTS.map((variant, index) => buildGenericCandidate({
        groupKey: "apparel_item",
        groupTitle: "服装商品级 Barcode 60x40",
        fields: ["商品名/类目", "等级", "货架位", "售价", "商品短码"],
        sample: buildApparelItemSample(index),
        variant,
        index,
      })),
    },
    {
      key: "store_dispatch_bale",
      title: "送店 Bale 60x40",
      typeLabel: "门店配货 / 送店 bale 标签 · 参考组",
      fields: ["门店", "件数/大类", "调拨单/任务", "执行状态", "送店 bale 码"],
      candidates: GENERIC_VARIANTS.map((variant, index) => buildGenericCandidate({
        groupKey: "store_dispatch_bale",
        groupTitle: "送店 Bale 60x40",
        fields: ["门店", "件数/大类", "调拨单/任务", "执行状态", "送店 bale 码"],
        sample: buildStoreDispatchSample(index),
        variant,
        index,
      })),
    },
  ];

  function mmToPercent(value, total) {
    return `${((Number(value || 0) / Number(total || 1)) * 100).toFixed(3)}%`;
  }

  function normalizeText(value) {
    return String(value || "").trim();
  }

  function textBlock(value, x, y, w, h, options = {}) {
    return {
      type: "text",
      value: normalizeText(value),
      print_value: normalizeText(options.printValue || value),
      x_mm: x,
      y_mm: y,
      w_mm: w,
      h_mm: h,
      size: options.size || "sm",
      align: options.align || "left",
      vertical_align: options.verticalAlign || "top",
      weight: options.weight || "700",
      tone: options.tone || "primary",
      content_role: options.contentRole || "",
      print_font_size: options.printFontSize || 8,
    };
  }

  function barcodeBlock(value, x, y, w, h, options = {}) {
    return {
      type: "barcode",
      value: normalizeText(value),
      x_mm: x,
      y_mm: y,
      w_mm: w,
      h_mm: h,
      content_role: options.contentRole || "barcode",
    };
  }

  function lineBlock(x, y, w, h, options = {}) {
    return {
      type: "line",
      x_mm: x,
      y_mm: y,
      w_mm: w,
      h_mm: h,
      tone: options.tone || "primary",
      content_role: options.contentRole || "divider",
    };
  }

  function badgeRowBlock(values, x, y, w, h) {
    return {
      type: "badgeRow",
      values: (Array.isArray(values) ? values : []).map((value) => normalizeText(value)).filter(Boolean),
      x_mm: x,
      y_mm: y,
      w_mm: w,
      h_mm: h,
    };
  }

  function buildWarehouseSample(index) {
    const serial = index + 1;
    return {
      supplier: "YCUXUR",
      major: serial % 2 === 0 ? "WINTER+" : "COATS",
      minor: serial % 2 === 0 ? "light knit / top" : "short dress / mixed",
      current_piece: `第${serial}件`,
      total_pieces: "共5件",
      batch_no: "BL-20260422-YCUXUR-001",
      shipment_no: "1-04052026",
      generated_at: `2026-04-22 09:4${index}`,
      code: `RB04222000000${serial}`,
      trace_pack: `C01-C0${serial}`,
    };
  }

  function compactBatchPrintValue(batchNo) {
    const normalized = normalizeText(batchNo);
    if (!normalized) {
      return "";
    }
    const dateMatch = normalized.match(/20(\d{6})/);
    const serialMatch = normalized.match(/(\d{3,})$/);
    const compactDate = dateMatch ? `20${dateMatch[1]}` : "";
    const compactSerial = serialMatch ? serialMatch[1].slice(-3) : "";
    const compact = [compactDate ? `BL-${compactDate}` : "", compactSerial].filter(Boolean).join("-");
    return compact || normalized;
  }

  function compactBatchTracePrintValue(batchNo) {
    const normalized = normalizeText(batchNo);
    if (!normalized) {
      return "";
    }
    const dateMatch = normalized.match(/20(\d{2})(\d{2})(\d{2})/);
    const serialMatch = normalized.match(/(\d{3,})$/);
    const compactDate = dateMatch ? `${dateMatch[1]}${dateMatch[2]}${dateMatch[3]}` : "";
    const compactSerial = serialMatch ? serialMatch[1].slice(-3) : "";
    const compact = [compactDate, compactSerial].filter(Boolean).join("-");
    return compact || compactBatchPrintValue(normalized);
  }

  function compactTimePrintValue(value) {
    const normalized = normalizeText(value);
    const match = normalized.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}:\d{2})/);
    if (!match) {
      return normalized;
    }
    return `${match[2]}-${match[3]} ${match[4]}`;
  }

  function buildWarehouseTraceRows(sample, options = {}) {
    const x = Number(options.x || 0);
    const y = Number(options.y || 0);
    const w = Number(options.w || 10);
    const lineHeight = Number(options.lineHeight || 3.4);
    const fontSize = Number(options.fontSize || 6.2);
    const align = options.align || "left";
    const gap = Number(options.gap || 0.8);
    const displayLabelMap = {
      code: "Barcode",
      batch: "Batch",
      shipment: "Shipment",
      inbound: "Inbound",
    };
    const printLabelMap = {
      code: "Code",
      batch: "Batch",
      shipment: "Ship",
      inbound: "In",
    };
    const rows = [
      {
        key: "code",
        displayValue: sample.code,
        printValue: sample.code,
      },
      {
        key: "batch",
        displayValue: sample.batch_no,
        printValue: compactBatchTracePrintValue(sample.batch_no),
      },
      {
        key: "shipment",
        displayValue: sample.shipment_no,
        printValue: sample.shipment_no,
      },
      {
        key: "inbound",
        displayValue: sample.generated_at,
        printValue: compactTimePrintValue(sample.generated_at),
      },
    ];
    return rows.map((row, index) => textBlock(
      `${displayLabelMap[row.key]}: ${row.displayValue}`,
      x,
      y + index * (lineHeight + gap),
      w,
      lineHeight,
      {
        size: "xs",
        weight: "700",
        align,
        contentRole: "trace_meta",
        printFontSize: fontSize,
        printValue: `${printLabelMap[row.key]}: ${row.printValue}`,
      },
    ));
  }

  function buildApparelItemSample(index) {
    return {
      primary: "Dress / Short",
      secondary: index % 2 === 0 ? "Grade A" : "Premium",
      tertiary: index % 2 === 0 ? "Rack DR-S-12" : "Rack SK-08",
      quaternary: index % 2 === 0 ? "KES 850" : "KES 690",
      code: `TOK-TASK2405-${String(index + 1).padStart(4, "0")}`,
    };
  }

  function buildStoreDispatchSample(index) {
    return {
      primary: index % 2 === 0 ? "UTAWALA" : "CBD WEST",
      secondary: index % 2 === 0 ? "12 pcs · Dress" : "18 pcs · Tops",
      tertiary: `TRF2405-${String(index + 1).padStart(3, "0")}`,
      quaternary: index % 2 === 0 ? "Clerk Pending" : "On Route",
      code: `SDB-TRF2405-${String(index + 1).padStart(3, "0")}`,
    };
  }

  function buildWarehouseLegacyBlocks(sample) {
    return [
      textBlock(`${sample.supplier}  ${sample.trace_pack}`, 3.6, 2.4, 52.8, 6.8, {
        size: "sm",
        weight: "700",
        contentRole: "legacy_headline",
        printFontSize: 8.8,
        printValue: `${sample.supplier} ${sample.trace_pack}`,
      }),
      barcodeBlock(sample.code, 3.6, 10.8, 52.8, 15.0, { contentRole: "barcode" }),
      textBlock(sample.code, 3.6, 27.4, 52.8, 4.8, {
        size: "md",
        weight: "700",
        align: "center",
        contentRole: "legacy_code",
        printFontSize: 6.8,
        printValue: sample.code,
      }),
    ];
  }

  function buildWarehouseQuadBlocks(sample, preset = {}) {
    const readNumber = (value, fallback) => Number(value ?? fallback);
    const topLeftX = 2.4;
    const topLeftW = readNumber(preset.topLeftW, 34.2);
    const topRightX = readNumber(preset.topRightX, 40.2);
    const topRightW = readNumber(preset.topRightW, 17.2);
    const supplierY = readNumber(preset.supplierY, 2.2);
    const majorY = readNumber(preset.majorY, 7.6);
    const minorY = readNumber(preset.minorY, 12.6);
    const supplierH = readNumber(preset.supplierH, 4.8);
    const majorH = readNumber(preset.majorH, 4.4);
    const minorH = readNumber(preset.minorH, 3.8);
    const currentY = readNumber(preset.currentY, 3.4);
    const totalY = readNumber(preset.totalY, 10.4);
    const pieceH = readNumber(preset.pieceH, 5.8);
    const barcodeX = readNumber(preset.barcodeX, 2.4);
    const barcodeY = readNumber(preset.barcodeY, 21.2);
    const barcodeW = readNumber(preset.barcodeW, 25.0);
    const barcodeH = readNumber(preset.barcodeH, 15.2);
    const lowerRightX = readNumber(preset.lowerRightX, 28.6);
    const lowerRightW = readNumber(preset.lowerRightW, 28.4);
    const traceY = readNumber(preset.traceY, 21.2);
    const traceLineHeight = readNumber(preset.traceLineHeight, 3.1);
    const traceGap = readNumber(preset.traceGap, 1.1);
    const topDividerX = preset.topDividerX == null ? null : readNumber(preset.topDividerX, 0);
    const topDividerY = readNumber(preset.topDividerY, 0);
    const topDividerW = readNumber(preset.topDividerW, 0.25);
    const topDividerH = readNumber(preset.topDividerH, 14);
    const middleDividerX = preset.middleDividerX == null ? null : readNumber(preset.middleDividerX, 0);
    const middleDividerY = readNumber(preset.middleDividerY, 19.6);
    const middleDividerW = readNumber(preset.middleDividerW, 0.25);
    const middleDividerH = readNumber(preset.middleDividerH, 16.2);
    const lowerVerticalDividerX = preset.lowerVerticalDividerX == null ? null : readNumber(preset.lowerVerticalDividerX, 0);
    const lowerVerticalDividerY = readNumber(preset.lowerVerticalDividerY, 20.0);
    const lowerVerticalDividerW = readNumber(preset.lowerVerticalDividerW, 0.25);
    const lowerVerticalDividerH = readNumber(preset.lowerVerticalDividerH, 16.2);
    const supplierFont = readNumber(preset.supplierFont, 9.0);
    const majorFont = readNumber(preset.majorFont, 8.8);
    const minorFont = readNumber(preset.minorFont, 6.8);
    const counterFont = readNumber(preset.counterFont, 8.6);
    const rightMetaFont = readNumber(preset.rightMetaFont, 6.0);
    const supplierWeight = String(preset.supplierWeight || "700").trim();
    const majorWeight = String(preset.majorWeight || "700").trim();
    const minorWeight = String(preset.minorWeight || "400").trim();
    const counterWeight = String(preset.counterWeight || "700").trim();
    const currentDisplayLabel = String(preset.currentDisplayLabel || "").trim();
    const totalDisplayLabel = String(preset.totalDisplayLabel || "").trim();
    const totalDisplayUnit = String(preset.totalDisplayUnit ?? "pcs").trim();
    const totalPrintUnit = String(preset.totalPrintUnit ?? "pcs").trim();
    const currentDisplayText = currentDisplayLabel ? `${currentDisplayLabel}: ${sample.current_piece.replace("第", "").replace("件", "")}` : sample.current_piece;
    const totalDisplayValue = totalDisplayUnit ? `${sample.total_pieces.replace("共", "").replace("件", "")} ${totalDisplayUnit}` : sample.total_pieces.replace("共", "").replace("件", "");
    const totalDisplayText = totalDisplayLabel ? `${totalDisplayLabel}: ${totalDisplayValue}` : sample.total_pieces;
    const currentPrintLabel = String(preset.currentPrintLabel || "No").trim();
    const totalPrintLabel = String(preset.totalPrintLabel || "Total").trim();
    const currentPrintText = `${currentPrintLabel}: ${sample.current_piece.replace("第", "").replace("件", "")}`;
    const totalPrintValue = totalPrintUnit ? `${sample.total_pieces.replace("共", "").replace("件", "")} ${totalPrintUnit}` : sample.total_pieces.replace("共", "").replace("件", "");
    const totalPrintText = `${totalPrintLabel}: ${totalPrintValue}`;

    const blocks = [
      textBlock(`供应商：${sample.supplier}`, topLeftX, supplierY, topLeftW, supplierH, { size: "md", weight: supplierWeight, contentRole: "top_supplier", printFontSize: supplierFont, printValue: `SUP: ${sample.supplier}` }),
      textBlock(`大类：${sample.major}`, topLeftX, majorY, topLeftW, majorH, { size: "md", weight: majorWeight, contentRole: "top_major", printFontSize: majorFont, printValue: `CAT: ${sample.major}` }),
      textBlock(`小类：${sample.minor}`, topLeftX, minorY, topLeftW, minorH, { size: "xs", weight: minorWeight, tone: "muted", contentRole: "top_minor", printFontSize: minorFont, printValue: `SUB: ${sample.minor}` }),
      textBlock(currentDisplayText, topRightX, currentY, topRightW, pieceH, { size: "lg", weight: counterWeight, align: "center", contentRole: "piece_current", printFontSize: counterFont, printValue: currentPrintText }),
      textBlock(totalDisplayText, topRightX, totalY, topRightW, pieceH, { size: "lg", weight: counterWeight, align: "center", contentRole: "piece_total", printFontSize: counterFont, printValue: totalPrintText }),
      barcodeBlock(sample.code, barcodeX, barcodeY, barcodeW, barcodeH, { contentRole: "barcode" }),
      ...buildWarehouseTraceRows(sample, {
        x: lowerRightX,
        y: traceY,
        w: lowerRightW,
        lineHeight: traceLineHeight,
        gap: traceGap,
        fontSize: rightMetaFont,
      }),
    ];
    if (topDividerX != null) {
      blocks.push(lineBlock(topDividerX, topDividerY, topDividerW, topDividerH, { contentRole: "top_divider" }));
    }
    if (middleDividerX != null) {
      blocks.push(lineBlock(middleDividerX, middleDividerY, middleDividerW, middleDividerH, { contentRole: "middle_divider" }));
    }
    if (lowerVerticalDividerX != null) {
      blocks.push(lineBlock(lowerVerticalDividerX, lowerVerticalDividerY, lowerVerticalDividerW, lowerVerticalDividerH, { contentRole: "lower_vertical_divider" }));
    }
    return blocks;
  }

  function buildWarehouseBandBlocks(sample, preset = {}) {
    const supplierFont = Number(preset.supplierFont || 8.8);
    const majorFont = Number(preset.majorFont || 8.2);
    const counterFont = Number(preset.counterFont || 8.4);
    const minorFont = Number(preset.minorFont || 6.6);
    const rightMetaFont = Number(preset.rightMetaFont || 6.0);
    const barcodeW = Number(preset.barcodeW || 24.6);
    const barcodeH = Number(preset.barcodeH || 14.8);
    const barcodeX = Number(preset.barcodeX || 2.8);
    const rightX = Number(preset.rightX || 29.8);
    const rightW = Number(preset.rightW || 27.4);

    return [
      textBlock(`供应商：${sample.supplier}`, 2.8, 2.0, 34.2, 4.4, { size: "md", weight: "700", contentRole: "top_supplier", printFontSize: supplierFont, printValue: `SUP: ${sample.supplier}` }),
      textBlock(`大类：${sample.major}`, 2.8, 6.6, 34.2, 4.0, { size: "md", weight: "700", contentRole: "top_major", printFontSize: majorFont, printValue: `CAT: ${sample.major}` }),
      textBlock(sample.current_piece, 39.0, 2.0, 18.0, 4.8, { size: "md", weight: "700", align: "center", contentRole: "piece_current", printFontSize: counterFont, printValue: `No.${sample.current_piece.replace("第", "").replace("件", "")}` }),
      textBlock(sample.total_pieces, 39.0, 7.2, 18.0, 4.8, { size: "md", weight: "700", align: "center", contentRole: "piece_total", printFontSize: counterFont, printValue: `${sample.total_pieces.replace("共", "").replace("件", "")} pcs` }),
      textBlock(`小类：${sample.minor}`, 2.8, 11.4, 54.2, 3.4, { size: "xs", weight: "400", tone: "muted", contentRole: "top_minor", printFontSize: minorFont, printValue: `SUB: ${sample.minor}` }),
      barcodeBlock(sample.code, barcodeX, 18.8, barcodeW, barcodeH, { contentRole: "barcode" }),
      ...buildWarehouseTraceRows(sample, {
        x: rightX,
        y: 18.8,
        w: rightW,
        lineHeight: 2.8,
        gap: 1.0,
        fontSize: rightMetaFont,
      }),
    ];
  }

  function buildWarehouseWideBlocks(sample, preset = {}) {
    const headFont = Number(preset.headFont || 8.8);
    const subFont = Number(preset.subFont || 6.6);
    const counterFont = Number(preset.counterFont || 7.0);
    const codeFont = Number(preset.codeFont || 8.6);
    const metaFont = Number(preset.metaFont || 6.0);
    const barcodeX = Number(preset.barcodeX || 3.6);
    const barcodeW = Number(preset.barcodeW || 52.8);
    const barcodeH = Number(preset.barcodeH || 13.8);

    return [
      textBlock(`供应商：${sample.supplier}`, 3.0, 2.2, 31.2, 4.4, { size: "sm", weight: "700", contentRole: "top_supplier", printFontSize: headFont, printValue: `SUP: ${sample.supplier}` }),
      textBlock(sample.current_piece, 35.2, 2.4, 10.0, 4.0, { size: "xs", weight: "700", align: "center", contentRole: "piece_current", printFontSize: counterFont, printValue: `No.${sample.current_piece.replace("第", "").replace("件", "")}` }),
      textBlock(sample.total_pieces, 46.0, 2.4, 11.0, 4.0, { size: "xs", weight: "700", align: "center", contentRole: "piece_total", printFontSize: counterFont, printValue: `${sample.total_pieces.replace("共", "").replace("件", "")} pcs` }),
      textBlock(`大类：${sample.major}`, 3.0, 7.0, 28.0, 3.4, { size: "xs", weight: "700", contentRole: "top_major", printFontSize: subFont, printValue: `CAT: ${sample.major}` }),
      textBlock(`小类：${sample.minor}`, 32.0, 7.0, 25.0, 3.4, { size: "xs", weight: "400", tone: "muted", contentRole: "top_minor", printFontSize: subFont, printValue: `SUB: ${sample.minor}` }),
      barcodeBlock(sample.code, barcodeX, 12.6, barcodeW, barcodeH, { contentRole: "barcode" }),
      textBlock(`Barcode: ${sample.code}`, 3.0, 27.0, 54.0, 4.0, { size: "sm", weight: "700", align: "center", contentRole: "trace_meta", printFontSize: codeFont, printValue: `Code: ${sample.code}` }),
      textBlock(`Batch: ${sample.batch_no}`, 3.0, 31.6, 54.0, 2.6, { size: "xs", weight: "700", align: "center", contentRole: "trace_meta", printFontSize: metaFont, printValue: `Batch: ${compactBatchTracePrintValue(sample.batch_no)}` }),
      textBlock(`Shipment: ${sample.shipment_no}`, 3.0, 34.4, 54.0, 2.2, { size: "xs", weight: "700", align: "center", contentRole: "trace_meta", printFontSize: metaFont, printValue: `Ship: ${sample.shipment_no}` }),
      textBlock(`Inbound: ${sample.generated_at}`, 3.0, 36.8, 54.0, 2.2, { size: "xs", weight: "400", tone: "muted", align: "center", contentRole: "trace_meta", printFontSize: metaFont, printValue: `In: ${compactTimePrintValue(sample.generated_at)}` }),
    ];
  }

  function buildWarehouseColumnBlocks(sample, preset = {}) {
    const leftW = Number(preset.leftW || 16.2);
    const barcodeX = Number(preset.barcodeX || 18.8);
    const barcodeW = Number(preset.barcodeW || 22.8);
    const rightX = Number(preset.rightX || 43.2);
    const rightW = Number(preset.rightW || 14.0);
    const leftFont = Number(preset.leftFont || 8.2);
    const minorFont = Number(preset.minorFont || 6.8);
    const rightFont = Number(preset.rightFont || 6.8);
    const traceFont = Number(preset.traceFont || 5.6);

    return [
      textBlock(`供应商：${sample.supplier}`, 2.4, 2.4, leftW, 5.2, { size: "sm", weight: "700", contentRole: "top_supplier", printFontSize: leftFont, printValue: `SUP: ${sample.supplier}` }),
      textBlock(`大类：${sample.major}`, 2.4, 8.2, leftW, 4.8, { size: "sm", weight: "700", contentRole: "top_major", printFontSize: leftFont, printValue: `CAT: ${sample.major}` }),
      textBlock(`小类：${sample.minor}`, 2.4, 13.6, leftW, 4.2, { size: "xs", weight: "400", tone: "muted", contentRole: "top_minor", printFontSize: minorFont, printValue: `SUB: ${sample.minor}` }),
      textBlock(sample.current_piece, rightX, 2.8, rightW, 4.8, { size: "sm", weight: "700", align: "center", contentRole: "piece_current", printFontSize: rightFont, printValue: `No.${sample.current_piece.replace("第", "").replace("件", "")}` }),
      textBlock(sample.total_pieces, rightX, 8.2, rightW, 4.8, { size: "sm", weight: "700", align: "center", contentRole: "piece_total", printFontSize: rightFont, printValue: `${sample.total_pieces.replace("共", "").replace("件", "")} pcs` }),
      barcodeBlock(sample.code, barcodeX, 18.6, barcodeW, 14.8, { contentRole: "barcode" }),
      textBlock(`Barcode: ${sample.code}`, 18.8, 33.4, 22.8, 4.0, { size: "xs", weight: "700", align: "center", contentRole: "trace_meta", printFontSize: 6.2, printValue: `Code: ${sample.code}` }),
      textBlock(`Batch: ${sample.batch_no}`, rightX, 14.0, rightW, 3.6, { size: "xs", weight: "700", contentRole: "trace_meta", printFontSize: traceFont, printValue: `Batch: ${compactBatchTracePrintValue(sample.batch_no)}` }),
      textBlock(`Shipment: ${sample.shipment_no}`, rightX, 18.2, rightW, 3.6, { size: "xs", weight: "700", contentRole: "trace_meta", printFontSize: traceFont, printValue: `Ship: ${sample.shipment_no}` }),
      textBlock(`Inbound: ${sample.generated_at}`, rightX, 22.4, rightW, 4.8, { size: "xs", weight: "400", tone: "muted", contentRole: "trace_meta", printFontSize: traceFont, printValue: `In: ${compactTimePrintValue(sample.generated_at)}` }),
    ];
  }

  function buildWarehouseBlocks(variant, sample) {
    if (variant.layout === "legacy") {
      return buildWarehouseLegacyBlocks(sample);
    }

    if (variant.layout === "quad") {
      const presetMap = {
        wb_balance: {
          supplierFont: 10.6,
          majorFont: 10.2,
          minorFont: 8.0,
          counterFont: 9.8,
          rightMetaFont: 6.8,
          supplierY: 0.5,
          majorY: 6.8,
          minorY: 12.9,
          supplierH: 5.6,
          majorH: 5.2,
          minorH: 4.6,
          currentY: 1.7,
          totalY: 9.0,
          pieceH: 6.2,
          supplierWeight: "700",
          majorWeight: "700",
          minorWeight: "700",
          counterWeight: "700",
          lowerRightX: 27.2,
          lowerRightW: 29.4,
          traceY: 20.4,
          traceLineHeight: 3.4,
          traceGap: 1.0,
          currentDisplayLabel: "No",
          totalDisplayLabel: "Total",
          totalDisplayUnit: "",
          totalPrintUnit: "",
        },
        wb_supplier_focus: {
          supplierFont: 13.4,
          majorFont: 12.2,
          minorFont: 10.0,
          counterFont: 12.2,
          rightMetaFont: 9.0,
          supplierY: 0.0,
          majorY: 4.8,
          minorY: 9.6,
          supplierH: 5.6,
          majorH: 5.2,
          minorH: 4.6,
          currentY: 0.0,
          totalY: 5.6,
          pieceH: 6.0,
          supplierWeight: "700",
          majorWeight: "700",
          minorWeight: "700",
          counterWeight: "700",
          topRightX: 40.8,
          lowerRightX: 29.6,
          lowerRightW: 27.0,
          traceY: 20.0,
          traceLineHeight: 3.4,
          traceGap: 0.5,
          barcodeW: 24.8,
          topDividerX: 2.4,
          topDividerY: 16.6,
          topDividerW: 54.2,
          topDividerH: 0.88,
          middleDividerX: 2.4,
          middleDividerY: 37.1,
          middleDividerW: 54.2,
          middleDividerH: 0.88,
          lowerVerticalDividerX: 28.2,
          lowerVerticalDividerY: 20.0,
          lowerVerticalDividerW: 0.88,
          lowerVerticalDividerH: 16.2,
          currentDisplayLabel: "No",
          totalDisplayLabel: "Total",
          totalDisplayUnit: "",
          totalPrintUnit: "",
        },
        wb_category_focus: {
          supplierFont: 9.8,
          majorFont: 10.8,
          minorFont: 8.0,
          counterFont: 9.6,
          rightMetaFont: 6.8,
          supplierY: 0.4,
          majorY: 6.6,
          minorY: 12.7,
          supplierH: 5.6,
          majorH: 5.4,
          minorH: 4.6,
          currentY: 1.7,
          totalY: 9.0,
          pieceH: 6.2,
          supplierWeight: "700",
          majorWeight: "700",
          minorWeight: "700",
          counterWeight: "700",
          lowerRightX: 27.2,
          lowerRightW: 29.4,
          traceY: 20.4,
          traceLineHeight: 3.4,
          traceGap: 1.0,
          currentDisplayLabel: "No",
          totalDisplayLabel: "Total",
          totalDisplayUnit: "",
          totalPrintUnit: "",
        },
        wb_right_utilized: { barcodeW: 24.0, lowerRightW: 29.2, rightMetaFont: 6.8 },
        wb_far_read: { barcodeW: 24.8, barcodeH: 15.8, supplierFont: 8.8, majorFont: 8.8, minorFont: 6.6, counterFont: 9.0 },
        wb_trace_dense: { barcodeW: 23.6, lowerRightX: 27.6, lowerRightW: 30.0, rightMetaFont: 6.4 },
        wb_piece_focus: { topLeftW: 31.8, topRightX: 36.4, topRightW: 20.8, counterFont: 9.2, supplierFont: 8.2, majorFont: 8.2 },
        wb_compact_head: { barcodeY: 19.8, barcodeH: 16.2, supplierFont: 8.2, majorFont: 8.0, minorFont: 6.0 },
      };
      return buildWarehouseQuadBlocks(sample, presetMap[variant.key] || {});
    }

    if (variant.layout === "band") {
      const presetMap = {
        wb_top_band: {},
        wb_top_band_dense: { minorFont: 6.0, rightMetaFont: 6.0, barcodeW: 24.0, rightX: 28.8, rightW: 28.2 },
        wb_top_band_counter: { supplierFont: 8.0, majorFont: 7.6, counterFont: 9.0, barcodeW: 23.8 },
        wb_top_band_clean: { barcodeW: 25.4, barcodeH: 14.6, rightW: 26.8, rightMetaFont: 6.0 },
        wb_top_band_trace: { barcodeW: 23.4, rightX: 27.8, rightW: 29.0, rightMetaFont: 6.4 },
      };
      return buildWarehouseBandBlocks(sample, presetMap[variant.key] || {});
    }

    if (variant.layout === "wide") {
      const presetMap = {
        wb_wide_bar: { barcodeW: 52.8, barcodeX: 3.6 },
        wb_wide_bar_center: { barcodeW: 50.8, barcodeX: 4.6, codeFont: 8.8 },
        wb_wide_bar_trace: { barcodeW: 51.8, barcodeX: 4.0, metaFont: 6.0, subFont: 6.0 },
      };
      return buildWarehouseWideBlocks(sample, presetMap[variant.key] || {});
    }

    if (variant.layout === "column") {
      const presetMap = {
        wb_column_focus: {},
        wb_column_clean: { leftW: 15.6, barcodeW: 23.6, rightX: 43.8, rightW: 13.2, leftFont: 6.8, rightFont: 6.2 },
        wb_column_counter: { rightFont: 7.0, barcodeW: 22.2, rightX: 42.8, rightW: 14.6 },
      };
      return buildWarehouseColumnBlocks(sample, presetMap[variant.key] || {});
    }

    return buildWarehouseQuadBlocks(sample);
  }

  function buildWarehouseCandidate(variant, index) {
    const sample = buildWarehouseSample(index);
    return {
      id: `warehouse_bale__${variant.key}`,
      group_key: "warehouse_bale",
      group_title: "仓库 Bale 60x40",
      type_label: "原始 bale 入仓标签",
      width_mm: LABEL_WIDTH_MM,
      height_mm: LABEL_HEIGHT_MM,
      candidate_no: index + 1,
      name: `仓库 Bale 60x40 ${String(index + 1).padStart(2, "0")}`,
      short_name: variant.title,
      description: variant.blurb,
      tags: variant.tags.slice(),
      field_labels: ["供应商", "大类", "小类", "第几件", "共几件", "一维码", "Barcode", "批次号", "箱单号", "入仓时间"],
      sample,
      blocks: buildWarehouseBlocks(variant, sample),
      print_category: "warehouse_bale",
    };
  }

  function buildGenericBlocksForVariant(variantKey, sample) {
    const primary = normalizeText(sample.primary);
    const secondary = normalizeText(sample.secondary);
    const tertiary = normalizeText(sample.tertiary);
    const quaternary = normalizeText(sample.quaternary);
    const code = normalizeText(sample.code);
    const metaPair = `${primary}  ${secondary}`.trim();

    switch (variantKey) {
      case "center_banner":
        return [
          textBlock(metaPair, 3.0, 2.0, 54.0, 5.4, { size: "sm", weight: "700", align: "center" }),
          barcodeBlock(code, 4.0, 8.4, 52.0, 17.2),
          textBlock(code, 3.0, 27.0, 54.0, 6.2, { size: "md", weight: "700", align: "center", contentRole: "short_code", printFontSize: 8.8 }),
          textBlock(tertiary, 3.0, 34.0, 54.0, 3.0, { size: "xs", weight: "400", tone: "muted", contentRole: "lower_meta", printFontSize: 5.2 }),
        ];
      case "two_line_header":
        return [
          textBlock(primary, 3.2, 2.2, 53.6, 4.0, { size: "sm", weight: "700", align: "left" }),
          textBlock(`${secondary} · ${tertiary}`, 3.2, 6.6, 53.6, 3.6, { size: "xs", weight: "400", tone: "muted", align: "left" }),
          barcodeBlock(code, 3.2, 11.2, 53.6, 16.4),
          textBlock(code, 3.2, 28.6, 53.6, 5.4, { size: "md", weight: "700", align: "center", contentRole: "short_code", printFontSize: 8.4 }),
          textBlock(quaternary, 3.2, 34.8, 53.6, 2.6, { size: "xs", weight: "400", tone: "muted", align: "center", contentRole: "lower_meta", printFontSize: 4.8 }),
        ];
      case "barcode_max":
        return [
          textBlock(secondary, 3.2, 2.0, 53.6, 3.8, { size: "xs", weight: "700", align: "center" }),
          barcodeBlock(code, 3.0, 6.8, 54.0, 21.0),
          textBlock(code, 3.0, 29.0, 54.0, 6.6, { size: "lg", weight: "700", align: "center", contentRole: "short_code", printFontSize: 9.8 }),
        ];
      case "top_bottom_bands":
        return [
          badgeRowBlock([primary, secondary], 3.2, 2.0, 53.6, 4.4),
          barcodeBlock(code, 3.2, 8.2, 53.6, 15.8),
          textBlock(code, 3.2, 24.8, 53.6, 5.6, { size: "md", weight: "700", align: "center", contentRole: "short_code", printFontSize: 8.8 }),
          badgeRowBlock([tertiary, quaternary], 3.2, 31.8, 53.6, 4.2),
        ];
      case "catalog_card":
        return [
          textBlock(primary, 3.4, 2.2, 53.2, 4.4, { size: "sm", weight: "700", align: "center" }),
          textBlock(secondary, 3.4, 6.8, 53.2, 3.2, { size: "xs", weight: "400", tone: "muted", align: "center" }),
          barcodeBlock(code, 4.6, 11.0, 50.8, 15.2),
          textBlock(code, 3.4, 27.2, 53.2, 5.2, { size: "md", weight: "700", align: "center", contentRole: "short_code", printFontSize: 8.4 }),
          textBlock(`${tertiary} · ${quaternary}`, 3.4, 33.2, 53.2, 3.6, { size: "xs", weight: "400", tone: "muted", align: "center", contentRole: "lower_meta", printFontSize: 4.8 }),
        ];
      case "trace_footer":
        return [
          textBlock(primary, 3.2, 2.2, 34.0, 4.2, { size: "sm", weight: "700" }),
          textBlock(secondary, 38.0, 2.2, 18.8, 4.2, { size: "xs", weight: "700", align: "right" }),
          barcodeBlock(code, 3.2, 8.2, 53.6, 14.8),
          textBlock(code, 3.2, 23.8, 53.6, 4.8, { size: "md", weight: "700", align: "center", contentRole: "short_code", printFontSize: 8.2 }),
          textBlock(tertiary, 3.2, 30.0, 53.6, 2.8, { size: "xs", weight: "400", tone: "muted", align: "left", contentRole: "lower_meta", printFontSize: 4.8 }),
          textBlock(quaternary, 3.2, 33.2, 53.6, 2.8, { size: "xs", weight: "400", tone: "muted", align: "right", contentRole: "lower_meta", printFontSize: 4.8 }),
        ];
      case "pill_header":
        return [
          badgeRowBlock([primary, secondary, tertiary], 3.0, 2.0, 54.0, 5.0),
          barcodeBlock(code, 4.0, 9.0, 52.0, 16.0),
          textBlock(code, 3.0, 26.6, 54.0, 5.6, { size: "md", weight: "700", align: "center", contentRole: "short_code", printFontSize: 8.4 }),
          textBlock(quaternary, 3.0, 33.6, 54.0, 2.8, { size: "xs", weight: "400", tone: "muted", align: "center", contentRole: "lower_meta", printFontSize: 4.8 }),
        ];
      case "stacked_right_note":
        return [
          textBlock(primary, 3.2, 2.2, 30.0, 4.6, { size: "sm", weight: "700" }),
          textBlock(secondary, 36.2, 2.2, 20.6, 3.0, { size: "xs", weight: "700", align: "right" }),
          textBlock(tertiary, 36.2, 5.6, 20.6, 3.0, { size: "xs", weight: "400", tone: "muted", align: "right" }),
          barcodeBlock(code, 3.2, 10.0, 53.6, 15.2),
          textBlock(code, 3.2, 26.8, 53.6, 5.6, { size: "md", weight: "700", align: "center", contentRole: "short_code", printFontSize: 8.4 }),
          textBlock(quaternary, 3.2, 33.2, 53.6, 3.2, { size: "xs", weight: "400", tone: "muted", align: "center", contentRole: "lower_meta", printFontSize: 4.8 }),
        ];
      case "split_top_wide_bar":
        return [
          textBlock(primary, 3.2, 2.4, 26.0, 4.8, { size: "sm", weight: "700" }),
          textBlock(secondary, 33.2, 2.4, 23.6, 4.8, { size: "sm", weight: "700", align: "right" }),
          barcodeBlock(code, 3.2, 9.2, 53.6, 17.4),
          textBlock(code, 3.2, 27.8, 53.6, 5.8, { size: "md", weight: "700", align: "center", contentRole: "short_code", printFontSize: 8.8 }),
          textBlock(tertiary, 3.2, 34.4, 53.6, 3.2, { size: "xs", weight: "400", tone: "muted", align: "center", contentRole: "lower_meta", printFontSize: 4.8 }),
        ];
      case "balanced_grid":
      default:
        return [
          textBlock(primary, 3.4, 2.4, 53.2, 4.0, { size: "sm", weight: "700", align: "left" }),
          textBlock(`${secondary} · ${tertiary}`, 3.4, 6.6, 53.2, 3.0, { size: "xs", weight: "400", tone: "muted", align: "center" }),
          barcodeBlock(code, 3.8, 10.4, 52.4, 15.6),
          textBlock(code, 3.4, 27.0, 53.2, 5.4, { size: "md", weight: "700", align: "center", contentRole: "short_code", printFontSize: 8.4 }),
          textBlock(quaternary, 3.4, 33.2, 53.2, 3.2, { size: "xs", weight: "400", tone: "muted", align: "center", contentRole: "lower_meta", printFontSize: 4.8 }),
        ];
    }
  }

  function buildGenericCandidate({ groupKey, groupTitle, fields, sample, variant, index }) {
    return {
      id: `${groupKey}__${variant.key}`,
      group_key: groupKey,
      group_title: groupTitle,
      type_label: groupTitle,
      width_mm: LABEL_WIDTH_MM,
      height_mm: LABEL_HEIGHT_MM,
      candidate_no: index + 1,
      name: `${groupTitle} ${String(index + 1).padStart(2, "0")}`,
      short_name: variant.title,
      description: variant.blurb,
      tags: variant.tags.slice(),
      field_labels: fields.slice(),
      sample: { ...sample },
      blocks: buildGenericBlocksForVariant(variant.key, sample),
      print_category: groupKey,
    };
  }

  function buildCandidatePrintPayload(candidate, options = {}) {
    return {
      printer_name: normalizeText(options.printerName) || "Deli DL-720C",
      width_mm: candidate.width_mm || LABEL_WIDTH_MM,
      height_mm: candidate.height_mm || LABEL_HEIGHT_MM,
      label_size: `${candidate.width_mm || LABEL_WIDTH_MM}x${candidate.height_mm || LABEL_HEIGHT_MM}`,
      candidate_id: candidate.id,
      blocks: (candidate.blocks || []).map((block) => ({
        type: block.type,
        value: normalizeText(block.print_value || block.value),
        values: Array.isArray(block.values) ? block.values.slice() : [],
        x_mm: Number(block.x_mm || 0),
        y_mm: Number(block.y_mm || 0),
        w_mm: Number(block.w_mm || 0),
        h_mm: Number(block.h_mm || 0),
        align: normalizeText(block.align) || "left",
        vertical_align: normalizeText(block.vertical_align) || "top",
        font_size: Number(block.print_font_size || 8),
        font_weight: normalizeText(block.weight) || "700",
      })),
    };
  }

  function buildCandidateBatchPrintPayload(group, options = {}) {
    return {
      printer_name: normalizeText(options.printerName) || "Deli DL-720C",
      width_mm: LABEL_WIDTH_MM,
      height_mm: LABEL_HEIGHT_MM,
      label_size: `${LABEL_WIDTH_MM}x${LABEL_HEIGHT_MM}`,
      candidates: (group?.candidates || []).map((candidate) => ({
        candidate_id: candidate.id,
        blocks: (candidate.blocks || []).map((block) => ({
          type: block.type,
          value: normalizeText(block.print_value || block.value),
          values: Array.isArray(block.values) ? block.values.slice() : [],
          x_mm: Number(block.x_mm || 0),
          y_mm: Number(block.y_mm || 0),
          w_mm: Number(block.w_mm || 0),
          h_mm: Number(block.h_mm || 0),
          align: normalizeText(block.align) || "left",
          vertical_align: normalizeText(block.vertical_align) || "top",
          font_size: Number(block.print_font_size || 8),
          font_weight: normalizeText(block.weight) || "700",
        })),
      })),
    };
  }

  function buildLabelCandidateGroups() {
    return GROUP_CONFIGS.map((groupConfig) => ({
      key: groupConfig.key,
      title: groupConfig.title,
      typeLabel: groupConfig.typeLabel,
      fields: groupConfig.fields.slice(),
      candidates: groupConfig.candidates.map((candidate) => ({
        ...candidate,
        field_labels: candidate.field_labels.slice(),
        tags: candidate.tags.slice(),
        sample: { ...candidate.sample },
        blocks: candidate.blocks.map((block) => ({ ...block, values: Array.isArray(block.values) ? block.values.slice() : undefined })),
      })),
    }));
  }

  function countLabelCandidates(groups) {
    return (Array.isArray(groups) ? groups : []).reduce((sum, group) => sum + (Array.isArray(group.candidates) ? group.candidates.length : 0), 0);
  }

  function loadShortlist() {
    if (typeof localStorage === "undefined") {
      return [];
    }
    try {
      const raw = JSON.parse(localStorage.getItem(SHORTLIST_STORAGE_KEY) || "[]");
      return Array.isArray(raw) ? raw.filter((value) => normalizeText(value)) : [];
    } catch (_error) {
      return [];
    }
  }

  function saveShortlist(ids) {
    if (typeof localStorage === "undefined") {
      return [];
    }
    const normalized = Array.from(new Set((Array.isArray(ids) ? ids : []).map((value) => normalizeText(value)).filter(Boolean)));
    localStorage.setItem(SHORTLIST_STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  }

  function toggleShortlistId(id) {
    const normalized = normalizeText(id);
    const shortlist = loadShortlist();
    const exists = shortlist.includes(normalized);
    return saveShortlist(exists ? shortlist.filter((value) => value !== normalized) : shortlist.concat(normalized));
  }

  return {
    LABEL_WIDTH_MM,
    LABEL_HEIGHT_MM,
    SHORTLIST_STORAGE_KEY,
    buildLabelCandidateGroups,
    buildCandidatePrintPayload,
    buildCandidateBatchPrintPayload,
    countLabelCandidates,
    mmToPercent,
    loadShortlist,
    saveShortlist,
    toggleShortlistId,
  };
});

(function (root, factory) {
  const exports = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = exports;
  }
  root.OperationsFulfillmentFlow = exports;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const TRANSFER_STATUS_ALIASES = {
    pending_approval: "submitted",
    dispatched: "shipped",
    receiving_in_progress: "partially_received",
    discrepancy_confirmed: "received",
    cancelled: "closed",
  };

  const DISPATCH_BALE_STATUS_ALIASES = {
    ready_dispatch: "packed",
    pending_acceptance: "in_transit",
    accepted: "received",
    printing_in_progress: "processing",
  };

  const TRANSFER_STATUS_LABELS = {
    draft: "草稿",
    submitted: "已提交待审核",
    approved: "已审核待仓配",
    picking: "仓库配货中",
    packed: "已打包待发运",
    shipped: "已发运待签收",
    partially_received: "门店部分签收",
    received: "门店已签收",
    closed: "已关闭",
  };

  const DISPATCH_BALE_STATUS_LABELS = {
    created: "已建包",
    packed: "已打包",
    labelled: "已贴签收码",
    in_transit: "配送中",
    received: "已签收",
    assigned: "已分配店员",
    processing: "店内处理中",
    completed: "已完成",
  };

  const RECEIPT_STATUS_LABELS = {
    not_started: "门店未签收",
    pending_receipt: "待门店签收",
    partial: "门店部分签收",
    received: "门店已签收",
  };

  function normalizeKey(value) {
    return String(value || "").trim().toLowerCase();
  }

  function normalizeText(value) {
    return String(value || "").trim();
  }

  function resolveCategoryPair(row) {
    const directMain = normalizeText(row && row.category_main);
    const directSub = normalizeText(row && row.category_sub);
    if (directMain || directSub) {
      return { categoryMain: directMain, categorySub: directSub };
    }
    const categoryName = normalizeText(row && row.category_name);
    if (!categoryName) {
      return { categoryMain: "", categorySub: "" };
    }
    const parts = categoryName.split("/");
    return {
      categoryMain: normalizeText(parts[0]),
      categorySub: normalizeText(parts[1] || parts[0]),
    };
  }

  function buildCategoryKey(categoryMain, categorySub) {
    const main = normalizeText(categoryMain);
    const sub = normalizeText(categorySub);
    return main && sub ? `${normalizeKey(main)}||${normalizeKey(sub)}` : "";
  }

  function buildLooseInventoryMap(rows) {
    const grouped = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const pair = resolveCategoryPair(row);
      const key = buildCategoryKey(pair.categoryMain, pair.categorySub);
      const qtyOnHand = Number(row && (row.qty_on_hand ?? row.qty) || 0);
      if (!key || qtyOnHand <= 0) {
        return;
      }
      const current = grouped.get(key) || {
        categoryMain: pair.categoryMain,
        categorySub: pair.categorySub,
        qtyOnHand: 0,
        rackCodes: new Set(),
        gradeSummary: [],
      };
      current.qtyOnHand += qtyOnHand;
      const rackCode = normalizeText(row && row.rack_code).toUpperCase();
      if (rackCode) {
        current.rackCodes.add(rackCode);
      }
      const grade = normalizeText(row && row.grade).toUpperCase();
      if (grade && ["P", "S"].includes(grade)) {
        current.gradeSummary.push({ grade, qty: qtyOnHand });
      }
      grouped.set(key, current);
    });
    return grouped;
  }

  function buildPreparedBaleMap(rows) {
    const grouped = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const taskType = normalizeKey(row && row.task_type);
      if (taskType === "sale") {
        return;
      }
      const pair = resolveCategoryPair(row);
      const key = buildCategoryKey(pair.categoryMain, pair.categorySub);
      const qty = Number(row && row.qty || 0);
      if (!key || qty <= 0) {
        return;
      }
      const current = grouped.get(key) || [];
      current.push({
        baleNo: normalizeText(row && row.bale_no).toUpperCase(),
        baleBarcode: normalizeText(row && (row.bale_barcode || row.scan_token)).toUpperCase(),
        qty,
        rackCode: normalizeText(row && row.rack_code).toUpperCase(),
        status: normalizeText(row && row.status),
        updatedAt: normalizeText(row && row.updated_at),
      });
      grouped.set(key, current);
    });
    grouped.forEach((rowsForKey, key) => {
      grouped.set(
        key,
        rowsForKey.sort((left, right) => {
          if (right.qty !== left.qty) {
            return right.qty - left.qty;
          }
          return left.baleNo.localeCompare(right.baleNo);
        }),
      );
    });
    return grouped;
  }

  function splitLooseQtyIntoBales(qty, baleTargetQty) {
    const targetQty = Math.max(1, Number(baleTargetQty || 0) || 200);
    const totalQty = Math.max(0, Number(qty || 0) || 0);
    const rows = [];
    let remaining = totalQty;
    let index = 1;
    while (remaining > 0) {
      const baleQty = remaining > targetQty ? targetQty : remaining;
      rows.push({
        baleIndex: index,
        qty: baleQty,
        isPartial: baleQty < targetQty,
        label: baleQty < targetQty ? `补差 bale ${index}` : `标准 bale ${index}`,
      });
      remaining -= baleQty;
      index += 1;
    }
    return rows;
  }

  function buildTransferDemandLines(rows) {
    const grouped = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const category_main = String(row && row.category_main || "").trim();
      const category_sub = String(row && row.category_sub || "").trim();
      const grade = String(row && row.grade || "").trim().toUpperCase();
      const requested_qty = Number(row && (row.requested_qty ?? row.suggested_qty) || 0);
      if (!category_main || !category_sub || requested_qty <= 0) {
        return;
      }
      const key = `${normalizeKey(category_main)}||${normalizeKey(category_sub)}||${normalizeKey(grade)}`;
      const current = grouped.get(key) || {
        category_main,
        category_sub,
        grade,
        requested_qty: 0,
        source_count: 0,
      };
      current.requested_qty += requested_qty;
      current.source_count += 1;
      grouped.set(key, current);
    });
    return Array.from(grouped.values()).sort((left, right) => {
      const leftKey = `${normalizeKey(left.category_main)}||${normalizeKey(left.category_sub)}||${normalizeKey(left.grade)}`;
      const rightKey = `${normalizeKey(right.category_main)}||${normalizeKey(right.category_sub)}||${normalizeKey(right.grade)}`;
      return leftKey.localeCompare(rightKey);
    });
  }

  function resolveTransferPlanningRows({
    transfer = {},
    cachedDemandLines = [],
    fallbackDraftRows = [],
  } = {}) {
    const transferSourceRows = Array.isArray(transfer && transfer.demand_lines) && transfer.demand_lines.length
      ? transfer.demand_lines
      : (Array.isArray(transfer && transfer.items) ? transfer.items : []);
    const transferRows = buildTransferDemandLines(transferSourceRows);
    if (transferRows.length) {
      return transferRows;
    }
    const cachedRows = buildTransferDemandLines(cachedDemandLines);
    if (cachedRows.length) {
      return cachedRows;
    }
    return buildTransferDemandLines(fallbackDraftRows);
  }

  function normalizeTransferLifecycleStatus(value) {
    const normalized = normalizeKey(value);
    return TRANSFER_STATUS_ALIASES[normalized] || normalized || "draft";
  }

  function normalizeDispatchBaleLifecycleStatus(value) {
    const normalized = normalizeKey(value);
    return DISPATCH_BALE_STATUS_ALIASES[normalized] || normalized || "created";
  }

  function getTransferLifecycleLabel(status) {
    const normalized = normalizeTransferLifecycleStatus(status);
    return TRANSFER_STATUS_LABELS[normalized] || String(status || "-").trim() || "-";
  }

  function getDispatchBaleLifecycleLabel(status) {
    const normalized = normalizeDispatchBaleLifecycleStatus(status);
    return DISPATCH_BALE_STATUS_LABELS[normalized] || String(status || "-").trim() || "-";
  }

  function getStoreReceiptStatusLabel(status) {
    const normalized = normalizeKey(status);
    return RECEIPT_STATUS_LABELS[normalized] || String(status || "-").trim() || "-";
  }

  function buildDeliveryBatch(order, dispatchBales) {
    const rows = Array.isArray(dispatchBales) ? dispatchBales.map((row) => ({
      ...row,
      lifecycle_status: normalizeDispatchBaleLifecycleStatus(row && row.status),
      lifecycle_label: getDispatchBaleLifecycleLabel(row && row.status),
    })) : [];
    const countByStatus = rows.reduce((acc, row) => {
      const key = row.lifecycle_status;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    return {
      delivery_batch_no: String(order && order.delivery_batch_no || "").trim(),
      shipment_session_no: String(order && order.shipment_session_no || "").trim(),
      bale_count: rows.length,
      created_bale_count: countByStatus.created || 0,
      packed_bale_count: countByStatus.packed || 0,
      labelled_bale_count: countByStatus.labelled || 0,
      in_transit_bale_count: countByStatus.in_transit || 0,
      received_bale_count: countByStatus.received || 0,
      assigned_bale_count: countByStatus.assigned || 0,
      processing_bale_count: countByStatus.processing || 0,
      completed_bale_count: countByStatus.completed || 0,
      dispatch_bales: rows,
    };
  }

  function normalizeTransferForOperationsFulfillment(order, dispatchBales) {
    const items = Array.isArray(order && order.items) ? order.items : [];
    const demand_lines = buildTransferDemandLines(
      Array.isArray(order && order.demand_lines) && order.demand_lines.length ? order.demand_lines : items,
    );
    const requested_qty = items.reduce((sum, row) => sum + Number(row && row.requested_qty || 0), 0);
    const lifecycle_status = normalizeTransferLifecycleStatus(order && order.status);
    const receipt_status = normalizeKey(order && order.store_receipt_status) || (
      lifecycle_status === "received" || lifecycle_status === "closed"
        ? "received"
        : lifecycle_status === "partially_received"
          ? "partial"
          : lifecycle_status === "shipped"
            ? "pending_receipt"
            : "not_started"
    );
    const delivery_batch = buildDeliveryBatch(order, dispatchBales);

    return {
      ...order,
      items,
      demand_lines,
      requested_qty,
      lifecycle_status,
      lifecycle_label: getTransferLifecycleLabel(lifecycle_status),
      store_receipt_status: receipt_status,
      store_receipt_label: getStoreReceiptStatusLabel(receipt_status),
      delivery_batch,
      dispatch_bales: delivery_batch.dispatch_bales,
    };
  }

  function summarizeOperationsFulfillment(rows) {
    const normalizedRows = Array.isArray(rows) ? rows : [];
    const countByStatus = normalizedRows.reduce((acc, row) => {
      const key = normalizeTransferLifecycleStatus(row && row.lifecycle_status || row && row.status);
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const pendingReceiptCount = normalizedRows.filter(
      (row) => normalizeKey(row && row.store_receipt_status) === "pending_receipt",
    ).length;
    const partialReceiptCount = normalizedRows.filter(
      (row) => normalizeKey(row && row.store_receipt_status) === "partial",
    ).length;
    const totalDispatchBales = normalizedRows.reduce(
      (sum, row) => sum + Number(row && row.delivery_batch && row.delivery_batch.bale_count || row && row.dispatch_bale_count || 0),
      0,
    );

    return {
      transfer_count: normalizedRows.length,
      draft_count: countByStatus.draft || 0,
      submitted_count: countByStatus.submitted || 0,
      approved_count: countByStatus.approved || 0,
      picking_count: countByStatus.picking || 0,
      packed_count: countByStatus.packed || 0,
      shipped_count: countByStatus.shipped || 0,
      partially_received_count: countByStatus.partially_received || 0,
      received_count: countByStatus.received || 0,
      closed_count: countByStatus.closed || 0,
      pending_receipt_count: pendingReceiptCount,
      partial_receipt_count: partialReceiptCount,
      total_dispatch_bales: totalDispatchBales,
    };
  }

  function buildTransferPreparationPlan({
    demandLines = [],
    preparedBales = [],
    looseRows = [],
    looseBaleTargetQty = 200,
  } = {}) {
    const normalizedDemandLines = buildTransferDemandLines(demandLines);
    const preparedMap = buildPreparedBaleMap(preparedBales);
    const looseMap = buildLooseInventoryMap(looseRows);
    const categoryCards = normalizedDemandLines.map((row) => {
      const categoryMain = normalizeText(row && row.category_main);
      const categorySub = normalizeText(row && row.category_sub);
      const requestedQty = Number(row && row.requested_qty || 0);
      const key = buildCategoryKey(categoryMain, categorySub);
      const preparedRows = [...(preparedMap.get(key) || [])];
      const selectedPreparedBales = [];
      let remainingQty = requestedQty;
      preparedRows.forEach((bale) => {
        if (bale.qty <= remainingQty) {
          selectedPreparedBales.push(bale);
          remainingQty -= bale.qty;
        }
      });
      const preparedQty = selectedPreparedBales.reduce((sum, bale) => sum + Number(bale.qty || 0), 0);
      const looseGroup = looseMap.get(key) || {
        qtyOnHand: 0,
        rackCodes: new Set(),
        gradeSummary: [],
      };
      const looseQtyNeeded = Math.min(remainingQty, Number(looseGroup.qtyOnHand || 0));
      const shortageQty = Math.max(remainingQty - looseQtyNeeded, 0);
      const plannedLooseBales = splitLooseQtyIntoBales(looseQtyNeeded, looseBaleTargetQty);
      let planMode = "none";
      if (shortageQty > 0) {
        planMode = selectedPreparedBales.length || plannedLooseBales.length ? "shortage" : "unavailable";
      } else if (selectedPreparedBales.length && plannedLooseBales.length) {
        planMode = "mixed";
      } else if (selectedPreparedBales.length) {
        planMode = "prepared_only";
      } else if (plannedLooseBales.length) {
        planMode = "loose_only";
      }
      return {
        categoryMain,
        categorySub,
        requestedQty,
        preparedQty,
        selectedPreparedBales,
        availablePreparedBaleCount: preparedRows.length,
        availablePreparedQty: preparedRows.reduce((sum, bale) => sum + Number(bale.qty || 0), 0),
        looseQtyNeeded,
        looseQtyAvailable: Number(looseGroup.qtyOnHand || 0),
        looseRackCodes: Array.from(looseGroup.rackCodes || []),
        looseGradeSummary: looseGroup.gradeSummary || [],
        plannedLooseBales,
        shortageQty,
        finalDispatchBaleCount: selectedPreparedBales.length + plannedLooseBales.length,
        planMode,
      };
    });
    const preparedPickRows = categoryCards.flatMap((row) =>
      row.selectedPreparedBales.map((bale) => ({
        categoryMain: row.categoryMain,
        categorySub: row.categorySub,
        sourceType: "prepared",
        baleNo: bale.baleNo,
        baleBarcode: bale.baleBarcode,
        qty: bale.qty,
        rackCode: bale.rackCode,
      })),
    );
    const loosePickRows = categoryCards.flatMap((row) =>
      row.plannedLooseBales.map((bale) => ({
        categoryMain: row.categoryMain,
        categorySub: row.categorySub,
        sourceType: "loose",
        baleIndex: bale.baleIndex,
        baleLabel: bale.label,
        qty: bale.qty,
        isPartial: bale.isPartial,
        rackCodes: row.looseRackCodes,
      })),
    );
    const looseQtyToPick = loosePickRows.reduce((sum, row) => sum + Number(row.qty || 0), 0);
    const finalDispatchRows = [
      ...preparedPickRows.map((row) => ({
        ...row,
        finalType: "prepared_dispatch",
        finalLabel: "现成待送店包裹 -> 最终送店 bale",
      })),
      ...(looseQtyToPick > 0 ? [{
        categoryMain: "多类目补差",
        categorySub: `${loosePickRows.length} 个类目`,
        sourceType: "loose_pick_sheet",
        finalType: "loose_pick_sheet_dispatch",
        finalLabel: "补差拣货单 -> 最终送店 bale",
        qty: looseQtyToPick,
        rackCodes: Array.from(new Set(loosePickRows.flatMap((row) => Array.isArray(row.rackCodes) ? row.rackCodes : []))),
        lines: loosePickRows,
      }] : []),
    ];
    return {
      demandLineCount: categoryCards.length,
      categoryCards,
      preparedPickRows,
      loosePickRows,
      finalDispatchRows,
      summary: {
        totalRequestedQty: categoryCards.reduce((sum, row) => sum + Number(row.requestedQty || 0), 0),
        selectedPreparedBaleCount: preparedPickRows.length,
        selectedPreparedQty: preparedPickRows.reduce((sum, row) => sum + Number(row.qty || 0), 0),
        looseQtyToPick,
        plannedLooseBaleCount: loosePickRows.length,
        totalFinalDispatchBaleCount: finalDispatchRows.length,
        shortageCategoryCount: categoryCards.filter((row) => Number(row.shortageQty || 0) > 0).length,
        shortageQty: categoryCards.reduce((sum, row) => sum + Number(row.shortageQty || 0), 0),
      },
    };
  }

  function interpretTransferExecutionError(message = "") {
    const raw = normalizeText(message);
    if (!raw) {
      return null;
    }
    const stockShortageMatch = raw.match(
      /^Insufficient warehouse stock for\s+(.+?):\s+requested\s+([0-9]+(?:\.[0-9]+)?),\s+available\s+([0-9]+(?:\.[0-9]+)?)$/i,
    );
    if (stockShortageMatch) {
      return {
        type: "warehouse_shortage",
        subject: normalizeText(stockShortageMatch[1]),
        requestedQty: Number(stockShortageMatch[2] || 0),
        availableQty: Number(stockShortageMatch[3] || 0),
        heading: "当前这张调拨单还不能正式锁库存",
        detail: "现在页面上看到的待送店包裹和散货补差，是备货规划视图；后端正式锁库存暂时还只认已入正式仓可发库存。",
      };
    }
    return {
      type: "generic",
      message: raw,
    };
  }

  function buildTransferExecutionTaskPrefix(transferNo = "") {
    const compact = normalizeText(transferNo).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    return compact || "TRANSFER";
  }

  function normalizeLoosePackageLimitQty(value = 200) {
    const parsed = Number(value || 0);
    if ([50, 100, 200].includes(parsed)) {
      return parsed;
    }
    return 200;
  }

  function buildShortLpkBarcodeValue(transferNo = "", fallback = "") {
    const normalizedTransfer = normalizeText(transferNo).toUpperCase();
    const match = normalizedTransfer.match(/^TO-?(\d{4})(\d{2})(\d{2})-?(\d{3})$/);
    if (match) {
      const [, year, month, day, serial] = match;
      return `LPK${year.slice(2)}${month}${day}${serial}`;
    }
    const fallbackCompact = normalizeText(fallback).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    if (/^LPK[A-Z0-9]+$/.test(fallbackCompact)) {
      return fallbackCompact.slice(0, 18);
    }
    return "";
  }

  function buildLpkMachineCode(transferNo = "") {
    const normalizedTransfer = normalizeText(transferNo).toUpperCase();
    const match = normalizedTransfer.match(/^TO-?(\d{4})(\d{2})(\d{2})-?(\d{3})$/);
    if (!match) {
      return "";
    }
    const [, year, month, day, serial] = match;
    return `3${year.slice(2)}${month}${day}${serial}`;
  }

  function buildLoosePackingTasks({
    transferNo = "",
    plan = {},
    now = "",
    packageLimitQty = 200,
  } = {}) {
    const prefix = buildTransferExecutionTaskPrefix(transferNo);
    const looseRows = Array.isArray(plan?.loosePickRows) ? plan.loosePickRows : [];
    const lines = looseRows
      .map((row, index) => ({
        lineNo: index + 1,
        categoryMain: normalizeText(row?.categoryMain),
        categorySub: normalizeText(row?.categorySub),
        baleLabel: normalizeText(row?.baleLabel) || `补差 bale ${index + 1}`,
        qty: Number(row?.qty || 0),
        rackCodes: Array.isArray(row?.rackCodes) ? row.rackCodes.map((item) => normalizeText(item).toUpperCase()).filter(Boolean) : [],
        isPartial: Boolean(row?.isPartial),
      }))
      .filter((row) => row.qty > 0);
    const totalQty = lines.reduce((sum, row) => sum + Number(row.qty || 0), 0);
    if (!totalQty) {
      return [];
    }
    const normalizedPackageLimitQty = normalizeLoosePackageLimitQty(packageLimitQty);
    const taskNo = `LPK-${prefix}-PICK`;
    const shortBarcodeValue = buildShortLpkBarcodeValue(transferNo, taskNo);
    return [{
      taskNo,
      taskBarcode: taskNo.replace(/[^A-Za-z0-9]/g, "").toUpperCase(),
      printableBarcode: shortBarcodeValue || "",
      taskType: "loose_pick_sheet",
      transferNo: normalizeText(transferNo).toUpperCase(),
      categoryMain: "多类目补差",
      categorySub: `${lines.length} 个类目`,
      baleLabel: `补差拣货单 · 小于 ${normalizedPackageLimitQty} 件 / 包`,
      qty: totalQty,
      totalQty,
      packageLimitQty: normalizedPackageLimitQty,
      plannedPackageCount: Math.max(1, Math.ceil(totalQty / normalizedPackageLimitQty)),
      rackCodes: Array.from(new Set(lines.flatMap((row) => row.rackCodes || []))),
      lines,
      isPartial: totalQty < normalizedPackageLimitQty,
      status: "pending_pick",
      createdAt: normalizeText(now) || new Date().toISOString(),
    }];
  }

  function formatLoosePickSheetPackingLines(lines = []) {
    if (!Array.isArray(lines)) {
      return [];
    }
    return lines
      .map((line) => {
        const categoryMain = normalizeText(line?.categoryMain);
        const categorySub = normalizeText(line?.categorySub);
        const qty = Number(line?.qty || 0);
        if (!categoryMain && !categorySub && qty <= 0) {
          return "";
        }
        return `${categoryMain || "-"} / ${categorySub || "-"} · ${Math.max(0, qty)} 件`;
      })
      .filter(Boolean);
  }

  function buildLoosePickSheetLabel({
    task = {},
    transfer = {},
    storeName = "",
    categoryLabel = "服装",
  } = {}) {
    const barcodeValue = normalizeText(task?.printableBarcode || task?.taskBarcode || task?.taskNo).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    const resolvedStoreName = normalizeText(storeName)
      || normalizeText(transfer?.to_store_name)
      || normalizeText(transfer?.to_store_code)
      || "STORE";
    const pickQty = Number(task?.totalQty || task?.qty || 0);
    const packingLines = formatLoosePickSheetPackingLines(task?.lines);
    return {
      templateCode: "store_loose_pick_60x40",
      templateName: "门店补差拣货单 60x40",
      templateScope: "warehouseout_bale",
      paperPreset: "60x40",
      widthMm: 60,
      heightMm: 40,
      barcodeType: "Code128",
      barcodeValue,
      storeName: resolvedStoreName,
      categoryLabel: normalizeText(categoryLabel) || "服装",
      pickQty,
      transferNo: normalizeText(task?.transferNo || transfer?.transfer_no).toUpperCase(),
      taskNo: normalizeText(task?.taskNo).toUpperCase(),
      packageLimitQty: normalizeLoosePackageLimitQty(task?.packageLimitQty),
      packingLines,
      packingList: packingLines.join("\n"),
    };
  }

  function buildLoosePickSheetDirectPrintPayload({
    task = {},
    transfer = {},
    storeName = "",
    categoryLabel = "服装",
    printerName = "",
  } = {}) {
    const label = buildLoosePickSheetLabel({ task, transfer, storeName, categoryLabel });
    const machineCode = buildLpkMachineCode(label.transferNo || transfer?.transfer_no || task?.transferNo);
    const barcodeValue = normalizeText(machineCode || label.barcodeValue || label.taskNo).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    const pickQty = Number(label.pickQty || 0);
    const packageLimitQty = normalizeLoosePackageLimitQty(label.packageLimitQty);
    const statusText = `${label.storeName || "STORE"} - ${label.categoryLabel || "服装"}`;
    return {
      printer_name: normalizeText(printerName),
      template_code: "store_loose_pick_60x40",
      template_scope: "warehouseout_bale",
      copies: 1,
      display_code: normalizeText(label.barcodeValue || label.taskNo).toUpperCase(),
      machine_code: machineCode,
      barcode_value: barcodeValue,
      scan_token: barcodeValue,
      bale_barcode: normalizeText(label.barcodeValue || label.taskNo).toUpperCase(),
      legacy_bale_barcode: "",
      human_readable: barcodeValue,
      supplier_name: "STORE REPLENISHMENT",
      category_main: "PICK SHEET",
      category_sub: "LOOSE GAP",
      category_display: `${label.categoryLabel || "服装"} / ${pickQty} 件`,
      package_position_label: `拣货 ${pickQty} 件`,
      serial_no: 1,
      total_packages: Math.max(1, Number(task?.plannedPackageCount || 1)),
      shipment_no: label.transferNo,
      parcel_batch_no: label.taskNo,
      unload_date: normalizeText(task?.createdAt || task?.updatedAt),
      store_name: label.storeName,
      transfer_order_no: label.transferNo,
      bale_piece_summary: "补差拣货单",
      total_quantity: `${pickQty} pcs`,
      packing_list: label.packingList || "",
      dispatch_bale_no: barcodeValue,
      outbound_time: "",
      status: statusText,
      cat: "PICK SHEET",
      sub: "LOOSE GAP",
      grade: `PKG<${packageLimitQty}`,
      qty: String(Math.max(0, pickQty)),
      weight: "",
      code: normalizeText(label.barcodeValue || label.taskNo).toUpperCase(),
    };
  }

  function buildTransferDispatchRows({
    plan = {},
    looseTasks = [],
  } = {}) {
    const preparedRows = Array.isArray(plan?.preparedPickRows) ? plan.preparedPickRows : [];
    const looseRows = Array.isArray(plan?.loosePickRows) ? plan.loosePickRows : [];
    const dispatchRows = preparedRows.map((row) => ({
      ...row,
      finalType: "prepared_dispatch",
      finalLabel: "现成待送店包裹 -> 最终送店 bale",
    }));
    const looseQty = looseRows.reduce((sum, row) => sum + Number(row?.qty || 0), 0);
    if (looseQty > 0) {
      const looseTask = (Array.isArray(looseTasks) ? looseTasks : []).find((task) =>
        normalizeText(task?.taskType).toLowerCase() === "loose_pick_sheet"
        || normalizeText(task?.taskNo).toUpperCase().includes("-PICK")
      ) || {};
      const taskBarcode = normalizeText(looseTask?.taskBarcode || looseTask?.taskNo).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      dispatchRows.push({
        categoryMain: "多类目补差",
        categorySub: `${looseRows.length} 个类目`,
        sourceType: "loose_pick_sheet",
        finalType: "loose_pick_sheet_dispatch",
        finalLabel: "补差拣货单 -> 最终送店 bale",
        baleNo: normalizeText(looseTask?.taskNo).toUpperCase(),
        baleBarcode: taskBarcode,
        qty: Number(looseTask?.totalQty || looseTask?.qty || looseQty),
        rackCodes: Array.from(new Set(looseRows.flatMap((row) => Array.isArray(row?.rackCodes) ? row.rackCodes : []))),
        taskNo: normalizeText(looseTask?.taskNo).toUpperCase(),
        taskBarcode,
        packageLimitQty: normalizeLoosePackageLimitQty(looseTask?.packageLimitQty),
        plannedPackageCount: Number(looseTask?.plannedPackageCount || 1),
        lines: Array.isArray(looseTask?.lines) && looseTask.lines.length ? looseTask.lines : looseRows,
      });
    }
    return dispatchRows;
  }

  function buildTransferDispatchResultDisplayRows({
    result = {},
    plan = {},
    looseTasks = [],
  } = {}) {
    const resultRows = Array.isArray(result?.store_dispatch_bales) ? result.store_dispatch_bales : [];
    const dispatchRows = buildTransferDispatchRows({ plan, looseTasks });
    if (!dispatchRows.length) {
      return resultRows;
    }
    const fallbackStoreCode = normalizeText(
      result?.to_store_code
      || result?.store_code
      || resultRows.find((row) => normalizeText(row?.store_code))?.store_code,
    ).toUpperCase();
    const looseRows = dispatchRows.filter((row) => row?.finalType === "loose_pick_sheet_dispatch");
    const preparedRows = dispatchRows.filter((row) => row?.finalType !== "loose_pick_sheet_dispatch");
    const usedResultRowIndexes = new Set();
    const pickResultRow = (row = {}, fallbackIndex = 0) => {
      const categoryLabel = [row?.categoryMain, row?.categorySub].map(normalizeText).filter(Boolean).join(" / ").toLowerCase();
      const matchedIndex = resultRows.findIndex((resultRow, index) => {
        if (usedResultRowIndexes.has(index)) {
          return false;
        }
        const resultLabel = normalizeText(resultRow?.category_summary || resultRow?.category_name).toLowerCase();
        return categoryLabel && resultLabel === categoryLabel;
      });
      const index = matchedIndex >= 0
        ? matchedIndex
        : resultRows.findIndex((_, resultIndex) => !usedResultRowIndexes.has(resultIndex) && resultIndex >= fallbackIndex);
      if (index >= 0) {
        usedResultRowIndexes.add(index);
        return resultRows[index] || {};
      }
      return {};
    };
    const displayRows = preparedRows.map((row, index) => {
      const resultRow = pickResultRow(row, index);
      const sourceBaleNo = normalizeText(row?.baleBarcode || row?.baleNo).toUpperCase();
      return {
        bale_no: normalizeText(resultRow?.bale_no || row?.dispatch_bale_no || row?.final_bale_no || `SDB-${index + 1}`).toUpperCase(),
        task_no: normalizeText(row?.taskNo).toUpperCase(),
        shipment_no: normalizeText(row?.shipmentNo || result?.transfer_no).toUpperCase(),
        token_group_no: 0,
        category_name: normalizeText(resultRow?.category_name || resultRow?.category_summary)
          || [row?.categoryMain, row?.categorySub].map(normalizeText).filter(Boolean).join(" / ")
          || "现成待送店包裹",
        category_summary: normalizeText(resultRow?.category_summary || resultRow?.category_name)
          || [row?.categoryMain, row?.categorySub].map(normalizeText).filter(Boolean).join(" / ")
          || "现成待送店包裹",
        grade: normalizeText(resultRow?.grade || row?.grade) || "mixed",
        item_count: Number(resultRow?.item_count || row?.qty || 0),
        status: normalizeText(resultRow?.status) || "ready_dispatch",
        store_code: normalizeText(resultRow?.store_code).toUpperCase() || fallbackStoreCode,
        source_type: "prepared_store_dispatch_bale",
        source_label: "现成待送店包裹",
        source_bales: [sourceBaleNo].filter(Boolean),
        rack_codes: Array.isArray(row?.rackCodes) ? row.rackCodes.map((item) => normalizeText(item).toUpperCase()).filter(Boolean) : [],
      };
    });

    looseRows.forEach((row, index) => {
      const sourceBarcode = normalizeText(row?.taskBarcode || row?.baleBarcode || row?.taskNo || row?.baleNo)
        .replace(/[^A-Za-z0-9]/g, "")
        .toUpperCase();
      const sourceTaskNo = normalizeText(row?.taskNo || row?.baleNo || sourceBarcode).toUpperCase();
      const lineCount = Array.isArray(row?.lines) && row.lines.length ? row.lines.length : 1;
      const collapsedBackendBales = resultRows
        .filter((resultRow) => {
          const summary = normalizeText(resultRow?.category_summary || resultRow?.category_name).toLowerCase();
          return Array.isArray(row?.lines) && row.lines.some((line) => {
            const label = [line?.categoryMain, line?.categorySub].map(normalizeText).filter(Boolean).join(" / ").toLowerCase();
            return label && summary === label;
          });
        })
        .map((resultRow) => normalizeText(resultRow?.bale_no).toUpperCase())
        .filter(Boolean);
      const resultRow = collapsedBackendBales.length === 1
        ? resultRows.find((candidate, candidateIndex) => {
          if (usedResultRowIndexes.has(candidateIndex)) {
            return false;
          }
          const resultBaleNo = normalizeText(candidate?.bale_no).toUpperCase();
          return resultBaleNo && collapsedBackendBales.includes(resultBaleNo);
        }) || {}
        : {};
      const resultRowIndex = resultRows.indexOf(resultRow);
      if (resultRowIndex >= 0) {
        usedResultRowIndexes.add(resultRowIndex);
      }
      displayRows.push({
        bale_no: normalizeText(resultRow?.bale_no || sourceTaskNo || sourceBarcode || `LOOSE-PICK-${index + 1}`).toUpperCase(),
        task_no: sourceTaskNo,
        shipment_no: normalizeText(result?.transfer_no || row?.transferNo).toUpperCase(),
        token_group_no: 0,
        category_name: "多类目补差",
        category_summary: `多类目补差 · ${lineCount} 个类目`,
        grade: `PKG<${normalizeLoosePackageLimitQty(row?.packageLimitQty)}`,
        item_count: Number(row?.qty || 0),
        status: "ready_dispatch",
        store_code: normalizeText(resultRow?.store_code).toUpperCase() || fallbackStoreCode,
        source_type: "loose_pick_sheet",
        source_label: "补差拣货单",
        source_bales: [sourceBarcode].filter(Boolean),
        collapsed_bale_nos: collapsedBackendBales,
        rack_codes: Array.isArray(row?.rackCodes) ? row.rackCodes.map((item) => normalizeText(item).toUpperCase()).filter(Boolean) : [],
        lines: Array.isArray(row?.lines) ? row.lines : [],
      });
    });
    const packageCount = displayRows.length;
    return displayRows.map((row, index) => ({
      ...row,
      package_index: index + 1,
      package_count: packageCount,
    }));
  }

  function getPreparedPickCanonicalKey(row = {}) {
    return normalizeText(row?.baleBarcode || row?.baleNo).toUpperCase();
  }

  function registerPreparedBaleScan({
    plan = {},
    foundPreparedBarcodes = [],
    barcode = "",
  } = {}) {
    const normalizedBarcode = normalizeText(barcode).toUpperCase();
    if (!normalizedBarcode) {
      return {
        ok: false,
        error: "请先扫描或录入现成待送店包裹 barcode。",
        foundPreparedBarcodes: Array.isArray(foundPreparedBarcodes) ? foundPreparedBarcodes : [],
      };
    }
    const preparedRows = Array.isArray(plan?.preparedPickRows) ? plan.preparedPickRows : [];
    const matchedRow = preparedRows.find((row) => {
      const barcodeKey = normalizeText(row?.baleBarcode).toUpperCase();
      const baleNoKey = normalizeText(row?.baleNo).toUpperCase();
      return normalizedBarcode === barcodeKey || normalizedBarcode === baleNoKey;
    });
    if (!matchedRow) {
      return {
        ok: false,
        error: "这包不在当前调拨单的现成待送店包裹清单里。",
        foundPreparedBarcodes: Array.isArray(foundPreparedBarcodes) ? foundPreparedBarcodes : [],
      };
    }
    const canonicalKey = getPreparedPickCanonicalKey(matchedRow);
    const current = new Set((Array.isArray(foundPreparedBarcodes) ? foundPreparedBarcodes : []).map((item) => normalizeText(item).toUpperCase()).filter(Boolean));
    const duplicate = current.has(canonicalKey);
    if (!duplicate) {
      current.add(canonicalKey);
    }
    return {
      ok: true,
      duplicate,
      matchedRow,
      foundPreparedBarcodes: Array.from(current),
    };
  }

  function updateLoosePackingTaskStatus({
    tasks = [],
    taskNo = "",
    nextStatus = "",
  } = {}) {
    const normalizedTaskNo = normalizeText(taskNo).toUpperCase();
    const normalizedStatus = normalizeText(nextStatus).toLowerCase();
    return (Array.isArray(tasks) ? tasks : []).map((row) => {
      if (normalizeText(row?.taskNo).toUpperCase() !== normalizedTaskNo) {
        return row;
      }
      const nextRow = {
        ...row,
        status: normalizedStatus || "pending_pick",
      };
      if (normalizedStatus === "picking") {
        nextRow.startedAt = new Date().toISOString();
      }
      if (normalizedStatus === "packed") {
        nextRow.completedAt = new Date().toISOString();
      }
      return nextRow;
    });
  }

  function summarizeTransferExecutionReadiness({
    plan = {},
    foundPreparedBarcodes = [],
    looseTasks = [],
  } = {}) {
    const preparedRows = Array.isArray(plan?.preparedPickRows) ? plan.preparedPickRows : [];
    const looseRows = Array.isArray(plan?.loosePickRows) ? plan.loosePickRows : [];
    const foundSet = new Set((Array.isArray(foundPreparedBarcodes) ? foundPreparedBarcodes : []).map((item) => normalizeText(item).toUpperCase()).filter(Boolean));
    const requiredPreparedKeys = preparedRows.map((row) => getPreparedPickCanonicalKey(row)).filter(Boolean);
    const foundPreparedCount = requiredPreparedKeys.filter((key) => foundSet.has(key)).length;
    const requiredLooseTasks = Array.isArray(looseTasks) ? looseTasks : [];
    const requiredLooseTaskCount = looseRows.length ? (requiredLooseTasks.length || 1) : 0;
    const completedLooseTaskCount = requiredLooseTasks.filter((row) => normalizeText(row?.status).toLowerCase() === "packed").length;
    return {
      requiredPreparedCount: preparedRows.length,
      foundPreparedCount,
      pendingPreparedCount: Math.max(preparedRows.length - foundPreparedCount, 0),
      requiredLooseTaskCount,
      completedLooseTaskCount,
      pendingLooseTaskCount: Math.max(requiredLooseTaskCount - completedLooseTaskCount, 0),
      canPrint: foundPreparedCount >= preparedRows.length && completedLooseTaskCount >= requiredLooseTaskCount,
    };
  }

  return {
    buildTransferPreparationPlan,
    buildLoosePackingTasks,
    buildLoosePickSheetLabel,
    buildLoosePickSheetDirectPrintPayload,
    buildTransferDispatchRows,
    buildTransferDispatchResultDisplayRows,
    buildDeliveryBatch,
    buildTransferDemandLines,
    resolveTransferPlanningRows,
    interpretTransferExecutionError,
    registerPreparedBaleScan,
    summarizeTransferExecutionReadiness,
    updateLoosePackingTaskStatus,
    getDispatchBaleLifecycleLabel,
    getStoreReceiptStatusLabel,
    getTransferLifecycleLabel,
    normalizeDispatchBaleLifecycleStatus,
    normalizeTransferForOperationsFulfillment,
    normalizeTransferLifecycleStatus,
    summarizeOperationsFulfillment,
  };
});

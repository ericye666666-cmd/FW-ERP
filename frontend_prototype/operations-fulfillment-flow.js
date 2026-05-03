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
    const directMain = normalizeText(row && (row.category_main || row.categoryMain));
    const directSub = normalizeText(row && (row.category_sub || row.categorySub));
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

  function normalizeIdentity(value) {
    return normalizeText(value).replace(/\s+/g, "").toUpperCase();
  }

  function normalizeGrade(value) {
    const normalized = normalizeText(value).toUpperCase();
    if (["P", "S"].includes(normalized)) {
      return normalized;
    }
    const match = normalized.match(/\b(P|S)\b/);
    return match ? match[1] : "";
  }

  function getPreparedBaleCanonicalBarcode(row = {}) {
    const candidates = [
      row.baleBarcode,
      row.bale_barcode,
      row.displayCode,
      row.display_code,
      row.scanToken,
      row.scan_token,
      row.baleNo,
      row.bale_no,
    ].map(normalizeIdentity).filter(Boolean);
    return candidates.find((value) => value.startsWith("SDB")) || candidates[0] || "";
  }

  function normalizePreparedBale(row = {}) {
    const pair = resolveCategoryPair(row);
    const baleNo = normalizeIdentity(row && (row.baleNo || row.bale_no));
    const displayCode = getPreparedBaleCanonicalBarcode(row);
    const machineCode = normalizeIdentity(row && (row.machineCode || row.machine_code || row.barcodeValue || row.barcode_value));
    const barcodeValue = normalizeIdentity(row && (row.barcodeValue || row.barcode_value || row.machineCode || row.machine_code));
    const scanToken = normalizeIdentity(row && (row.scanToken || row.scan_token));
    const humanReadable = normalizeIdentity(row && (row.humanReadable || row.human_readable));
    const grade = normalizeGrade(row && (row.grade || row.gradeSummary || row.grade_summary || row.ratio_label || row.ratioSummary || row.ratio_summary));
    const qty = Number(row && (row.qty ?? row.item_count ?? row.pieces_per_bale ?? row.package_qty) || 0);
    return {
      ...row,
      baleNo,
      baleBarcode: displayCode,
      displayCode,
      scanToken,
      machineCode,
      barcodeValue,
      humanReadable,
      categoryMain: pair.categoryMain,
      categorySub: pair.categorySub,
      grade,
      qty,
      rackCode: normalizeText(row && (row.rackCode || row.rack_code)).toUpperCase(),
      status: normalizeText(row && row.status).toLowerCase(),
      taskType: normalizeText(row && (row.taskType || row.task_type)).toLowerCase(),
      updatedAt: normalizeText(row && (row.updatedAt || row.updated_at)),
      identityValues: [
        baleNo,
        displayCode,
        scanToken,
        machineCode,
        barcodeValue,
        humanReadable,
        normalizeIdentity(row && row.display_code),
        normalizeIdentity(row && row.bale_barcode),
        normalizeIdentity(row && row.scan_token),
      ].filter(Boolean),
    };
  }

  function isPreparedBaleAvailableForDispatch(row = {}) {
    const taskType = normalizeKey(row.taskType || row.task_type);
    if (taskType && !["store_dispatch", "dispatch", "store_prep_bale"].includes(taskType)) {
      return false;
    }
    const status = normalizeKey(row.status);
    return !status || ["waiting_store_dispatch", "ready_dispatch", "completed"].includes(status);
  }

  function getPreparedBaleOccupancyReference(row = {}, currentTransferNo = "") {
    const current = normalizeIdentity(currentTransferNo);
    const fields = [
      row.occupied_by_transfer_no,
      row.occupiedByTransferNo,
      row.bound_transfer_no,
      row.transfer_no,
      row.store_delivery_execution_order_no,
      row.sdo_no,
      row.occupied_by_sdo_no,
      row.official_delivery_barcode,
      row.delivery_batch_no,
    ];
    for (const value of fields) {
      const normalized = normalizeIdentity(value);
      if (normalized && normalized !== current) {
        return normalized;
      }
    }
    const status = normalizeKey(row.status);
    if (["in_transit", "shipped", "received", "assigned", "sold", "closed", "cancelled"].includes(status)) {
      return status;
    }
    return "";
  }

  function doesPreparedBaleMatchDemand(row = {}, demand = {}) {
    const candidate = normalizePreparedBale(row);
    const categoryMatches = buildCategoryKey(candidate.categoryMain, candidate.categorySub)
      === buildCategoryKey(demand.category_main || demand.categoryMain, demand.category_sub || demand.categorySub);
    if (!categoryMatches) {
      return false;
    }
    const requiredGrade = normalizeGrade(demand.grade || demand.grade_summary || demand.gradeSummary);
    return !requiredGrade || candidate.grade === requiredGrade;
  }

  function getPreparedDemandQtySpecs(plan = {}, demand = {}) {
    const directSpecs = [
      demand.package_qty,
      demand.packageQty,
      demand.pieces_per_bale,
      demand.piecesPerBale,
    ].map((value) => Number(value || 0)).filter((value) => value > 0);
    const preparedSpecs = (Array.isArray(plan?.preparedPickRows) ? plan.preparedPickRows : [])
      .filter((row) => doesPreparedBaleMatchDemand(row, demand))
      .map((row) => Number(row?.qty || 0))
      .filter((value) => value > 0);
    return new Set([...directSpecs, ...preparedSpecs]);
  }

  function doesPreparedBaleMatchQuantitySpec(plan = {}, candidate = {}, demand = {}) {
    const specs = getPreparedDemandQtySpecs(plan, demand);
    if (!specs.size) {
      return true;
    }
    return specs.has(Number(candidate?.qty || 0));
  }

  function findPreparedBaleByBarcode(rows = [], barcode = "") {
    const normalizedBarcode = normalizeIdentity(barcode);
    if (!normalizedBarcode) {
      return null;
    }
    return (Array.isArray(rows) ? rows : [])
      .map((row) => normalizePreparedBale(row))
      .find((row) => row.identityValues.includes(normalizedBarcode)) || null;
  }

  function getPreparedDemandRows(plan = {}) {
    if (Array.isArray(plan?.demandLines) && plan.demandLines.length) {
      return plan.demandLines;
    }
    return Array.isArray(plan?.categoryCards) ? plan.categoryCards.map((row) => ({
      category_main: row.categoryMain,
      category_sub: row.categorySub,
      grade: row.grade,
      requested_qty: row.requestedQty,
    })) : [];
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
      const candidate = normalizePreparedBale(row);
      if (!isPreparedBaleAvailableForDispatch(candidate)) {
        return;
      }
      const key = buildCategoryKey(candidate.categoryMain, candidate.categorySub);
      if (!key || candidate.qty <= 0) {
        return;
      }
      const current = grouped.get(key) || [];
      current.push({
        ...candidate,
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

  function getReplenishmentStockStatus({
    requestedQty = 0,
    availableQty = 0,
    pickableQty = 0,
    shortageQty = 0,
  } = {}) {
    const requested = Math.max(0, Number(requestedQty || 0));
    const available = Math.max(0, Number(availableQty || 0));
    const pickable = Math.max(0, Number(pickableQty || 0));
    const shortage = Math.max(0, Number(shortageQty || 0));
    if (requested <= 0) {
      return { key: "pending", badgeLabel: "待处理", suggestedAction: "待处理" };
    }
    if (available <= 0 || pickable <= 0) {
      return { key: "out_of_stock", badgeLabel: "库存不足", suggestedAction: "等待补货" };
    }
    if (shortage > 0) {
      return { key: "partial_pick", badgeLabel: "部分拣货", suggestedAction: "部分拣货" };
    }
    return { key: "full_pick", badgeLabel: "可全拣", suggestedAction: "可全拣" };
  }

  function getLoosePickLineStatus({
    requestedQty = 0,
    pickedQty = 0,
    shortageQty = 0,
  } = {}) {
    const requested = Math.max(0, Number(requestedQty || 0));
    const picked = Math.max(0, Number(pickedQty || 0));
    const shortage = Math.max(0, Number(shortageQty || 0));
    if (requested <= 0) {
      return { key: "pending", label: "待处理" };
    }
    if (picked > 0 && shortage > 0) {
      return { key: "partial_pick", label: "部分拣货" };
    }
    if (shortage > 0) {
      return { key: "out_of_stock", label: "库存不足" };
    }
    if (picked > 0) {
      return { key: "picked", label: "已拣" };
    }
    return { key: "pending", label: "待处理" };
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
        requested_qty: 0,
        source_count: 0,
      };
      if (grade) {
        current.grade = grade;
      }
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
      const grade = normalizeGrade(row && row.grade);
      const requestedQty = Number(row && row.requested_qty || 0);
      const key = buildCategoryKey(categoryMain, categorySub);
      const preparedRows = [...(preparedMap.get(key) || [])].filter((bale) => !grade || normalizeGrade(bale.grade) === grade);
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
      const looseRequiredQty = Math.max(remainingQty, 0);
      const availableQty = Math.max(0, preparedQty + Number(looseGroup.qtyOnHand || 0));
      const pickableQty = Math.min(requestedQty, availableQty);
      const looseQtyNeeded = Math.min(remainingQty, Number(looseGroup.qtyOnHand || 0));
      const shortageQty = Math.max(requestedQty - pickableQty, 0);
      const plannedLooseBales = splitLooseQtyIntoBales(looseQtyNeeded, looseBaleTargetQty);
      const stockStatus = getReplenishmentStockStatus({
        requestedQty,
        availableQty,
        pickableQty,
        shortageQty,
      });
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
        grade,
        requestedQty,
        requested_qty: requestedQty,
        preparedQty,
        selectedPreparedBales,
        availablePreparedBaleCount: preparedRows.length,
        availablePreparedQty: preparedRows.reduce((sum, bale) => sum + Number(bale.qty || 0), 0),
        availableQty,
        available_qty: availableQty,
        pickableQty,
        pickable_qty: pickableQty,
        looseQtyNeeded,
        looseRequiredQty,
        looseQtyAvailable: Number(looseGroup.qtyOnHand || 0),
        looseRackCodes: Array.from(looseGroup.rackCodes || []),
        looseGradeSummary: looseGroup.gradeSummary || [],
        plannedLooseBales,
        shortageQty,
        shortage_qty: shortageQty,
        stockStatus: stockStatus.key,
        stockBadgeLabel: stockStatus.badgeLabel,
        suggestedAction: stockStatus.suggestedAction,
        finalDispatchBaleCount: selectedPreparedBales.length + plannedLooseBales.length,
        planMode,
      };
    });
    const preparedPickRows = categoryCards.flatMap((row) =>
      row.selectedPreparedBales.map((bale) => ({
        categoryMain: row.categoryMain,
        categorySub: row.categorySub,
        grade: row.grade,
        sourceType: "prepared",
        baleNo: bale.baleNo,
        baleBarcode: bale.baleBarcode,
        scanToken: bale.scanToken,
        displayCode: bale.displayCode,
        machineCode: bale.machineCode,
        barcodeValue: bale.barcodeValue,
        humanReadable: bale.humanReadable,
        qty: bale.qty,
        rackCode: bale.rackCode,
        status: bale.status,
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
        requestedQty: row.looseRequiredQty,
        requested_qty: row.looseRequiredQty,
        availableQty: row.looseQtyAvailable,
        available_qty: row.looseQtyAvailable,
        pickedQty: bale.qty,
        picked_qty: bale.qty,
        shortageQty: bale.baleIndex === 1 ? row.shortageQty : 0,
        shortage_qty: bale.baleIndex === 1 ? row.shortageQty : 0,
        status: getLoosePickLineStatus({
          requestedQty: row.looseRequiredQty,
          pickedQty: bale.qty,
          shortageQty: bale.baleIndex === 1 ? row.shortageQty : 0,
        }).key,
        statusLabel: getLoosePickLineStatus({
          requestedQty: row.looseRequiredQty,
          pickedQty: bale.qty,
          shortageQty: bale.baleIndex === 1 ? row.shortageQty : 0,
        }).label,
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
      demandLines: normalizedDemandLines,
      availablePreparedBales: (Array.isArray(preparedBales) ? preparedBales : [])
        .map((row) => normalizePreparedBale(row))
        .filter((row) => row.qty > 0 && isPreparedBaleAvailableForDispatch(row)),
      matchingAvailablePreparedBales: (Array.isArray(preparedBales) ? preparedBales : [])
        .map((row) => normalizePreparedBale(row))
        .filter((candidate) =>
          candidate.qty > 0
          && isPreparedBaleAvailableForDispatch(candidate)
          && normalizedDemandLines.some((line) =>
            doesPreparedBaleMatchDemand(candidate, line)
            && doesPreparedBaleMatchQuantitySpec({ preparedPickRows }, candidate, line)
          )
        ),
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
    const lineMap = new Map();
    looseRows.forEach((row, index) => {
      const categoryMain = normalizeText(row?.categoryMain);
      const categorySub = normalizeText(row?.categorySub);
      const key = `${categoryMain.toLowerCase()}::${categorySub.toLowerCase()}`;
      const rawPickedQty = Math.max(0, Number(row?.pickedQty ?? row?.picked_qty ?? row?.qty ?? 0));
      const rawAvailableQty = row?.availableQty ?? row?.available_qty;
      const availableQty = Math.max(0, Number(rawAvailableQty ?? rawPickedQty));
      const pickedQty = Math.min(rawPickedQty, availableQty);
      const requestedQty = Math.max(pickedQty, Number(row?.requestedQty ?? row?.requested_qty ?? pickedQty));
      const shortageQty = Math.max(0, Number(row?.shortageQty ?? row?.shortage_qty ?? Math.max(requestedQty - pickedQty, 0)));
      if (!categoryMain && !categorySub && pickedQty <= 0) {
        return;
      }
      const current = lineMap.get(key) || {
        categoryMain,
        categorySub,
        baleLabels: [],
        qty: 0,
        pickedQty: 0,
        requestedQty: 0,
        availableQty: 0,
        shortageQty: 0,
        rackCodes: new Set(),
        isPartial: false,
      };
      current.qty += pickedQty;
      current.pickedQty += pickedQty;
      current.requestedQty = Math.max(current.requestedQty, requestedQty);
      current.availableQty = Math.max(current.availableQty, availableQty);
      current.shortageQty = Math.max(current.shortageQty, shortageQty);
      current.isPartial = current.isPartial || Boolean(row?.isPartial);
      const baleLabel = normalizeText(row?.baleLabel) || `补差 bale ${index + 1}`;
      if (baleLabel) {
        current.baleLabels.push(baleLabel);
      }
      (Array.isArray(row?.rackCodes) ? row.rackCodes : []).forEach((item) => {
        const rackCode = normalizeText(item).toUpperCase();
        if (rackCode) {
          current.rackCodes.add(rackCode);
        }
      });
      lineMap.set(key, current);
    });
    const lines = Array.from(lineMap.values())
      .map((row, index) => {
        const status = getLoosePickLineStatus(row);
        return {
          lineNo: index + 1,
          categoryMain: row.categoryMain,
          categorySub: row.categorySub,
          baleLabel: row.baleLabels.join("、") || `补差 bale ${index + 1}`,
          qty: row.qty,
          requestedQty: row.requestedQty,
          requested_qty: row.requestedQty,
          availableQty: row.availableQty,
          available_qty: row.availableQty,
          pickedQty: row.pickedQty,
          picked_qty: row.pickedQty,
          shortageQty: row.shortageQty,
          shortage_qty: row.shortageQty,
          rackCodes: Array.from(row.rackCodes),
          status: status.key,
          statusLabel: status.label,
          isPartial: row.isPartial,
        };
      })
      .filter((row) => row.qty > 0);
    const shortageLines = (Array.isArray(plan?.categoryCards) ? plan.categoryCards : [])
      .map((row) => ({
        categoryMain: normalizeText(row?.categoryMain),
        categorySub: normalizeText(row?.categorySub),
        qty: Number(row?.shortageQty || 0),
      }))
      .filter((row) => row.qty > 0);
    const totalQty = lines.reduce((sum, row) => sum + Number(row.qty || 0), 0);
    if (!totalQty) {
      return [];
    }
    const requestedQty = lines.reduce((sum, row) => sum + Number(row.requestedQty || 0), 0);
    const availableQty = lines.reduce((sum, row) => sum + Number(row.availableQty || 0), 0);
    const pickedQty = lines.reduce((sum, row) => sum + Number(row.pickedQty || row.qty || 0), 0);
    const shortageQty = lines.reduce((sum, row) => sum + Number(row.shortageQty || 0), 0);
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
      requestedQty,
      requested_qty: requestedQty,
      availableQty,
      available_qty: availableQty,
      pickedQty,
      picked_qty: pickedQty,
      shortageQty,
      shortage_qty: shortageQty,
      packageLimitQty: normalizedPackageLimitQty,
      plannedPackageCount: Math.max(1, Math.ceil(totalQty / normalizedPackageLimitQty)),
      rackCodes: Array.from(new Set(lines.flatMap((row) => row.rackCodes || []))),
      lines,
      shortageLines,
      isPartial: totalQty < normalizedPackageLimitQty,
      status: "pending_pick",
      createdAt: normalizeText(now) || new Date().toISOString(),
    }];
  }

  function formatLoosePickSheetSummaryLine(line = {}) {
    const categoryMain = normalizeText(line?.categoryMain);
    const categorySub = normalizeText(line?.categorySub);
    const qty = Number(line?.qty || 0);
    if (!categoryMain && !categorySub && qty <= 0) {
      return "";
    }
    return `${categoryMain || "-"}${categorySub ? `/${categorySub}` : ""} x${Math.max(0, qty)}`;
  }

  function formatLoosePickSheetSummaryLines(lines = [], { limit = 2 } = {}) {
    const normalized = (Array.isArray(lines) ? lines : [])
      .map(formatLoosePickSheetSummaryLine)
      .filter(Boolean);
    if (!normalized.length) {
      return [];
    }
    const visibleCount = Math.max(1, Number(limit || 2));
    const visible = normalized.slice(0, visibleCount);
    if (normalized.length > visibleCount) {
      visible.push(`+${normalized.length - visibleCount} more`);
    }
    return visible;
  }

  function formatLoosePickSheetPackingLines(lines = []) {
    if (!Array.isArray(lines)) {
      return [];
    }
    return lines
      .map((line) => {
        const categoryMain = normalizeText(line?.categoryMain);
        const categorySub = normalizeText(line?.categorySub);
        const qty = Number(line?.pickedQty ?? line?.picked_qty ?? line?.qty ?? 0);
        const requestedQty = Math.max(qty, Number(line?.requestedQty ?? line?.requested_qty ?? qty));
        const shortageQty = Math.max(0, Number(line?.shortageQty ?? line?.shortage_qty ?? 0));
        if (!categoryMain && !categorySub && qty <= 0) {
          return "";
        }
        return `${categoryMain || "-"} / ${categorySub || "-"} · ${Math.max(0, qty)} 件${
          shortageQty > 0 ? `（需求 ${requestedQty} / 缺 ${shortageQty}）` : ""
        }`;
      })
      .filter(Boolean);
  }

  function formatLoosePickSheetShortageLines(lines = []) {
    if (!Array.isArray(lines)) {
      return [];
    }
    return lines
      .map((line) => {
        const shortageQty = Math.max(0, Number(line?.shortageQty ?? line?.shortage_qty ?? 0));
        if (shortageQty <= 0) {
          return "";
        }
        const categoryMain = normalizeText(line?.categoryMain);
        const categorySub = normalizeText(line?.categorySub);
        return `${categoryMain || "-"} / ${categorySub || "-"} · 缺 ${shortageQty} 件`;
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
    const shortageLineRows = Array.isArray(task?.shortageLines) && task.shortageLines.length
      ? task.shortageLines
      : (Array.isArray(task?.lines) ? task.lines : [])
        .map((line) => ({
          categoryMain: normalizeText(line?.categoryMain),
          categorySub: normalizeText(line?.categorySub),
          qty: Number(line?.shortageQty ?? line?.shortage_qty ?? 0),
        }))
        .filter((line) => line.qty > 0);
    const shortageLines = formatLoosePickSheetShortageLines(task?.lines);
    const pickedSummaryLines = formatLoosePickSheetSummaryLines(task?.lines, { limit: 2 });
    const shortageSummaryLines = formatLoosePickSheetSummaryLines(shortageLineRows, { limit: 2 });
    const readablePackingLines = [
      ...pickedSummaryLines.map((line) => `Pick: ${line}`),
      ...shortageSummaryLines.map((line) => `Short: ${line}`),
    ];
    return {
      labelTitle: "LPK / SHORTAGE PICK",
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
      pickedSummaryLines,
      shortageSummaryLines,
      pickedItemSummary: pickedSummaryLines.join("; "),
      shortageSummary: shortageSummaryLines.join("; "),
      packingList: readablePackingLines.length ? readablePackingLines.join("\n") : packingLines.join("\n"),
      shortageLines,
      shortageList: shortageLines.join("\n"),
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
      label_title: label.labelTitle || "LPK / SHORTAGE PICK",
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
      picked_item_summary: label.pickedItemSummary || "",
      shortage_summary: label.shortageSummary || "",
      packing_list: label.packingList || "",
      dispatch_bale_no: barcodeValue,
      outbound_time: "",
      status: statusText,
      cat: "PICK SHEET",
      sub: "LOOSE GAP",
      grade: `PKG<${packageLimitQty}`,
      qty: String(Math.max(0, pickQty)),
      weight: "",
      code: barcodeValue,
    };
  }

  function buildTransferDispatchRows({
    plan = {},
    looseTasks = [],
    foundPreparedBarcodes = [],
  } = {}) {
    const foundPreparedRows = getFoundPreparedBaleRows(plan, foundPreparedBarcodes);
    const preparedRows = foundPreparedRows.length
      ? foundPreparedRows
      : (Array.isArray(plan?.preparedPickRows) ? plan.preparedPickRows : []);
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
      const taskBarcode = normalizeText(looseTask?.printableBarcode || looseTask?.taskBarcode || looseTask?.taskNo).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
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
    foundPreparedBarcodes = [],
  } = {}) {
    const resultRows = Array.isArray(result?.store_dispatch_bales) ? result.store_dispatch_bales : [];
    const dispatchRows = buildTransferDispatchRows({ plan, looseTasks, foundPreparedBarcodes });
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
    return getPreparedBaleCanonicalBarcode(row);
  }

  function getPreparedBaleSpecLabel(row = {}) {
    const candidate = normalizePreparedBale(row);
    return `${candidate.categoryMain || "-"} / ${candidate.categorySub || "-"} / ${candidate.grade || "mixed"} / ${candidate.qty || 0} 件`;
  }

  function getPreparedScanCandidateRows(plan = {}) {
    const rowsByKey = new Map();
    [
      ...(Array.isArray(plan?.availablePreparedBales) ? plan.availablePreparedBales : []),
      ...(Array.isArray(plan?.matchingAvailablePreparedBales) ? plan.matchingAvailablePreparedBales : []),
      ...(Array.isArray(plan?.preparedPickRows) ? plan.preparedPickRows : []),
    ].forEach((row) => {
      const candidate = normalizePreparedBale(row);
      const key = getPreparedPickCanonicalKey(candidate);
      if (key) {
        rowsByKey.set(key, candidate);
      }
    });
    return Array.from(rowsByKey.values());
  }

  function getFoundPreparedBaleRows(plan = {}, foundPreparedBarcodes = []) {
    const candidates = getPreparedScanCandidateRows(plan);
    return (Array.isArray(foundPreparedBarcodes) ? foundPreparedBarcodes : [])
      .map((barcode) => findPreparedBaleByBarcode(candidates, barcode))
      .filter(Boolean);
  }

  function getDemandFulfilledQty(plan = {}, demand = {}, foundPreparedBarcodes = []) {
    return getFoundPreparedBaleRows(plan, foundPreparedBarcodes)
      .filter((row) => doesPreparedBaleMatchDemand(row, demand))
      .reduce((sum, row) => sum + Number(row.qty || 0), 0);
  }

  function findMatchingUnmetPreparedDemand(plan = {}, candidate = {}, foundPreparedBarcodes = []) {
    const demandRows = getPreparedDemandRows(plan);
    return demandRows.find((demand) => {
      if (!doesPreparedBaleMatchDemand(candidate, demand)) {
        return false;
      }
      if (!doesPreparedBaleMatchQuantitySpec(plan, candidate, demand)) {
        return false;
      }
      const requestedQty = Number(demand.requested_qty ?? demand.requestedQty ?? 0);
      const fulfilledQty = getDemandFulfilledQty(plan, demand, foundPreparedBarcodes);
      return requestedQty > fulfilledQty && Number(candidate.qty || 0) <= requestedQty - fulfilledQty;
    }) || null;
  }

  function registerPreparedBaleScan({
    plan = {},
    foundPreparedBarcodes = [],
    barcode = "",
    transferNo = "",
  } = {}) {
    const normalizedBarcode = normalizeIdentity(barcode);
    if (!normalizedBarcode) {
      return {
        ok: false,
        error: "请先扫描或录入现成待送店包裹 barcode。",
        foundPreparedBarcodes: Array.isArray(foundPreparedBarcodes) ? foundPreparedBarcodes : [],
      };
    }
    const preparedRows = Array.isArray(plan?.preparedPickRows) ? plan.preparedPickRows : [];
    const candidateRows = getPreparedScanCandidateRows(plan);
    const matchedRow = findPreparedBaleByBarcode(candidateRows, normalizedBarcode);
    if (!matchedRow) {
      return {
        ok: false,
        error: "未找到这个 SDB，请确认是否已经完成压缩、打印并贴标。",
        foundPreparedBarcodes: Array.isArray(foundPreparedBarcodes) ? foundPreparedBarcodes : [],
      };
    }
    const occupiedBy = getPreparedBaleOccupancyReference(matchedRow, transferNo);
    if (occupiedBy) {
      return {
        ok: false,
        error: "该 SDB 已被其他调拨单或送货执行单占用，不能加入本单。",
        matchedRow,
        foundPreparedBarcodes: Array.isArray(foundPreparedBarcodes) ? foundPreparedBarcodes : [],
      };
    }
    const canonicalKey = getPreparedPickCanonicalKey(matchedRow);
    const current = new Set((Array.isArray(foundPreparedBarcodes) ? foundPreparedBarcodes : []).map((item) => normalizeIdentity(item)).filter(Boolean));
    const duplicate = current.has(canonicalKey);
    if (duplicate) {
      return {
        ok: true,
        duplicate: true,
        matchedRow,
        canonicalBarcode: canonicalKey,
        message: "该 SDB 已经在本单现成包清单中。",
        foundPreparedBarcodes: Array.from(current),
      };
    }
    const preselectedKeys = new Set(preparedRows.map((row) => getPreparedPickCanonicalKey(row)).filter(Boolean));
    const matchingDemand = findMatchingUnmetPreparedDemand(plan, matchedRow, foundPreparedBarcodes);
    if (!matchingDemand) {
      return {
        ok: false,
        error: `该 SDB 是 ${getPreparedBaleSpecLabel(matchedRow)}，但当前调拨单不需要这个型号或该型号数量已满足。`,
        matchedRow,
        foundPreparedBarcodes: Array.isArray(foundPreparedBarcodes) ? foundPreparedBarcodes : [],
      };
    }
    const addedByDemandMatch = !preselectedKeys.has(canonicalKey);
    if (!duplicate) {
      current.add(canonicalKey);
    }
    return {
      ok: true,
      duplicate: false,
      addedByDemandMatch,
      matchedRow,
      canonicalBarcode: canonicalKey,
      message: addedByDemandMatch
        ? "该 SDB 符合当前调拨需求，已加入本单现成包清单。"
        : "该 SDB 已经在本单现成包清单中。",
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
    const demandRows = getPreparedDemandRows(plan);
    const matchingFoundPreparedRows = getFoundPreparedBaleRows(plan, foundPreparedBarcodes)
      .filter((row) => demandRows.some((demand) =>
        doesPreparedBaleMatchDemand(row, demand)
        && doesPreparedBaleMatchQuantitySpec(plan, row, demand)
      ));
    const foundPreparedCount = Math.min(preparedRows.length, matchingFoundPreparedRows.length);
    const requiredLooseTasks = Array.isArray(looseTasks) ? looseTasks : [];
    const requiredLooseTaskCount = looseRows.length ? (requiredLooseTasks.length || 1) : 0;
    const completedLooseTaskCount = requiredLooseTasks.filter((row) =>
      normalizeText(row?.status).toLowerCase() === "packed" && Number(row?.shortageQty ?? row?.shortage_qty ?? 0) <= 0
    ).length;
    const partialLooseTaskCount = requiredLooseTasks.filter((row) =>
      normalizeText(row?.status).toLowerCase() === "packed" && Number(row?.shortageQty ?? row?.shortage_qty ?? 0) > 0
    ).length;
    const unresolvedShortageQty = Math.max(0, Number(plan?.summary?.shortageQty || 0));
    return {
      requiredPreparedCount: preparedRows.length,
      foundPreparedCount,
      pendingPreparedCount: Math.max(preparedRows.length - foundPreparedCount, 0),
      requiredLooseTaskCount,
      completedLooseTaskCount,
      partialLooseTaskCount,
      pendingLooseTaskCount: Math.max(requiredLooseTaskCount - completedLooseTaskCount, 0),
      unresolvedShortageQty,
      canPrint: foundPreparedCount >= preparedRows.length
        && completedLooseTaskCount >= requiredLooseTaskCount
        && unresolvedShortageQty <= 0,
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

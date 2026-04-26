(function (root, factory) {
  const exports = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = exports;
  }
  root.BaleSalesWorkbenchFlow = exports;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function normalizeText(value) {
    return String(value || "").trim();
  }

  function normalizeUpper(value) {
    return normalizeText(value).toUpperCase();
  }

  function normalizeLower(value) {
    return normalizeText(value).toLowerCase();
  }

  function roundToTwo(value) {
    return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  }

  function isRawBaleInSalesPool(row) {
    const status = normalizeLower(row && row.status);
    const destination = normalizeLower(row && row.destination_judgement);
    return status === "in_bale_sales_pool" || destination === "bale_sales_pool";
  }

  function getOrderTimestamp(order) {
    const value = normalizeText(order && (order.updated_at || order.created_at));
    const timestamp = value ? new Date(value).getTime() : 0;
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  function shouldReplaceLinkedOrder(previousOrder, nextOrder) {
    if (!previousOrder) {
      return true;
    }
    const previousTs = getOrderTimestamp(previousOrder);
    const nextTs = getOrderTimestamp(nextOrder);
    if (nextTs !== previousTs) {
      return nextTs > previousTs;
    }
    return normalizeText(nextOrder && nextOrder.order_no) > normalizeText(previousOrder && previousOrder.order_no);
  }

  function buildLinkedOrderIndex(consignmentOrders) {
    const index = new Map();
    (Array.isArray(consignmentOrders) ? consignmentOrders : []).forEach((order) => {
      const poolEntryIds = Array.isArray(order && order.selected_pool_entry_ids) ? order.selected_pool_entry_ids : [];
      poolEntryIds.forEach((poolEntryId) => {
        const normalizedPoolEntryId = normalizeUpper(poolEntryId);
        if (!normalizedPoolEntryId) {
          return;
        }
        const previous = index.get(normalizedPoolEntryId);
        if (shouldReplaceLinkedOrder(previous, order)) {
          index.set(normalizedPoolEntryId, order);
        }
      });
    });
    return index;
  }

  function deriveLinkedOrderState(baseStatus, linkedOrder) {
    const orderStatus = normalizeLower(linkedOrder && linkedOrder.status);
    if (orderStatus === "settled") {
      return {
        current_status: "settled",
        is_sellable: false,
        is_outbound: true,
        is_settled: true,
      };
    }
    if (orderStatus === "packed") {
      return {
        current_status: "packed",
        is_sellable: false,
        is_outbound: true,
        is_settled: false,
      };
    }
    if (orderStatus === "draft") {
      return {
        current_status: "draft",
        is_sellable: false,
        is_outbound: false,
        is_settled: false,
      };
    }
    const normalizedBaseStatus = normalizeLower(baseStatus);
    return {
      current_status: normalizedBaseStatus || "in_pool",
      is_sellable: normalizedBaseStatus === "in_pool",
      is_outbound: normalizedBaseStatus === "outbound" || normalizedBaseStatus === "settled",
      is_settled: normalizedBaseStatus === "settled",
    };
  }

  function normalizeRawPoolRow(row, linkedOrder) {
    const poolEntryId = `RAW:${normalizeUpper(row && row.bale_barcode)}`;
    const linkedState = deriveLinkedOrderState("in_pool", linkedOrder);
    return {
      pool_entry_id: poolEntryId,
      source_type: "raw_direct_sale",
      bale_barcode: normalizeUpper(row && row.bale_barcode),
      source_reference: normalizeUpper((row && row.source_bale_token) || (row && row.shipment_no)),
      source_document_no: normalizeUpper(row && row.shipment_no),
      source_task_no: "",
      supplier_name: normalizeText(row && row.supplier_name),
      category_main: normalizeText(row && row.category_main),
      category_sub: normalizeText(row && row.category_sub),
      weight_kg: roundToTwo(row && row.weight_kg),
      bale_count: 1,
      entered_at: normalizeText(row && row.entered_bale_sales_pool_at),
      status_updated_at: normalizeText(linkedOrder && linkedOrder.updated_at) || normalizeText(row && row.entered_bale_sales_pool_at),
      linked_order_no: normalizeUpper(linkedOrder && linkedOrder.order_no),
      current_status: linkedState.current_status,
      is_sellable: linkedState.is_sellable,
      is_outbound: linkedState.is_outbound,
      is_settled: linkedState.is_settled,
    };
  }

  function normalizeRebalePoolRow(row, linkedOrder) {
    const poolEntryId = `REB:${normalizeUpper(row && row.rebale_entry_no)}`;
    const linkedState = deriveLinkedOrderState((row && row.status) || "in_pool", linkedOrder);
    return {
      pool_entry_id: poolEntryId,
      source_type: "sorted_rebale_sale",
      bale_barcode: normalizeUpper(row && row.bale_barcode),
      source_reference: normalizeUpper((row && row.source_task_no) || (row && row.source_order_no)),
      source_document_no: normalizeUpper(row && row.source_order_no),
      source_task_no: normalizeUpper(row && row.source_task_no),
      supplier_name: normalizeText(row && row.supplier_name),
      category_main: normalizeText(row && row.category_main),
      category_sub: normalizeText(row && row.category_sub),
      weight_kg: roundToTwo(row && row.weight_kg),
      bale_count: Number(row && row.bale_count) > 0 ? Number(row && row.bale_count) : 1,
      entered_at: normalizeText((row && row.entered_bale_sales_pool_at) || (row && row.created_at)),
      status_updated_at: normalizeText(linkedOrder && linkedOrder.updated_at) || normalizeText((row && row.entered_bale_sales_pool_at) || (row && row.created_at)),
      linked_order_no: normalizeUpper(linkedOrder && linkedOrder.order_no),
      current_status: linkedState.current_status,
      is_sellable: linkedState.is_sellable,
      is_outbound: linkedState.is_outbound,
      is_settled: linkedState.is_settled,
    };
  }

  function comparePoolRows(left, right) {
    const leftTime = new Date(normalizeText(left && left.entered_at) || 0).getTime();
    const rightTime = new Date(normalizeText(right && right.entered_at) || 0).getTime();
    if (leftTime !== rightTime) {
      return rightTime - leftTime;
    }
    return normalizeText(left && left.bale_barcode).localeCompare(normalizeText(right && right.bale_barcode));
  }

  function buildBaleSalesPoolRows(input) {
    const payload = input || {};
    const linkedOrderIndex = buildLinkedOrderIndex(payload.consignmentOrders);
    const rows = [];
    (Array.isArray(payload.rawBales) ? payload.rawBales : []).forEach((row) => {
      if (!isRawBaleInSalesPool(row)) {
        return;
      }
      const poolEntryId = `RAW:${normalizeUpper(row && row.bale_barcode)}`;
      rows.push(normalizeRawPoolRow(row, linkedOrderIndex.get(poolEntryId)));
    });
    (Array.isArray(payload.rebaleEntries) ? payload.rebaleEntries : []).forEach((row) => {
      const poolEntryId = `REB:${normalizeUpper(row && row.rebale_entry_no)}`;
      rows.push(normalizeRebalePoolRow(row, linkedOrderIndex.get(poolEntryId)));
    });
    return rows.sort(comparePoolRows);
  }

  function summarizeBaleSalesPoolRows(rows) {
    return (Array.isArray(rows) ? rows : []).reduce(
      (summary, row) => {
        summary.totalCount += 1;
        summary.totalWeightKg = roundToTwo(summary.totalWeightKg + Number(row && row.weight_kg || 0));
        summary.totalBaleCount += Number(row && row.bale_count || 0) || 0;
        if (normalizeLower(row && row.source_type) === "raw_direct_sale") {
          summary.rawDirectCount += 1;
        }
        if (normalizeLower(row && row.source_type) === "sorted_rebale_sale") {
          summary.sortedRebaleCount += 1;
        }
        if (row && row.is_sellable) {
          summary.sellableCount += 1;
        }
        if (row && row.is_outbound) {
          summary.outboundCount += 1;
        }
        if (row && row.is_settled) {
          summary.settledCount += 1;
        }
        return summary;
      },
      {
        totalCount: 0,
        rawDirectCount: 0,
        sortedRebaleCount: 0,
        sellableCount: 0,
        outboundCount: 0,
        settledCount: 0,
        totalWeightKg: 0,
        totalBaleCount: 0,
      },
    );
  }

  function buildSourceTypeSummary(rows) {
    const rawDirectCount = rows.filter((row) => normalizeLower(row && row.source_type) === "raw_direct_sale").length;
    const sortedRebaleCount = rows.filter((row) => normalizeLower(row && row.source_type) === "sorted_rebale_sale").length;
    const parts = [];
    if (rawDirectCount) {
      parts.push(`原始未分拣 bale 直售 ${rawDirectCount} 包`);
    }
    if (sortedRebaleCount) {
      parts.push(`分拣结果再打 bale ${sortedRebaleCount} 包`);
    }
    return parts.join(" + ") || "待补充来源";
  }

  function buildConsignmentBundleDraft(rows) {
    const items = (Array.isArray(rows) ? rows : []).filter(Boolean);
    const totalWeightKg = roundToTwo(items.reduce((sum, row) => sum + Number(row && row.weight_kg || 0), 0));
    const totalBaleCount = items.reduce((sum, row) => sum + (Number(row && row.bale_count || 0) || 0), 0);
    const averageBaleWeightKg = totalBaleCount > 0 ? roundToTwo(totalWeightKg / totalBaleCount) : 0;
    return {
      title: "整包销售池混包草稿",
      target_total_weight_kg: totalWeightKg,
      target_bale_weight_kg: averageBaleWeightKg,
      selected_pool_entry_ids: items.map((row) => normalizeUpper(row && row.pool_entry_id)).filter(Boolean),
      source_type_summary: buildSourceTypeSummary(items),
      source_rule: `来源：${items.map((row) => normalizeUpper(row && row.bale_barcode)).filter(Boolean).join(", ")}`,
    };
  }

  return {
    buildBaleSalesPoolRows,
    summarizeBaleSalesPoolRows,
    buildConsignmentBundleDraft,
  };
});

(function (root, factory) {
  const exports = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = exports;
  }
  root.WarehouseStockHubFlow = exports;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const DEFAULT_WAREHOUSE_HUB_TARGETS = Object.freeze([
    {
      key: "current_bales",
      label: "仓库现有总库存（Bales）",
      description: "按贴完码后的在库 bale 看当前总量与扣减去向。",
      panelTitle: "0.1 原始 Bale 总库存",
      loadAction: "load-raw-bales",
      focusSelector: "#rawBaleStockSummary",
    },
    {
      key: "sorted_inventory",
      label: "仓库已分拣服装",
      description: "查看分拣工单形成的服装库存和锁定库位。",
      panelTitle: "0.3 分拣库存 / 中转区库存",
      loadAction: "load-sorting-stock",
      focusSelector: "#sortingStockSummary",
    },
    {
      key: "dispatch_history",
      label: "门店送货执行单",
      description: "查看门店配送 bale、调拨单和送货状态历史。",
      panelTitle: "门店送货执行单",
      loadAction: "load-warehouse-dispatch-history",
      focusSelector: "#warehouseDispatchHistorySummary",
    },
    {
      key: "sold_history",
      label: "B2B 已售包裹",
      description: "查看已出库或已结算的整包销售历史。",
      panelTitle: "B2B 已售包裹",
      loadAction: "load-warehouse-sold-packages",
      focusSelector: "#warehouseSoldPackagesSummary",
    },
  ]);

  function buildWarehouseHubNavCards(actions, activePanelKey) {
    return (Array.isArray(actions) ? actions : []).map((action) => ({
      ...action,
      isActive: Boolean(action && action.panelKey && activePanelKey && action.panelKey === activePanelKey),
    }));
  }

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

  function getDispatchOccurredAt(row) {
    return normalizeText(
      row && (
        row.dispatched_at
        || row.accepted_at
        || row.assigned_at
        || row.packed_at
        || row.updated_at
        || row.created_at
      ),
    );
  }

  function summarizeWarehouseDispatchHistory(rows) {
    const summary = (Array.isArray(rows) ? rows : []).reduce(
      (summary, row) => {
        const status = normalizeLower(row && row.status);
        const occurredAt = getDispatchOccurredAt(row);
        const itemCount = Number(row && row.item_count || 0);
        const storeCode = normalizeUpper(row && row.store_code);
        summary.totalCount += 1;
        summary.totalItemCount += Number.isFinite(itemCount) ? itemCount : 0;
        if (storeCode) {
          summary.storeCodeSet.add(storeCode);
        }
        if (status === "in_transit") {
          summary.inTransitCount += 1;
        }
        if (status === "accepted") {
          summary.acceptedCount += 1;
        }
        if (status === "completed") {
          summary.completedCount += 1;
        }
        if (!summary.latestOccurredAt || new Date(occurredAt || 0).getTime() > new Date(summary.latestOccurredAt || 0).getTime()) {
          summary.latestOccurredAt = occurredAt;
        }
        return summary;
      },
      {
        totalCount: 0,
        totalItemCount: 0,
        inTransitCount: 0,
        acceptedCount: 0,
        completedCount: 0,
        latestOccurredAt: "",
        storeCodeSet: new Set(),
      },
    );
    return {
      totalCount: summary.totalCount,
      totalItemCount: summary.totalItemCount,
      inTransitCount: summary.inTransitCount,
      acceptedCount: summary.acceptedCount,
      completedCount: summary.completedCount,
      latestOccurredAt: summary.latestOccurredAt,
      storeCount: summary.storeCodeSet.size,
    };
  }

  function buildTransferIndex(transferRows) {
    const index = new Map();
    (Array.isArray(transferRows) ? transferRows : []).forEach((row) => {
      const transferNo = normalizeUpper(row && row.transfer_no);
      if (transferNo) {
        index.set(transferNo, row);
      }
    });
    return index;
  }

  function buildWarehouseDispatchHistoryRows(dispatchRows, transferRows) {
    const transferIndex = buildTransferIndex(transferRows);
    return (Array.isArray(dispatchRows) ? dispatchRows : [])
      .map((row) => {
        const transfer = transferIndex.get(normalizeUpper(row && row.transfer_no));
        return {
          bale_no: normalizeUpper(row && row.bale_no),
          transfer_no: normalizeUpper(row && row.transfer_no),
          task_no: normalizeUpper(row && row.task_no),
          shipment_no: normalizeUpper(row && row.shipment_no),
          store_code: normalizeUpper(row && row.store_code),
          to_store_code: normalizeUpper((transfer && transfer.to_store_code) || (row && row.store_code)),
          from_warehouse_code: normalizeUpper(transfer && transfer.from_warehouse_code),
          status: normalizeLower(row && row.status),
          category_name: normalizeText(row && row.category_name),
          grade: normalizeText(row && row.grade),
          item_count: Number(row && row.item_count || 0),
          occurred_at: getDispatchOccurredAt(row),
          assigned_employee: normalizeText(row && row.assigned_employee),
        };
      })
      .sort((left, right) => {
        const leftTime = new Date(left && left.occurred_at || 0).getTime();
        const rightTime = new Date(right && right.occurred_at || 0).getTime();
        if (leftTime !== rightTime) {
          return rightTime - leftTime;
        }
        return normalizeText(left && left.bale_no).localeCompare(normalizeText(right && right.bale_no));
      });
  }

  function summarizeWarehouseSortedInventory(rows) {
    const summary = (Array.isArray(rows) ? rows : []).reduce(
      (summary, row) => {
        const qty = Number(row && row.qty_on_hand || 0);
        const rackCode = normalizeUpper(row && row.rack_code);
        const updatedAt = normalizeText(row && row.updated_at);
        const totalCostKes = Number(row && row.total_cost_kes || 0);
        summary.totalRowCount += 1;
        summary.totalQty += Number.isFinite(qty) ? qty : 0;
        summary.totalInventoryValueKes = roundToTwo(summary.totalInventoryValueKes + (Number.isFinite(totalCostKes) ? totalCostKes : 0));
        if (rackCode) {
          summary.rackCodeSet.add(rackCode);
        }
        if (!summary.latestUpdatedAt || new Date(updatedAt || 0).getTime() > new Date(summary.latestUpdatedAt || 0).getTime()) {
          summary.latestUpdatedAt = updatedAt;
        }
        return summary;
      },
      {
        totalRowCount: 0,
        totalQty: 0,
        totalInventoryValueKes: 0,
        latestUpdatedAt: "",
        rackCodeSet: new Set(),
      },
    );
    return {
      totalRowCount: summary.totalRowCount,
      totalQty: summary.totalQty,
      totalInventoryValueKes: summary.totalInventoryValueKes,
      latestUpdatedAt: summary.latestUpdatedAt,
      rackCount: summary.rackCodeSet.size,
    };
  }

  function summarizeWarehousePreparedBales(rows) {
    return (Array.isArray(rows) ? rows : []).reduce((summary, row) => {
      const taskType = normalizeLower(row && row.task_type) || "store_dispatch";
      const qty = Number(row && row.qty || 0);
      const totalCostKes = Number(row && row.total_cost_kes || 0);
      if (taskType === "sale") {
        summary.saleBaleCount += 1;
        summary.saleQty += Number.isFinite(qty) ? qty : 0;
        summary.saleCostKes = roundToTwo(summary.saleCostKes + (Number.isFinite(totalCostKes) ? totalCostKes : 0));
        return summary;
      }
      summary.dispatchBaleCount += 1;
      summary.dispatchQty += Number.isFinite(qty) ? qty : 0;
      summary.dispatchCostKes = roundToTwo(summary.dispatchCostKes + (Number.isFinite(totalCostKes) ? totalCostKes : 0));
      return summary;
    }, {
      dispatchBaleCount: 0,
      dispatchQty: 0,
      dispatchCostKes: 0,
      saleBaleCount: 0,
      saleQty: 0,
      saleCostKes: 0,
    });
  }

  function buildWarehouseStageBoard({
    rawSummary = {},
    sortedSummary = {},
    preparedSummary = {},
  } = {}) {
    return [
      {
        key: "unsorted",
        title: "未分拣",
        primaryValue: Number(rawSummary && rawSummary.currentCount || 0),
        primaryUnit: "包",
        secondaryValue: roundToTwo(rawSummary && rawSummary.currentWeightKg || 0),
        secondaryUnit: "KG",
        tertiaryValue: 0,
        tertiaryUnit: "",
      },
      {
        key: "sorted_garments",
        title: "已分拣（服装）",
        primaryValue: Number(sortedSummary && sortedSummary.totalQty || 0),
        primaryUnit: "件",
        secondaryValue: Number(sortedSummary && sortedSummary.rackCount || 0),
        secondaryUnit: "货架位",
        tertiaryValue: roundToTwo(sortedSummary && sortedSummary.totalInventoryValueKes || 0),
        tertiaryUnit: "KES",
      },
      {
        key: "packed_dispatch",
        title: "已打包待送店",
        primaryValue: Number(preparedSummary && preparedSummary.dispatchBaleCount || 0),
        primaryUnit: "bale",
        secondaryValue: Number(preparedSummary && preparedSummary.dispatchQty || 0),
        secondaryUnit: "件",
        tertiaryValue: roundToTwo(preparedSummary && preparedSummary.dispatchCostKes || 0),
        tertiaryUnit: "KES",
      },
      {
        key: "packed_sale",
        title: "已打包待售",
        primaryValue: Number(preparedSummary && preparedSummary.saleBaleCount || 0),
        primaryUnit: "bale",
        secondaryValue: Number(preparedSummary && preparedSummary.saleQty || 0),
        secondaryUnit: "件",
        tertiaryValue: roundToTwo(preparedSummary && preparedSummary.saleCostKes || 0),
        tertiaryUnit: "KES",
      },
    ];
  }

  function isSoldPackageRow(row) {
    return Boolean(row && (row.is_outbound || row.is_settled));
  }

  function getSoldOccurredAt(row) {
    return normalizeText(row && (row.status_updated_at || row.entered_at));
  }

  function summarizeSoldPackageHistory(rows) {
    return (Array.isArray(rows) ? rows : [])
      .filter(isSoldPackageRow)
      .reduce(
        (summary, row) => {
          summary.totalCount += 1;
          summary.totalWeightKg = roundToTwo(summary.totalWeightKg + Number(row && row.weight_kg || 0));
          if (normalizeLower(row && row.source_type) === "raw_direct_sale") {
            summary.rawDirectCount += 1;
          }
          if (normalizeLower(row && row.source_type) === "sorted_rebale_sale") {
            summary.sortedRebaleCount += 1;
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
          settledCount: 0,
          totalWeightKg: 0,
        },
      );
  }

  function buildSoldPackageHistoryRows(rows) {
    return (Array.isArray(rows) ? rows : [])
      .filter(isSoldPackageRow)
      .map((row) => ({
        pool_entry_id: normalizeUpper(row && row.pool_entry_id),
        bale_barcode: normalizeUpper(row && row.bale_barcode),
        source_type: normalizeLower(row && row.source_type),
        source_document_no: normalizeUpper(row && row.source_document_no),
        source_task_no: normalizeUpper(row && row.source_task_no),
        supplier_name: normalizeText(row && row.supplier_name),
        category_main: normalizeText(row && row.category_main),
        category_sub: normalizeText(row && row.category_sub),
        current_status: normalizeLower(row && row.current_status),
        linked_order_no: normalizeUpper(row && row.linked_order_no),
        weight_kg: roundToTwo(row && row.weight_kg),
        occurred_at: getSoldOccurredAt(row),
      }))
      .sort((left, right) => {
        const leftTime = new Date(left && left.occurred_at || 0).getTime();
        const rightTime = new Date(right && right.occurred_at || 0).getTime();
        if (leftTime !== rightTime) {
          return rightTime - leftTime;
        }
        return normalizeText(left && left.bale_barcode).localeCompare(normalizeText(right && right.bale_barcode));
      });
  }

  return {
    DEFAULT_WAREHOUSE_HUB_TARGETS,
    buildWarehouseHubNavCards,
    buildWarehouseStageBoard,
    summarizeWarehouseDispatchHistory,
    buildWarehouseDispatchHistoryRows,
    summarizeWarehousePreparedBales,
    summarizeWarehouseSortedInventory,
    summarizeSoldPackageHistory,
    buildSoldPackageHistoryRows,
  };
});

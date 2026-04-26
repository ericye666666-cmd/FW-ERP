(function (root, factory) {
  const exports = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = exports;
  }
  root.RawBaleStockFlow = exports;
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

  function isOccupied(row) {
    return Boolean(normalizeText(row && row.occupied_by_task_no));
  }

  function buildSoldRawBaleCodeSet(salesPoolRows) {
    return new Set(
      (Array.isArray(salesPoolRows) ? salesPoolRows : [])
        .filter((row) => normalizeLower(row && row.source_type) === "raw_direct_sale")
        .filter((row) => Boolean(row && (row.is_outbound || row.is_settled)))
        .map((row) => normalizeUpper(row && row.bale_barcode))
        .filter(Boolean),
    );
  }

  function isRawBaleEligibleForSortingTask(row) {
    return (
      normalizeLower(row && row.status) === "ready_for_sorting"
      && !isOccupied(row)
    );
  }

  function summarizeRawBaleStock(rows, salesPoolRows) {
    const items = Array.isArray(rows) ? rows : [];
    const soldCodeSet = buildSoldRawBaleCodeSet(salesPoolRows);
    return items.reduce(
      (summary, row) => {
        const status = normalizeLower(row && row.status);
        const weightKg = Number(row && row.weight_kg || 0);
        const baleBarcode = normalizeUpper(row && row.bale_barcode);
        summary.totalCount += 1;
        if (soldCodeSet.has(baleBarcode)) {
          summary.soldCount += 1;
          return summary;
        }
        if (status === "sorted") {
          summary.sortedCount += 1;
          return summary;
        }
        summary.currentCount += 1;
        summary.currentWeightKg = roundToTwo(summary.currentWeightKg + (Number.isFinite(weightKg) ? weightKg : 0));
        if (status === "ready_for_sorting") {
          summary.readyCount += 1;
        }
        if (status === "sorting_in_progress") {
          summary.sortingInProgressCount += 1;
        }
        if (status === "in_bale_sales_pool") {
          summary.baleSalesPoolCount += 1;
        }
        if (isOccupied(row) || status === "sorting_in_progress") {
          summary.occupiedCount += 1;
        }
        return summary;
      },
      {
        totalCount: 0,
        currentCount: 0,
        readyCount: 0,
        sortingInProgressCount: 0,
        occupiedCount: 0,
        baleSalesPoolCount: 0,
        sortedCount: 0,
        soldCount: 0,
        currentWeightKg: 0,
      },
    );
  }

  function filterRawBales(rows, filters) {
    const searchValue = normalizeLower(filters && filters.searchValue);
    return (Array.isArray(rows) ? rows : []).filter((row) => {
      if (searchValue) {
        const haystack = normalizeLower([
          row && row.bale_barcode,
          row && row.legacy_bale_barcode,
          row && row.shipment_no,
          row && row.source_bale_token,
          row && row.parcel_batch_no,
          row && row.supplier_name,
          row && row.category_main,
          row && row.category_sub,
        ].join(" "));
        if (!haystack.includes(searchValue)) {
          return false;
        }
      }
      return true;
    });
  }

  function buildRawBaleTimeline(rawBales, salesPoolRows) {
    const timeline = [];
    (Array.isArray(rawBales) ? rawBales : []).forEach((row) => {
      if (normalizeLower(row && row.status) !== "sorted") {
        return;
      }
      const occurredAt = normalizeText(row && (row.updated_at || row.created_at));
      if (!occurredAt) {
        return;
      }
      timeline.push({
        type: "sorted",
        bale_barcode: normalizeUpper(row && row.bale_barcode),
        shipment_no: normalizeUpper(row && row.shipment_no),
        occurred_at: occurredAt,
      });
    });
    (Array.isArray(salesPoolRows) ? salesPoolRows : []).forEach((row) => {
      if (normalizeLower(row && row.source_type) !== "raw_direct_sale") {
        return;
      }
      if (!(row && (row.is_outbound || row.is_settled))) {
        return;
      }
      const occurredAt = normalizeText(row && (row.status_updated_at || row.entered_at));
      if (!occurredAt) {
        return;
      }
      timeline.push({
        type: "sold",
        bale_barcode: normalizeUpper(row && row.bale_barcode),
        shipment_no: normalizeUpper(row && row.source_document_no),
        occurred_at: occurredAt,
      });
    });
    return timeline.sort((left, right) => {
      const leftTime = new Date(left && left.occurred_at || 0).getTime();
      const rightTime = new Date(right && right.occurred_at || 0).getTime();
      if (leftTime !== rightTime) {
        return rightTime - leftTime;
      }
      return normalizeText(left && left.bale_barcode).localeCompare(normalizeText(right && right.bale_barcode));
    });
  }

  return {
    summarizeRawBaleStock,
    filterRawBales,
    isRawBaleEligibleForSortingTask,
    buildRawBaleTimeline,
  };
});

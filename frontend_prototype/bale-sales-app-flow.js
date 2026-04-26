(function (root, factory) {
  const exports = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = exports;
  }
  root.BaleSalesAppFlow = exports;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function normalizeText(value) {
    return String(value || "").trim();
  }

  function normalizeUpper(value) {
    return normalizeText(value).toUpperCase();
  }

  function roundToTwo(value) {
    return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  }

  function normalizeNumber(value) {
    const numeric = Number(value || 0);
    return Number.isFinite(numeric) ? roundToTwo(numeric) : 0;
  }

  function summarizePricingCandidates(rows) {
    return (Array.isArray(rows) ? rows : []).reduce(
      (summary, row) => {
        summary.totalCount += 1;
        summary.totalSourceCostKes = roundToTwo(summary.totalSourceCostKes + normalizeNumber(row && row.source_cost_kes));
        summary.totalCostKes = roundToTwo(summary.totalCostKes + normalizeNumber(row && row.total_cost_kes));
        summary.totalTargetSaleKes = roundToTwo(summary.totalTargetSaleKes + normalizeNumber(row && row.target_sale_price_kes));
        if (normalizeText(row && row.status) === "available") {
          summary.availableCount += 1;
        }
        return summary;
      },
      {
        totalCount: 0,
        availableCount: 0,
        totalSourceCostKes: 0,
        totalCostKes: 0,
        totalTargetSaleKes: 0,
      },
    );
  }

  function buildShipmentFilterOptions(rows) {
    const values = [...new Set(
      (Array.isArray(rows) ? rows : [])
        .map((row) => normalizeText(row && row.shipment_no))
        .filter(Boolean),
    )].sort((left, right) => left.localeCompare(right, "zh-CN"));
    return [{ label: "全部船单", value: "" }, ...values.map((value) => ({ label: value, value }))];
  }

  function buildPricingDraftFromRow(row) {
    return {
      editableCostKes: String(normalizeNumber(row && row.editable_cost_kes)),
      downstreamCostKes: String(normalizeNumber(row && row.downstream_cost_kes)),
      marginPercent: String(roundToTwo(normalizeNumber(row && row.margin_rate) * 100)),
      note: normalizeText(row && row.pricing_note),
    };
  }

  function buildPricingUpdatePayload(draft) {
    const current = draft || {};
    return {
      editable_cost_kes: normalizeNumber(current.editableCostKes),
      downstream_cost_kes: normalizeNumber(current.downstreamCostKes),
      margin_rate: Number((normalizeNumber(current.marginPercent) / 100).toFixed(4)),
      note: normalizeText(current.note),
    };
  }

  function findCandidateByBarcode(rows, barcode) {
    const normalized = normalizeUpper(barcode);
    if (!normalized) {
      return null;
    }
    return (Array.isArray(rows) ? rows : []).find((row) => normalizeUpper(row && row.bale_barcode) === normalized) || null;
  }

  function resolveSalePrice(row, salePriceDrafts) {
    const entryId = normalizeText(row && row.entry_id);
    const draftValue = entryId && salePriceDrafts ? salePriceDrafts[entryId] : "";
    const draftPrice = normalizeNumber(draftValue);
    if (draftPrice > 0) {
      return draftPrice;
    }
    const targetSale = normalizeNumber(row && row.target_sale_price_kes);
    if (targetSale > 0) {
      return targetSale;
    }
    return normalizeNumber(row && row.total_cost_kes);
  }

  function buildOutboundSaleDraftFromRow(row) {
    return String(resolveSalePrice(row, {}));
  }

  function summarizeOutboundSelection(rows, salePriceDrafts) {
    return (Array.isArray(rows) ? rows : []).reduce(
      (summary, row) => {
        const totalCostKes = normalizeNumber(row && row.total_cost_kes);
        const salePriceKes = resolveSalePrice(row, salePriceDrafts);
        summary.selectedCount += 1;
        summary.totalWeightKg = roundToTwo(summary.totalWeightKg + normalizeNumber(row && row.weight_kg));
        summary.totalCostKes = roundToTwo(summary.totalCostKes + totalCostKes);
        summary.totalSaleKes = roundToTwo(summary.totalSaleKes + salePriceKes);
        summary.totalProfitKes = roundToTwo(summary.totalProfitKes + (salePriceKes - totalCostKes));
        return summary;
      },
      {
        selectedCount: 0,
        totalWeightKg: 0,
        totalCostKes: 0,
        totalSaleKes: 0,
        totalProfitKes: 0,
      },
    );
  }

  function buildOutboundOrderPayload(input) {
    const payload = input || {};
    const selectedRows = Array.isArray(payload.selectedRows) ? payload.selectedRows : [];
    if (!selectedRows.length) {
      throw new Error("请先选择或扫码至少一个 bale。");
    }
    const soldBy = normalizeText(payload.soldBy);
    const customerName = normalizeText(payload.customerName);
    const paymentMethod = normalizeText(payload.paymentMethod);
    if (!soldBy) {
      throw new Error("请先填写销售人。");
    }
    if (!customerName) {
      throw new Error("请先填写客户名称。");
    }
    if (!paymentMethod) {
      throw new Error("请先选择付款方式。");
    }
    const salePriceDrafts = payload.salePriceDrafts || {};
    return {
      sold_by: soldBy,
      customer_name: customerName,
      customer_contact: normalizeText(payload.customerContact),
      payment_method: paymentMethod,
      note: normalizeText(payload.note),
      items: selectedRows.map((row) => ({
        entry_id: normalizeText(row && row.entry_id),
        sale_price_kes: resolveSalePrice(row, salePriceDrafts),
      })),
    };
  }

  return {
    summarizePricingCandidates,
    buildShipmentFilterOptions,
    buildPricingDraftFromRow,
    buildPricingUpdatePayload,
    findCandidateByBarcode,
    buildOutboundSaleDraftFromRow,
    summarizeOutboundSelection,
    buildOutboundOrderPayload,
  };
});

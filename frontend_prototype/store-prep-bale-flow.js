(function (root, factory) {
  const exports = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = exports;
  }
  root.StorePrepBaleFlow = exports;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function normalizeText(value) {
    return String(value || "").trim();
  }

  function normalizeMachineCode(value) {
    const normalized = normalizeText(value).replace(/\s+/g, "");
    return /^[1-5]\d{9}$/.test(normalized) ? normalized : "";
  }

  function normalizeLower(value) {
    return normalizeText(value).toLowerCase();
  }

  function roundToTwo(value) {
    return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  }

  function normalizeGradeRequirements(rows) {
    const grouped = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const grade = normalizeText(row && row.grade).toUpperCase();
      const qty = Number(row && row.qty || 0);
      if (!["P", "S"].includes(grade) || qty <= 0) {
        return;
      }
      grouped.set(grade, (grouped.get(grade) || 0) + qty);
    });
    return ["P", "S"]
      .filter((grade) => grouped.has(grade))
      .map((grade) => ({ grade, qty: Number(grouped.get(grade) || 0) }));
  }

  function normalizeGradeRatios(rows) {
    const grouped = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const grade = normalizeText(row && row.grade).toUpperCase();
      const ratioPct = Number(row && (row.ratioPct ?? row.ratio_pct) || 0);
      if (!["P", "S"].includes(grade) || ratioPct <= 0) {
        return;
      }
      grouped.set(grade, roundToTwo((grouped.get(grade) || 0) + ratioPct));
    });
    return ["P", "S"]
      .filter((grade) => grouped.has(grade))
      .map((grade) => ({ grade, ratioPct: Number(grouped.get(grade) || 0) }));
  }

  function formatRatioPct(value) {
    return Number(value || 0) % 1 === 0 ? String(Number(value || 0)) : String(roundToTwo(value));
  }

  function estimateSaleBaleGradeMix({ targetWeightKg = 0, standardPieceWeightKg = 0, gradeRatios = [] } = {}) {
    const normalizedRatios = normalizeGradeRatios(gradeRatios);
    if (Number(targetWeightKg || 0) <= 0 || Number(standardPieceWeightKg || 0) <= 0 || !normalizedRatios.length) {
      return {
        targetQty: 0,
        ratioSummary: "",
        gradeRequirements: [],
      };
    }
    const ratioTotal = normalizedRatios.reduce((sum, row) => sum + Number(row.ratioPct || 0), 0);
    if (ratioTotal <= 0) {
      return {
        targetQty: 0,
        ratioSummary: "",
        gradeRequirements: [],
      };
    }
    const targetQty = Math.max(1, Math.ceil(Number(targetWeightKg || 0) / Number(standardPieceWeightKg || 0)));
    let remainingQty = targetQty;
    const allocations = normalizedRatios.map((row) => {
      const exactQty = targetQty * (Number(row.ratioPct || 0) / ratioTotal);
      const qty = Math.floor(exactQty);
      remainingQty -= qty;
      return {
        grade: row.grade,
        qty,
        fraction: exactQty - qty,
      };
    }).sort((left, right) => {
      if (right.fraction !== left.fraction) {
        return right.fraction - left.fraction;
      }
      return normalizeLower(left.grade).localeCompare(normalizeLower(right.grade), "zh-CN");
    });
    for (let index = 0; index < remainingQty; index += 1) {
      allocations[index % allocations.length].qty += 1;
    }
    const gradeRequirements = normalizeGradeRequirements(
      allocations.map((row) => ({ grade: row.grade, qty: row.qty })),
    );
    const ratioSummary = normalizedRatios.map((row) => `${row.grade}${formatRatioPct(row.ratioPct)}%`).join(" / ");
    return {
      targetQty,
      ratioSummary,
      gradeRequirements,
    };
  }

  function getCategorySub(row) {
    const explicit = normalizeText(row && row.category_sub);
    if (explicit) {
      return explicit;
    }
    const categoryName = normalizeText(row && row.category_name);
    if (!categoryName) {
      return "";
    }
    const parts = categoryName.split("/");
    return normalizeText(parts[1] || parts[0] || "");
  }

  function buildStorePrepCategoryOptions(rows) {
    const grouped = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const sub = getCategorySub(row);
      if (!sub) {
        return;
      }
      grouped.set(sub, (grouped.get(sub) || 0) + (Number(row && row.qty_on_hand || 0) || 0));
    });
    const values = [...grouped.entries()].sort((left, right) => normalizeLower(left[0]).localeCompare(normalizeLower(right[0]), "zh-CN"));
    return [
      { value: "", label: "选择小类" },
      ...values.map(([value, qty]) => ({ value, label: `${value} · 可打包 ${qty} 件` })),
    ];
  }

  function summarizeStorePrepBales(rows) {
    return (Array.isArray(rows) ? rows : []).reduce((acc, row) => {
      const qty = Number(row && row.qty || 0);
      const totalCostKes = Number(row && row.total_cost_kes || 0);
      const updatedAt = normalizeText(row && row.updated_at);
      const taskType = normalizeLower(row && row.task_type);
      acc.baleCount += 1;
      if (taskType === "sale") {
        acc.saleBaleCount += 1;
      } else {
        acc.dispatchBaleCount += 1;
      }
      acc.totalQty += Number.isFinite(qty) ? qty : 0;
      acc.totalCostKes = roundToTwo(acc.totalCostKes + (Number.isFinite(totalCostKes) ? totalCostKes : 0));
      if (!acc.latestUpdatedAt || new Date(updatedAt || 0).getTime() > new Date(acc.latestUpdatedAt || 0).getTime()) {
        acc.latestUpdatedAt = updatedAt;
      }
      return acc;
    }, {
      baleCount: 0,
      dispatchBaleCount: 0,
      saleBaleCount: 0,
      totalQty: 0,
      totalCostKes: 0,
      latestUpdatedAt: "",
    });
  }

  function buildStorePrepBaleDirectPrintPayload(row = {}, {
    printerName = "",
    templateCode = "",
  } = {}) {
    const taskType = normalizeLower(row && row.task_type) || "store_dispatch";
    const resolvedTemplateCode = normalizeText(templateCode) || getStorePrepTemplateDefaultCode(taskType);
    const displayCode = normalizeText(row && (row.scan_token || row.bale_barcode)).toUpperCase();
    const machineCode = normalizeMachineCode(row && (row.machine_code || row.barcode_value));
    const categoryMain = normalizeText(row && row.category_main);
    const categorySub = normalizeText(row && row.category_sub);
    const categoryDisplay = [categoryMain, categorySub].filter(Boolean).join(" / ");
    const actualWeightKg = Number(row && row.actual_weight_kg || 0);
    const qty = Number(row && row.qty || 0);
    const packagePositionLabel = actualWeightKg > 0
      ? `${qty} 件 · ${actualWeightKg % 1 === 0 ? String(actualWeightKg) : String(roundToTwo(actualWeightKg))} KG`
      : `${qty} 件`;
    return {
      printer_name: normalizeText(printerName),
      template_code: resolvedTemplateCode,
      copies: 1,
      barcode_value: machineCode,
      scan_token: machineCode,
      bale_barcode: normalizeText(row && row.bale_barcode).toUpperCase(),
      legacy_bale_barcode: "",
      display_code: displayCode,
      machine_code: machineCode,
      human_readable: machineCode,
      supplier_name: "SORTED STOCK",
      category_main: categoryMain,
      category_sub: categorySub,
      category_display: categoryDisplay,
      package_position_label: packagePositionLabel,
      serial_no: 1,
      total_packages: 1,
      shipment_no: normalizeText(row && row.task_no).toUpperCase(),
      parcel_batch_no: normalizeText(row && row.bale_no).toUpperCase(),
      unload_date: normalizeText(row && (row.updated_at || row.created_at)),
      template_scope: "warehouseout_bale",
      dispatch_bale_no: machineCode,
      status: taskType === "sale" ? "wait for sale" : "WAITING FOR STORE DISPATCH",
      cat: categoryMain,
      sub: categorySub,
      grade: normalizeText(row && row.grade_summary),
      qty: String(Math.max(0, qty)),
      weight: actualWeightKg > 0 ? `${actualWeightKg % 1 === 0 ? String(actualWeightKg) : String(roundToTwo(actualWeightKg))} KG` : "",
      code: displayCode,
    };
  }

  function getStorePrepTemplateDefaultCode(taskType = "store_dispatch") {
    return normalizeLower(taskType) === "sale" ? "wait_for_sale" : "wait_for_transtoshop";
  }

  function pickPreferredStorePrepTemplateCode(templates = [], {
    taskType = "store_dispatch",
    preferredValue = "",
    currentValue = "",
  } = {}) {
    const rows = Array.isArray(templates) ? templates : [];
    if (!rows.length) {
      return getStorePrepTemplateDefaultCode(taskType);
    }
    const preferred = normalizeLower(preferredValue);
    if (preferred && rows.some((row) => normalizeLower(row && row.template_code) === preferred)) {
      return preferred;
    }
    const current = normalizeLower(currentValue);
    if (current && rows.some((row) => normalizeLower(row && row.template_code) === current)) {
      return current;
    }
    const defaultCode = getStorePrepTemplateDefaultCode(taskType);
    if (rows.some((row) => normalizeLower(row && row.template_code) === defaultCode)) {
      return defaultCode;
    }
    return normalizeLower(rows[0] && rows[0].template_code);
  }

  return {
    buildStorePrepBaleDirectPrintPayload,
    buildStorePrepCategoryOptions,
    estimateSaleBaleGradeMix,
    getStorePrepTemplateDefaultCode,
    normalizeGradeRequirements,
    normalizeGradeRatios,
    pickPreferredStorePrepTemplateCode,
    summarizeStorePrepBales,
  };
});

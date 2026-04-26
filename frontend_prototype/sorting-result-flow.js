(function (root, factory) {
  const exports = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = exports;
  }
  root.SortingResultFlow = exports;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const SORTING_RESULT_GRADE_OPTIONS = Object.freeze([
    { value: "P", label: "P" },
    { value: "S", label: "S" },
  ]);

  function normalizeText(value) {
    return String(value || "").trim();
  }

  function normalizeLower(value) {
    return normalizeText(value).toLowerCase();
  }

  function normalizeGrade(value) {
    const normalized = normalizeText(value).toUpperCase();
    return normalized === "P" || normalized === "S" ? normalized : "";
  }

  function roundToTwo(value) {
    return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  }

  function normalizeSortingLossPhotos(photos = []) {
    return (Array.isArray(photos) ? photos : [])
      .map((row) => ({
        filename: normalizeText(row && row.filename),
        content_type: normalizeText(row && row.content_type) || "image/jpeg",
        data_url: normalizeText(row && row.data_url),
      }))
      .filter((row) => row.filename && row.data_url);
  }

  function normalizeSortingLossRecord(record = null) {
    const explicitFalse = Boolean(
      record
      && (
        record.has_loss === false
        || String((record && record.has_loss) ?? "").trim().toLowerCase() === "false"
      )
    );
    const hasLoss = Boolean(
      record && !explicitFalse
      && (
        record.has_loss === true
        || String(record.has_loss || "").trim().toLowerCase() === "true"
        || Number(record.loss_qty || 0) > 0
        || Number(record.loss_weight_kg || 0) > 0
      )
    );
    if (!hasLoss) {
      return {
        has_loss: false,
        loss_qty: 0,
        loss_weight_kg: 0,
        note: "",
        photos: [],
      };
    }
    return {
      has_loss: true,
      loss_qty: Math.max(0, Math.round(Number(record && record.loss_qty || 0))),
      loss_weight_kg: Math.max(0, roundToTwo(record && record.loss_weight_kg)),
      note: normalizeText(record && record.note),
      photos: normalizeSortingLossPhotos(record && record.photos),
    };
  }

  function getSortingSellableWeightKg(totalSourceWeightKg = 0, lossRecord = null) {
    const totalWeight = Math.max(0, roundToTwo(totalSourceWeightKg));
    const normalizedLoss = normalizeSortingLossRecord(lossRecord);
    if (!normalizedLoss.has_loss) {
      return totalWeight;
    }
    return Math.max(0, roundToTwo(totalWeight - normalizedLoss.loss_weight_kg));
  }

  function buildSortingResultCategoryName(categoryMain = "", categorySub = "") {
    const main = normalizeText(categoryMain);
    const sub = normalizeText(categorySub);
    if (main && sub) {
      return `${main} / ${sub}`;
    }
    return main || sub;
  }

  function parseSortingResultCategoryName(categoryName = "") {
    const parts = normalizeText(categoryName)
      .split("/")
      .map((part) => normalizeText(part))
      .filter(Boolean);
    return {
      category_main: parts[0] || "",
      category_sub: parts[1] || "",
    };
  }

  function inflateSortingResultRows(value) {
    return Array.isArray(value)
      ? value.map((row) => {
        const pair = parseSortingResultCategoryName(row && row.category_name);
        return {
          category_main: pair.category_main,
          category_sub: pair.category_sub,
          grade: normalizeGrade(row && row.grade) || "P",
          actual_weight_kg: roundToTwo(
            (row && row.actual_weight_kg)
            || (row && row.weight_kg)
            || (row && row.estimated_total_weight_kg),
          ) || "",
          qty: Number(row && row.qty || 1),
          rack_code: normalizeText(row && row.rack_code),
          default_cost_kes: roundToTwo(row && row.default_cost_kes),
          confirm_to_inventory: String(row && row.confirm_to_inventory) === "false" ? "false" : "true",
        };
      })
      : [];
  }

  function buildSortingResultOutputRows(rows, options = {}) {
    return (Array.isArray(rows) ? rows : []).map((row) => {
      const matchedCost = resolveSortingResultDefaultCost(options.defaultCosts, row);
      const defaultCostKes = matchedCost?.default_cost_kes ?? roundToTwo(row && row.default_cost_kes);
      const matchedRack = resolveSortingResultDefaultRack(options.defaultRacks, {
        ...row,
        default_cost_kes: defaultCostKes,
      });
      return {
        category_name: buildSortingResultCategoryName(row && row.category_main, row && row.category_sub),
        grade: normalizeGrade(row && row.grade) || "P",
        actual_weight_kg: roundToTwo(row && row.actual_weight_kg) || null,
        qty: Number(row && row.qty || 0),
        rack_code: normalizeText((matchedRack && matchedRack.rack_code) || (row && row.rack_code)),
        confirm_to_inventory: String(row && row.confirm_to_inventory) !== "false",
        default_cost_kes: defaultCostKes > 0 ? defaultCostKes : null,
      };
    });
  }

  function resolveSortingResultDefaultCost(defaultCostRows, row) {
    const normalizedMain = normalizeLower(row && row.category_main);
    const normalizedSub = normalizeLower(row && row.category_sub);
    const normalizedGrade = normalizeGrade(row && row.grade);
    if (!normalizedMain || !normalizedSub || !normalizedGrade) {
      return null;
    }
    return (Array.isArray(defaultCostRows) ? defaultCostRows : []).find(
      (entry) =>
        normalizeLower(entry && entry.category_main) === normalizedMain
        && normalizeLower(entry && entry.category_sub) === normalizedSub
        && normalizeGrade(entry && entry.grade) === normalizedGrade,
    ) || null;
  }

  function resolveSortingResultDefaultRack(defaultRackRows, row) {
    const normalizedMain = normalizeLower(row && row.category_main);
    const normalizedSub = normalizeLower(row && row.category_sub);
    const normalizedGrade = normalizeGrade(row && row.grade);
    const normalizedCost = roundToTwo(row && row.default_cost_kes);
    if (!normalizedMain || !normalizedSub || !normalizedGrade || !(normalizedCost > 0)) {
      return null;
    }
    return (Array.isArray(defaultRackRows) ? defaultRackRows : []).find(
      (entry) =>
        normalizeLower(entry && entry.category_main) === normalizedMain
        && normalizeLower(entry && entry.category_sub) === normalizedSub
        && normalizeGrade(entry && entry.grade) === normalizedGrade
        && roundToTwo(entry && entry.default_cost_kes) === normalizedCost,
    ) || null;
  }

  return {
    SORTING_RESULT_GRADE_OPTIONS,
    buildSortingResultCategoryName,
    parseSortingResultCategoryName,
    inflateSortingResultRows,
    buildSortingResultOutputRows,
    getSortingSellableWeightKg,
    normalizeSortingLossRecord,
    resolveSortingResultDefaultCost,
    resolveSortingResultDefaultRack,
  };
});

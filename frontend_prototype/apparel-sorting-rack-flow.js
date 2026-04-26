(function (root, factory) {
  const exports = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = exports;
  }
  root.ApparelSortingRackFlow = exports;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const DEFAULT_APPAREL_CATEGORY_PRESETS = Object.freeze([
    { category_main: "tops", category_sub: "lady tops", label: "女装上衣", rack_prefix: "A-TS-LT", cost_p: 185, cost_s: 138 },
    { category_main: "tops", category_sub: "unisex T-shirt", label: "中性T恤", rack_prefix: "A-TS-UT", cost_p: 165, cost_s: 126 },
    { category_main: "tops", category_sub: "men shirt", label: "男衬衫", rack_prefix: "A-TS-MS", cost_p: 190, cost_s: 145 },
    { category_main: "dress", category_sub: "short dress", label: "短裙", rack_prefix: "A-DR-SD", cost_p: 220, cost_s: 165 },
    { category_main: "dress", category_sub: "long dress", label: "长裙", rack_prefix: "A-DR-LD", cost_p: 245, cost_s: 188 },
    { category_main: "dress", category_sub: "2 pieces", label: "套装", rack_prefix: "A-DR-2P", cost_p: 280, cost_s: 215 },
    { category_main: "pants", category_sub: "sweat pant", label: "卫裤", rack_prefix: "A-PT-SW", cost_p: 195, cost_s: 148 },
    { category_main: "pants", category_sub: "cargo pant", label: "工装裤", rack_prefix: "A-PT-CR", cost_p: 205, cost_s: 156 },
    { category_main: "pants", category_sub: "jeans pant", label: "牛仔裤", rack_prefix: "A-PT-JE", cost_p: 210, cost_s: 158 },
    { category_main: "pants", category_sub: "others pants", label: "其他裤装", rack_prefix: "A-PT-OT", cost_p: 180, cost_s: 138 },
    { category_main: "jacket", category_sub: "jacket", label: "外套", rack_prefix: "A-JK-JK", cost_p: 260, cost_s: 198 },
    { category_main: "kids", category_sub: "baby kids", label: "婴童", rack_prefix: "A-KD-BB", cost_p: 145, cost_s: 108 },
    { category_main: "kids", category_sub: "big kids", label: "大童", rack_prefix: "A-KD-BK", cost_p: 165, cost_s: 124 },
    { category_main: "shoes", category_sub: "sport shoes", label: "运动鞋", rack_prefix: "A-SH-SP", cost_p: 320, cost_s: 248 },
    { category_main: "shoes", category_sub: "office shoes", label: "办公鞋", rack_prefix: "A-SH-OF", cost_p: 300, cost_s: 232 },
    { category_main: "shoes", category_sub: "lady shoes", label: "女鞋", rack_prefix: "A-SH-LD", cost_p: 285, cost_s: 218 },
    { category_main: "shoes", category_sub: "kids shoes", label: "童鞋", rack_prefix: "A-SH-KD", cost_p: 210, cost_s: 158 },
    { category_main: "bags", category_sub: "bags", label: "包袋", rack_prefix: "A-BG-BG", cost_p: 240, cost_s: 182 },
    { category_main: "cosmetics", category_sub: "cosmetics", label: "化妆品", rack_prefix: "A-CS-CS", cost_p: 135, cost_s: 98 },
    { category_main: "others", category_sub: "others", label: "其他", rack_prefix: "A-OT-OT", cost_p: 150, cost_s: 112 },
  ]);

  const DEFAULT_APPAREL_SORTING_RACKS = Object.freeze(
    DEFAULT_APPAREL_CATEGORY_PRESETS.flatMap((preset) => ([
      { category_main: preset.category_main, category_sub: preset.category_sub, grade: "P", default_cost_kes: preset.cost_p, rack_code: `${preset.rack_prefix}-P-01`, note: `${preset.label} P 档默认分拣库位` },
      { category_main: preset.category_main, category_sub: preset.category_sub, grade: "S", default_cost_kes: preset.cost_s, rack_code: `${preset.rack_prefix}-S-01`, note: `${preset.label} S 档默认分拣库位` },
    ])),
  );

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

  function normalizeRackCode(value) {
    return normalizeText(value).toUpperCase();
  }

  function normalizeApparelSortingRackRows(rows = []) {
    const seen = new Set();
    return (Array.isArray(rows) ? rows : [])
      .map((row) => ({
        category_main: normalizeText(row && row.category_main),
        category_sub: normalizeText(row && row.category_sub),
        grade: normalizeGrade(row && row.grade),
        default_cost_kes: roundToTwo(row && row.default_cost_kes),
        rack_code: normalizeRackCode(row && row.rack_code),
        note: normalizeText(row && row.note),
      }))
      .filter((row) => row.category_main && row.category_sub && row.grade && row.default_cost_kes > 0 && row.rack_code)
      .filter((row) => {
        const key = `${normalizeLower(row.category_main)}||${normalizeLower(row.category_sub)}||${row.grade}||${row.default_cost_kes.toFixed(2)}`;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      })
      .sort((left, right) => {
        const leftKey = `${left.category_main}/${left.category_sub}/${left.grade}/${left.default_cost_kes}`;
        const rightKey = `${right.category_main}/${right.category_sub}/${right.grade}/${right.default_cost_kes}`;
        return leftKey.localeCompare(rightKey, "zh-CN");
      });
  }

  function findApparelSortingRackRecord(rows = [], categoryMain = "", categorySub = "", grade = "", defaultCostKes = 0) {
    const normalizedMain = normalizeLower(categoryMain);
    const normalizedSub = normalizeLower(categorySub);
    const normalizedGrade = normalizeGrade(grade);
    const normalizedCost = roundToTwo(defaultCostKes);
    if (!normalizedMain || !normalizedSub || !normalizedGrade || !(normalizedCost > 0)) {
      return null;
    }
    return normalizeApparelSortingRackRows(rows).find(
      (row) =>
        normalizeLower(row && row.category_main) === normalizedMain
        && normalizeLower(row && row.category_sub) === normalizedSub
        && normalizeGrade(row && row.grade) === normalizedGrade
        && roundToTwo(row && row.default_cost_kes) === normalizedCost,
    ) || null;
  }

  function summarizeApparelSortingRacks(rows = []) {
    return normalizeApparelSortingRackRows(rows).reduce(
      (summary, row) => {
        summary.totalCount += 1;
        summary.gradeCounts[row.grade] += 1;
        return summary;
      },
      {
        totalCount: 0,
        gradeCounts: { P: 0, S: 0 },
      },
    );
  }

  return {
    DEFAULT_APPAREL_CATEGORY_PRESETS,
    DEFAULT_APPAREL_SORTING_RACKS,
    normalizeApparelSortingRackRows,
    findApparelSortingRackRecord,
    summarizeApparelSortingRacks,
  };
});

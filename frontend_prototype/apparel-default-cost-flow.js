(function (root, factory) {
  const exports = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = exports;
  }
  root.ApparelDefaultCostFlow = exports;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const DEFAULT_APPAREL_CATEGORY_PRESETS = Object.freeze([
    { category_main: "tops", category_sub: "lady tops", label: "女装上衣", cost_p: 185, cost_s: 138 },
    { category_main: "tops", category_sub: "unisex T-shirt", label: "中性T恤", cost_p: 165, cost_s: 126 },
    { category_main: "tops", category_sub: "men shirt", label: "男衬衫", cost_p: 190, cost_s: 145 },
    { category_main: "dress", category_sub: "short dress", label: "短裙", cost_p: 220, cost_s: 165 },
    { category_main: "dress", category_sub: "long dress", label: "长裙", cost_p: 245, cost_s: 188 },
    { category_main: "dress", category_sub: "2 pieces", label: "套装", cost_p: 280, cost_s: 215 },
    { category_main: "pants", category_sub: "sweat pant", label: "卫裤", cost_p: 195, cost_s: 148 },
    { category_main: "pants", category_sub: "cargo pant", label: "工装裤", cost_p: 205, cost_s: 156 },
    { category_main: "pants", category_sub: "jeans pant", label: "牛仔裤", cost_p: 210, cost_s: 158 },
    { category_main: "pants", category_sub: "others pants", label: "其他裤装", cost_p: 180, cost_s: 138 },
    { category_main: "jacket", category_sub: "jacket", label: "外套", cost_p: 260, cost_s: 198 },
    { category_main: "kids", category_sub: "baby kids", label: "婴童", cost_p: 145, cost_s: 108 },
    { category_main: "kids", category_sub: "big kids", label: "大童", cost_p: 165, cost_s: 124 },
    { category_main: "shoes", category_sub: "sport shoes", label: "运动鞋", cost_p: 320, cost_s: 248 },
    { category_main: "shoes", category_sub: "office shoes", label: "办公鞋", cost_p: 300, cost_s: 232 },
    { category_main: "shoes", category_sub: "lady shoes", label: "女鞋", cost_p: 285, cost_s: 218 },
    { category_main: "shoes", category_sub: "kids shoes", label: "童鞋", cost_p: 210, cost_s: 158 },
    { category_main: "bags", category_sub: "bags", label: "包袋", cost_p: 240, cost_s: 182 },
    { category_main: "cosmetics", category_sub: "cosmetics", label: "化妆品", cost_p: 135, cost_s: 98 },
    { category_main: "others", category_sub: "others", label: "其他", cost_p: 150, cost_s: 112 },
  ]);

  const DEFAULT_APPAREL_DEFAULT_COSTS = Object.freeze(
    DEFAULT_APPAREL_CATEGORY_PRESETS.flatMap((preset) => ([
      { category_main: preset.category_main, category_sub: preset.category_sub, grade: "P", default_cost_kes: preset.cost_p, note: `${preset.label} P 档默认成本` },
      { category_main: preset.category_main, category_sub: preset.category_sub, grade: "S", default_cost_kes: preset.cost_s, note: `${preset.label} S 档默认成本` },
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

  function normalizeApparelDefaultCostRows(rows = []) {
    const seen = new Set();
    return (Array.isArray(rows) ? rows : [])
      .map((row) => ({
        category_main: normalizeText(row && row.category_main),
        category_sub: normalizeText(row && row.category_sub),
        grade: normalizeGrade(row && row.grade),
        default_cost_kes: roundToTwo(row && row.default_cost_kes),
        note: normalizeText(row && row.note),
      }))
      .filter((row) => row.category_main && row.category_sub && row.grade && row.default_cost_kes > 0)
      .filter((row) => {
        const key = `${normalizeLower(row.category_main)}||${normalizeLower(row.category_sub)}||${row.grade}`;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      })
      .sort((left, right) => {
        const leftKey = `${left.category_main}/${left.category_sub}/${left.grade}`;
        const rightKey = `${right.category_main}/${right.category_sub}/${right.grade}`;
        return leftKey.localeCompare(rightKey, "zh-CN");
      });
  }

  function findApparelDefaultCostRecord(rows = [], categoryMain = "", categorySub = "", grade = "") {
    const normalizedMain = normalizeLower(categoryMain);
    const normalizedSub = normalizeLower(categorySub);
    const normalizedGrade = normalizeGrade(grade);
    if (!normalizedMain || !normalizedSub || !normalizedGrade) {
      return null;
    }
    return normalizeApparelDefaultCostRows(rows).find(
      (row) =>
        normalizeLower(row && row.category_main) === normalizedMain
        && normalizeLower(row && row.category_sub) === normalizedSub
        && normalizeGrade(row && row.grade) === normalizedGrade,
    ) || null;
  }

  function summarizeApparelDefaultCosts(rows = []) {
    return normalizeApparelDefaultCostRows(rows).reduce(
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
    DEFAULT_APPAREL_DEFAULT_COSTS,
    normalizeApparelDefaultCostRows,
    findApparelDefaultCostRecord,
    summarizeApparelDefaultCosts,
  };
});

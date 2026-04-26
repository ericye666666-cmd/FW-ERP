(function (root, factory) {
  const exports = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = exports;
  }
  root.SortingStockFlow = exports;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function normalizeText(value) {
    return String(value || "").trim();
  }

  function normalizeLower(value) {
    return normalizeText(value).toLowerCase();
  }

  function roundToTwo(value) {
    return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
  }

  function createGradeQtyMap() {
    return { P: 0, S: 0 };
  }

  function addGradeQty(target, grade, qty) {
    const normalizedGrade = normalizeText(grade).toUpperCase();
    const normalizedQty = Number(qty || 0);
    if (!Object.prototype.hasOwnProperty.call(target, normalizedGrade) || !Number.isFinite(normalizedQty) || normalizedQty <= 0) {
      return;
    }
    target[normalizedGrade] += normalizedQty;
  }

  function getSortingStockCategoryMain(row) {
    const explicit = normalizeText(row && row.category_main);
    if (explicit) {
      return explicit;
    }
    const categoryName = normalizeText(row && row.category_name);
    if (!categoryName) {
      return "";
    }
    return normalizeText(categoryName.split("/")[0]);
  }

  function buildSortingStockCategoryOptions(rows) {
    const values = [...new Set(
      (Array.isArray(rows) ? rows : [])
        .map((row) => getSortingStockCategoryMain(row))
        .filter(Boolean)
        .sort((left, right) => normalizeLower(left).localeCompare(normalizeLower(right), "zh-CN"))
    )];
    return [{ value: "", label: "全部大类" }, ...values.map((value) => ({ value, label: value }))];
  }

  function getSortingStockCategorySub(row) {
    const explicit = normalizeText(row && row.category_sub);
    if (explicit) {
      return explicit;
    }
    const categoryName = normalizeText(row && row.category_name);
    if (!categoryName) {
      return "";
    }
    return normalizeText(categoryName.split("/")[1] || categoryName.split("/")[0] || "");
  }

  function filterSortingStockRowsByMainCategory(rows, selectedMain) {
    const normalizedMain = normalizeLower(selectedMain);
    return (Array.isArray(rows) ? rows : []).filter((row) => {
      if (!normalizedMain) {
        return true;
      }
      return normalizeLower(getSortingStockCategoryMain(row)) === normalizedMain;
    });
  }

  function summarizeSortingStockRows(rows) {
    const summary = (Array.isArray(rows) ? rows : []).reduce((acc, row) => {
      const qty = Number(row && row.qty_on_hand || 0);
      const rackCode = normalizeText(row && row.rack_code);
      const updatedAt = normalizeText(row && row.updated_at);
      const totalCostKes = Number(
        row && (
          row.total_cost_kes
          ?? ((row.unit_cost_kes != null && row.qty_on_hand != null) ? Number(row.unit_cost_kes) * Number(row.qty_on_hand) : 0)
        ) || 0,
      );
      acc.totalRowCount += 1;
      acc.totalQty += Number.isFinite(qty) ? qty : 0;
      acc.totalInventoryValueKes = roundToTwo(acc.totalInventoryValueKes + (Number.isFinite(totalCostKes) ? totalCostKes : 0));
      if (rackCode) {
        acc.rackCodeSet.add(rackCode);
      }
      if (!acc.latestUpdatedAt || new Date(updatedAt || 0).getTime() > new Date(acc.latestUpdatedAt || 0).getTime()) {
        acc.latestUpdatedAt = updatedAt;
      }
      return acc;
    }, {
      totalRowCount: 0,
      totalQty: 0,
      totalInventoryValueKes: 0,
      latestUpdatedAt: "",
      rackCodeSet: new Set(),
    });

    return {
      totalRowCount: summary.totalRowCount,
      totalQty: summary.totalQty,
      rackCount: summary.rackCodeSet.size,
      totalInventoryValueKes: summary.totalInventoryValueKes,
      latestUpdatedAt: summary.latestUpdatedAt,
    };
  }

  function buildSortingCompressionGroups(looseRows, packedRows, openTasks) {
    const groups = new Map();
    function getGroup(main, sub) {
      const key = `${normalizeLower(main)}||${normalizeLower(sub)}`;
      if (!groups.has(key)) {
        groups.set(key, {
          groupKey: key,
          categoryMain: normalizeText(main),
          categorySub: normalizeText(sub),
          looseRows: [],
          packedRows: [],
          openTasks: [],
          looseQty: 0,
          packedQty: 0,
          suspendedQty: 0,
          availableLooseQty: 0,
          looseValueKes: 0,
          packedValueKes: 0,
          looseQtyByGrade: createGradeQtyMap(),
          suspendedQtyByGrade: createGradeQtyMap(),
          availableLooseQtyByGrade: createGradeQtyMap(),
        });
      }
      return groups.get(key);
    }
    (Array.isArray(looseRows) ? looseRows : []).forEach((row) => {
      const main = getSortingStockCategoryMain(row);
      const sub = getSortingStockCategorySub(row);
      if (!sub) {
        return;
      }
      const group = getGroup(main, sub);
      const qty = Number(row && row.qty_on_hand || 0);
      const totalCostKes = Number(row && row.total_cost_kes || 0);
      addGradeQty(group.looseQtyByGrade, row && row.grade, qty);
      group.looseRows.push(row);
      group.looseQty += Number.isFinite(qty) ? qty : 0;
      group.looseValueKes = roundToTwo(group.looseValueKes + (Number.isFinite(totalCostKes) ? totalCostKes : 0));
    });
    (Array.isArray(packedRows) ? packedRows : []).forEach((row) => {
      const main = normalizeText(row && row.category_main);
      const sub = normalizeText(row && row.category_sub);
      if (!sub) {
        return;
      }
      const group = getGroup(main, sub);
      const qty = Number(row && row.qty || 0);
      const totalCostKes = Number(row && row.total_cost_kes || 0);
      group.packedRows.push(row);
      group.packedQty += Number.isFinite(qty) ? qty : 0;
      group.packedValueKes = roundToTwo(group.packedValueKes + (Number.isFinite(totalCostKes) ? totalCostKes : 0));
    });
    (Array.isArray(openTasks) ? openTasks : []).forEach((row) => {
      if (normalizeLower(row && row.status) !== "open") {
        return;
      }
      const sub = normalizeText(row && row.category_sub);
      if (!sub) {
        return;
      }
      const explicitMain = normalizeText(row && row.category_main);
      let group = explicitMain ? groups.get(`${normalizeLower(explicitMain)}||${normalizeLower(sub)}`) : null;
      if (!group) {
        group = [...groups.values()].find((entry) => normalizeLower(entry && entry.categorySub) === normalizeLower(sub)) || null;
      }
      if (!group) {
        group = getGroup(explicitMain, sub);
      }
      group.openTasks.push(row);
      group.suspendedQty += Number(row && (row.suspended_qty ?? row.target_qty) || 0);
      (Array.isArray(row && row.grade_requirements) ? row.grade_requirements : []).forEach((requirement) => {
        addGradeQty(group.suspendedQtyByGrade, requirement && requirement.grade, requirement && requirement.qty);
      });
    });
    groups.forEach((group) => {
      group.availableLooseQty = Math.max(Number(group.looseQty || 0) - Number(group.suspendedQty || 0), 0);
      group.availableLooseQtyByGrade = {
        P: Math.max(Number(group.looseQtyByGrade.P || 0) - Number(group.suspendedQtyByGrade.P || 0), 0),
        S: Math.max(Number(group.looseQtyByGrade.S || 0) - Number(group.suspendedQtyByGrade.S || 0), 0),
      };
    });
    return [...groups.values()].sort((left, right) => {
      const mainCompare = normalizeLower(left.categoryMain).localeCompare(normalizeLower(right.categoryMain), "zh-CN");
      if (mainCompare !== 0) {
        return mainCompare;
      }
      return normalizeLower(left.categorySub).localeCompare(normalizeLower(right.categorySub), "zh-CN");
    });
  }

  function buildSortingCompressionEmployeeOptions(employees, occupancy) {
    const openTaskByEmployee = new Map();
    const compressionTasks = Array.isArray(occupancy)
      ? occupancy
      : (Array.isArray(occupancy && occupancy.compressionTasks) ? occupancy.compressionTasks : []);
    const sortingTasks = Array.isArray(occupancy && occupancy.sortingTasks) ? occupancy.sortingTasks : [];
    compressionTasks.forEach((row) => {
      if (normalizeLower(row && row.status) !== "open") {
        return;
      }
      const username = normalizeText(row && row.assigned_employee);
      if (!username || openTaskByEmployee.has(username)) {
        return;
      }
      openTaskByEmployee.set(username, {
        taskNo: normalizeText(row && row.task_no),
        statusLabel: normalizeLower(row && row.task_type) === "sale" ? "待售卖压缩工单进行中" : "压缩工单进行中",
      });
    });
    sortingTasks.forEach((row) => {
      if (normalizeLower(row && row.status) !== "open") {
        return;
      }
      const taskNo = normalizeText(row && row.task_no);
      (Array.isArray(row && row.handler_names) ? row.handler_names : []).forEach((handlerName) => {
        const username = normalizeText(handlerName);
        if (!username || openTaskByEmployee.has(username)) {
          return;
        }
        openTaskByEmployee.set(username, {
          taskNo,
          statusLabel: "分拣任务进行中",
        });
      });
    });
    return (Array.isArray(employees) ? employees : []).map((row) => {
      const value = normalizeText(row && row.username);
      const fullName = normalizeText(row && row.full_name) || value;
      const occupied = openTaskByEmployee.get(value) || null;
      const occupiedTaskNo = occupied && occupied.taskNo ? occupied.taskNo : "";
      const occupiedStatusLabel = occupied && occupied.statusLabel ? occupied.statusLabel : "";
      return {
        value,
        label: occupiedTaskNo ? `${fullName} · ${value} · ${occupiedStatusLabel}（${occupiedTaskNo}）` : `${fullName} · ${value}`,
        disabled: Boolean(occupiedTaskNo),
        occupiedTaskNo,
        occupiedStatusLabel,
      };
    });
  }

  function filterSortingCompressionGroups(groups, filters) {
    const searchText = normalizeLower(filters && filters.searchText);
    const categoryMain = normalizeLower(filters && filters.categoryMain);
    const minLooseQty = Number(filters && filters.minLooseQty || 0);
    return (Array.isArray(groups) ? groups : []).filter((group) => {
      if (categoryMain && normalizeLower(group && group.categoryMain) !== categoryMain) {
        return false;
      }
      if (minLooseQty > 0 && Number(group && group.looseQty || 0) < minLooseQty) {
        return false;
      }
      if (!searchText) {
        return true;
      }
      const haystack = [
        normalizeText(group && group.categoryMain),
        normalizeText(group && group.categorySub),
        ...((Array.isArray(group && group.looseRows) ? group.looseRows : []).flatMap((row) => [
          normalizeText(row && row.category_name),
          normalizeText(row && row.sku_code),
          normalizeText(row && row.grade),
          normalizeText(row && row.rack_code),
        ])),
        ...((Array.isArray(group && group.packedRows) ? group.packedRows : []).flatMap((row) => [
          normalizeText(row && row.bale_no),
          normalizeText(row && row.bale_barcode),
          normalizeText(row && row.task_no),
        ])),
        ...((Array.isArray(group && group.openTasks) ? group.openTasks : []).flatMap((row) => [
          normalizeText(row && row.task_no),
          normalizeText(row && row.assigned_employee),
          normalizeText(row && row.label_summary),
        ])),
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(searchText);
    });
  }

  function buildSortingCompressionDisplaySections(group) {
    const looseGradeBuckets = new Map();
    const packedTaskBuckets = new Map();
    const normalizedGroup = group && typeof group === "object" ? group : {};
    (Array.isArray(normalizedGroup.looseRows) ? normalizedGroup.looseRows : []).forEach((row) => {
      const normalizedGrade = normalizeText(row && row.grade).toUpperCase() || "未分级";
      if (!looseGradeBuckets.has(normalizedGrade)) {
        looseGradeBuckets.set(normalizedGrade, {
          grade: normalizedGrade,
          qty: 0,
          rackCodes: new Set(),
          internalCodes: new Set(),
          totalCostKes: 0,
          latestUpdatedAt: "",
          rows: [],
        });
      }
      const bucket = looseGradeBuckets.get(normalizedGrade);
      const qty = Number(row && row.qty_on_hand || 0);
      const totalCostKes = Number(row && row.total_cost_kes || 0);
      bucket.qty += Number.isFinite(qty) ? qty : 0;
      bucket.totalCostKes = roundToTwo(bucket.totalCostKes + (Number.isFinite(totalCostKes) ? totalCostKes : 0));
      const rackCode = normalizeText(row && row.rack_code);
      const internalCode = normalizeText(row && row.sku_code);
      if (rackCode) {
        bucket.rackCodes.add(rackCode);
      }
      if (internalCode) {
        bucket.internalCodes.add(internalCode);
      }
      bucket.rows.push(row);
      const updatedAt = normalizeText(row && row.updated_at);
      if (!bucket.latestUpdatedAt || new Date(updatedAt || 0).getTime() > new Date(bucket.latestUpdatedAt || 0).getTime()) {
        bucket.latestUpdatedAt = updatedAt;
      }
    });
    (Array.isArray(normalizedGroup.packedRows) ? normalizedGroup.packedRows : []).forEach((row) => {
      const normalizedTaskType = normalizeLower(row && row.task_type) === "sale" ? "sale" : "store_dispatch";
      if (!packedTaskBuckets.has(normalizedTaskType)) {
        packedTaskBuckets.set(normalizedTaskType, {
          taskType: normalizedTaskType,
          baleCount: 0,
          qty: 0,
          totalCostKes: 0,
          latestUpdatedAt: "",
          gradeSummaries: new Set(),
          rows: [],
        });
      }
      const bucket = packedTaskBuckets.get(normalizedTaskType);
      const qty = Number(row && row.qty || 0);
      const totalCostKes = Number(row && row.total_cost_kes || 0);
      bucket.baleCount += 1;
      bucket.qty += Number.isFinite(qty) ? qty : 0;
      bucket.totalCostKes = roundToTwo(bucket.totalCostKes + (Number.isFinite(totalCostKes) ? totalCostKes : 0));
      const gradeSummary = normalizeText(row && row.grade_summary);
      if (gradeSummary) {
        bucket.gradeSummaries.add(gradeSummary);
      }
      const updatedAt = normalizeText(row && row.updated_at);
      if (!bucket.latestUpdatedAt || new Date(updatedAt || 0).getTime() > new Date(bucket.latestUpdatedAt || 0).getTime()) {
        bucket.latestUpdatedAt = updatedAt;
      }
      bucket.rows.push(row);
    });

    const looseGradeCards = [...looseGradeBuckets.values()]
      .map((bucket) => ({
        grade: bucket.grade,
        qty: bucket.qty,
        rackCodes: [...bucket.rackCodes.values()].sort((left, right) => normalizeLower(left).localeCompare(normalizeLower(right), "zh-CN")),
        internalCodes: [...bucket.internalCodes.values()].sort((left, right) => normalizeLower(left).localeCompare(normalizeLower(right), "zh-CN")),
        totalCostKes: bucket.totalCostKes,
        latestUpdatedAt: bucket.latestUpdatedAt,
        rows: bucket.rows,
      }))
      .sort((left, right) => normalizeLower(left.grade).localeCompare(normalizeLower(right.grade), "zh-CN"));

    const packedTaskCards = [...packedTaskBuckets.values()]
      .map((bucket) => ({
        taskType: bucket.taskType,
        baleCount: bucket.baleCount,
        qty: bucket.qty,
        totalCostKes: bucket.totalCostKes,
        latestUpdatedAt: bucket.latestUpdatedAt,
        gradeSummaries: [...bucket.gradeSummaries.values()].sort((left, right) => normalizeLower(left).localeCompare(normalizeLower(right), "zh-CN")),
        rows: bucket.rows,
      }))
      .sort((left, right) => {
        const order = { store_dispatch: 0, sale: 1 };
        return (order[left.taskType] ?? 99) - (order[right.taskType] ?? 99);
      });

    return {
      looseGradeCards,
      packedTaskCards,
      packedBaleCount: (Array.isArray(normalizedGroup.packedRows) ? normalizedGroup.packedRows : []).length,
      storeDispatchBaleCount: packedTaskCards.find((row) => row.taskType === "store_dispatch")?.baleCount || 0,
      saleBaleCount: packedTaskCards.find((row) => row.taskType === "sale")?.baleCount || 0,
    };
  }

  return {
    buildSortingStockCategoryOptions,
    buildSortingCompressionGroups,
    buildSortingCompressionDisplaySections,
    buildSortingCompressionEmployeeOptions,
    filterSortingStockRowsByMainCategory,
    filterSortingCompressionGroups,
    getSortingStockCategoryMain,
    getSortingStockCategorySub,
    summarizeSortingStockRows,
  };
});

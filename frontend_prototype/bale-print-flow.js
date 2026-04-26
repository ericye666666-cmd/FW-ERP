(function (root, factory) {
  const exports = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = exports;
  }
  root.BalePrintFlow = exports;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function normalizeBarcode(value) {
    return String(value || "").trim().toUpperCase();
  }

  function normalizeText(value) {
    return String(value || "").trim();
  }

  function isWarehouseShortCode(value) {
    return /^RB[A-Z0-9]{6,}$/.test(normalizeBarcode(value));
  }

  function computeEditDistance(leftValue, rightValue, maxDistance) {
    const left = normalizeBarcode(leftValue);
    const right = normalizeBarcode(rightValue);
    if (left === right) {
      return 0;
    }
    if (!left || !right) {
      return Math.max(left.length, right.length);
    }
    if (Math.abs(left.length - right.length) > maxDistance) {
      return maxDistance + 1;
    }
    let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let rowIndex = 1; rowIndex <= left.length; rowIndex += 1) {
      const current = [rowIndex];
      let rowMin = current[0];
      for (let columnIndex = 1; columnIndex <= right.length; columnIndex += 1) {
        const substitutionCost = left[rowIndex - 1] === right[columnIndex - 1] ? 0 : 1;
        const value = Math.min(
          previous[columnIndex] + 1,
          current[columnIndex - 1] + 1,
          previous[columnIndex - 1] + substitutionCost,
        );
        current.push(value);
        rowMin = Math.min(rowMin, value);
      }
      if (rowMin > maxDistance) {
        return maxDistance + 1;
      }
      previous = current;
    }
    return previous[right.length];
  }

  function findApproximateShortCodeMatch(rows, barcode, maxDistance = 2) {
    const normalizedCode = normalizeBarcode(barcode);
    if (!isWarehouseShortCode(normalizedCode)) {
      return { matchedRow: null, ambiguous: false };
    }
    let matchedRow = null;
    let bestDistance = maxDistance + 1;
    let ambiguous = false;
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const candidate = normalizeBarcode(row && row.bale_barcode);
      if (!isWarehouseShortCode(candidate) || candidate.slice(0, 4) !== normalizedCode.slice(0, 4)) {
        return;
      }
      const distance = computeEditDistance(candidate, normalizedCode, maxDistance);
      if (distance > maxDistance) {
        return;
      }
      if (distance < bestDistance) {
        matchedRow = row;
        bestDistance = distance;
        ambiguous = false;
        return;
      }
      if (distance === bestDistance && normalizeBarcode(matchedRow && matchedRow.bale_barcode) !== candidate) {
        ambiguous = true;
      }
    });
    if (ambiguous) {
      return { matchedRow: null, ambiguous: true };
    }
    return { matchedRow, ambiguous: false };
  }

  function matchesBaleReference(row, barcode) {
    const normalized = normalizeBarcode(barcode);
    if (!normalized) {
      return false;
    }
    return (
      normalizeBarcode(row && row.bale_barcode) === normalized
      || normalizeBarcode(row && row.legacy_bale_barcode) === normalized
      || normalizeBarcode(row && row.scan_token) === normalized
    );
  }

  function hasPrintedMark(row) {
    return Boolean(String(row && row.printed_at ? row.printed_at : "").trim());
  }

  function sortRowsBySerial(rows) {
    return (Array.isArray(rows) ? [...rows] : []).sort(
      (left, right) => Number(left && left.serial_no ? left.serial_no : 0) - Number(right && right.serial_no ? right.serial_no : 0),
    );
  }

  function buildBaleGroupPrintPlan(targetGroup, queuedJobs) {
    const groupRows = sortRowsBySerial(targetGroup && targetGroup.rows ? targetGroup.rows : []);
    const pendingRows = groupRows.filter((row) => !hasPrintedMark(row));
    const pendingCodeSet = new Set(pendingRows.map((row) => normalizeBarcode(row && row.bale_barcode)));
    const queuedByCode = new Map();

    (Array.isArray(queuedJobs) ? queuedJobs : []).forEach((job) => {
      const code = normalizeBarcode(job && job.barcode);
      if (!code || !pendingCodeSet.has(code) || queuedByCode.has(code)) {
        return;
      }
      queuedByCode.set(code, job);
    });

    const orderedQueuedJobs = pendingRows
      .map((row) => queuedByCode.get(normalizeBarcode(row && row.bale_barcode)))
      .filter(Boolean);

    const missingRows = pendingRows.filter((row) => !queuedByCode.has(normalizeBarcode(row && row.bale_barcode)));

    return {
      pendingRows,
      orderedQueuedJobs,
      missingRows,
      pendingCount: pendingRows.length,
    };
  }

  function getBaleGroupCompletionAction(targetGroup) {
    const pendingCount = sortRowsBySerial(targetGroup && targetGroup.rows ? targetGroup.rows : []).filter((row) => !hasPrintedMark(row)).length;
    if (pendingCount > 0) {
      return {
        action: "resume_printing",
        pendingCount,
      };
    }
    return {
      action: "already_complete",
      pendingCount: 0,
    };
  }

  function getBaleShipmentContinuationAction(rows, batchGroups) {
    const pendingRows = sortRowsBySerial(Array.isArray(rows) ? rows : []).filter((row) => !hasPrintedMark(row));
    if (!pendingRows.length) {
      return {
        action: "proceed_to_sorting",
        pendingCount: 0,
        nextPendingKey: "",
      };
    }

    const nextPendingGroup = (Array.isArray(batchGroups) ? batchGroups : []).find((group) =>
      Array.isArray(group && group.rows) && group.rows.some((row) => !hasPrintedMark(row)),
    );

    return {
      action: "resume_printing",
      pendingCount: pendingRows.length,
      nextPendingKey: normalizeBarcode(nextPendingGroup && nextPendingGroup.batchNo),
    };
  }

  function getBaleModalCompletionAction(options) {
    const pendingCount = Number(options && options.pendingCount ? options.pendingCount : 0);
    const hasSuccessfulBatchPrint = Boolean(options && options.hasSuccessfulBatchPrint);
    if (pendingCount <= 0) {
      return {
        action: "already_complete",
        pendingCount: 0,
      };
    }
    if (!hasSuccessfulBatchPrint) {
      return {
        action: "print_first",
        pendingCount,
      };
    }
    return {
      action: "complete_group",
      pendingCount,
    };
  }

  function getBaleModalCloseAction(options) {
    const completionAction = getBaleModalCompletionAction(options);
    if (completionAction.action === "already_complete") {
      return {
        action: "allow_close",
        pendingCount: 0,
        message: "",
      };
    }
    if (completionAction.action === "print_first") {
      return {
        action: "keep_modal_open",
        pendingCount: completionAction.pendingCount,
        message: `请先点“打印本轮全部 ${completionAction.pendingCount} 张”，核对实体出纸后，再点“确认本类已贴完”。当前不能直接结束这轮贴码流程。`,
      };
    }
    return {
      action: "keep_modal_open",
      pendingCount: completionAction.pendingCount,
      message: "请先点“确认本类已贴完”，再结束这轮贴码流程。",
    };
  }

  function formatCategoryDisplay(row) {
    const parts = [row && row.category_main, row && row.category_sub]
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    return parts.join(" / ");
  }

  function buildBaleDirectPrintPayload(job, options = {}) {
    const currentIndex = Number(options && options.currentIndex ? options.currentIndex : 0);
    const totalJobs = Number(options && options.totalJobs ? options.totalJobs : 0);
    return {
      printer_name: normalizeText(options && options.printerName),
      template_code: normalizeText(options && options.templateCode),
      copies: Number(job && job.copies ? job.copies : 1) || 1,
      barcode_value: normalizeText(job && job.print_payload && (job.print_payload.scan_token || job.print_payload.barcode_value) || job && job.barcode),
      scan_token: normalizeText(job && job.print_payload && (job.print_payload.scan_token || job.print_payload.barcode_value)),
      bale_barcode: normalizeText(job && (job.barcode || (job.print_payload && job.print_payload.bale_barcode))),
      legacy_bale_barcode: normalizeText(job && job.print_payload && job.print_payload.legacy_bale_barcode),
      supplier_name: normalizeText(job && job.print_payload && job.print_payload.supplier_name || options && options.supplierName),
      category_main: normalizeText(job && job.print_payload && job.print_payload.category_main),
      category_sub: normalizeText(job && job.print_payload && job.print_payload.category_sub),
      category_display: normalizeText(job && job.print_payload && job.print_payload.category_display || options && options.categoryDisplay || job && job.product_name),
      package_position_label: normalizeText(
        job && job.print_payload && (job.print_payload.package_position_label || job.print_payload.package_position)
          || `第 ${job && job.print_payload && job.print_payload.serial_no || currentIndex + 1} 包 / 共 ${job && job.print_payload && job.print_payload.total_packages || totalJobs || 1} 包`,
      ),
      serial_no: Number(job && job.print_payload && job.print_payload.serial_no ? job.print_payload.serial_no : currentIndex + 1 || 0),
      total_packages: Number(job && job.print_payload && job.print_payload.total_packages ? job.print_payload.total_packages : totalJobs || 0),
      shipment_no: normalizeText(job && job.print_payload && job.print_payload.shipment_no),
      parcel_batch_no: normalizeText(job && job.print_payload && job.print_payload.parcel_batch_no),
      unload_date: normalizeText(job && job.print_payload && (job.print_payload.unload_date || job.print_payload.received_at)),
    };
  }

  function buildBaleScanPayload(status, barcode, row, approximate = false) {
    return {
      status,
      barcode,
      baleBarcode: normalizeBarcode(row && row.bale_barcode),
      scanToken: normalizeBarcode(row && row.scan_token),
      shipmentNo: normalizeBarcode(row && row.shipment_no),
      batchNo: String(row && row.parcel_batch_no ? row.parcel_batch_no : "").trim(),
      groupKey: normalizeBarcode(row && row.parcel_batch_no),
      supplierName: String(row && row.supplier_name ? row.supplier_name : "").trim(),
      categoryDisplay: formatCategoryDisplay(row),
      serialNo: Number(row && row.serial_no ? row.serial_no : 0),
      printed: hasPrintedMark(row),
      approximate,
    };
  }

  function getBaleScanTestResult(options) {
    const barcode = normalizeBarcode(options && options.barcode);
    if (!barcode) {
      return {
        status: "empty",
        barcode: "",
        baleBarcode: "",
        scanToken: "",
        shipmentNo: "",
        batchNo: "",
        groupKey: "",
        supplierName: "",
        categoryDisplay: "",
        serialNo: 0,
        printed: false,
      };
    }

    const shipmentRows = sortRowsBySerial(options && options.shipmentRows ? options.shipmentRows : []);
    const allRows = Array.isArray(options && options.allRows) ? options.allRows : shipmentRows;
    const matchedCurrentRow = shipmentRows.find((row) => matchesBaleReference(row, barcode));
    if (matchedCurrentRow) {
      return buildBaleScanPayload("matched", barcode, matchedCurrentRow);
    }

    const approximateCurrentMatch = findApproximateShortCodeMatch(shipmentRows, barcode);
    if (approximateCurrentMatch.matchedRow) {
      return buildBaleScanPayload("matched", barcode, approximateCurrentMatch.matchedRow, true);
    }
    if (approximateCurrentMatch.ambiguous) {
      return {
        status: "not_found",
        barcode,
        baleBarcode: "",
        scanToken: "",
        shipmentNo: normalizeBarcode(options && options.shipmentNo),
        batchNo: "",
        groupKey: "",
        supplierName: "",
        categoryDisplay: "",
        serialNo: 0,
        printed: false,
        ambiguous: true,
      };
    }

    const matchedForeignRow = allRows.find((row) => matchesBaleReference(row, barcode));
    if (matchedForeignRow) {
      return buildBaleScanPayload("foreign_shipment", barcode, matchedForeignRow);
    }

    return {
      status: "not_found",
      barcode,
      baleBarcode: "",
      scanToken: "",
      shipmentNo: normalizeBarcode(options && options.shipmentNo),
      batchNo: "",
      groupKey: "",
      supplierName: "",
      categoryDisplay: "",
      serialNo: 0,
      printed: false,
    };
  }

  return {
    buildBaleGroupPrintPlan,
    buildBaleDirectPrintPayload,
    getBaleModalCloseAction,
    getBaleGroupCompletionAction,
    getBaleShipmentContinuationAction,
    getBaleModalCompletionAction,
    getBaleScanTestResult,
  };
});

(function (root, factory) {
  const exports = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = exports;
  }
  root.SortingTaskFlow = exports;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  function normalizeText(value) {
    return String(value || "").trim();
  }

  function normalizeShipmentNo(value) {
    return normalizeText(value).toUpperCase();
  }

  function getLocalDateKey(value) {
    const parsed = new Date(value || "");
    if (Number.isNaN(parsed.getTime())) {
      return "";
    }
    return parsed.toISOString().slice(0, 10);
  }

  function normalizeSearchValue(value) {
    return normalizeText(value).toLowerCase();
  }

  function isRawBaleMachineCode(value) {
    return /^1\d{9}$/.test(normalizeShipmentNo(value));
  }

  function isNonRawBaleMachineCode(value) {
    return /^[2-5]\d{9}$/.test(normalizeShipmentNo(value));
  }

  function isWarehouseShortCode(value) {
    return /^RB[A-Z0-9]{6,}$/.test(normalizeShipmentNo(value));
  }

  function getBaleReferenceCandidates(row) {
    const candidates = [
      row && row.bale_barcode,
      row && row.legacy_bale_barcode,
      row && row.scan_token,
    ];
    const machineCode = normalizeShipmentNo(row && row.machine_code);
    const barcodeValue = normalizeShipmentNo(row && row.barcode_value);
    const humanReadable = normalizeShipmentNo(row && row.human_readable);
    if (isRawBaleMachineCode(machineCode)) {
      candidates.push(machineCode);
    }
    if (isRawBaleMachineCode(barcodeValue)) {
      candidates.push(barcodeValue);
    }
    if (
      isRawBaleMachineCode(humanReadable)
      && (humanReadable === machineCode || humanReadable === barcodeValue)
    ) {
      candidates.push(humanReadable);
    }
    return candidates.map((item) => normalizeShipmentNo(item)).filter(Boolean);
  }

  function computeEditDistance(leftValue, rightValue, maxDistance) {
    const left = normalizeShipmentNo(leftValue);
    const right = normalizeShipmentNo(rightValue);
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

  function findApproximateShortCodeMatch(rows, baleCode, maxDistance = 2) {
    const normalizedCode = normalizeShipmentNo(baleCode);
    if (!isWarehouseShortCode(normalizedCode)) {
      return { matchedRow: null, ambiguous: false };
    }
    let matchedRow = null;
    let bestDistance = maxDistance + 1;
    let ambiguous = false;
    (Array.isArray(rows) ? rows : []).forEach((row) => {
      const candidate = normalizeShipmentNo(row && row.bale_barcode);
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
      if (distance === bestDistance && normalizeShipmentNo(matchedRow && matchedRow.bale_barcode) !== candidate) {
        ambiguous = true;
      }
    });
    if (ambiguous) {
      return { matchedRow: null, ambiguous: true };
    }
    return { matchedRow, ambiguous: false };
  }

  function matchesBaleReference(row, baleCode) {
    const normalizedCode = normalizeShipmentNo(baleCode);
    if (!normalizedCode) {
      return false;
    }
    if (isNonRawBaleMachineCode(normalizedCode)) {
      return false;
    }
    return getBaleReferenceCandidates(row).includes(normalizedCode);
  }

  function mergeSortingTaskLookupBales(baleBarcodeRows, rawBaleRows) {
    const mergedByBaleBarcode = new Map();
    const orderedKeys = [];
    const upsertRow = (row) => {
      const baleBarcode = normalizeShipmentNo(row && row.bale_barcode);
      if (!baleBarcode) {
        return;
      }
      if (!mergedByBaleBarcode.has(baleBarcode)) {
        orderedKeys.push(baleBarcode);
      }
      const existing = mergedByBaleBarcode.get(baleBarcode) || {};
      mergedByBaleBarcode.set(baleBarcode, {
        ...existing,
        ...row,
        bale_barcode: baleBarcode,
      });
    };
    (Array.isArray(baleBarcodeRows) ? baleBarcodeRows : []).forEach(upsertRow);
    (Array.isArray(rawBaleRows) ? rawBaleRows : []).forEach(upsertRow);
    return orderedKeys.map((key) => mergedByBaleBarcode.get(key)).filter(Boolean);
  }

  function isSelectableRawBale(row) {
    return (
      normalizeSearchValue(row && row.status) === "ready_for_sorting"
      && !normalizeText(row && row.occupied_by_task_no)
    );
  }

  function hasCompletedSourceCost(row) {
    if (!row || typeof row !== "object") {
      return false;
    }
    const gateStatus = normalizeSearchValue(row.source_cost_gate_status);
    if (row.source_cost_allows_sorting === true) {
      return true;
    }
    if (gateStatus === "allocated" || gateStatus === "recorded_pending_allocation") {
      return true;
    }
    if (gateStatus === "missing_source" || gateStatus === "missing_cost_record" || gateStatus === "invalid_weight_or_qty") {
      return false;
    }
    if (typeof row.source_cost_completed === "boolean") {
      return row.source_cost_completed;
    }
    const amount = Number(
      row.source_cost_kes
      ?? row.source_cost_amount
      ?? row.source_total_cost_kes
      ?? row.source_allocated_cost_kes
      ?? 0,
    );
    return amount > 0;
  }

  function getSourceCostGateWarning(row) {
    const gateStatus = normalizeSearchValue(row && row.source_cost_gate_status);
    if (gateStatus !== "recorded_pending_allocation") {
      return "";
    }
    return normalizeText(row && row.source_cost_gate_message) || "来源成本已记录，待分摊；可先创建分拣任务。";
  }

  function getSourceCostGateBlockMessage(row) {
    if (hasCompletedSourceCost(row)) {
      return "";
    }
    const gateStatus = normalizeSearchValue(row && row.source_cost_gate_status);
    if (gateStatus === "missing_source" || gateStatus === "missing_cost_record" || gateStatus === "invalid_weight_or_qty") {
      return normalizeText(row && row.source_cost_gate_message) || `source_cost_gate_status=${gateStatus}`;
    }
    return "该 Bale 来源成本未完成，不能创建分拣任务。请先补齐中方来源与三段成本。";
  }

  function findSortingTaskLookupMatches(rows, options) {
    const searchValue = normalizeSearchValue(options && options.searchValue);
    const selectedBaleCodeSet = new Set((options && options.selectedBaleCodes || []).map((item) => normalizeShipmentNo(item)).filter(Boolean));
    const occupiedBaleCodeSet = new Set((options && options.occupiedBaleCodes || []).map((item) => normalizeShipmentNo(item)).filter(Boolean));
    return (Array.isArray(rows) ? rows : [])
      .filter((row) => isSelectableRawBale(row))
      .filter((row) => !selectedBaleCodeSet.has(normalizeShipmentNo(row && row.bale_barcode)))
      .filter((row) => !occupiedBaleCodeSet.has(normalizeShipmentNo(row && row.bale_barcode)))
      .filter((row) => {
        if (!searchValue) {
          return true;
        }
        const haystack = normalizeSearchValue([
          row && row.bale_barcode,
          row && row.legacy_bale_barcode,
          row && row.scan_token,
          row && row.machine_code,
          row && row.barcode_value,
          row && row.human_readable,
          row && row.shipment_no,
          row && row.supplier_name,
          row && row.category_main,
          row && row.category_sub,
          row && row.parcel_batch_no,
        ].join(" "));
        return haystack.includes(searchValue);
      })
      .sort((left, right) => normalizeShipmentNo(left && left.bale_barcode).localeCompare(normalizeShipmentNo(right && right.bale_barcode)));
  }

  function addBaleToSortingTaskSelection(options) {
    const allBales = Array.isArray(options && options.allBales) ? options.allBales : [];
    const selectedBaleCodes = (options && options.selectedBaleCodes || []).map((item) => normalizeShipmentNo(item)).filter(Boolean);
    const baleCode = normalizeShipmentNo(options && options.baleCode);
    if (!baleCode) {
      return {
        ok: false,
        error: "请先输入或扫描 bale barcode。",
        selectedBaleCodes,
      };
    }
    if (isNonRawBaleMachineCode(baleCode)) {
      return {
        ok: false,
        error: "0.1 创建分拣任务只能扫描 RAW_BALE 入仓包码，SDB / LPK / SDO / STORE_ITEM 不能加入分拣任务。",
        selectedBaleCodes,
      };
    }
    let matchedRow = allBales.find((row) => matchesBaleReference(row, baleCode)) || null;
    let approximate = false;
    if (!matchedRow) {
      const approximateMatch = findApproximateShortCodeMatch(allBales, baleCode);
      if (approximateMatch.ambiguous) {
        return {
          ok: false,
          error: `${baleCode} 对应多个可能 bale，请重扫一次。`,
          selectedBaleCodes,
        };
      }
      matchedRow = approximateMatch.matchedRow;
      approximate = Boolean(matchedRow);
    }
    if (!matchedRow) {
      return {
        ok: false,
        error: isRawBaleMachineCode(baleCode)
          ? "未找到这个 RAW_BALE machine_code，请确认该标签是否已经完成 RAW_BALE 入库。"
          : `${baleCode} 不存在，不能加入分拣任务。`,
        selectedBaleCodes,
      };
    }
    if (!isSelectableRawBale(matchedRow)) {
      return {
        ok: false,
        error: `${baleCode} 当前状态不能加入分拣任务。`,
        selectedBaleCodes,
      };
    }
    const sourceCostBlockMessage = getSourceCostGateBlockMessage(matchedRow);
    if (sourceCostBlockMessage) {
      return {
        ok: false,
        error: sourceCostBlockMessage,
        selectedBaleCodes,
      };
    }
    const canonicalBaleBarcode = normalizeShipmentNo(matchedRow && matchedRow.bale_barcode);
    const warning = getSourceCostGateWarning(matchedRow);
    if (selectedBaleCodes.includes(canonicalBaleBarcode)) {
      return {
        ok: true,
        duplicate: true,
        matchedRow,
        selectedBaleCodes,
        warning,
      };
    }
    return {
      ok: true,
      duplicate: false,
      approximate,
      matchedRow,
      selectedBaleCodes: [...selectedBaleCodes, canonicalBaleBarcode],
      warning,
    };
  }

  function normalizeTerminator(value) {
    const normalized = normalizeSearchValue(value);
    if (normalized === "enter" || normalized === "tab") {
      return normalized;
    }
    return "none";
  }

  function getSortingScannerDiagnostic(options) {
    const hidSupported = Boolean(options && options.hidSupported);
    const usbSupported = Boolean(options && options.usbSupported);
    const hidDeviceCount = Math.max(0, Number(options && options.hidDeviceCount ? options.hidDeviceCount : 0));
    const usbDeviceCount = Math.max(0, Number(options && options.usbDeviceCount ? options.usbDeviceCount : 0));
    const authorizedDeviceCount = hidDeviceCount + usbDeviceCount;
    const inputFocused = Boolean(options && options.inputFocused);
    const detectionArmed = Boolean(options && options.detectionArmed);
    const detectionStartedAtMs = Math.max(0, Number(options && options.detectionStartedAtMs ? options.detectionStartedAtMs : 0));
    const nowMs = Math.max(0, Number(options && options.nowMs ? options.nowMs : 0));
    const lastCompletedScan = options && options.lastCompletedScan ? options.lastCompletedScan : null;
    const scanValue = normalizeText(lastCompletedScan && lastCompletedScan.value);
    const scanTarget = normalizeSearchValue(lastCompletedScan && lastCompletedScan.target);
    const terminator = normalizeTerminator(lastCompletedScan && lastCompletedScan.terminator);
    const durationMs = Math.max(0, Number(lastCompletedScan && lastCompletedScan.durationMs ? lastCompletedScan.durationMs : 0));
    const scanAgeMs = lastCompletedScan ? Math.max(0, nowMs - Math.max(0, Number(lastCompletedScan.capturedAtMs || nowMs))) : null;
    const base = {
      status: "idle",
      severity: "info",
      headline: "等待开始检测扫码枪",
      detail: "点“开始检测”后，页面会同时观察浏览器可见设备和扫码框输入。",
      recommendations: [
        "先点“开始检测”，再让扫码枪对着 bale 标签扫一次。",
      ],
      canAutoAdd: false,
      authorizedDeviceCount,
      authorizedDeviceLabel: authorizedDeviceCount ? `${authorizedDeviceCount} 台已授权设备` : "还没有已授权设备",
      capabilityLabel: [hidSupported ? "WebHID" : "", usbSupported ? "WebUSB" : ""].filter(Boolean).join(" + ") || "浏览器不支持直连设备枚举",
      lastScanValue: scanValue,
      lastScanTarget: scanTarget,
      lastTerminator: terminator,
      lastDurationMs: durationMs,
      scanAgeMs,
      inputFocused,
    };

    if (scanValue && scanTarget === "bale_lookup" && (terminator === "enter" || terminator === "tab")) {
      return {
        ...base,
        status: "keyboard_ready",
        severity: "success",
        headline: "扫码枪输入正常",
        detail: `最近一次扫码以 ${terminator === "enter" ? "Enter" : "Tab"} 结束，页面可以直接识别并加入任务。`,
        recommendations: [
          "继续直接扫码即可，扫完会自动加入当前分拣任务。",
          inputFocused ? "保持焦点留在扫码框里，不要切到别的输入框。" : "先把焦点切回扫码框，再继续连续扫码。",
        ],
        canAutoAdd: true,
      };
    }

    if (scanValue && scanTarget === "bale_lookup" && terminator === "none") {
      const membershipStatus = normalizeSearchValue(lastCompletedScan && lastCompletedScan.membershipStatus);
      const isAlreadyAdded = membershipStatus === "already_added";
      const isPendingBind = membershipStatus === "pending_handler_bind";
      return {
        ...base,
        status: "suffix_missing",
        severity: isAlreadyAdded || isPendingBind ? "info" : "warning",
        headline: isAlreadyAdded || isPendingBind ? "已识别条码" : "已经收到条码，但没有回车或 Tab 后缀",
        detail: isAlreadyAdded
          ? `已识别条码：${scanValue}，状态：已加入待分拣列表`
          : isPendingBind
            ? `已识别条码：${scanValue}，状态：等待绑定分拣人`
            : "页面能看到扫码输入，但当前不会自动提交到分拣任务。",
        recommendations: [
          isAlreadyAdded || isPendingBind
            ? "这条码已识别成功，可继续扫码下一包。"
            : "把扫码枪后缀设成 Enter 或 Tab，这样扫完会自动加入任务。",
          isAlreadyAdded || isPendingBind
            ? (inputFocused ? "保持焦点留在扫码框里，继续连续扫码。" : "先把焦点切回扫码框，再继续连续扫码。")
            : "在改设置前，也可以先扫进输入框，再手动点“加入任务”。",
        ],
        canAutoAdd: false,
      };
    }

    if (authorizedDeviceCount > 0) {
      return {
        ...base,
        status: "direct_device_ready",
        severity: "success",
        headline: "已检测到浏览器可见设备",
        detail: "浏览器已经能看到至少一台已授权设备。接下来重点检查扫码框焦点和扫码后缀。",
        recommendations: [
          inputFocused ? "现在直接扫一次 bale 标签，确认是否会自动加入任务。" : "先点“聚焦扫码框”，再实际扫一次标签。",
          "如果扫了还是没反应，优先检查扫码枪是不是输出到别的输入框，或者后缀不是 Enter/Tab。",
        ],
        canAutoAdd: false,
      };
    }

    if (detectionArmed && !inputFocused && detectionStartedAtMs && nowMs - detectionStartedAtMs >= 8000) {
      return {
        ...base,
        status: "focus_missing",
        severity: "warning",
        headline: "焦点不在扫码框",
        detail: "页面还没有在扫码框里收到任何输入，最常见原因是焦点已经跑到别的控件或别的窗口。",
        recommendations: [
          "先点“聚焦扫码框”，再重新扫一次。",
          "确认系统输入法、浏览器地址栏、别的弹窗没有抢走键盘焦点。",
        ],
        canAutoAdd: false,
      };
    }

    if (detectionArmed && detectionStartedAtMs) {
      const elapsedMs = Math.max(0, nowMs - detectionStartedAtMs);
      if (elapsedMs < 8000) {
        return {
          ...base,
          status: "waiting_for_scan",
          severity: "info",
          headline: "正在等待扫码输入",
          detail: "检测已经开始。现在保持扫码框聚焦，并实际扫一次 bale 标签。",
          recommendations: [
            inputFocused ? "现在直接扫标签。" : "先点“聚焦扫码框”，再立即扫标签。",
          ],
          canAutoAdd: false,
        };
      }
      return {
        ...base,
        status: "no_input_detected",
        severity: "error",
        headline: "页面没有收到扫码输入",
        detail: "检测窗口内没有捕获到任何可用于分拣任务的扫码数据。",
        recommendations: [
          inputFocused ? "先在系统记事本或浏览器纯文本框里扫一次，确认枪有没有实际打出字符。" : "先点“聚焦扫码框”，再重试一次。",
          "如果系统级也没有字符，检查 USB/2.4G 接收器、蓝牙配对、电量和扫码枪工作模式。",
          "如果系统级能出字符，但本页无反应，优先检查后缀是不是 Enter/Tab。",
        ],
        canAutoAdd: false,
      };
    }

    return base;
  }

  function buildSortingTaskManagerBuckets(rows, activeDate) {
    const normalizedRows = Array.isArray(rows) ? rows : [];
    const normalizedDate = normalizeText(activeDate);
    const openRows = normalizedRows.filter((row) => normalizeSearchValue(row && row.status) === "open");
    const completedSourceRows = normalizedRows.filter((row) => normalizeSearchValue(row && row.status) !== "open");
    const completedRows = normalizedDate
      ? completedSourceRows.filter((row) => getLocalDateKey(row && row.started_at) === normalizedDate)
      : completedSourceRows;
    return {
      openRows,
      completedRows,
      visibleRows: [...openRows, ...completedRows],
    };
  }

  return {
    addBaleToSortingTaskSelection,
    buildSortingTaskManagerBuckets,
    findSortingTaskLookupMatches,
    getSortingScannerDiagnostic,
    isSelectableRawBale,
    mergeSortingTaskLookupBales,
  };
});

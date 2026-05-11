const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appJs = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const stylesCss = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");

function extractFunctionSource(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `missing function ${functionName}`);
  const signatureEnd = source.indexOf(") {", start);
  assert.notEqual(signatureEnd, -1, `missing function body for ${functionName}`);
  const braceStart = signatureEnd + 2;
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  throw new Error(`could not extract ${functionName}`);
}

function extractAsyncFunctionSource(source, functionName) {
  const asyncStart = source.indexOf(`async function ${functionName}`);
  if (asyncStart === -1) {
    return extractFunctionSource(source, functionName);
  }
  const signatureEnd = source.indexOf(") {", asyncStart);
  assert.notEqual(signatureEnd, -1, `missing async function body for ${functionName}`);
  const braceStart = signatureEnd + 2;
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(asyncStart, index + 1);
      }
    }
  }
  throw new Error(`could not extract async ${functionName}`);
}

function extractAssignedFunctionSource(source, functionName) {
  const start = source.indexOf(`${functionName} = async function`);
  assert.notEqual(start, -1, `missing assigned function ${functionName}`);
  const signatureEnd = source.indexOf(") {", start);
  assert.notEqual(signatureEnd, -1, `missing assigned function body for ${functionName}`);
  const braceStart = signatureEnd + 2;
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  throw new Error(`could not extract assigned ${functionName}`);
}

function extractAssignedAnyFunctionSource(source, functionName) {
  const asyncStart = source.indexOf(`${functionName} = async function`);
  const syncStart = source.indexOf(`${functionName} = function`);
  const start = asyncStart === -1 ? syncStart : asyncStart;
  assert.notEqual(start, -1, `missing assigned function ${functionName}`);
  const signatureEnd = source.indexOf(") {", start);
  assert.notEqual(signatureEnd, -1, `missing assigned function body for ${functionName}`);
  const braceStart = signatureEnd + 2;
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  throw new Error(`could not extract assigned ${functionName}`);
}

test("POS scans use the typed resolver with POS context before cart insert", () => {
  assert.match(appJs, /posStoreItemSaleRecords/);
  const resolverSource = extractFunctionSource(appJs, "resolveCashierTerminalStoreItemForPos");
  const guardSource = extractFunctionSource(appJs, "ensureCashierTerminalResolvedItemCanEnterCart");
  const terminalLookupSource = extractAssignedFunctionSource(appJs, "submitCashierTerminalLookup");
  assert.match(resolverSource, /resolveBarcodeForContext\(normalizedQuery,\s*"pos",\s*\[\],\s*\{\s*rejectOnContextReject:\s*false\s*\}\)/);
  assert.match(resolverSource, /ensureCashierTerminalResolvedItemCanEnterCart\(resolved,\s*normalizedQuery\)/);
  assert.match(guardSource, /resolved\?\.reject_reason/);
  assert.match(terminalLookupSource, /await resolveCashierTerminalStoreItemForPos\(query\)/);
  assert.doesNotMatch(terminalLookupSource, /resolveCashierTerminalPreviewScan\(query\)/);
  assert.doesNotMatch(terminalLookupSource, /resolvePosStoreItemTokenByMachineCode\(query\)/);
  assert.doesNotMatch(terminalLookupSource, /submitLookup\(\{ preventDefault\(\) \{\}, currentTarget: form \}\)/);
});

test("POS cashier terminal renders cashier touch layout without changing barcode scope", () => {
  assert.match(indexHtml, /class="[^"]*cashier-terminal-shell/);
  assert.match(indexHtml, /class="[^"]*cashier-terminal-touch-layout/);
  assert.match(indexHtml, /id="cashierTerminalBarcodeInput"[\s\S]*?placeholder="扫描 STORE_ITEM 商品码"/);
  assert.match(indexHtml, /id="cashierTerminalCart"[\s\S]*class="[^"]*cashier-terminal-cart/);
  assert.match(indexHtml, /id="cashierTerminalPaymentPanel"[\s\S]*class="[^"]*cashier-terminal-payment-panel/);
  assert.match(indexHtml, /id="cashierTerminalQuickActions"[\s\S]*class="[^"]*cashier-terminal-status-footer/);
  assert.match(appJs, /scanTitle:\s*"扫码收银"/);
  assert.match(appJs, /basketTitle:\s*"商品篮"/);
  assert.match(appJs, /paymentTitle:\s*"结账区"/);
  assert.match(appJs, /completeTrade:\s*"完成销售"/);
  assert.match(appJs, /cashMethod:\s*"Cash"/);
  assert.match(appJs, /mpesaMethod:\s*"M-Pesa"/);
  assert.match(appJs, /mixedMethod:\s*"Mixed"/);
  assert.match(appJs, /function restoreCashierTerminalFixedPaymentLabels/);
  assert.match(appJs, /cash:\s*"Cash"/);
  assert.match(appJs, /mpesa:\s*"M-Pesa"/);
  assert.match(appJs, /mixed:\s*"Mixed"/);
  assert.match(appJs, /restoreCashierTerminalFixedPaymentLabels\(\);/);
  assert.match(appJs, /grossAmount:\s*"总金额"/);
  assert.match(appJs, /receiptStatus:\s*"小票打印"/);
  assert.match(appJs, /syncStatus:\s*"同步状态"/);
  assert.match(appJs, /resolveCashierTerminalStoreItemForPos\(query\)/);
  assert.doesNotMatch(appJs, /resolveBarcodeForContext\([^)]*"pos",\s*\[[^\]]*"RAW_BALE"/);
  assert.doesNotMatch(appJs, /resolveBarcodeForContext\([^)]*"pos",\s*\[[^\]]*"STORE_PREP_BALE"/);
  assert.doesNotMatch(appJs, /resolveBarcodeForContext\([^)]*"pos",\s*\[[^\]]*"LOOSE_PICK_TASK"/);
  assert.doesNotMatch(appJs, /resolveBarcodeForContext\([^)]*"pos",\s*\[[^\]]*"STORE_DELIVERY_EXECUTION"/);
});

test("POS cashier terminal gates resolver results before adding items", () => {
  const guardSource = extractFunctionSource(appJs, "ensureCashierTerminalResolvedItemCanEnterCart");
  assert.match(guardSource, /barcode_type/);
  assert.match(guardSource, /"STORE_ITEM"/);
  assert.match(guardSource, /pos_allowed/);
  assert.match(guardSource, /reject_reason/);
  assert.match(guardSource, /store_code/);
  assert.match(guardSource, /!storeCode/);
  assert.match(guardSource, /getCashierTerminalStoreCode\(\)/);
  ["on_shelf", "in_stock", "available", "printed_in_store"].forEach((status) => {
    assert.match(appJs, new RegExp(`"${status}"`));
  });
  ["sold", "held", "reserved", "transferred_out", "voided", "pending_print", "pending_putaway"].forEach((status) => {
    assert.match(guardSource, new RegExp(`"${status}"`));
  });
  assert.doesNotMatch(appJs, /function buildPrototypeStoreItemMachineCodeV2/);
  assert.doesNotMatch(appJs, /function buildStoreItemTokenSerial/);
  assert.doesNotMatch(appJs, /const machineCode = `5\$\{/);
  assert.match(appJs, /store_item_machine_code:\s*token\.machine_code/);
  assert.match(appJs, /barcode:\s*token\.machine_code/);
  assert.doesNotMatch(appJs, /barcode:\s*token\.display_code/);
});

test("POS fallback is backend-unavailable demo data only and does not prefix-allow sales", () => {
  const resolverSource = extractAsyncFunctionSource(appJs, "resolveCashierTerminalStoreItemForPos");
  const fallbackSource = extractFunctionSource(appJs, "resolveCashierTerminalLocalDemoItem");
  assert.match(resolverSource, /isCashierTerminalResolverUnavailableError\(error\)/);
  assert.match(resolverSource, /throw error/);
  assert.match(resolverSource, /resolveCashierTerminalLocalDemoItem\(normalizedQuery\)/);
  assert.match(appJs, /当前使用本地演示数据，真实扫码接口不可用。/);
  assert.match(fallbackSource, /findCashierTerminalPreviewItem\(normalizedQuery\)/);
  assert.match(fallbackSource, /item\?\.type !== "STORE_ITEM"/);
  assert.doesNotMatch(appJs, /inferCashierTerminalRejectedType/);
  assert.doesNotMatch(fallbackSource, /\.startsWith\("SDO"\)/);
  assert.doesNotMatch(fallbackSource, /\.startsWith\("SDB"\)/);
  assert.doesNotMatch(fallbackSource, /\.startsWith\("LPK"\)/);
  assert.doesNotMatch(fallbackSource, /\.startsWith\("RAW"\)/);
});

function buildCashierResolverHarness({ resolved = {}, guardError = null, apiError = null } = {}) {
  const source = extractAsyncFunctionSource(appJs, "resolveCashierTerminalStoreItemForPos");
  const calls = {
    fallback: 0,
    guard: 0,
    mapper: 0,
  };
  const context = {
    CASHIER_TERMINAL_LOCAL_DEMO_NOTICE: "当前使用本地演示数据，真实扫码接口不可用。",
    cashierTerminalState: {},
    normalizeCashierPreviewScan: (value) => String(value || "").trim().toUpperCase(),
    resolveBarcodeForContext: async () => {
      if (apiError) {
        throw apiError;
      }
      return resolved;
    },
    ensureCashierTerminalPreviewState: () => {},
    ensureCashierTerminalResolvedItemCanEnterCart: () => {
      calls.guard += 1;
      if (guardError) {
        throw guardError;
      }
    },
    mapCashierTerminalResolvedStoreItem: () => {
      calls.mapper += 1;
      return { display_code: "SI-OK", machine_code: "5260428001" };
    },
    isCashierTerminalResolverUnavailableError: (error) => {
      const status = Number(error?.status || 0);
      return !status || status >= 500 || Boolean(error && error.resolverUnavailable);
    },
    resolveCashierTerminalLocalDemoItem: () => {
      calls.fallback += 1;
      return { display_code: "SI-DEMO", machine_code: "5250511000123" };
    },
  };
  const fn = vm.runInNewContext(`${source}\nresolveCashierTerminalStoreItemForPos;`, context);
  return { fn, calls, context };
}

test("POS resolver business rejections never fall back to local demo data", async () => {
  const cases = [
    {
      name: "resolver returned SDO rejection",
      resolved: { barcode_type: "STORE_DELIVERY_EXECUTION", pos_allowed: false, reject_reason: "POS 只允许扫描 STORE_ITEM 商品码。" },
      error: new Error("POS 只允许扫描 STORE_ITEM 商品码。"),
      match: /POS 只允许扫描 STORE_ITEM 商品码/,
    },
    {
      name: "resolver returned STORE_ITEM with pos_allowed false",
      resolved: { barcode_type: "STORE_ITEM", pos_allowed: false, reject_reason: "" },
      error: new Error("该 STORE_ITEM 暂未被允许在 POS 销售。"),
      match: /暂未被允许在 POS 销售/,
    },
    {
      name: "resolver returned STORE_ITEM from another store",
      resolved: { barcode_type: "STORE_ITEM", pos_allowed: true, reject_reason: "", store_code: "CBD", status: "on_shelf" },
      error: new Error("其他门店商品不能在当前 POS 销售。"),
      match: /其他门店商品不能在当前 POS 销售/,
    },
  ];

  for (const testCase of cases) {
    const { fn, calls } = buildCashierResolverHarness({
      resolved: testCase.resolved,
      guardError: testCase.error,
    });

    await assert.rejects(() => fn(` ${testCase.name} `), testCase.match);
    assert.equal(calls.fallback, 0, `${testCase.name} should not call local demo fallback`);
    assert.equal(calls.guard, 1, `${testCase.name} should run the POS guard once`);
  }
});

test("POS local demo fallback only runs when resolver API is unavailable", async () => {
  const apiError = new Error("fetch failed");
  apiError.resolverUnavailable = true;
  const { fn, calls, context } = buildCashierResolverHarness({ apiError });

  const result = await fn("5250511000123");

  assert.equal(calls.fallback, 1);
  assert.equal(calls.guard, 0);
  assert.equal(calls.mapper, 0);
  assert.equal(result.local_demo_notice, context.CASHIER_TERMINAL_LOCAL_DEMO_NOTICE);
});

test("POS complete sale posts to the real backend sale API and never fabricates success", () => {
  const submitSource = extractAssignedFunctionSource(appJs, "submitCashierTerminalSale");
  const backendSource = extractAsyncFunctionSource(appJs, "submitCashierTerminalBackendSale");
  const payloadSource = extractFunctionSource(appJs, "buildCashierTerminalPosSalePayload");
  const receiptSource = extractFunctionSource(appJs, "normalizeCashierTerminalBackendSale");
  assert.match(submitSource, /await submitCashierTerminalBackendSale\(\)/);
  assert.match(backendSource, /request\(`\/stores\/\$\{encodeURIComponent\(storeCode\)\}\/pos-sales`/);
  assert.match(backendSource, /method:\s*"POST"/);
  assert.match(backendSource, /JSON\.stringify\(payload\)/);
  assert.match(backendSource, /cashierTerminalState\.latestCompletedSale\s*=\s*sale/);
  assert.match(backendSource, /resetCashierTerminalForNextSale\(\)/);
  assert.match(backendSource, /markCashierTerminalSoldItemsLocally\(sale\)/);
  assert.match(backendSource, /真实销售接口不可用，本单未完成。请恢复系统后重试。/);
  assert.match(payloadSource, /payment_method:\s*cashierTerminalState\.activePaymentMode/);
  assert.match(payloadSource, /items:\s*cartItems\.map/);
  assert.match(payloadSource, /machine_code:/);
  assert.match(payloadSource, /display_code:/);
  assert.match(payloadSource, /final_price:/);
  assert.match(receiptSource, /sale_no:\s*sale\.sale_no/);
  const catchStart = backendSource.indexOf("} catch");
  const catchEnd = backendSource.indexOf("const sale =", catchStart);
  assert.doesNotMatch(backendSource.slice(catchStart, catchEnd), /resetCashierTerminalForNextSale/);
  assert.doesNotMatch(backendSource.slice(catchStart, catchEnd), /latestCompletedSale\s*=/);
  assert.doesNotMatch(backendSource, /SALE-UTW-250511/);
  assert.doesNotMatch(backendSource, /saleSequence\s*\+=/);
  assert.doesNotMatch(backendSource, /completed_pending_sync/);
  assert.doesNotMatch(backendSource, /resolveCashierTerminalLocalDemoItem/);
});

test("POS sale completion depends on backend sale_no for inventory sale-out reconciliation", () => {
  const backendSource = extractAsyncFunctionSource(appJs, "submitCashierTerminalBackendSale");
  const receiptSource = extractFunctionSource(appJs, "normalizeCashierTerminalBackendSale");

  assert.match(backendSource, /\/stores\/\$\{encodeURIComponent\(storeCode\)\}\/pos-sales/);
  assert.match(backendSource, /cashierTerminalState\.latestCompletedSale\s*=\s*sale/);
  assert.match(receiptSource, /sale_no:\s*sale\.sale_no/);
  assert.doesNotMatch(backendSource, /SALE-MOCK|mock sale|模拟销售成功/i);
});

test("POS sale API unavailable detection does not hide backend business errors", () => {
  const source = extractFunctionSource(appJs, "isCashierTerminalSaleApiUnavailableError");
  const fn = vm.runInNewContext(`${source}\nisCashierTerminalSaleApiUnavailableError;`, {
    formatErrorMessage: (error) => error?.message || error?.payload?.detail || "",
  });

  assert.equal(fn(new Error("fetch failed")), true);
  assert.equal(fn({ status: 503, message: "service unavailable" }), true);
  assert.equal(fn({ status: 404, message: "Not Found" }), true);
  assert.equal(fn({ status: 404, message: "Cannot POST /api/v1/stores/UTAWALA/pos-sales" }), true);
  assert.equal(fn({ status: 404, message: "Store UTAWALA not found" }), false);
  assert.equal(fn({ status: 400, message: "该商品已售出，不能重复销售。" }), false);
  assert.equal(fn({ status: 400, message: "Mixed payment amount must cover POS sale total." }), false);
});

test("POS real receipt reprint loads sale detail/list without creating a sale", () => {
  const latestSource = extractAsyncFunctionSource(appJs, "loadCashierTerminalLatestReceiptForReprint");
  const detailSource = extractAsyncFunctionSource(appJs, "loadCashierTerminalSaleReceiptForReprint");
  const fetchDetailSource = extractAsyncFunctionSource(appJs, "fetchCashierTerminalSaleDetail");
  const fetchListSource = extractAsyncFunctionSource(appJs, "fetchCashierTerminalRecentSales");
  const actionSource = extractAssignedFunctionSource(appJs, "handleCashierTerminalAction");
  const receiptSource = extractFunctionSource(appJs, "renderCashierTerminalReceiptPanel");

  assert.match(fetchDetailSource, /request\(`\/stores\/\$\{encodeURIComponent\(storeCode\)\}\/pos-sales\/\$\{encodeURIComponent\(saleNo\)\}`\)/);
  assert.match(fetchListSource, /request\(`\/stores\/\$\{encodeURIComponent\(storeCode\)\}\/pos-sales\?limit=\$\{encodeURIComponent\(String\(limit\)\)\}`\)/);
  assert.match(latestSource, /cashierTerminalState\.latestCompletedSale\?\.sale_no/);
  assert.match(latestSource, /fetchCashierTerminalRecentSales\(1\)/);
  assert.match(latestSource, /暂无可重打销售单。/);
  assert.match(detailSource, /fetchCashierTerminalSaleDetail\(saleNo\)/);
  assert.match(detailSource, /normalizeCashierTerminalBackendSale\(sale,\s*\{\s*reprint:\s*true\s*\}\)/);
  assert.match(detailSource, /cashierTerminalState\.latestCompletedSale\s*=\s*normalized/);
  assert.match(detailSource, /已加载销售单：/);
  assert.match(detailSource, /收据已准备重打：/);
  assert.match(actionSource, /case "reprint-receipt":/);
  assert.match(actionSource, /openCashierTerminalReprintConfirmation\(""\)/);
  assert.match(actionSource, /case "confirm-reprint":/);
  assert.match(actionSource, /await loadCashierTerminalLatestReceiptForReprint\(\)/);
  assert.doesNotMatch(detailSource, /submitCashierTerminalBackendSale/);
  assert.doesNotMatch(detailSource, /resetCashierTerminalForNextSale/);
  assert.doesNotMatch(detailSource, /create_pos_sale/);
  assert.match(receiptSource, /REPRINT COPY/);
});

test("POS recent sales drawer can list, view, and reprint real sales", () => {
  const drawerSource = extractAssignedAnyFunctionSource(appJs, "renderCashierTerminalDrawer");
  const actionSource = extractAssignedFunctionSource(appJs, "handleCashierTerminalAction");
  const loadListSource = extractAsyncFunctionSource(appJs, "loadCashierTerminalRecentSales");
  assert.match(appJs, /data-terminal-drawer="recent-sales"/);
  assert.match(drawerSource, /drawer === "recent-sales"/);
  assert.match(drawerSource, /最近销售/);
  assert.match(drawerSource, /data-terminal-action="view-sale-detail"/);
  assert.match(drawerSource, /data-terminal-action="reprint-sale"/);
  assert.match(loadListSource, /fetchCashierTerminalRecentSales\(limit\)/);
  assert.match(loadListSource, /cashierTerminalState\.recentSales\s*=/);
  assert.match(actionSource, /case "view-sale-detail":/);
  assert.match(actionSource, /await loadCashierTerminalSaleReceiptForReprint\(target\.dataset\.terminalSaleNo,\s*\{\s*reprint:\s*false\s*\}\)/);
  assert.match(actionSource, /case "reprint-sale":/);
  assert.match(actionSource, /openCashierTerminalReprintConfirmation\(target\.dataset\.terminalSaleNo\)/);
});

test("POS shift flow blocks sale until open shift and sends shift_id", () => {
  const submitSource = extractAsyncFunctionSource(appJs, "submitCashierTerminalBackendSale");
  const payloadSource = extractFunctionSource(appJs, "buildCashierTerminalPosSalePayload");
  const openSource = extractAsyncFunctionSource(appJs, "openCashierTerminalShift");
  const currentSource = extractAsyncFunctionSource(appJs, "fetchCashierTerminalCurrentShift");
  const summarySource = extractAsyncFunctionSource(appJs, "loadCashierTerminalShiftSummary");

  assert.match(submitSource, /if \(!cashierTerminalState\.currentShift\?\.shift_id\)/);
  assert.match(submitSource, /请先开班后再收银。/);
  assert.match(submitSource, /await loadCashierTerminalShiftSummary\(sale\.shift_id \|\| payload\.shift_id\)/);
  assert.match(payloadSource, /shift_id:\s*cashierTerminalState\.currentShift\?\.shift_id \|\| cashierTerminalState\.shiftNo/);
  assert.match(openSource, /request\(`\/stores\/\$\{encodeURIComponent\(storeCode\)\}\/pos-shifts\/open`/);
  assert.match(openSource, /cashierTerminalState\.currentShift\s*=\s*normalizeCashierTerminalShift\(shift\)/);
  assert.match(currentSource, /\/pos-shifts\/current\?cashier_id=/);
  assert.match(summarySource, /request\(`\/stores\/\$\{encodeURIComponent\(storeCode\)\}\/pos-shifts\/\$\{encodeURIComponent\(shiftId\)\}\/summary`\)/);
});

test("POS shift close uses real API, records variance, and clears closed shift", () => {
  const drawerSource = extractAssignedAnyFunctionSource(appJs, "renderCashierTerminalDrawer");
  const closeSource = extractAsyncFunctionSource(appJs, "closeCashierTerminalShiftBackend");
  const updateFieldSource = extractAssignedAnyFunctionSource(appJs, "updateCashierTerminalDrawerField");
  const actionSource = extractAssignedFunctionSource(appJs, "handleCashierTerminalAction");

  assert.match(drawerSource, /当前班次/);
  assert.match(drawerSource, /本班统计/);
  assert.match(drawerSource, /开班/);
  assert.match(drawerSource, /关闭班次/);
  assert.match(drawerSource, /cashierTerminalState\.shiftSummary/);
  assert.match(updateFieldSource, /field === "countedCash"/);
  assert.match(updateFieldSource, /cashierTerminalState\.shiftSummary\?\.expected_cash/);
  assert.match(closeSource, /request\(`\/stores\/\$\{encodeURIComponent\(storeCode\)\}\/pos-shifts\/\$\{encodeURIComponent\(shiftId\)\}\/close`/);
  assert.match(closeSource, /cashierTerminalState\.currentShift\s*=\s*null/);
  assert.match(closeSource, /cashierTerminalState\.shiftOpen\s*=\s*false/);
  assert.match(closeSource, /请先开班/);
  assert.match(actionSource, /case "open-shift":/);
  assert.match(actionSource, /await openCashierTerminalShift\(\)/);
  assert.match(actionSource, /case "close-shift":/);
  assert.match(actionSource, /await closeCashierTerminalShiftBackend\(\)/);
});

test("POS hold flow uses real hold APIs and blocks empty cart or missing shift", () => {
  const createSource = extractAsyncFunctionSource(appJs, "createCashierTerminalHold");
  const listSource = extractAsyncFunctionSource(appJs, "loadCashierTerminalHoldList");
  const resumeSource = extractAsyncFunctionSource(appJs, "resumeCashierTerminalHold");
  const cancelSource = extractAsyncFunctionSource(appJs, "cancelCashierTerminalHold");
  const actionSource = extractAssignedFunctionSource(appJs, "handleCashierTerminalAction");

  assert.match(createSource, /if \(!totals\.totalItems\)/);
  assert.match(createSource, /购物车为空，不能挂单/);
  assert.match(createSource, /if \(!cashierTerminalState\.currentShift\?\.shift_id\)/);
  assert.match(createSource, /请先开班后再挂单/);
  assert.match(createSource, /request\(`\/stores\/\$\{encodeURIComponent\(storeCode\)\}\/pos-holds`/);
  assert.match(createSource, /method:\s*"POST"/);
  assert.match(createSource, /cashierTerminalState\.cartItems\s*=\s*\[\]/);
  assert.match(createSource, /focusCashierTerminalScanInput\(\{\s*select:\s*false\s*\}\)/);
  assert.match(listSource, /request\(`\/stores\/\$\{encodeURIComponent\(storeCode\)\}\/pos-holds\?status=held&limit=\$\{encodeURIComponent\(String\(limit\)\)\}`\)/);
  assert.match(listSource, /cashierTerminalState\.holdOrders\s*=/);
  assert.match(resumeSource, /request\(`\/stores\/\$\{encodeURIComponent\(storeCode\)\}\/pos-holds\/\$\{encodeURIComponent\(holdNo\)\}\/resume`/);
  assert.match(resumeSource, /method:\s*"POST"/);
  assert.match(resumeSource, /cashierTerminalState\.activeHoldNo\s*=\s*hold\.hold_no/);
  assert.match(cancelSource, /request\(`\/stores\/\$\{encodeURIComponent\(storeCode\)\}\/pos-holds\/\$\{encodeURIComponent\(holdNo\)\}\/cancel`/);
  assert.match(cancelSource, /cancel_reason/);
  assert.match(actionSource, /case "confirm-hold":[\s\S]*await createCashierTerminalHold\(\)/);
  assert.match(actionSource, /case "resume-hold":[\s\S]*await resumeCashierTerminalHold\(target\.dataset\.terminalHoldNo\)/);
  assert.match(actionSource, /case "cancel-hold":[\s\S]*await cancelCashierTerminalHold\(target\.dataset\.terminalHoldNo\)/);
});

test("POS sale from hold sends hold_no and resets active hold only after sale", () => {
  const payloadSource = extractFunctionSource(appJs, "buildCashierTerminalPosSalePayload");
  const resetSource = extractAssignedAnyFunctionSource(appJs, "resetCashierTerminalForNextSale");

  assert.match(payloadSource, /hold_no:\s*cashierTerminalState\.activeHoldNo \|\| ""/);
  assert.match(resetSource, /cashierTerminalState\.activeHoldNo\s*=\s*""/);
});

test("POS hold drawer renders real hold rows without source-chain fields and shift shows active hold warning", () => {
  const drawerSource = extractAssignedAnyFunctionSource(appJs, "renderCashierTerminalDrawer");
  const summarySource = extractAsyncFunctionSource(appJs, "loadCashierTerminalShiftSummary");

  assert.match(drawerSource, /drawer === "hold-list"/);
  assert.match(drawerSource, /data-terminal-hold-no/);
  assert.doesNotMatch(drawerSource, /data-terminal-hold-index/);
  assert.doesNotMatch(drawerSource, /data-terminal-action="transfer-hold"/);
  assert.doesNotMatch(appJs, /function transferCashierTerminalHold/);
  assert.doesNotMatch(appJs, /case "transfer-hold":/);
  assert.doesNotMatch(drawerSource, /来源链/);
  assert.match(summarySource, /cashierTerminalState\.shiftSummary\s*=\s*summary/);
  assert.match(drawerSource, /当前还有 \$\{escapeHtml\(activeHoldCount\)\} 笔挂单未处理，请完成收款或取消挂单。/);
});

test("POS cashier UX strongly guides no-shift state and returns focus after shift or drawer actions", () => {
  const paymentSource = extractAssignedAnyFunctionSource(appJs, "renderCashierTerminalPaymentPanel");
  const openSource = extractAsyncFunctionSource(appJs, "openCashierTerminalShift");
  const actionSource = extractAssignedFunctionSource(appJs, "handleCashierTerminalAction");

  assert.match(paymentSource, /POS 暂不可收银/);
  assert.match(paymentSource, /当前没有开班，请先开班后再收银/);
  assert.match(paymentSource, /开班并开始收银/);
  assert.match(paymentSource, /data-terminal-action="open-drawer" data-terminal-drawer="shift"/);
  assert.match(openSource, /focusCashierTerminalScanInput\(\{\s*select:\s*false\s*\}\)/);
  assert.match(actionSource, /case "close-drawer":[\s\S]*focusCashierTerminalScanInput\(\{\s*select:\s*false\s*\}\)/);
});

test("POS payment validation uses cashier-facing shortage and M-Pesa messages", () => {
  const source = extractFunctionSource(appJs, "validateCashierTerminalPayment");
  const context = {
    cashierTerminalState: {
      activePaymentMode: "cash",
      cashReceived: "100",
      mpesaAmount: "250",
      mpesaReference: "",
      mixedCashAmount: "100",
      mixedMpesaAmount: "50",
      mixedMpesaReference: "",
    },
    getCashierTerminalTotals: () => ({ totalItems: 1, totalAmount: 250 }),
    normalizeCashierTerminalNumber: (value) => Math.max(Number(value || 0) || 0, 0),
    formatCashierPreviewMoney: (value) => `KSh ${Number(value || 0)}`,
  };
  const fn = vm.runInNewContext(`${source}\nvalidateCashierTerminalPayment;`, context);

  assert.throws(() => fn(), /还差 KSh 150/);
  context.cashierTerminalState.activePaymentMode = "mpesa";
  assert.throws(() => fn(), /请输入 M-Pesa Reference/);
  context.cashierTerminalState.activePaymentMode = "mixed";
  assert.throws(() => fn(), /Cash \+ M-Pesa 还差 KSh 100/);
});

test("POS M-Pesa UI warns manual reference is not automatic settlement proof", () => {
  const paymentSource = extractAssignedAnyFunctionSource(appJs, "renderCashierTerminalPaymentPanel");
  assert.match(paymentSource, /请确认 M-Pesa 已到账，再点击完成收款。/);
});

test("POS scan failures keep resolver details but show cashier-facing main error and refocus scan", () => {
  const formatterSource = extractFunctionSource(appJs, "formatCashierTerminalScanError");
  const lookupSource = extractAssignedFunctionSource(appJs, "submitCashierTerminalLookup");
  const scanListenerMatch = appJs.match(/cashierTerminalScanForm\?\.addEventListener\("submit"[\s\S]*?\n\}\);/);
  assert.ok(scanListenerMatch, "missing cashier terminal scan listener");

  assert.match(formatterSource, /不能销售：请扫描商品码 STORE_ITEM/);
  assert.match(formatterSource, /你扫到的是 SDO 送货单码。/);
  assert.match(formatterSource, /reject_reason/);
  assert.match(lookupSource, /formatCashierTerminalScanError\(error\)/);
  assert.match(lookupSource, /cashierTerminalState\.scanErrorTitle/);
  assert.match(lookupSource, /focusCashierTerminalScanInput\(\{\s*select:\s*true\s*\}\)/);
  assert.match(scanListenerMatch[0], /finally[\s\S]*focusCashierTerminalScanInput\(\{\s*select:\s*true\s*\}\)/);
});

test("POS reprint confirmation loads real receipt only after cashier confirmation", () => {
  const drawerSource = extractAssignedAnyFunctionSource(appJs, "renderCashierTerminalDrawer");
  const actionSource = extractAssignedFunctionSource(appJs, "handleCashierTerminalAction");
  const detailSource = extractAsyncFunctionSource(appJs, "loadCashierTerminalSaleReceiptForReprint");

  assert.match(drawerSource, /drawer === "reprint-confirm"/);
  assert.match(drawerSource, /这是重打小票，不会重新销售，也不会扣库存。/);
  assert.match(drawerSource, /确认重打/);
  assert.match(drawerSource, /取消/);
  assert.match(actionSource, /case "reprint-receipt":[\s\S]*openCashierTerminalReprintConfirmation/);
  assert.match(actionSource, /case "reprint-sale":[\s\S]*openCashierTerminalReprintConfirmation/);
  assert.match(actionSource, /case "confirm-reprint":[\s\S]*loadCashierTerminalLatestReceiptForReprint/);
  assert.doesNotMatch(actionSource, /case "confirm-reprint":[\s\S]*submitCashierTerminalBackendSale/);
  assert.match(detailSource, /focusCashierTerminalScanInput\(\{\s*select:\s*false\s*\}\)/);
});

test("POS close-shift drawer highlights non-zero cash variance with manager note guidance", () => {
  const drawerSource = extractAssignedAnyFunctionSource(appJs, "renderCashierTerminalDrawer");
  assert.match(drawerSource, /cashier-shift-variance[\s\S]*danger/);
  assert.match(drawerSource, /现金有差异，请填写原因并让店长确认。/);
});

test("cashier terminal shell only activates on the POS sales panel", () => {
  const terminalModeSource = extractFunctionSource(appJs, "syncCashierTerminalMode");
  assert.match(terminalModeSource, /isCashierTerminalRole\(\)/);
  assert.match(terminalModeSource, /isCashierTerminalPanelActive\(\)/);
  assert.doesNotMatch(terminalModeSource, /const enabled = Boolean\(currentSession\.user\) && isCashierTerminalRole\(\);/);
});

test("cashier terminal hidden drawer does not cover the POS screen", () => {
  assert.match(
    stylesCss,
    /body\.cashier-terminal-mode \.drawer-backdrop\[hidden\][\s\S]*body\.cashier-terminal-mode \.side-drawer\[hidden\][\s\S]*display:\s*none\s*!important/
  );
});

test("operations analytics renders POS store summaries and source-chain sale records", () => {
  const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
  assert.match(indexHtml, /id="posSalesAnalyticsSummary"/);
  assert.match(indexHtml, /id="posSalesAnalyticsRecords"/);
  assert.match(indexHtml, /id="operationsPosSalesAnalyticsSummary"/);
  assert.match(indexHtml, /id="operationsPosSalesAnalyticsRecords"/);
  const summarizeSource = extractFunctionSource(appJs, "summarizePosStoreItemSalesForAnalytics");
  const renderSource = extractFunctionSource(appJs, "renderPosSalesAnalyticsSummary");
  [
    "todaySalesAmount",
    "todayItemCount",
    "todayOrderCount",
    "averageTicket",
    "cashSalesAmount",
    "mpesaSalesAmount",
    "mixedSalesAmount",
    "soldStoreItemCount",
    "costKnownItemCount",
    "costUnknownItemCount",
    "knownGrossMarginAmount",
    "marginPendingRecordCount",
    "lastSaleAt",
  ].forEach((field) => assert.match(summarizeSource, new RegExp(field)));
  [
    "source_sdo",
    "source_package",
    "source_type",
    "assigned_employee",
    "store_rack_code",
    "category_summary",
    "成本待确认",
    "毛利待确认",
  ].forEach((field) => assert.match(renderSource, new RegExp(field)));
  assert.match(appJs, /renderPosSalesAnalyticsSummary\(posStoreItemSaleRecordState\)/);
});

test("operations center exposes all POS sales data with brief analysis", () => {
  assert.match(indexHtml, /<h2>2\. 全部销售数据 \/ 简要分析<\/h2>/);
  [
    "operationsAllSalesOverview",
    "operationsAllSalesAnalysis",
    "operationsAllSalesByStore",
    "operationsAllSalesRecords",
  ].forEach((id) => assert.match(indexHtml, new RegExp(`id="${id}"`)));

  const allSalesSummarySource = extractFunctionSource(appJs, "summarizeAllPosStoreItemSalesForOperations");
  const allSalesRenderSource = extractFunctionSource(appJs, "renderOperationsAllSalesData");
  [
    "totalSalesAmount",
    "totalItemCount",
    "totalOrderCount",
    "storeCount",
    "averageTicket",
    "todaySalesAmount",
    "last7DaysSalesAmount",
    "cashSalesAmount",
    "mpesaSalesAmount",
    "mixedSalesAmount",
    "storeSummaries",
    "categorySummaries",
    "costKnownItemCount",
    "costUnknownItemCount",
    "knownGrossMarginAmount",
    "marginPendingRecordCount",
    "analysisLines",
  ].forEach((field) => assert.match(allSalesSummarySource, new RegExp(field)));
  [
    "operationsAllSalesOverview",
    "operationsAllSalesAnalysis",
    "operationsAllSalesByStore",
    "operationsAllSalesRecords",
    "source_sdo",
    "source_package",
    "source_type",
    "assigned_employee",
    "store_rack_code",
    "cashier",
    "category_summary",
    "cost_status",
    "gross_margin",
    "毛利待确认",
  ].forEach((field) => assert.match(allSalesRenderSource, new RegExp(field)));
  assert.match(appJs, /renderOperationsAllSalesData\(records\)/);
  assert.match(appJs, /match:\s*"2\. 全部销售数据 \/ 简要分析"/);
  const navMetaStart = appJs.indexOf('match: "2. 全部销售数据 / 简要分析"');
  const navMetaEnd = appJs.indexOf("\n  },", navMetaStart);
  assert.doesNotMatch(appJs.slice(navMetaStart, navMetaEnd), /hiddenInNav:\s*true/);
});

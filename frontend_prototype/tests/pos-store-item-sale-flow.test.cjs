const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appJs = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const stylesCss = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
const terminologyTs = fs.readFileSync(path.join(__dirname, "..", "..", "src", "i18n", "terminology.ts"), "utf8");
const enKEDictionaryTs = fs.readFileSync(path.join(__dirname, "..", "..", "src", "i18n", "dictionaries", "en-KE.ts"), "utf8");
const zhCNDictionaryTs = fs.readFileSync(path.join(__dirname, "..", "..", "src", "i18n", "dictionaries", "zh-CN.ts"), "utf8");

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

function extractLastCssRule(selectorPattern) {
  const pattern = new RegExp(`${selectorPattern}\\s*\\{[^}]*\\}`, "g");
  const matches = Array.from(stylesCss.matchAll(pattern));
  assert.ok(matches.length, `missing css rule ${selectorPattern}`);
  return matches[matches.length - 1][0];
}

function extractCssRuleContaining(selectorPattern, requiredPattern) {
  const pattern = new RegExp(`${selectorPattern}\\s*\\{[^}]*\\}`, "g");
  const matches = Array.from(stylesCss.matchAll(pattern)).map((match) => match[0]);
  const found = matches.find((rule) => requiredPattern.test(rule));
  assert.ok(found, `missing css rule ${selectorPattern} containing ${requiredPattern}`);
  return found;
}

function extractCssSection(startMarker, endMarker) {
  const start = stylesCss.indexOf(startMarker);
  assert.notEqual(start, -1, `missing css section ${startMarker}`);
  const end = endMarker ? stylesCss.indexOf(endMarker, start + startMarker.length) : -1;
  return stylesCss.slice(start, end === -1 ? stylesCss.length : end);
}

function extractElementById(source, id) {
  const start = source.indexOf(`id="${id}"`);
  assert.notEqual(start, -1, `missing element ${id}`);
  const sectionStart = source.lastIndexOf("<section", start);
  const divStart = source.lastIndexOf("<div", start);
  const blockStart = Math.max(sectionStart, divStart);
  const nextSection = source.indexOf("\n            <section", start);
  const nextPanel = source.indexOf("\n          </main>", start);
  const blockEnd = [nextSection, nextPanel].filter((index) => index > start).sort((left, right) => left - right)[0] || source.length;
  return source.slice(blockStart, blockEnd);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

test("POS cashier high-frequency copy is backed by stable dictionary keys", () => {
  const requiredKeys = {
    scanStoreItem: "pos.scan.storeItem",
    addUnbarcodedItem: "pos.item.addUnbarcoded",
    openShift: "pos.shift.open",
    closeShift: "pos.shift.close",
    holdOrder: "pos.order.hold",
    resumeHeldOrder: "pos.order.resumeHeld",
    reprintReceipt: "pos.receipt.reprint",
    xReport: "pos.report.x",
    zReport: "pos.report.z",
    cashVariance: "pos.cash.variance",
    itemAlreadySold: "pos.item.alreadySold",
    storeItemOnlyRule: "pos.scan.storeItemOnly",
    openShiftFirst: "pos.shift.openFirst",
  };

  assert.match(appJs, /POS_CASHIER_TERMINOLOGY_KEYS/);
  assert.match(appJs, /function cashierTerminalTerm/);

  Object.entries(requiredKeys).forEach(([name, key]) => {
    assert.match(terminologyTs, new RegExp(escapeRegex(key)));
    assert.match(enKEDictionaryTs, new RegExp(escapeRegex(key)));
    assert.match(zhCNDictionaryTs, new RegExp(escapeRegex(key)));
    assert.match(appJs, new RegExp(`${name}:\\s*"${escapeRegex(key)}"`));
  });

  const copySource = extractFunctionSource(appJs, "ensureCashierTerminalPreviewCopy");
  [
    "scanStoreItem",
    "addUnbarcodedItem",
    "openShift",
    "closeShift",
    "holdOrder",
    "resumeHeldOrder",
    "reprintReceipt",
    "xReport",
    "zReport",
    "cashVariance",
    "itemAlreadySold",
    "storeItemOnlyRule",
    "openShiftFirst",
  ].forEach((keyName) => {
    assert.match(copySource, new RegExp(`cashierTerminalTerm\\(POS_CASHIER_TERMINOLOGY_KEYS\\.${keyName}(?:,\\s*"(?:zh|en)")?\\)`));
  });
});

test("POS cashier visible copy is employee-facing and keeps Store Item scan guidance short", () => {
  const terminalHtml = extractElementById(indexHtml, "cashierTerminalShell");
  const visibleSources = [
    terminalHtml,
    extractAssignedAnyFunctionSource(appJs, "renderCashierTerminalStatusBar"),
    extractAssignedAnyFunctionSource(appJs, "renderCashierTerminalLookupPanel"),
    extractAssignedAnyFunctionSource(appJs, "renderCashierTerminalPaymentPanel"),
    extractFunctionSource(appJs, "formatCashierTerminalScanError"),
    extractAssignedAnyFunctionSource(appJs, "renderCashierTerminalDrawer"),
  ].join("\n");

  assert.match(appJs, /POS only scans Store Item\. Scan a product label\./);
  assert.match(visibleSources, /storeItemOnlyRule|posStoreItemOnly/);
  [
    "entity_type",
    "stock_in_confirmed",
    "manual_legacy_item",
    "sale_out",
    "pending_print",
    "pending_putaway",
  ].forEach((backendWord) => {
    assert.doesNotMatch(visibleSources, new RegExp(escapeRegex(backendWord)));
  });
});

test("POS cashier shift lookup page is wired with nav entry, refresh action, and empty-state copy", () => {
  assert.match(indexHtml, /9\.1 收银班次查询/);
  assert.match(indexHtml, /id="cashierShiftLookupRefreshButton"/);
  assert.match(indexHtml, /刷新门店终端总览/);
  assert.match(appJs, /match:\s*"9\.1 收银班次查询"/);
  assert.match(appJs, /navTitle:\s*"收银班次查询"/);
  assert.match(appJs, /function renderCashierShiftLookupSummary/);
  assert.match(appJs, /async function refreshCashierShiftLookupSummary/);
  assert.match(appJs, /一家门店可同时有多个收银员开班/);
  assert.match(appJs, /本机记录的 terminal_id（仅作设备来源参考）/);
});

test("POS cashier terminal renders cashier touch layout without changing barcode scope", () => {
  assert.match(indexHtml, /class="[^"]*cashier-terminal-shell/);
  assert.match(indexHtml, /class="[^"]*cashier-terminal-touch-layout/);
  assert.match(indexHtml, /id="cashierTerminalBarcodeInput"[\s\S]*?placeholder="扫描或输入 STORE_ITEM 商品码"/);
  assert.match(indexHtml, /id="cashierTerminalCart"[\s\S]*class="[^"]*cashier-terminal-cart/);
  assert.match(indexHtml, /id="cashierTerminalPaymentPanel"[\s\S]*class="[^"]*cashier-terminal-payment-panel/);
  assert.match(indexHtml, /id="cashierTerminalQuickActions"[\s\S]*class="[^"]*cashier-terminal-transaction-strip/);
  assert.match(appJs, /scanTitle:\s*cashierTerminalTerm\(POS_CASHIER_TERMINOLOGY_KEYS\.scanStoreItem,\s*"zh"\)/);
  assert.match(appJs, /basketTitle:\s*"商品篮"/);
  assert.match(appJs, /paymentTitle:\s*"结账"/);
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

test("POS cashier terminal separates top status and shift-only strip metrics", () => {
  const headerSource = extractAssignedAnyFunctionSource(appJs, "renderCashierTerminalSessionStrip");
  const infoStripSource = extractAssignedAnyFunctionSource(appJs, "renderCashierTerminalStatusBar");

  ["当前门店", "收银员", "班次", "网络状态", "打印机", "同步状态"].forEach((label) => assert.match(headerSource, new RegExp(label)));
  ["今日销售额", "今日订单数", "本班销售额", "本班订单数", "当前时间"].forEach((label) => assert.doesNotMatch(headerSource, new RegExp(label)));
  assert.match(headerSource, /getCashierTerminalStoreDisplayName\(\)/);
  assert.match(headerSource, /getCashierTerminalCashierDisplayName\(\)/);
  assert.match(headerSource, /getCashierTerminalShiftNo\(\) \? renderCashierTerminalHeaderData\(getCashierTerminalShiftNo\(\)\) : escapeHtml\(copy\.openShiftFirst\)/);
  assert.match(infoStripSource, /cashier-terminal-status-summary/);
  ["班次号", "班次状态", "开班时间", "备用金", "本班销售额", "本班订单数"].forEach((label) => assert.match(infoStripSource, new RegExp(label)));
  assert.match(infoStripSource, /getCashierTerminalShiftNo\(\) \|\| copy\.openShiftFirst/);
  assert.match(infoStripSource, /cashierTerminalState\.currentShift\?\.opened_at/);
  assert.match(infoStripSource, /cashierTerminalState\.currentShift\?\.opening_float_cash/);
  assert.doesNotMatch(infoStripSource, /copy\.posStoreItemOnly/);
  assert.doesNotMatch(infoStripSource, /todaySalesAmount/);
  assert.doesNotMatch(infoStripSource, /todayOrderCount/);
  assert.match(infoStripSource, /copy\.resumeHeldOrder/);
  assert.match(infoStripSource, /copy\.closeShift/);
  assert.match(infoStripSource, /copy\.openNow/);
});

test("POS cashier terminal exposes a fullscreen entry with browser API fallback", () => {
  const terminalHtml = extractElementById(indexHtml, "cashierTerminalShell");
  const actionSource = extractAssignedFunctionSource(appJs, "handleCashierTerminalAction");
  const toggleSource = extractAsyncFunctionSource(appJs, "toggleCashierTerminalFullscreen");
  const syncSource = extractFunctionSource(appJs, "syncCashierTerminalFullscreenState");

  assert.match(terminalHtml, /data-terminal-action="toggle-fullscreen"/);
  assert.match(terminalHtml, /data-terminal-action="toggle-fullscreen" data-i18n-skip/);
  assert.match(terminalHtml, /全屏收银 \/ Enter Fullscreen/);
  assert.match(actionSource, /case "toggle-fullscreen":[\s\S]*await toggleCashierTerminalFullscreen\(\)/);
  assert.match(toggleSource, /requestFullscreen\(\)/);
  assert.match(toggleSource, /exitFullscreen\(\)/);
  assert.match(toggleSource, /F11/);
  assert.match(toggleSource, /fullscreenFeedback/);
  assert.match(syncSource, /document\.fullscreenElement/);
  assert.match(appJs, /fullscreenchange/);
});

test("POS topbar exposes a compact cashier language switch", () => {
  const terminalHtml = extractElementById(indexHtml, "cashierTerminalShell");
  const headerSource = extractAssignedAnyFunctionSource(appJs, "renderCashierTerminalSessionStrip");
  const syncSource = extractFunctionSource(appJs, "syncGlobalLanguageButtons");
  const topbarActionsRule = extractLastCssRule("body\\.cashier-terminal-mode \\.topbar-actions");
  const compactLanguageRule = extractCssRuleContaining("body\\.cashier-terminal-mode \\.cashier-terminal-web-language-toggle", /min-width:\s*88px/);
  const compactButtonRule = extractCssRuleContaining("body\\.cashier-terminal-mode \\.cashier-terminal-web-language-toggle \\.global-language-button", /min-width:\s*34px/);

  assert.match(terminalHtml, /cashier-terminal-web-language-toggle/);
  assert.match(terminalHtml, /data-i18n-skip/);
  assert.match(terminalHtml, /data-global-language="zh">中<\/button>\s*<span class="cashier-terminal-language-divider"[^>]*>\/<\/span>\s*<button type="button" class="global-language-button" data-global-language="en">Eng<\/button>/);
  assert.match(syncSource, /closest\("\.cashier-terminal-web-language-toggle"\)/);
  assert.match(syncSource, /button\.textContent = isCashierCompactLanguageButton \? "中"/);
  assert.match(syncSource, /button\.textContent = isCashierCompactLanguageButton \? "Eng"/);
  assert.doesNotMatch(headerSource, /renderWebLanguageToggleMarkup\("cashier-terminal-web-language-toggle"\)/);
  assert.match(topbarActionsRule, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto\s+auto\s+auto/);
  assert.match(compactLanguageRule, /justify-self:\s*end/);
  assert.match(compactLanguageRule, /white-space:\s*nowrap/);
  assert.match(compactButtonRule, /font-size:\s*12px/);
});

test("POS header sales counters sync from real shift and recent sale data instead of demo defaults", () => {
  const previewSource = extractFunctionSource(appJs, "ensureCashierTerminalPreviewState");
  const summarySource = extractAsyncFunctionSource(appJs, "loadCashierTerminalShiftSummary");
  const recentSource = extractAsyncFunctionSource(appJs, "loadCashierTerminalRecentSales");
  const saleSource = extractAsyncFunctionSource(appJs, "submitCashierTerminalBackendSale");
  const openSource = extractAsyncFunctionSource(appJs, "openCashierTerminalShift");
  const primeSource = extractAsyncFunctionSource(appJs, "primeCashierTerminalSession");
  const applyShiftSource = extractFunctionSource(appJs, "applyCashierTerminalShiftSummaryToHeader");
  const applySalesSource = extractFunctionSource(appJs, "applyCashierTerminalTodaySalesSummaryFromSales");

  assert.doesNotMatch(previewSource, /48620|18450/);
  assert.match(previewSource, /todaySalesAmount\s*=\s*normalizeCashierTerminalNumber\(cashierTerminalState\.todaySalesAmount\)/);
  assert.match(previewSource, /shiftSalesAmount\s*=\s*normalizeCashierTerminalNumber\(cashierTerminalState\.shiftSalesAmount\)/);
  assert.match(applyShiftSource, /summary\.total_sales/);
  assert.match(applyShiftSource, /summary\.order_count/);
  assert.match(applySalesSource, /getLocalDateKey/);
  assert.match(applySalesSource, /cashierTerminalState\.latestCompletedSale/);
  assert.match(summarySource, /applyCashierTerminalShiftSummaryToHeader\(summary\)/);
  assert.match(summarySource, /await loadCashierTerminalTodaySalesSummary\(\{\s*render:\s*false\s*\}\)/);
  assert.match(summarySource, /renderCashierTerminalSessionStrip\(\)/);
  assert.match(recentSource, /applyCashierTerminalTodaySalesSummaryFromSales\(cashierTerminalState\.recentSales\)/);
  assert.match(saleSource, /await loadCashierTerminalShiftSummary\(sale\.shift_id \|\| payload\.shift_id\)/);
  assert.match(saleSource, /await loadCashierTerminalTodaySalesSummary\(\{\s*render:\s*false\s*\}\)/);
  assert.match(openSource, /await loadCashierTerminalShiftSummary\(cashierTerminalState\.currentShift\.shift_id\)/);
  assert.match(primeSource, /await loadCashierTerminalTodaySalesSummary\(\{\s*render:\s*false\s*\}\)/);
  assert.match(primeSource, /renderCashierTerminal\(\)/);
});

test("POS top header derives store and cashier from the logged-in account", () => {
  const storeSource = extractAssignedAnyFunctionSource(appJs, "getCashierTerminalStoreCode");
  const storeLabelSource = extractFunctionSource(appJs, "getCashierTerminalStoreDisplayName");
  const storeCodeLabelSource = extractFunctionSource(appJs, "formatCashierTerminalStoreNameFromCode");
  const cashierSource = extractFunctionSource(appJs, "getCashierTerminalCashierName");
  const cashierDisplaySource = extractFunctionSource(appJs, "getCashierTerminalCashierDisplayName");
  const headerSource = extractAssignedAnyFunctionSource(appJs, "renderCashierTerminalSessionStrip");

  assert.doesNotMatch(storeSource, /CASHIER_TERMINAL_PREVIEW_STORE/);
  assert.match(storeSource, /currentSession\.user/);
  assert.match(storeSource, /getCashierTerminalSessionStoreCode/);
  assert.match(storeLabelSource, /currentSession\.user/);
  assert.match(storeLabelSource, /storeDirectoryState/);
  assert.match(storeCodeLabelSource, /Lucky Summer/);
  assert.doesNotMatch(cashierSource, /CASHIER_TERMINAL_PREVIEW_CASHIER/);
  assert.match(cashierSource, /currentSession\.user\?\.username/);
  assert.match(cashierDisplaySource, /currentSession\.user/);
  assert.doesNotMatch(cashierDisplaySource, /getUserDisplayNameForLanguage/);
  assert.match(extractFunctionSource(appJs, "renderCashierTerminalHeaderData"), /data-i18n-skip/);
  assert.match(headerSource, /getCashierTerminalStoreDisplayName\(\)/);
  assert.match(headerSource, /getCashierTerminalCashierDisplayName\(\)/);
  assert.match(headerSource, /renderCashierTerminalHeaderData\(getCashierTerminalStoreDisplayName\(\)\)/);
  assert.match(headerSource, /renderCashierTerminalHeaderData\(getCashierTerminalCashierDisplayName\(\)\)/);

  const helpers = vm.runInNewContext(
    [
      extractFunctionSource(appJs, "getCashierTerminalSessionStoreCode"),
      storeCodeLabelSource,
      storeSource,
      storeLabelSource,
      cashierSource,
      cashierDisplaySource,
      "({ getCashierTerminalStoreCode, getCashierTerminalStoreDisplayName, getCashierTerminalCashierName, getCashierTerminalCashierDisplayName })",
    ].join("\n"),
    {
      currentSession: {
        user: {
          username: "lucky_cashier_1",
          full_name: "Lucky Summer Cashier",
          role_code: "cashier",
          store_code: "LUCKY_SUMMER",
        },
      },
      storeDirectoryState: [],
      getCurrentStoreCodeFallback: () => "UTAWALA",
      getUserDisplayNameForLanguage: (user) => user.full_name || user.username || "-",
    },
  );

  assert.equal(helpers.getCashierTerminalStoreCode(), "LUCKY_SUMMER");
  assert.equal(helpers.getCashierTerminalStoreDisplayName(), "Lucky Summer");
  assert.equal(helpers.getCashierTerminalCashierName(), "lucky_cashier_1");
  assert.equal(helpers.getCashierTerminalCashierDisplayName(), "Lucky Summer Cashier");
});

test("POS cashier terminal removes blocking bottom floating status cards", () => {
  assert.doesNotMatch(stylesCss, /body\.cashier-terminal-mode \.cashier-terminal-quick-actions\s*\{[^}]*position:\s*fixed/);
  assert.doesNotMatch(stylesCss, /body\.cashier-terminal-mode \.cashier-terminal-quick-actions\s*\{[^}]*bottom:/);
  assert.match(stylesCss, /body\.cashier-terminal-mode \.cashier-terminal-transaction-strip\s*\{/);
  assert.match(stylesCss, /body\.cashier-terminal-mode \.cashier-terminal-status-metrics\s*\{[^}]*grid-template-columns:\s*repeat\(7,\s*minmax\(0,\s*1fr\)\)/);
});

test("POS hotfix keeps top header compact and receipt non-blocking", () => {
  const topbarRule = extractCssRuleContaining("body\\.cashier-terminal-mode \\.topbar", /grid-template-columns:\s*minmax\(150px,\s*190px\)\s+minmax\(0,\s*1fr\)/);
  const topbarActionsRule = extractLastCssRule("body\\.cashier-terminal-mode \\.topbar-actions");
  const statusStripRule = extractCssRuleContaining("body\\.cashier-terminal-mode \\.cashier-terminal-session-strip", /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(88px,\s*1fr\)\)/);
  const mainBodyRule = extractCssRuleContaining("body\\.cashier-terminal-mode \\.cashier-terminal-body", /height:\s*calc\(100vh - 132px\)/);
  const transactionStripRule = extractCssRuleContaining("body\\.cashier-terminal-mode \\.cashier-terminal-transaction-strip", /min-height:\s*52px/);
  const receiptEmptyRule = extractLastCssRule("body\\.cashier-terminal-mode \\.cashier-terminal-receipt-panel\\.is-empty");
  const receiptSource = extractFunctionSource(appJs, "renderCashierTerminalReceiptPanel");

  assert.match(stylesCss, /POS-UI-2-HOTFIX/);
  assert.match(stylesCss, /Issue #309/);
  assert.match(topbarRule, /display:\s*grid/);
  assert.match(topbarRule, /grid-template-columns:\s*minmax\(150px,\s*190px\)\s+minmax\(0,\s*1fr\)/);
  assert.match(topbarRule, /align-items:\s*center/);
  assert.match(topbarRule, /max-height:\s*78px/);
  assert.doesNotMatch(topbarRule, /align-items:\s*stretch/);
  assert.match(topbarActionsRule, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto\s+auto\s+auto/);
  assert.match(statusStripRule, /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(88px,\s*1fr\)\)/);
  assert.match(statusStripRule, /max-height:\s*58px/);
  assert.match(mainBodyRule, /grid-template-columns:\s*minmax\(230px,\s*0\.27fr\)\s+minmax\(390px,\s*0\.43fr\)\s+minmax\(300px,\s*0\.3fr\)/);
  assert.match(mainBodyRule, /height:\s*calc\(100vh - 132px\)/);
  assert.match(transactionStripRule, /min-height:\s*52px/);
  assert.match(transactionStripRule, /overflow:\s*visible/);
  assert.match(receiptSource, /receiptPanel\.hidden\s*=\s*true/);
  assert.match(receiptEmptyRule, /display:\s*none/);
});

test("POS 1366x768 cashier layout keeps scan cart checkout in the first viewport", () => {
  const compactDesktopMedia = extractCssSection("@media (min-width: 1121px) and (max-width: 1320px)", "@media (max-height: 780px)");
  assert.match(compactDesktopMedia, /body\.cashier-terminal-mode \.cashier-terminal-body\s*\{[\s\S]*grid-template-columns:\s*minmax\(230px,\s*0\.27fr\)\s+minmax\(390px,\s*0\.43fr\)\s+minmax\(300px,\s*0\.3fr\)/);
  assert.match(compactDesktopMedia, /body\.cashier-terminal-mode \.payment-column\s*\{[\s\S]*grid-column:\s*auto/);

  const shortHeightMedia = extractCssSection("@media (max-height: 780px)");
  assert.match(shortHeightMedia, /cashier-terminal-body\s*\{[\s\S]*height:\s*calc\(100vh - 154px\)/);
  assert.match(shortHeightMedia, /cashier-terminal-transaction-strip\s*\{[\s\S]*min-height:\s*44px/);
  assert.match(shortHeightMedia, /cashier-terminal-payment-panel\s*\{[\s\S]*overflow:\s*auto/);
  assert.match(shortHeightMedia, /cashier-terminal-quick-actions\s*\{[\s\S]*display:\s*none/);
  assert.doesNotMatch(shortHeightMedia, /position:\s*fixed/);
});

test("POS fullscreen shell fills the viewport on cashier all-in-one terminals", () => {
  const shellRule = extractCssRuleContaining("body\\.cashier-terminal-mode \\.cashier-terminal-shell", /height:\s*100dvh/);
  const fullscreenRule = extractCssRuleContaining("body\\.cashier-terminal-mode \\.cashier-terminal-shell:fullscreen", /width:\s*100vw/);
  const bodyRule = extractCssRuleContaining("body\\.cashier-terminal-mode", /overflow:\s*hidden/);
  const shortHeightMedia = extractCssSection("@media (max-height: 780px)");

  assert.match(shellRule, /height:\s*100dvh/);
  assert.match(shellRule, /max-height:\s*100dvh/);
  assert.match(fullscreenRule, /height:\s*100dvh/);
  assert.match(fullscreenRule, /background:/);
  assert.match(bodyRule, /overflow:\s*hidden/);
  assert.match(shortHeightMedia, /cashier-terminal-body\s*\{[\s\S]*height:\s*calc\(100dvh - 144px\)/);
});

test("POS cashier terminal gates resolver results before adding items", () => {
  const guardSource = extractFunctionSource(appJs, "ensureCashierTerminalResolvedItemCanEnterCart");
  assert.match(guardSource, /barcode_type/);
  assert.match(guardSource, /"STORE_ITEM"/);
  assert.match(guardSource, /pos_allowed/);
  assert.match(guardSource, /reject_reason/);
  assert.match(guardSource, /store_code/);
  assert.doesNotMatch(appJs, /getFirstCashierTerminalResolvedStatuses/);
  assert.match(appJs, /getCashierTerminalResolvedStatuses\(resolved\)/);
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

test("POS manual unbarcoded item is an explicit separate audited action", () => {
  const drawerSource = extractAssignedAnyFunctionSource(appJs, "renderCashierTerminalDrawer");
  const actionSource = extractAssignedFunctionSource(appJs, "handleCashierTerminalAction");
  const addSource = extractFunctionSource(appJs, "addCashierTerminalManualItemToCart");
  const payloadSource = extractFunctionSource(appJs, "buildCashierTerminalPosSaleItemPayload");

  assert.match(indexHtml, /data-terminal-drawer="manual-item"/);
  assert.match(indexHtml, /无码商品/);
  assert.match(indexHtml, /Manual Item/);
  assert.match(drawerSource, /drawer === "manual-item"/);
  [
    "manualItemCategory",
    "manualItemDescription",
    "manualItemQuantity",
    "manualItemUnitPrice",
    "manualItemReason",
  ].forEach((fieldName) => assert.match(drawerSource, new RegExp(fieldName)));
  [
    "Tag missing",
    "Label damaged",
    "Legacy item",
    "Manager approved manual sale",
    "Other",
  ].forEach((reason) => assert.match(appJs, new RegExp(escapeRegex(reason))));
  assert.match(drawerSource, /getCashierTerminalManualCategoryOptions\(\)/);
  assert.match(drawerSource, /<select data-terminal-drawer-field="manualItemCategory"/);
  assert.doesNotMatch(drawerSource, /<input type="text"[^>]+data-terminal-drawer-field="manualItemCategory"/);
  assert.match(actionSource, /case "add-manual-item":/);
  assert.match(actionSource, /addCashierTerminalManualItemToCart\(\)/);
  assert.match(addSource, /buildCashierTerminalManualUnbarcodedLine\(\)/);
  assert.match(addSource, /cashierTerminalState\.cartItems\.push\(line\)/);
  assert.doesNotMatch(addSource, /resolveBarcodeForContext|resolveCashierTerminalStoreItemForPos|ensureCashierTerminalResolvedItemCanEnterCart/);
  assert.match(payloadSource, /line_type:\s*row\.line_type \|\| "manual_unbarcoded"/);
  assert.match(payloadSource, /barcode_type:\s*"NONE"/);
  assert.match(payloadSource, /store_item_machine_code:\s*null/);
  assert.match(payloadSource, /requires_audit:\s*true/);
});

test("POS manual sale category options come from warehouse default sale price category mains", () => {
  const source = [
    extractFunctionSource(appJs, "getCashierTerminalManualCategoryOptions"),
  ].join("\n");

  assert.match(source, /ensureApparelDefaultSalePriceState\(\)/);
  assert.match(source, /category_main/);
  assert.match(source, /getCategoryMainDisplayLabel/);
  assert.match(source, /DEFAULT_APPAREL_CATEGORY_PRESETS/);

  const getOptions = vm.runInNewContext(`${source}\ngetCashierTerminalManualCategoryOptions;`, {
    ensureApparelDefaultSalePriceState: () => [
      { category_main: "dress", category_sub: "short dress", grade: "P", default_sale_price_kes: 440 },
      { category_main: "dress", category_sub: "long dress", grade: "S", default_sale_price_kes: 376 },
      { category_main: "shoes", category_sub: "sport shoes", grade: "P", default_sale_price_kes: 640 },
    ],
    getCategoryMainDisplayLabel: (value, options = {}) => options.bilingual ? `${value} / ${value.toUpperCase()}` : value,
    DEFAULT_APPAREL_CATEGORY_PRESETS: [
      { category_main: "dress" },
      { category_main: "shoes" },
      { category_main: "tops" },
    ],
  });

  assert.deepEqual(JSON.parse(JSON.stringify(getOptions().map((row) => row.value))), ["dress", "shoes"]);
  assert.deepEqual(JSON.parse(JSON.stringify(getOptions().map((row) => row.label))), ["dress / DRESS", "shoes / SHOES"]);
});

test("POS manual sale category options render without legacy preset globals", () => {
  const source = [
    extractFunctionSource(appJs, "getCashierTerminalManualCategoryOptions"),
  ].join("\n");

  const getOptions = vm.runInNewContext(`${source}\ngetCashierTerminalManualCategoryOptions;`, {
    ensureApparelDefaultSalePriceState: () => [
      { category_main: "dress", category_sub: "short dress", grade: "P", default_sale_price_kes: 440 },
      { category_main: "shoes", category_sub: "sport shoes", grade: "P", default_sale_price_kes: 640 },
    ],
    getCategoryMainDisplayLabel: (value, options = {}) => options.bilingual ? `${value} / ${value.toUpperCase()}` : value,
  });

  assert.deepEqual(JSON.parse(JSON.stringify(getOptions().map((row) => row.value))), ["dress", "shoes"]);
});

test("POS manual item builder creates cart row without STORE_ITEM machine code", () => {
  const source = [
    extractFunctionSource(appJs, "getCashierTerminalManualCategoryOptions"),
    extractFunctionSource(appJs, "isCashierTerminalManualUnbarcodedLine"),
    extractFunctionSource(appJs, "buildCashierTerminalManualUnbarcodedLine"),
  ].join("\n");
  const context = {
    cashierTerminalState: {
      manualItemCategory: "dress",
      manualItemDescription: "Button pack",
      manualItemQuantity: "2",
      manualItemUnitPrice: "125",
      manualItemReason: "Label damaged",
    },
    ensureApparelDefaultSalePriceState: () => [
      { category_main: "dress", category_sub: "short dress", grade: "P", default_sale_price_kes: 440 },
    ],
    DEFAULT_APPAREL_CATEGORY_PRESETS: [{ category_main: "dress" }],
    getCategoryMainDisplayLabel: (value) => value,
    ensureCashierTerminalPreviewState: () => {},
    normalizeCashierTerminalNumber: (value) => Number(value || 0),
    getCashierTerminalCashierName: () => "Clerk A",
  };
  const buildManualLine = vm.runInNewContext(`${source}\nbuildCashierTerminalManualUnbarcodedLine;`, context);

  const line = buildManualLine();

  assert.equal(line.line_type, "manual_unbarcoded");
  assert.equal(line.barcode_type, "NONE");
  assert.equal(line.store_item_machine_code, null);
  assert.equal(line.machine_code, "");
  assert.equal(line.display_code, "MANUAL");
  assert.equal(line.description, "Button pack");
  assert.equal(line.category, "dress");
  assert.equal(line.quantity, 2);
  assert.equal(line.unit_price, 125);
  assert.equal(line.subtotal, 250);
  assert.equal(line.manual_reason, "Label damaged");
  assert.equal(line.created_by, "Clerk A");
  assert.equal(line.requires_audit, true);
  assert.equal(line.inventory_tracked, false);
});

test("POS manual item action adds to cart without legacy preset globals", () => {
  const source = [
    extractFunctionSource(appJs, "getCashierTerminalManualCategoryOptions"),
    extractFunctionSource(appJs, "isCashierTerminalManualUnbarcodedLine"),
    extractFunctionSource(appJs, "buildCashierTerminalManualUnbarcodedLine"),
    extractFunctionSource(appJs, "addCashierTerminalManualItemToCart"),
  ].join("\n");
  const context = {
    cashierTerminalState: {
      cartItems: [],
      activeDrawer: "manual-item",
      manualItemCategory: "dress",
      manualItemDescription: "Loose scarf",
      manualItemQuantity: "1",
      manualItemUnitPrice: "125",
      manualItemReason: "Label damaged",
    },
    ensureApparelDefaultSalePriceState: () => [
      { category_main: "dress", category_sub: "short dress", grade: "P", default_sale_price_kes: 440 },
    ],
    getCategoryMainDisplayLabel: (value) => value,
    ensureCashierTerminalPreviewState: () => {},
    normalizeCashierTerminalNumber: (value) => Number(value || 0),
    getCashierTerminalCashierName: () => "Clerk A",
    renderCashierTerminal: () => {},
    revealCashierTerminalCartAfterManualAdd: () => {},
    showTransientInlineNotice: () => {},
    focusCashierTerminalScanInput: () => {},
  };
  const addManualItem = vm.runInNewContext(`${source}\naddCashierTerminalManualItemToCart;`, context);

  addManualItem();

  assert.equal(context.cashierTerminalState.cartItems.length, 1);
  assert.equal(context.cashierTerminalState.cartItems[0].line_type, "manual_unbarcoded");
  assert.equal(context.cashierTerminalState.cartItems[0].store_item_machine_code, null);
  assert.equal(context.cashierTerminalState.cartItems[0].barcode_type, "NONE");
  assert.equal(context.cashierTerminalState.activeDrawer, "");
});

test("POS manual item add-to-cart closes drawer, resets form, and returns to cart", () => {
  const source = [
    extractFunctionSource(appJs, "getCashierTerminalManualCategoryOptions"),
    extractFunctionSource(appJs, "isCashierTerminalManualUnbarcodedLine"),
    extractFunctionSource(appJs, "buildCashierTerminalManualUnbarcodedLine"),
    extractFunctionSource(appJs, "addCashierTerminalManualItemToCart"),
  ].join("\n");
  const renderSnapshots = [];
  const revealedLines = [];
  const focusCalls = [];
  const context = {
    cashierTerminalState: {
      cartItems: [],
      activeDrawer: "manual-item",
      manualItemCategory: "dress",
      manualItemDescription: "Loose belt",
      manualItemQuantity: "2",
      manualItemUnitPrice: "125",
      manualItemReason: "Label damaged",
    },
    ensureApparelDefaultSalePriceState: () => [
      { category_main: "dress", category_sub: "short dress", grade: "P", default_sale_price_kes: 440 },
    ],
    getCategoryMainDisplayLabel: (value) => value,
    ensureCashierTerminalPreviewState: () => {},
    normalizeCashierTerminalNumber: (value) => Number(value || 0),
    getCashierTerminalCashierName: () => "Clerk A",
    renderCashierTerminal: () => {
      renderSnapshots.push({
        activeDrawer: context.cashierTerminalState.activeDrawer,
        cartItems: context.cashierTerminalState.cartItems.length,
      });
    },
    revealCashierTerminalCartAfterManualAdd: (line) => {
      revealedLines.push(line);
    },
    showTransientInlineNotice: () => {},
    focusCashierTerminalScanInput: (options) => {
      focusCalls.push(options);
    },
  };
  const addManualItem = vm.runInNewContext(`${source}\naddCashierTerminalManualItemToCart;`, context);

  addManualItem();

  assert.equal(context.cashierTerminalState.activeDrawer, "");
  assert.equal(context.cashierTerminalState.cartItems.length, 1);
  assert.equal(context.cashierTerminalState.manualItemCategory, "");
  assert.equal(context.cashierTerminalState.manualItemDescription, "");
  assert.equal(context.cashierTerminalState.manualItemQuantity, "1");
  assert.equal(context.cashierTerminalState.manualItemUnitPrice, "");
  assert.equal(context.cashierTerminalState.manualItemReason, "Tag missing");
  assert.deepEqual(renderSnapshots, [{ activeDrawer: "", cartItems: 1 }]);
  assert.equal(revealedLines.length, 1);
  assert.equal(revealedLines[0].line_type, "manual_unbarcoded");
  assert.deepEqual(JSON.parse(JSON.stringify(focusCalls)), [{ select: false, preventScroll: true }]);
});

test("POS manual item drawer field blur does not detach Add to Cart before click", () => {
  const changeListenerMatch = appJs.match(/cashierTerminalShell\?\.addEventListener\("change"[\s\S]*?\n\}\);/);
  assert.ok(changeListenerMatch, "missing cashier terminal change listener");
  const changeListenerSource = changeListenerMatch[0];
  const drawerFieldBranchMatch = changeListenerSource.match(/if \(target\.dataset\.terminalDrawerField\) \{[\s\S]*?\n  \}/);
  assert.ok(drawerFieldBranchMatch, "missing drawer field change branch");

  assert.match(drawerFieldBranchMatch[0], /updateCashierTerminalDrawerField\(target\.dataset\.terminalDrawerField,\s*target\.value\)/);
  assert.doesNotMatch(drawerFieldBranchMatch[0], /renderCashierTerminal\(\)/);
  assert.match(extractAssignedFunctionSource(appJs, "handleCashierTerminalAction"), /case "add-manual-item":[\s\S]*addCashierTerminalManualItemToCart\(\)/);
});

test("POS manual item payload stays separately identifiable and does not mimic STORE_ITEM", () => {
  const source = [
    extractFunctionSource(appJs, "isCashierTerminalManualUnbarcodedLine"),
    extractFunctionSource(appJs, "buildCashierTerminalPosSaleItemPayload"),
  ].join("\n");
  const context = {
    normalizeCashierTerminalNumber: (value) => Number(value || 0),
  };
  const buildPayloadLine = vm.runInNewContext(`${source}\nbuildCashierTerminalPosSaleItemPayload;`, context);

  const payload = buildPayloadLine({
    line_type: "manual_unbarcoded",
    barcode_type: "NONE",
    store_item_machine_code: null,
    display_code: "MANUAL",
    description: "Loose scarf",
    category: "Accessories",
    quantity: 3,
    unit_price: 80,
    subtotal: 240,
    manual_reason: "Manager approved manual sale",
    created_by: "Clerk A",
    requires_audit: true,
  });

  assert.deepEqual(JSON.parse(JSON.stringify(payload)), {
    line_type: "manual_unbarcoded",
    barcode_type: "NONE",
    store_item_machine_code: null,
    display_code: "MANUAL",
    description: "Loose scarf",
    category: "Accessories",
    quantity: 3,
    qty: 3,
    unit_price: 80,
    subtotal: 240,
    final_price: 240,
    manual_reason: "Manager approved manual sale",
    created_by: "Clerk A",
    requires_audit: true,
    machine_code: "",
    discount_amount: 0,
  });
});

test("POS manual unbarcoded sale closure keeps payload and guardrails intact", () => {
  const builderSource = extractFunctionSource(appJs, "buildCashierTerminalManualUnbarcodedLine");
  const payloadLineSource = extractFunctionSource(appJs, "buildCashierTerminalPosSaleItemPayload");
  const payloadSource = extractFunctionSource(appJs, "buildCashierTerminalPosSalePayload");
  const submitSource = extractAssignedFunctionSource(appJs, "submitCashierTerminalSale");
  const backendSource = extractAsyncFunctionSource(appJs, "submitCashierTerminalBackendSale");
  const guardSource = extractFunctionSource(appJs, "ensureCashierTerminalResolvedItemCanEnterCart");

  assert.match(indexHtml, /无码商品|manual unbarcoded sale/i);
  assert.match(builderSource, /manualItemCategory/);
  assert.match(builderSource, /manualItemDescription/);
  assert.match(builderSource, /manualItemQuantity/);
  assert.match(builderSource, /manualItemUnitPrice/);
  assert.match(submitSource, /await submitCashierTerminalBackendSale\(\)/);

  assert.match(payloadLineSource, /line_type:\s*row\.line_type \|\| "manual_unbarcoded"/);
  assert.match(payloadLineSource, /barcode_type:\s*"NONE"/);
  assert.match(payloadLineSource, /store_item_machine_code:\s*null/);
  assert.doesNotMatch(payloadLineSource, /barcode_value:/);

  assert.match(payloadSource, /items:\s*cartItems\.map/);
  assert.match(backendSource, /\/pos-sales/);
  assert.doesNotMatch(backendSource, /createStoreItem|generateStoreItem|store_item_create/i);
  assert.doesNotMatch(backendSource, /createInventoryMovement|inventory_movement_type\s*:\s*"standard"/i);

  assert.match(guardSource, /STORE_ITEM/);
  assert.match(appJs, /此码不能用于 POS 销售，请扫描 STORE_ITEM 商品码。/);
  assert.match(appJs, /STORE_DELIVERY_EXECUTION/);
  assert.match(appJs, /SDP 是 SDO 内包明细/);
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
  const idempotencySource = extractFunctionSource(appJs, "getCashierTerminalSaleIdempotencyKey");
  const clearIdempotencySource = extractFunctionSource(appJs, "clearCashierTerminalSaleIdempotencyKey");
  const resetSource = extractAssignedAnyFunctionSource(appJs, "resetCashierTerminalForNextSale");
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
  assert.match(payloadSource, /idempotency_key:\s*getCashierTerminalSaleIdempotencyKey\(\)/);
  assert.match(payloadSource, /machine_code:/);
  assert.match(payloadSource, /display_code:/);
  assert.match(payloadSource, /final_price:/);
  assert.match(idempotencySource, /cashierTerminalState\.activeSaleIdempotencyKey/);
  assert.match(idempotencySource, /crypto\.randomUUID/);
  assert.match(clearIdempotencySource, /activeSaleIdempotencyKey\s*=\s*""/);
  assert.match(resetSource, /clearCashierTerminalSaleIdempotencyKey\(\)/);
  assert.match(receiptSource, /sale_no:\s*sale\.sale_no/);
  const catchStart = backendSource.indexOf("} catch");
  const catchEnd = backendSource.indexOf("const sale =", catchStart);
  assert.doesNotMatch(backendSource.slice(catchStart, catchEnd), /resetCashierTerminalForNextSale/);
  assert.doesNotMatch(backendSource.slice(catchStart, catchEnd), /clearCashierTerminalSaleIdempotencyKey/);
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
assert.match(appJs, /打印小票 \/ Print Receipt/);
  assert.match(appJs, /class=\"cashier-terminal-sale-complete\"/);
  assert.match(actionSource, /case "confirm-reprint":/);
  assert.match(actionSource, /await loadCashierTerminalLatestReceiptForReprint\(\)/);
  assert.doesNotMatch(detailSource, /submitCashierTerminalBackendSale/);
  assert.doesNotMatch(detailSource, /resetCashierTerminalForNextSale/);
  assert.doesNotMatch(detailSource, /create_pos_sale/);
  assert.match(receiptSource, /receiptPanel\.innerHTML\s*=\s*""/);
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
  assert.match(submitSource, /POS_CASHIER_TERMINOLOGY_KEYS\.openShiftFirst/);
  assert.match(submitSource, /await loadCashierTerminalShiftSummary\(sale\.shift_id \|\| payload\.shift_id\)/);
  assert.match(payloadSource, /shift_id:\s*cashierTerminalState\.currentShift\?\.shift_id \|\| cashierTerminalState\.shiftNo/);
  assert.match(openSource, /request\(`\/stores\/\$\{encodeURIComponent\(storeCode\)\}\/pos-shifts\/open`/);
  assert.match(openSource, /cashierTerminalState\.currentShift\s*=\s*normalizeCashierTerminalShift\(shift\)/);
  assert.match(currentSource, /\/pos-shifts\/current\?cashier_id=/);
  assert.match(summarySource, /request\(`\/stores\/\$\{encodeURIComponent\(storeCode\)\}\/pos-shifts\/\$\{encodeURIComponent\(shiftId\)\}\/summary`\)/);
});

test("POS open shift gives loading, existing-shift, success, and error feedback", () => {
  const openSource = extractAsyncFunctionSource(appJs, "openCashierTerminalShift");
  const drawerSource = extractAssignedAnyFunctionSource(appJs, "renderCashierTerminalDrawer");

  assert.match(openSource, /shiftActionInFlight\s*=\s*true/);
  assert.match(openSource, /正在开班，请稍候/);
  assert.match(openSource, /fetchCashierTerminalCurrentShift\(\)/);
  assert.match(openSource, /当前已有开班：/);
  assert.match(openSource, /message\.includes\("already"\) \|\| message\.includes\("已有开班"\) \|\| message\.includes\("已有"\)/);
  assert.match(openSource, /已成功开班：/);
  assert.match(openSource, /已有开班但未能读取当前班次，请刷新或联系管理员。/);
  assert.match(openSource, /开班失败：/);
  assert.match(openSource, /renderCashierTerminalSessionStrip\(\)/);
  assert.match(openSource, /renderCashierTerminalStatusBar\(\)/);
  assert.match(drawerSource, /正在开班\.\.\./);
});

test("POS shift close uses real API, records variance, and clears closed shift", () => {
  const drawerSource = extractAssignedAnyFunctionSource(appJs, "renderCashierTerminalDrawer");
  const closeSource = extractAsyncFunctionSource(appJs, "closeCashierTerminalShiftBackend");
  const updateFieldSource = extractAssignedAnyFunctionSource(appJs, "updateCashierTerminalDrawerField");
  const actionSource = extractAssignedFunctionSource(appJs, "handleCashierTerminalAction");

  assert.match(drawerSource, /当前班次/);
  assert.match(drawerSource, /本班统计/);
  assert.match(drawerSource, /copy\.openNow/);
  assert.match(drawerSource, /copy\.closeShift/);
  assert.match(drawerSource, /cashierTerminalState\.shiftSummary/);
  assert.match(updateFieldSource, /field === "countedCash"/);
  assert.match(updateFieldSource, /cashierTerminalState\.shiftSummary\?\.expected_cash/);
  assert.match(closeSource, /request\(`\/stores\/\$\{encodeURIComponent\(storeCode\)\}\/pos-shifts\/\$\{encodeURIComponent\(shiftId\)\}\/close`/);
  assert.match(closeSource, /cashierTerminalState\.currentShift\s*=\s*null/);
  assert.match(closeSource, /cashierTerminalState\.shiftOpen\s*=\s*false/);
  assert.match(closeSource, /POS_CASHIER_TERMINOLOGY_KEYS\.openShiftFirst/);
  assert.match(actionSource, /case "open-shift":/);
  assert.match(actionSource, /await openCashierTerminalShift\(\)/);
  assert.match(actionSource, /case "close-shift":/);
  assert.match(actionSource, /await closeCashierTerminalShiftBackend\(\)/);
});

test("POS shift reports load real X/Z APIs and render printable read-only drawer", () => {
  const drawerSource = extractAssignedAnyFunctionSource(appJs, "renderCashierTerminalDrawer");
  const loadReportSource = extractAsyncFunctionSource(appJs, "loadCashierTerminalShiftReport");
  const printReportSource = extractFunctionSource(appJs, "printCashierTerminalShiftReport");
  const actionSource = extractAssignedFunctionSource(appJs, "handleCashierTerminalAction");

  assert.match(drawerSource, /copy\.xReport/);
  assert.match(drawerSource, /结班后可查看 Z-report/);
  assert.match(drawerSource, /drawer === "shift-report"/);
  assert.match(drawerSource, /DIRECT LOOP POS/);
  assert.match(drawerSource, /Cash Accountability/);
  assert.match(drawerSource, /Payment Breakdown/);
  assert.match(drawerSource, /Category Breakdown/);
  assert.match(drawerSource, /data-terminal-action="print-shift-report"/);
  assert.match(loadReportSource, /\/pos-shifts\/\$\{encodeURIComponent\(shiftId\)\}\/\$\{reportSlug\}-report/);
  assert.match(loadReportSource, /cashierTerminalState\.shiftReport\s*=/);
  assert.match(loadReportSource, /cashierTerminalState\.activeDrawer\s*=\s*"shift-report"/);
  assert.doesNotMatch(loadReportSource, /submitCashierTerminalBackendSale|resetCashierTerminalForNextSale|cashierTerminalState\.cartItems\s*=\s*\[\]|cashierTerminalState\.currentShift\s*=\s*null/);
  assert.match(printReportSource, /printCashierTerminal57mmHtml/);
  assert.match(actionSource, /case "load-shift-report":[\s\S]*await loadCashierTerminalShiftReport\(target\.dataset\.terminalReportType\)/);
  assert.match(actionSource, /case "print-shift-report":[\s\S]*printCashierTerminalShiftReport\(\)/);
});

test("POS receipt print action builds a real 57mm thermal receipt", () => {
  const receiptPrintSource = extractFunctionSource(appJs, "printCashierTerminalReceipt");
  const receiptHtmlSource = extractFunctionSource(appJs, "buildCashierTerminal57mmReceiptHtml");
  const printSource = extractFunctionSource(appJs, "printCashierTerminal57mmHtml");
  const actionSource = extractAssignedFunctionSource(appJs, "handleCashierTerminalAction");

  assert.match(receiptHtmlSource, /cashier-receipt-57mm/);
  assert.match(receiptHtmlSource, /Sale No\./);
  assert.match(receiptHtmlSource, /Order No\./);
  assert.match(receiptHtmlSource, /Qty/);
  assert.match(receiptHtmlSource, /Unit/);
  assert.match(receiptHtmlSource, /Discount/);
  assert.match(receiptHtmlSource, /Total/);
  assert.match(receiptHtmlSource, /Payment/);
  assert.match(receiptHtmlSource, /Paid/);
  assert.match(receiptHtmlSource, /Change/);
  assert.match(receiptPrintSource, /cashierTerminalState\.latestCompletedSale/);
  assert.match(receiptPrintSource, /buildCashierTerminal57mmReceiptHtml\(sale\)/);
  assert.match(receiptPrintSource, /printCashierTerminal57mmHtml/);
  assert.match(printSource, /cashier-terminal-print-root/);
  assert.match(printSource, /window\.print\(\)/);
  assert.match(actionSource, /case "print-receipt":[\s\S]*printCashierTerminalReceipt\(\)/);
  assert.doesNotMatch(actionSource, /mock：已发送打印/);
});

test("POS shift and Z Report print uses 57mm content with state fallback totals", () => {
  const fallbackSource = extractFunctionSource(appJs, "buildCashierTerminalShiftReportFromCurrentState");
  const reportHtmlSource = extractFunctionSource(appJs, "buildCashierTerminal57mmShiftReportHtml");
  const printReportSource = extractFunctionSource(appJs, "printCashierTerminalShiftReport");
  const legacyPreviewSource = extractFunctionSource(appJs, "buildShiftReportPreviewHtml");

  assert.match(fallbackSource, /cashierTerminalState\.shiftSummary/);
  assert.match(fallbackSource, /cashierTerminalState\.latestCompletedSale/);
  assert.match(fallbackSource, /card_sales/);
  assert.match(fallbackSource, /refund_total/);
  assert.match(fallbackSource, /cancelled_order_count/);
  assert.match(reportHtmlSource, /cashier-shift-report-57mm/);
  assert.match(reportHtmlSource, /Orders/);
  assert.match(reportHtmlSource, /Items/);
  assert.match(reportHtmlSource, /Total Sales/);
  assert.match(reportHtmlSource, /Discount/);
  assert.match(reportHtmlSource, /Cash/);
  assert.match(reportHtmlSource, /M-Pesa/);
  assert.match(reportHtmlSource, /Card/);
  assert.match(reportHtmlSource, /Mixed/);
  assert.match(reportHtmlSource, /Cancelled/);
  assert.match(reportHtmlSource, /Refund/);
  assert.match(printReportSource, /buildCashierTerminalShiftReportFromCurrentState/);
  assert.match(printReportSource, /buildCashierTerminal57mmShiftReportHtml/);
  assert.match(printReportSource, /printCashierTerminal57mmHtml/);
  assert.match(legacyPreviewSource, /buildCashierTerminal57mmShiftReportHtml\(report\)/);
  assert.match(legacyPreviewSource, /window\.print\(\)/);
});

test("POS print CSS isolates 57mm thermal paper from cashier UI", () => {
  const printSource = extractFunctionSource(appJs, "printCashierTerminal57mmHtml");
  const pageStyleSource = extractFunctionSource(appJs, "ensureCashierTerminal57mmPageStyle");

  assert.match(pageStyleSource, /@page \{ size: 57mm auto; margin: 0; \}/);
  assert.match(printSource, /ensureCashierTerminal57mmPageStyle\(\)/);
  assert.match(stylesCss, /@media print\s*\{[\s\S]*cashier-terminal-print-root[\s\S]*\}/);
  assert.match(stylesCss, /body\.cashier-terminal-printing\s*>\s*:not\(\.cashier-terminal-print-root\)/);
  assert.match(stylesCss, /\.cashier-terminal-print-root\s*\{[\s\S]*display:\s*none;/);
  assert.match(stylesCss, /\.cashier-thermal-paper-57mm\s*\{[\s\S]*width:\s*57mm;/);
  assert.match(stylesCss, /cashier-print-actions[\s\S]*display:\s*none/);
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
  assert.match(createSource, /POS_CASHIER_TERMINOLOGY_KEYS\.openShiftFirst/);
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
  assert.match(paymentSource, /copy\.openShiftFirst/);
  assert.match(paymentSource, /copy\.openNow/);
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

test("POS checkout shows Cash / M-Pesa / Mixed payment modes", () => {
  const paymentSource = extractAssignedAnyFunctionSource(appJs, "renderCashierTerminalPaymentPanel");
  const modeSource = extractFunctionSource(appJs, "setCashierTerminalPaymentMode");

  assert.match(paymentSource, /data-terminal-payment-mode="cash"/);
  assert.match(paymentSource, /data-terminal-payment-mode="mpesa"/);
  assert.match(paymentSource, /data-terminal-payment-mode="mixed"/);
  assert.match(paymentSource, /data-terminal-payment-field="mpesaAmount"/);
  assert.match(paymentSource, /data-terminal-payment-field="mpesaReference"/);
  assert.doesNotMatch(modeSource, /只开放现金收款/);
});

test("POS hides unfinished cashier feature pages while keeping offline sync entry visible and routable", () => {
  const navMetaSource = appJs.slice(appJs.indexOf("const STORE_PANEL_NAV_META"), appJs.indexOf("const STORE_MANAGER_PDA_TABS"));
  const offlineSection = extractElementById(indexHtml, "offlineSyncSummary");

  const offlineNavIndex = navMetaSource.indexOf('match: "12. 离线销售同步"');
  assert.ok(offlineNavIndex >= 0, "offline sync nav meta should exist");
  const offlineNavBlock = navMetaSource.slice(offlineNavIndex, navMetaSource.indexOf("\n  },", offlineNavIndex));
  assert.doesNotMatch(offlineNavBlock, /hiddenInNav:\s*true/);
  assert.match(offlineNavBlock, /section:\s*"cashier"/);

  ["作废单", "顾客退货 / 退款单", "支付异常单", "11. Safaricom / M-Pesa"].forEach((title) => {
    const index = navMetaSource.indexOf(`match: "${title}"`);
    assert.ok(index >= 0, `${title} nav meta should exist`);
    assert.match(navMetaSource.slice(index, navMetaSource.indexOf("\n  },", index)), /hiddenInNav:\s*true/);
  });
  assert.match(indexHtml, /<h2>作废单<\/h2>[\s\S]{0,200}aria-hidden="true"|aria-hidden="true"[\s\S]{0,200}<h2>作废单<\/h2>/);
  assert.match(indexHtml, /<h2>顾客退货 \/ 退款单<\/h2>[\s\S]{0,200}aria-hidden="true"|aria-hidden="true"[\s\S]{0,200}<h2>顾客退货 \/ 退款单<\/h2>/);
  assert.match(indexHtml, /<h2>支付异常单<\/h2>[\s\S]{0,200}aria-hidden="true"|aria-hidden="true"[\s\S]{0,200}<h2>支付异常单<\/h2>/);
  assert.match(indexHtml, /<h2>11\. Safaricom \/ M-Pesa<\/h2>[\s\S]{0,200}aria-hidden="true"|aria-hidden="true"[\s\S]{0,200}<h2>11\. Safaricom \/ M-Pesa<\/h2>/);
  assert.match(offlineSection, /演示 \/ 本地记录/);
  assert.match(indexHtml, /id="offlineSyncDateFilter" type="date"/);
  assert.match(indexHtml, /id="offlineSyncBatchList"/);
  assert.match(appJs, /panel\.classList\.toggle\("hidden-screen",\s*!active\)/);
  assert.match(appJs, /document\.querySelector\("#offlineSyncDateFilter"\)\?\.addEventListener\("change"/);
});

test("POS scan failures keep resolver details but show cashier-facing main error and refocus scan", () => {
  const formatterSource = extractFunctionSource(appJs, "formatCashierTerminalScanError");
  const lookupSource = extractAssignedFunctionSource(appJs, "submitCashierTerminalLookup");
  const scanListenerMatch = appJs.match(/cashierTerminalScanForm\?\.addEventListener\("submit"[\s\S]*?\n\}\);/);
  assert.ok(scanListenerMatch, "missing cashier terminal scan listener");

  assert.match(formatterSource, /POS_CASHIER_TERMINOLOGY_KEYS\.storeItemOnlyRule/);
  assert.match(formatterSource, /This is a store delivery code\./);
  assert.match(formatterSource, /这是门店送货单码。/);
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
  assert.match(drawerSource, /copy\.receiptReprint/);
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

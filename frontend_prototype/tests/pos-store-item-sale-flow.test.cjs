const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

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

test("POS scans only STORE_ITEM machine codes from clerk-generated tokens", () => {
  assert.match(appJs, /posStoreItemSaleRecords/);
  const lookupSource = extractFunctionSource(appJs, "resolvePosStoreItemTokenByMachineCode");
  const terminalLookupSource = extractFunctionSource(appJs, "submitCashierTerminalLookup");
  assert.match(lookupSource, /^function resolvePosStoreItemTokenByMachineCode/);
  assert.match(appJs, /function computeStoreItemEan13CheckDigit/);
  assert.match(appJs, /function isValidStoreItemMachineCodeForPos/);
  assert.match(lookupSource, /\!isValidStoreItemMachineCodeForPos\(machineCode\)/);
  assert.match(appJs, /computeStoreItemEan13CheckDigit\(machineCode\.slice\(0,\s*12\)\) === machineCode\.slice\(12\)/);
  assert.match(lookupSource, /此码不能用于 POS 销售，请扫描 STORE_ITEM 商品码。/);
  assert.match(lookupSource, /sale_status[\s\S]*sold[\s\S]*该商品已售出，不能重复销售/);
  assert.match(lookupSource, /sale_status[\s\S]*ready_for_sale/);
  assert.match(terminalLookupSource, /resolvePosStoreItemTokenByMachineCode\(query\)/);
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
  assert.match(appJs, /resolvePosStoreItemTokenByMachineCode\(query\)/);
  assert.doesNotMatch(appJs, /resolveBarcodeForContext\([^)]*"pos",\s*\[[^\]]*"RAW_BALE"/);
  assert.doesNotMatch(appJs, /resolveBarcodeForContext\([^)]*"pos",\s*\[[^\]]*"STORE_PREP_BALE"/);
  assert.doesNotMatch(appJs, /resolveBarcodeForContext\([^)]*"pos",\s*\[[^\]]*"LOOSE_PICK_TASK"/);
  assert.doesNotMatch(appJs, /resolveBarcodeForContext\([^)]*"pos",\s*\[[^\]]*"STORE_DELIVERY_EXECUTION"/);
});

test("POS cashier terminal keeps non-STORE_ITEM codes out of sales", () => {
  const lookupSource = extractFunctionSource(appJs, "resolvePosStoreItemTokenByMachineCode");
  assert.match(lookupSource, /const machineCode = String\(value \|\| ""\)\.replace\(\s*\/\[\^0-9\]\/g,\s*""\)/, "lookup should normalize machine code from numeric barcode input");
  assert.match(lookupSource, /\!isValidStoreItemMachineCodeForPos\(machineCode\)/);
  assert.match(appJs, /return \/\^5\\d\{9\}\$\/\.test\(machineCode\)/);
  assert.match(lookupSource, /throw new Error\("此码不能用于 POS 销售，请扫描 STORE_ITEM 商品码。"\)/);
  ["RAW_BALE", "STORE_PREP_BALE", "LOOSE_PICK_TASK", "STORE_DELIVERY_EXECUTION"].forEach((barcodeType) => {
    assert.doesNotMatch(lookupSource, new RegExp(`allowedBarcodeTypes[\\s\\S]*${barcodeType}`));
  });
  assert.doesNotMatch(appJs, /function buildPrototypeStoreItemMachineCodeV2/);
  assert.doesNotMatch(appJs, /function buildStoreItemTokenSerial/);
  assert.doesNotMatch(appJs, /const machineCode = `5\$\{/);
  assert.match(appJs, /store_item_machine_code:\s*token\.machine_code/);
  assert.match(appJs, /barcode:\s*token\.machine_code/);
  assert.doesNotMatch(appJs, /barcode:\s*token\.display_code/);
});

test("POS sale completion records source chain and marks only scanned STORE_ITEM tokens sold", () => {
  const recordSource = extractFunctionSource(appJs, "buildPosStoreItemSaleRecord");
  const completeSource = extractFunctionSource(appJs, "completeCashierTerminalStoreItemSale");
  assert.match(recordSource, /sale_no:\s*saleNo/);
  assert.match(appJs, /function buildPosStoreItemSaleNo[\s\S]*?`SALE-\$\{storeCode\}-/);
  [
    "store_item_display_code",
    "store_item_machine_code",
    "source_sdo",
    "source_package",
    "source_type",
    "assigned_employee",
    "store_rack_code",
    "category_summary",
    "selected_price",
    "cost_price",
    "cost_status",
    "gross_margin",
    "gross_margin_pct",
    "payment_method",
    "sold_at",
  ].forEach((field) => assert.match(recordSource, new RegExp(`${field}:`)));
  assert.match(appJs, /function buildPosStoreItemMargin/);
  const marginSource = extractFunctionSource(appJs, "buildPosStoreItemMargin");
  assert.match(marginSource, /cost_status[\s\S]*unknown/);
  assert.match(marginSource, /gross_margin:\s*null/);
  assert.match(marginSource, /gross_margin_pct:\s*null/);
  assert.match(marginSource, /selectedPrice - costPrice/);
  assert.match(marginSource, /grossMargin \/ selectedPrice/);
  assert.match(completeSource, /sale_status:\s*"sold"/);
  assert.match(completeSource, /sold_at:/);
  assert.match(completeSource, /cashier:/);
  assert.match(completeSource, /persistStoreSdoPackageItemTokenState\(\)/);
  assert.match(completeSource, /persistPosStoreItemSaleRecordState\(\)/);
  assert.match(completeSource, /cashierTerminalState\.latestCompletedSale/);
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
  assert.match(extractFunctionSource(appJs, "submitCashierTerminalSale"), /renderPosSalesAnalyticsSummary\(posStoreItemSaleRecordState\)/);
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

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
  assert.match(appJs, /sale_status:\s*"ready_for_sale"/);
  const lookupSource = extractFunctionSource(appJs, "resolvePosStoreItemTokenByMachineCode");
  const terminalLookupSource = extractFunctionSource(appJs, "submitCashierTerminalLookup");
  assert.match(lookupSource, /^function resolvePosStoreItemTokenByMachineCode/);
  assert.match(lookupSource, /\!machineCode\.startsWith\("5"\)/);
  assert.match(lookupSource, /这不是商品码，不能收银。请扫描 STORE_ITEM 商品条码。/);
  assert.match(lookupSource, /sale_status[\s\S]*sold[\s\S]*该商品已售出，不能重复销售/);
  assert.match(lookupSource, /sale_status[\s\S]*ready_for_sale/);
  assert.match(terminalLookupSource, /resolvePosStoreItemTokenByMachineCode\(query\)/);
  assert.doesNotMatch(terminalLookupSource, /submitLookup\(\{ preventDefault\(\) \{\}, currentTarget: form \}\)/);
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

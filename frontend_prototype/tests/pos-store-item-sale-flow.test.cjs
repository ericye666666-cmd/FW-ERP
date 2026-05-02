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
  assert.match(appJs, /function buildPosStoreItemSaleNo[\s\S]*?`SALE-\$\{datePart\}-\$\{timePart\}-\$\{randomPart\}`/);
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

test("cashier terminal supports legacy stock quick sale without loosening barcode scans", () => {
  assert.match(indexHtml, /data-terminal-drawer="legacy-stock"/);
  assert.match(appJs, /POS_DB_SYNC_FAILURE_MESSAGE\s*=\s*"销售已完成，但数据库同步失败，请联系管理员"/);
  assert.match(appJs, /LEGACY_STOCK_SOURCE_TYPE\s*=\s*"LEGACY_STOCK"/);
  assert.match(appJs, /STORE_ITEM_SOURCE_TYPE\s*=\s*"STORE_ITEM"/);
  assert.match(appJs, /legacyCategory:\s*"Tops"/);
  assert.match(appJs, /legacySubcategory:\s*"lady tops"/);
  const addLegacySource = extractFunctionSource(appJs, "addLegacyStockQuickSaleToCart");
  assert.match(addLegacySource, /旧库存快速销售必须填写大类/);
  assert.match(addLegacySource, /旧库存快速销售必须填写小类/);
  assert.match(addLegacySource, /旧库存快速销售数量必须是正整数/);
  assert.match(addLegacySource, /旧库存快速销售必须填写大于 0 的价格/);
  assert.match(addLegacySource, /source_type:\s*LEGACY_STOCK_SOURCE_TYPE/);
  assert.match(addLegacySource, /legacy_category:\s*category/);
  assert.match(addLegacySource, /legacy_subcategory:\s*subcategory/);
  assert.match(addLegacySource, /legacy_item_label:\s*legacyItemLabel/);
  const saleFormSource = extractFunctionSource(appJs, "syncCashierTerminalSaleForm");
  assert.match(saleFormSource, /付款金额必须等于销售总额/);
  assert.match(saleFormSource, /混合支付必须同时包含 cash 和 M-Pesa/);
  assert.match(saleFormSource, /pendingSaleNo/);
  assert.match(saleFormSource, /source_type:\s*sourceType/);
  assert.match(saleFormSource, /legacy_category/);
  assert.match(saleFormSource, /legacy_subcategory/);
  assert.match(saleFormSource, /legacy_item_label/);
  assert.match(saleFormSource, /store_item_display_code/);
  assert.match(saleFormSource, /store_item_machine_code/);
  const submitSource = extractFunctionSource(appJs, "submitCashierTerminalSale");
  assert.match(submitSource, /cashierTerminalSaleSubmitPromise/);
  assert.match(submitSource, /saleSubmitInFlight/);
  assert.match(submitSource, /pendingSaleResult/);
  assert.match(submitSource, /db_sync_status[\s\S]*failed/);
  assert.match(submitSource, /showTransientInlineNotice[\s\S]*POS_DB_SYNC_FAILURE_MESSAGE/);
  assert.match(submitSource, /markCashierTerminalStoreItemsSoldLocally\(result\)/);
  assert.doesNotMatch(submitSource, /buildCashierTerminalLocalSaleResult\(preparedSale\)/);
  assert.match(extractFunctionSource(appJs, "submitCashierTerminalLookup"), /resolvePosStoreItemTokenByMachineCode\(query\)/);
});

test("STORE_ITEM-only sale uses backend submit path before local sold mirror", () => {
  const submitSource = extractFunctionSource(appJs, "submitCashierTerminalSale");
  assert.match(submitSource, /syncCashierTerminalSaleForm\(\)/);
  assert.match(submitSource, /submitSale\(\{ preventDefault\(\) \{\}, currentTarget: form \}\)/);
  assert.match(submitSource, /markCashierTerminalStoreItemsSoldLocally\(result\)/);
  assert.doesNotMatch(submitSource, /isStoreItemOnlyCart/);
  assert.doesNotMatch(submitSource, /completeCashierTerminalStoreItemSale\(\)/);

  const localMirrorSource = extractFunctionSource(appJs, "markCashierTerminalStoreItemsSoldLocally");
  assert.match(localMirrorSource, /sale_status:\s*"sold"/);
  assert.match(localMirrorSource, /persistStoreSdoPackageItemTokenState\(\)/);
  assert.match(localMirrorSource, /store_item_machine_code/);
  assert.match(localMirrorSource, /db_sync_status/);
  assert.match(localMirrorSource, /appendPosSaleResultToLocalAnalytics\(result\)/);
});

test("offline M-Pesa supports manual SMS confirmation responsibility chain", () => {
  assert.match(appJs, /MPESA_MANUAL_CONFIRMATION_ACTION\s*=\s*"MPESA_PAYMENT_MANUALLY_CONFIRMED"/);
  assert.match(indexHtml, /已通过 Safaricom 手机短信确认到账/);
  const createPaymentSource = extractFunctionSource(appJs, "createCashierTerminalPaymentLine");
  const paymentLinesSource = extractFunctionSource(appJs, "getCashierTerminalNormalizedPaymentLines");
  const renderPaymentSource = extractFunctionSource(appJs, "renderCashierTerminalPaymentPanel");
  const receiptSource = extractFunctionSource(appJs, "renderCashierTerminalDrawer");
  [
    "customer_phone",
    "manual_confirmed",
    "confirmed_by",
    "confirmed_at_local",
    "confirmation_note",
    "payment_status",
  ].forEach((field) => {
    assert.match(createPaymentSource + paymentLinesSource, new RegExp(field));
  });
  assert.match(paymentLinesSource, /pending_verification/);
  assert.match(paymentLinesSource, /manual_confirmed/);
  assert.match(paymentLinesSource, /confirmed_at_local/);
  assert.match(renderPaymentSource, /已通过 Safaricom 手机短信确认到账/);
  assert.match(renderPaymentSource, /mpesaCustomerPhone/);
  assert.match(renderPaymentSource, /mpesaManualConfirmed/);
  assert.match(receiptSource, /M-Pesa：人工确认到账/);
  assert.match(receiptSource, /offline_sale_id/);
  assert.match(receiptSource, /待同步/);
});

test("offline sync builder records M-Pesa manual confirmation fields", () => {
  const builderConfigStart = appJs.indexOf('"offline-sales":');
  assert.notEqual(builderConfigStart, -1, "missing offline sales builder");
  const builderConfigEnd = appJs.indexOf('\n  },\n};', builderConfigStart);
  const builderConfig = appJs.slice(builderConfigStart, builderConfigEnd);
  [
    "customer_phone",
    "mpesa_manual_confirmed",
    "confirmed_by",
    "confirmed_at_local",
    "confirmation_note",
    "payment_status",
    "manual_confirmed",
  ].forEach((field) => assert.match(builderConfig, new RegExp(field)));
  assert.match(builderConfig, /type:\s*"checkbox"/);
  assert.match(builderConfig, /已通过 Safaricom 手机短信确认到账/);
  assert.match(builderConfig, /pending_verification/);
  assert.match(builderConfig, /manual_confirmed/);
});

test("cashier terminal permits only cashier and admin roles", () => {
  assert.match(appJs, /CASHIER_ROLE_CODES\s*=\s*new Set\(\["cashier", "store_cashier", "admin"\]\)/);
  assert.match(appJs, /只有收银员可以进入收银区/);
  assert.doesNotMatch(appJs, /CASHIER_ROLE_CODES\s*=\s*new Set\(\[[^\]]*"store_clerk"/);
  assert.doesNotMatch(appJs, /CASHIER_ROLE_CODES\s*=\s*new Set\(\[[^\]]*"warehouse_clerk"/);
  assert.doesNotMatch(appJs, /CASHIER_ROLE_CODES\s*=\s*new Set\(\[[^\]]*"warehouse_manager"/);
  assert.doesNotMatch(appJs, /CASHIER_ROLE_CODES\s*=\s*new Set\(\[[^\]]*"area_supervisor"/);
  assert.doesNotMatch(appJs, /CASHIER_ROLE_CODES\s*=\s*new Set\(\[[^\]]*"store_manager"/);
});

test("cashier terminal disables sale completion while a sale is in flight", () => {
  const createStateSource = extractFunctionSource(appJs, "createCashierTerminalState");
  const renderPaymentSource = extractFunctionSource(appJs, "renderCashierTerminalPaymentPanel");
  const actionSource = extractFunctionSource(appJs, "handleCashierTerminalAction");
  assert.match(appJs, /let cashierTerminalSaleSubmitPromise\s*=\s*null/);
  assert.match(createStateSource, /saleSubmitInFlight:\s*false/);
  assert.match(createStateSource, /pendingSaleNo:\s*""/);
  assert.match(createStateSource, /pendingSaleResult:\s*null/);
  assert.match(renderPaymentSource, /saleSubmitInFlight/);
  assert.match(renderPaymentSource, /disabled/);
  assert.match(renderPaymentSource, /提交中/);
  assert.match(actionSource, /case "complete-sale"[\s\S]*submitCashierTerminalSale/);
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
    "manualConfirmedMpesaAmount",
    "pendingVerificationMpesaAmount",
    "verifiedMpesaAmount",
    "manual_confirmed_mpesa",
    "legacyStockSalesAmount",
    "storeItemSalesAmount",
    "legacyStockItemCount",
    "categorySummaries",
    "subcategorySummaries",
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
    "LEGACY_STOCK",
    "STORE_ITEM",
    "assigned_employee",
    "store_rack_code",
    "category_summary",
    "数据库销售分析暂不可用，当前显示本地记录",
    "M-Pesa 人工确认",
    "M-Pesa 待核验",
    "M-Pesa 已系统核验",
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
    "manualConfirmedMpesaAmount",
    "pendingVerificationMpesaAmount",
    "verifiedMpesaAmount",
    "legacyStockSalesAmount",
    "storeItemSalesAmount",
    "legacyStockItemCount",
    "storeItemItemCount",
    "storeSummaries",
    "categorySummaries",
    "subcategorySummaries",
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
    "LEGACY_STOCK 销售额",
    "STORE_ITEM 销售额",
    "M-Pesa 人工确认",
    "M-Pesa 待核验",
    "M-Pesa 已系统核验",
    "category_summary",
    "按小类销售",
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

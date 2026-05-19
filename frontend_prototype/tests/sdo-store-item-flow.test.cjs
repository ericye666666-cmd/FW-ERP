const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appJs = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

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

test("transfer bundle writes SDB/LPK source packages and hydrates SDO packages back into transfer state", () => {
  const submitSource = extractFunctionSource(appJs, "submitTransferBundle");
  const displayRowSource = extractFunctionSource(appJs, "getTransferDerivedStoreDispatchRows");
  assert.match(submitSource, /buildTransferDispatchResultDisplayRows/);
  assert.match(submitSource, /source_type:\s*String\(row\?\.source_type/);
  assert.match(submitSource, /source_code:\s*String\(row\?\.source_code \|\| row\?\.bale_no/);
  assert.match(submitSource, /item_count:\s*parseKnownDispatchItemCount\(row\)/);
  assert.match(appJs, /store_delivery_execution_order:\s*storeDeliveryExecutionOrder/);
  assert.match(appJs, /store_delivery_execution_order_no:\s*storeDeliveryExecutionOrder\.execution_order_no/);
  assert.match(appJs, /official_delivery_barcode:\s*storeDeliveryExecutionOrder\.official_delivery_barcode/);
  assert.match(displayRowSource, /store_delivery_execution_order\?\.packages/);
  assert.match(displayRowSource, /display_store_dispatch_bales/);
  assert.match(displayRowSource, /store_dispatch_bales/);
});

test("loading transfers hydrates SDO packages before store receiving derives package rows", () => {
  const loadSource = extractFunctionSource(appJs, "loadTransferOrders");
  const hydrateSource = extractFunctionSource(appJs, "hydrateTransferOrdersWithStoreDeliveryExecutionOrders");
  const displayRowSource = extractFunctionSource(appJs, "getTransferDerivedStoreDispatchRows");

  assert.match(loadSource, /hydrateTransferOrdersWithStoreDeliveryExecutionOrders/);
  assert.match(hydrateSource, /store-delivery-execution-orders/);
  assert.match(hydrateSource, /store_delivery_execution_order:/);
  assert.match(hydrateSource, /machine_code:/);
  assert.match(displayRowSource, /const packageCount = getTransferShipmentPackageCount\(transfer\)/);
  assert.match(displayRowSource, /source_type:\s*String\(upstreamPackageRows\[index\]\?\.source_type/);
});

test("warehouse print confirmation updates only the current modal index and re-renders Page 6 cards", () => {
  const completionSource = extractFunctionSource(appJs, "completeCurrentBalePrintModalJob");
  assert.match(completionSource, /const currentIndex =/);
  assert.match(completionSource, /currentJob \? \[currentJob\] : \[\]/);
  assert.match(completionSource, /index !== currentIndex/);
  assert.match(completionSource, /status:\s*"labelled"/);
  assert.match(completionSource, /renderTransferActionResultSummary\(transferOutput\)/);
  assert.match(completionSource, /renderTransferExecutionWorkbench\(transferNo\)/);
  assert.match(completionSource, /renderTransferDispatchSummary\(transferOrderState\)/);
});

test("warehouse execution selectors summarize demand lines and prepared SDB counts", () => {
  const start = appJs.indexOf("function populateTransferOrderSelectors");
  assert.notEqual(start, -1, "populateTransferOrderSelectors should exist");
  const end = appJs.indexOf("async function refreshPickingWavePanel", start);
  assert.notEqual(end, -1, "populateTransferOrderSelectors block should end before refreshPickingWavePanel");
  const source = appJs.slice(start, end);

  assert.match(source, /const plan = buildTransferPreparationPlan\(getTransferPreparationPlanRows\(row\)\)/);
  assert.match(source, /const total = Number\(summary\.totalRequestedQty/);
  assert.match(source, /const sdbCount = Number\(summary\.selectedPreparedBaleCount/);
  assert.match(source, /SDB \$\{sdbCount\}/);
  assert.doesNotMatch(source, /SDB \$\{row\.delivery_batch\?\.bale_count \|\| 0\}/);
});

test("warehouse execution keeps the SDO generation form bound to the active transfer", () => {
  const source = extractFunctionSource(appJs, "renderTransferExecutionWorkbench");
  assert.match(source, /setInputValue\("#transferBundleForm \[name='transfer_no'\]", transfer\.transfer_no\)/);
  assert.match(source, /setInputValue\("#approveTransferForm \[name='transfer_no'\]", transfer\.transfer_no\)/);
  assert.match(source, /setInputValue\("#transferPrintForm \[name='transfer_no'\]", transfer\.transfer_no\)/);
});

test("warehouse ship selectors can count generated SDO packages without runtime errors", () => {
  const source = extractFunctionSource(appJs, "getTransferShipmentPackageCount");
  assert.match(source, /store_delivery_execution_order\?\.packages/);
  assert.match(source, /display_store_dispatch_bales/);
  assert.match(source, /store_dispatch_bales/);
  assert.match(source, /delivery_batch\?\.bale_count/);
  assert.match(source, /dispatch_bale_count/);
});

test("Austin clerk page does not locally generate STORE_ITEM machine codes", () => {
  assert.match(appJs, /storeSdoPackageItemTokens/);
  assert.match(appJs, /function generateStoreItemTokensForSdoPackage/);
  assert.match(appJs, /STORE_ITEM machine_code 必须由后端统一发号/);
  assert.doesNotMatch(appJs, /function buildPrototypeStoreItemMachineCodeV2/);
  assert.doesNotMatch(appJs, /function buildStoreItemTokenSerial/);
  assert.doesNotMatch(appJs, /const machineCode = `5\$\{/);
  assert.match(appJs, /data-store-package-generate-items/);
  assert.match(appJs, /data-store-package-print-generated/);
});

test("STORE_ITEM source_type is normalized to SDB or LPK for assigned SDO packages", () => {
  const source = extractFunctionSource(appJs, "getStorePackageSourceType");
  assert.match(source, /PREPARED_STORE_DISPATCH_BALE/);
  assert.match(source, /LOOSE_PICK_SHEET/);
  assert.match(source, /return "SDB"/);
  assert.match(source, /return "LPK"/);
});

test("writeOutput preserves raw objects so visible compressed output can still be updated by code", () => {
  assert.match(appJs, /__retailOpsOutputValue/);
  assert.match(appJs, /function readOutput/);
});

test("clerk 6.2 home is a PDA package list and moves package actions into shelving step", () => {
  const homeSource = extractFunctionSource(appJs, "renderStoreClerkHomeSummary");
  const cardSource = extractFunctionSource(appJs, "renderStorePackageListCard");
  const stepSource = extractFunctionSource(appJs, "renderStorePackageShelvingStep");
  const generateSource = extractFunctionSource(appJs, "generateStoreItemTokensForSdoPackage");

  assert.match(homeSource, /我的 SDP 包任务/);
  assert.match(homeSource, /assigned SDP/);
  assert.match(homeSource, /已打印商品码/);
  assert.match(cardSource, />去上架</);
  assert.doesNotMatch(cardSource, /data-store-package-generate-items|data-store-package-print-items|查看已生成商品码/);
  assert.doesNotMatch(homeSource, /Support|打印 \/ 异常入口|renderSummaryActions|clerk-home-grid/);

  assert.match(stepSource, /SDP 包任务详情/);
  assert.match(stepSource, /选择货架位/);
  assert.match(extractFunctionSource(appJs, "getStorePackageCostLabel"), /成本待确认/);
  assert.match(appJs, /A-01[\s\S]*A-02[\s\S]*B-01[\s\S]*B-02[\s\S]*C-01/);
  assert.match(generateSource, /store-items\/generate/);
  assert.match(generateSource, /request/);
});

test("clerk package cards open shelving even when SDO code is missing", () => {
  const keySource = extractFunctionSource(appJs, "getStorePackageActionKey");
  const cardSource = extractFunctionSource(appJs, "renderStorePackageListCard");

  assert.match(keySource, /getStoreReceivingPackageCode/);
  assert.match(keySource, /SDO_PACKAGE::/);
  assert.match(keySource, /transfer_no[\s\S]*shipment_no[\s\S]*store_code[\s\S]*assigned_employee/);
  assert.match(keySource, /STORE_PACKAGE/);
  assert.match(keySource, /SOURCE_REF::\$\{scopeCode \|\| "STORE_PACKAGE"\}::\$\{sourceCode\}/);
  assert.doesNotMatch(cardSource, /row\?\.flow_type === "direct_hang" \|\| !actionKey/);
  assert.match(cardSource, /data-store-package-process="\$\{escapeHtml\(actionKey\)\}"/);
});

test("clerk package shelving step creates STORE_ITEM print jobs without marking printed", () => {
  const stepSource = extractFunctionSource(appJs, "renderStorePackageShelvingStep");
  const generateSource = extractFunctionSource(appJs, "generateStoreItemTokensForSdoPackage");
  const priceChoiceSource = extractFunctionSource(appJs, "getStorePackagePriceChoices");
  const defaultPriceSource = extractFunctionSource(appJs, "getDefaultStoreSalePriceChoices");
  const costSource = extractFunctionSource(appJs, "getStorePackageCostPrice");
  const printSource = extractFunctionSource(appJs, "createStorePackageGeneratedStoreItemPrintJobs");
  const printableSource = extractFunctionSource(appJs, "getStorePackagePrintableTokens");
  const pendingPrintSource = extractFunctionSource(appJs, "isPendingPrintStoreItemToken");
  const labelSource = extractFunctionSource(appJs, "getStoreItemLabelTemplateCode");
  const generatedListSource = extractFunctionSource(appJs, "renderStorePackageGeneratedStoreItems");
  const feedbackSource = extractFunctionSource(appJs, "renderStorePackagePrintJobFeedback");

  assert.match(stepSource, /上架设置/);
  assert.match(stepSource, /store_rack_code/);
  assert.match(appJs, /默认售价 1/);
  assert.match(appJs, /默认售价 2/);
  assert.match(appJs, /自定义售价/);
  assert.match(appJs, /storeDefaultSalePrices/);
  assert.match(appJs, /4\.7 服装默认售价规则/);
  assert.match(appJs, /function getDefaultStoreSalePriceChoices/);
  assert.match(priceChoiceSource, /getDefaultStoreSalePriceChoices/);
  assert.match(stepSource, /STORE_ITEM 生成区/);
  assert.match(stepSource, /生成 STORE_ITEM 商品码/);
  assert.match(generatedListSource, /打印本次标签/);
  assert.match(generatedListSource, /data-store-package-label-size/);
  assert.match(generatedListSource, /value="60x40" selected/);
  assert.match(generatedListSource, /value="40x30"/);
  assert.match(generatedListSource, /data-store-package-print-generated/);
  assert.match(generatedListSource, /machine_code/);
  assert.match(generatedListSource, /barcode_value/);

  assert.match(appJs, /STORE_ITEM machine_code 必须由后端统一发号/);
  assert.match(generateSource, /store-items\/generate/);
  assert.match(generateSource, /selected_price/);
  assert.match(generateSource, /quantity/);
  assert.doesNotMatch(appJs, /function buildPrototypeStoreItemMachineCodeV2/);
  assert.doesNotMatch(generateSource, /barcode_value:\s*machineCode/);
  assert.doesNotMatch(generateSource, /machine_code:\s*machineCode/);
  assert.doesNotMatch(generateSource, /machineCode = `5/);
  assert.match(costSource, /total_cost_kes/);
  assert.match(costSource, /totalCost \/ itemCount/);
  assert.match(costSource, /return null/);
  assert.doesNotMatch(generateSource, /costPrice \|\| 0/);
  assert.match(defaultPriceSource, /Math\.round\(costPrice \* 1\.8\)/);
  assert.match(defaultPriceSource, /Math\.round\(costPrice \* 2\.2\)/);
  assert.match(defaultPriceSource, /default_price_1:\s*150/);
  assert.match(defaultPriceSource, /default_price_2:\s*200/);
  assert.match(labelSource, /60x40/);
  assert.match(labelSource, /apparel_60x40/);
  assert.match(labelSource, /40x30/);
  assert.match(labelSource, /apparel_40x30/);
  assert.match(printableSource, /getStorePackageLastGeneratedTokens/);
  assert.match(printableSource, /lastGeneratedPending/);
  assert.match(printableSource, /if \(lastGeneratedPending\.length\)/);
  assert.doesNotMatch(printableSource, /if \(lastGenerated\.length\)/);
  assert.match(printableSource, /getStorePackageTokens/);
  assert.match(printableSource, /isPendingPrintStoreItemToken/);
  assert.match(pendingPrintSource, /print_status/);
  assert.match(pendingPrintSource, /status/);
  assert.match(pendingPrintSource, /pending_print/);
  assert.match(pendingPrintSource, /print_failed|failed/);
  assert.match(printSource, /\/print-jobs\/item-tokens/);
  assert.match(printSource, /getStorePackagePrintableTokens/);
  assert.match(printSource, /token_nos/);
  assert.match(printSource, /copies:\s*1/);
  assert.match(printSource, /printer_name:\s*"Deli DL-720C"/);
  assert.match(printSource, /template_code/);
  assert.match(printSource, /当前没有待打印 STORE_ITEM/);
  assert.match(feedbackSource, /queued/);
  assert.match(generatedListSource, /lastGeneratedPending/);
  assert.match(generatedListSource, /isCurrentBatch = lastGeneratedPending\.length > 0/);
  assert.match(generatedListSource, /const printTitle/);
  assert.match(generatedListSource, /const printButtonText/);
  assert.match(generatedListSource, /本次生成数量/);
  assert.match(generatedListSource, /待打印标签/);
  assert.match(generatedListSource, /打印待打印标签/);
  assert.match(generatedListSource, /当前没有待打印 STORE_ITEM/);
  assert.match(generatedListSource, /待打印/);
  assert.match(generatedListSource, /打印失败/);
  assert.match(generatedListSource, /可重打/);
  assert.match(generatedListSource, /待入库确认/);
  assert.match(generatedListSource, /barcode_value/);
  assert.match(generatedListSource, /来源 SDP/);
  assert.match(generatedListSource, /所属 SDO/);
  assert.match(generatedListSource, /rack_code/);
  assert.match(feedbackSource, /创建打印任务后仍需等待打印完成/);
  assert.match(generatedListSource, /<h4>\$\{printTitle\}<\/h4>/);
  assert.match(generatedListSource, />\$\{printButtonText\}<\/button>/);

  assert.match(appJs, /function getSelectedStorePackagePrice/);
  assert.match(appJs, /function createStorePackageGeneratedStoreItemPrintJobs/);
  assert.match(appJs, /function renderStorePackagePrintJobFeedback/);
  assert.match(appJs, /请先选择货架位/);
  assert.match(appJs, /请先选择售价/);
  assert.match(appJs, /请先生成 STORE_ITEM 商品码/);
  assert.match(appJs, /打印任务创建失败/);
  assert.doesNotMatch(appJs, /data-store-package-confirm-printed/);
  assert.doesNotMatch(printSource, /\/print-jobs\/\$\{[^}]+}\/complete/);
  assert.doesNotMatch(printSource, /printed_in_store/);
  assert.doesNotMatch(printSource, /print_status:\s*"printed"/);
  assert.doesNotMatch(printSource, /storeSdoPackageItemTokenState\s*=\s*storeSdoPackageItemTokenState\.map/);
  assert.doesNotMatch(printSource, /status:\s*"print_queued"/);
  assert.doesNotMatch(printSource, /persistStoreSdoPackageItemTokenState/);
  assert.doesNotMatch(generatedListSource, /已可销售/);
});

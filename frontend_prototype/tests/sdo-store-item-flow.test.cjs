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
  assert.match(appJs, /function buildSdoPackagePayloadFromDispatchRow/);
  assert.match(appJs, /Array\.isArray\(row\?\.source_bales\)/);
  assert.match(appJs, /sourceBales\?\.find/);
  assert.match(appJs, /async function hydrateStoreDeliveryExecutionOrdersForTransfers/);
  assert.match(appJs, /store_delivery_execution_order:\s*storeDeliveryExecutionOrder/);
});

test("warehouse print confirmation updates only the current modal index and re-renders Page 6 cards", () => {
  assert.match(appJs, /function markDisplayStoreDispatchBaleLabelledByIndex/);
  assert.match(appJs, /const currentModalIndex =/);
  assert.match(appJs, /jobsToComplete = currentJob \? \[currentJob\] : \[\]/);
  assert.match(appJs, /renderTransferExecutionWorkbench\(transferNo\)/);
  assert.doesNotMatch(appJs, /doesDispatchRowMatchPrintJob\(row, job\)/);
});

test("Austin clerk page can generate traceable STORE_ITEM tokens from assigned SDO packages", () => {
  assert.match(appJs, /storeSdoPackageItemTokens/);
  assert.match(appJs, /function generateStoreItemTokensForSdoPackage/);
  assert.match(appJs, /barcode_type:\s*"STORE_ITEM"/);
  assert.match(appJs, /source_sdo:/);
  assert.match(appJs, /source_package:/);
  assert.match(appJs, /data-store-package-generate-items/);
  assert.match(appJs, /data-store-package-print-items/);
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

  assert.match(homeSource, /我的待上架包列表/);
  assert.match(homeSource, /待上架包数/);
  assert.match(homeSource, /已打印商品码/);
  assert.match(cardSource, />去上架</);
  assert.doesNotMatch(cardSource, /data-store-package-generate-items|data-store-package-print-items|查看已生成商品码/);
  assert.doesNotMatch(homeSource, /Support|打印 \/ 异常入口|renderSummaryActions|clerk-home-grid/);

  assert.match(stepSource, /包上架 \/ 商品码打印/);
  assert.match(stepSource, /选择货架位/);
  assert.match(extractFunctionSource(appJs, "getStorePackageCostLabel"), /成本待确认/);
  assert.match(appJs, /A-01[\s\S]*A-02[\s\S]*B-01[\s\S]*B-02[\s\S]*C-01/);
  assert.match(generateSource, /store_rack_code:\s*rackCode/);
});

test("clerk package cards open shelving even when SDO code is missing", () => {
  const keySource = extractFunctionSource(appJs, "getStorePackageActionKey");
  const cardSource = extractFunctionSource(appJs, "renderStorePackageListCard");

  assert.match(keySource, /transfer_no[\s\S]*shipment_no[\s\S]*store_code[\s\S]*assigned_employee/);
  assert.match(keySource, /STORE_PACKAGE/);
  assert.match(keySource, /sourceCode \? `\$\{scopeCode \|\| "STORE_PACKAGE"\}::\$\{sourceCode\}` : ""/);
  assert.doesNotMatch(cardSource, /row\?\.flow_type === "direct_hang" \|\| !actionKey/);
  assert.match(cardSource, /data-store-package-process="\$\{escapeHtml\(actionKey\)\}"/);
});

test("clerk package shelving step supports price selection and batch print preview", () => {
  const stepSource = extractFunctionSource(appJs, "renderStorePackageShelvingStep");
  const generateSource = extractFunctionSource(appJs, "generateStoreItemTokensForSdoPackage");
  const priceChoiceSource = extractFunctionSource(appJs, "getStorePackagePriceChoices");

  assert.match(stepSource, /上架设置/);
  assert.match(stepSource, /store_rack_code/);
  assert.match(appJs, /默认售价 1/);
  assert.match(appJs, /默认售价 2/);
  assert.match(appJs, /自定义售价/);
  assert.match(appJs, /storeDefaultSalePrices/);
  assert.match(appJs, /4\.9 默认售价管理/);
  assert.match(appJs, /function getDefaultStoreSalePriceChoices/);
  assert.match(priceChoiceSource, /getDefaultStoreSalePriceChoices/);
  assert.match(stepSource, /STORE_ITEM 生成区/);
  assert.match(stepSource, /生成 STORE_ITEM 商品码/);
  assert.match(stepSource, /商品码打印区/);
  assert.match(stepSource, /本次打印数量/);
  assert.match(stepSource, /预览本次商品码/);
  assert.match(stepSource, /打印本次数量/);
  assert.match(stepSource, /标记本次已打印/);
  assert.match(appJs, /STORE_ITEM machine_code barcode/);

  assert.match(generateSource, /selected_price:\s*selectedPrice/);
  assert.match(generateSource, /print_status:\s*"pending_print"/);
  assert.match(generateSource, /machineCode = `5/);

  assert.match(appJs, /function getSelectedStorePackagePrice/);
  assert.match(appJs, /function buildStorePackagePrintPreviewTokens/);
  assert.match(appJs, /function markStorePackagePrintPreviewTokensPrinted/);
  assert.match(appJs, /data-store-package-preview-print/);
  assert.match(appJs, /data-store-package-confirm-printed/);
  assert.match(appJs, /请先选择货架位/);
  assert.match(appJs, /请先选择售价/);
  assert.match(appJs, /请先生成 STORE_ITEM 商品码/);
  assert.match(appJs, /本包商品码已全部打印/);
});

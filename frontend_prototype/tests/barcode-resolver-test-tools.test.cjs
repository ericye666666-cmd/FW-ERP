const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const indexHtml = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
const appJs = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");

test("Test Tools contains 条码识别测试 section", () => {
  assert.match(indexHtml, /<h3>条码识别测试<\/h3>/);
});

test("Test Tools exposes RAW_BALE barcode data repair beside barcode resolver", () => {
  const testingPanel = indexHtml.match(/<section class="panel" data-workspace-panel="testing">[\s\S]*?<pre id="storeRecentSalesSimulationOutput" class="output hidden-output"><\/pre>/)?.[0] || "";
  assert.match(testingPanel, /<h3>条码识别测试<\/h3>/);
  assert.match(testingPanel, /RAW_BALE 条码数据修复/);
  assert.match(testingPanel, /修复历史 RAW_BALE 缺少正式 machine_code 的数据/);
  assert.match(testingPanel, /不会修改 POS、库存、成本、SDB、LPK、SDO 或 STORE_ITEM 规则/);
  assert.match(testingPanel, /预检查 RAW_BALE 条码数据/);
  assert.match(testingPanel, /确认修复 RAW_BALE 条码数据/);
  assert.match(testingPanel, /id="rawBaleMachineCodeRepairApplyButton"[\s\S]*disabled/);
  assert.match(testingPanel, /id="rawBaleMachineCodeRepairSummary"/);
});

test("barcode resolver test has barcode input, required contexts, and test button", () => {
  assert.match(indexHtml, /<form id="barcodeResolverTestForm"[\s\S]*?<input name="barcode" placeholder="RB260427AAAQH"/);
  [
    "warehouse_sorting_create",
    "warehouse_dispatch_planning",
    "warehouse_execution",
    "warehouse_shortage_pick",
    "pos",
    "store_receiving",
    "store_pda",
    "identity_ledger",
    "b2b_bale_sales",
  ].forEach((context) => {
    assert.match(indexHtml, new RegExp(`<option value="${context}">${context}<\\/option>`));
  });
  assert.match(indexHtml, /<button type="submit">测试条码<\/button>/);
});

test("frontend barcode resolver test calls /barcode/resolve/ with selected context", () => {
  assert.match(appJs, /resolveBarcodeForContext\(barcode, context\)/);
  assert.match(appJs, /\/barcode\/resolve\/\$\{encodeURIComponent\(normalizedBarcode\)\}\?context=\$\{encodeURIComponent\(context \|\| ""\)\}/);
});

test("RAW_BALE repair controls use auth request helper and show session-expired message", () => {
  const repairFunction = appJs.match(/async function runRawBaleMachineCodeRepair[\s\S]*?async function loadStoreClosingChecklist/)?.[0] || "";
  const errorHandler = appJs.match(/if \(action === "raw-bale-machine-code-repair-dry-run" \|\| action === "raw-bale-machine-code-repair-apply"\)[\s\S]*?return;/)?.[0] || "";
  assert.match(appJs, /async function runRawBaleMachineCodeRepair/);
  assert.match(repairFunction, /request\("\/admin\/tools\/raw-bale-machine-code-repair"/);
  assert.match(repairFunction, /dry_run:\s*dryRun/);
  assert.match(appJs, /登录已过期，请重新登录后再执行修复。/);
  assert.match(errorHandler, /getRawBaleMachineCodeRepairErrorMessage\(error\)/);
  assert.doesNotMatch(repairFunction, /localStorage\.getItem\(["']retail_ops_access_token["']\)/);
  assert.doesNotMatch(repairFunction, /请复制 token/);
  assert.doesNotMatch(repairFunction, /DevTools|Console/);
});

test("dry run result enables apply only when repairable RAW_BALE data exists", () => {
  assert.match(appJs, /const canApply = Boolean\(report\.dry_run && \(wouldUpdateRawBales > 0 \|\| wouldUpdatePrintJobs > 0\)\)/);
  assert.match(appJs, /applyButton\.disabled = !canApply/);
  assert.match(appJs, /没有需要修复的 RAW_BALE 数据/);
});

test("result panel renders required key fields for non-developer review", () => {
  assert.match(appJs, /barcode_type:/);
  assert.match(appJs, /business_object\.kind:/);
  assert.match(appJs, /pos_allowed:/);
  assert.match(appJs, /operational_next_step:/);
});

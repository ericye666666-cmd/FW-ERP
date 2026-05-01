const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appJs = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const stylesCss = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");

test("formal app loads barcode resolver before app.js", () => {
  assert.match(indexHtml, /<script src="\.\/barcode-resolver-flow\.js(?:\?v=[^"]+)?"><\/script>[\s\S]*<script src="\.\/app\.js(?:\?v=[^"]+)?"><\/script>/);
});

test("high-risk scan pages call the global resolver with explicit context", () => {
  assert.match(appJs, /resolveBarcodeForContext\(baleCode,\s*"warehouse_sorting_create",\s*\["RAW_BALE"\]\)/);
  assert.match(appJs, /resolveBarcodeForContext\(scannedCodes\[0\],\s*"store_receiving",\s*\["STORE_DELIVERY_EXECUTION"\]\)/);
  assert.doesNotMatch(appJs, /resolveBarcodeForContext\(baleNo,\s*"store_receiving",\s*\["DISPATCH_BALE"\]\)/);
  assert.match(appJs, /resolveBarcodeForContext\(payload\.bale_no,\s*"store_pda",\s*\["DISPATCH_BALE"\]\)/);
  assert.match(appJs, /resolveBarcodeForContext\(payload\.token_no,\s*"store_pda",\s*\["STORE_ITEM"\]\)/);
  assert.match(appJs, /resolveBarcodeForContext\(payload\.barcode,\s*"pos",\s*\["STORE_ITEM"\]\)/);
  assert.match(appJs, /resolveBarcodeForContext\(identityNo,\s*"identity_ledger",\s*\["RAW_BALE",\s*"DISPATCH_BALE",\s*"STORE_PREP_BALE",\s*"LOOSE_PICK_TASK",\s*"STORE_DELIVERY_EXECUTION",\s*"STORE_ITEM"\]\)/);
  assert.doesNotMatch(appJs, /resolveBarcodeForContext\([^)]*"pos",\s*\[[^\]]*"RAW_BALE"/);
  assert.doesNotMatch(appJs, /resolveBarcodeForContext\([^)]*"pos",\s*\[[^\]]*"STORE_DELIVERY_EXECUTION"/);
});

test("POS lookup preserves backend canonical product barcode after resolver approval", () => {
  assert.match(appJs, /getCanonicalBarcodeForContext\(\{\s*inputBarcode:\s*payload\.barcode,\s*resolved,\s*stockResult:\s*result,\s*context:\s*"pos",\s*\}\)/);
});

test("warehouse inbound print modal locks template selection to warehouse_in", () => {
  assert.match(appJs, /function getBaleModalTemplateOptions/);
  assert.match(appJs, /buildLockedTemplateOptions\(labelTemplateState,\s*\{\s*allowedCodes:\s*\["warehouse_in"\]/);
  assert.match(appJs, /row\.disabled \? "disabled" : ""/);
  assert.match(appJs, /不可用于当前页面/);
});

test("0.1 start print opens the bale print modal before creating backend print jobs", () => {
  assert.match(
    appJs,
    /const templateCode = getPreferredBaleTemplateCode\(\);[\s\S]*?openBalePrintModal\(\{[\s\S]*?preferredTemplateCode: "warehouse_in"[\s\S]*?\}\);[\s\S]*?request\("\/warehouse\/bale-barcodes\/print-jobs"/,
  );
});

test("completed inbound print modal keeps close and completion actions clickable", () => {
  assert.match(appJs, /function isBalePrintModalAlreadyComplete/);
  assert.match(appJs, /completeButton\.disabled = completionAction\.action !== "complete_group" && !alreadyComplete/);
  assert.match(appJs, /completeButton\.textContent = alreadyComplete \? "本包已贴标，关闭弹窗" : "确认本包已贴标"/);
  assert.match(appJs, /if \(completionAction\.action === "already_complete"\) \{[\s\S]*?closeBalePrintModal\(\{ force: true \}\)/);
});

test("bale print modal keeps field operators on primary print actions", () => {
  assert.match(indexHtml, /id="balePrintModalPrimaryPrintButton"[\s\S]*?打印标签/);
  assert.match(indexHtml, /id="balePrintModalPrimaryPrintAllButton"[\s\S]*?打印全部/);
  assert.match(indexHtml, /id="balePrintModalCompleteButton"[\s\S]*?确认本包已贴标/);
  assert.match(indexHtml, /id="balePrintModalCloseAndRefreshButton"[\s\S]*?取消并返回/);
  assert.match(indexHtml, /id="balePrintModalAgentFallback"[\s\S]*?未检测到本地打印代理，当前将使用浏览器打印。/);
});

test("bale print modal moves technical print controls into collapsed advanced options", () => {
  assert.match(indexHtml, /<details id="balePrintModalAdvancedOptions" class="bale-print-advanced">[\s\S]*?<summary>高级打印选项<\/summary>[\s\S]*id="balePrintModalCheckLocalAgentButton"/);
  assert.doesNotMatch(indexHtml, /<details id="balePrintModalAdvancedOptions"[^>]*open/);
  assert.match(indexHtml, /id="balePrintModalBrowserPrintButton"[\s\S]*?用浏览器打印/);
  assert.match(indexHtml, /id="balePrintModalDirectPrintButton"[\s\S]*直接打印本张（仅本地\/LAN 后端）/);
});

test("primary bale print action auto-selects local agent or browser fallback", () => {
  assert.match(appJs, /async function printCurrentBaleModalPrimaryAction\(\)[\s\S]*?localPrintAgentState\.connected[\s\S]*?printCurrentBaleModalViaLocalAgent\(\)[\s\S]*?checkLocalPrintAgentHealth\(\)[\s\S]*?browserPrintCurrentBaleModalJob\(\)/);
  assert.match(appJs, /document\.querySelector\("#balePrintModalPrimaryPrintButton"\)\?\.addEventListener\("click"/);
  assert.match(appJs, /未检测到本地打印代理，当前将使用浏览器打印。/);
  assert.match(appJs, /function browserPrintCurrentBaleModalJob\(\)/);
  assert.match(appJs, /frameWindow\.print\(\)/);
});

test("bale print modal includes local print agent status and controls", () => {
  assert.match(indexHtml, /id="balePrintModalLocalAgentStatus"[\s\S]*Local print agent: not connected · URL: http:\/\/127\.0\.0\.1:8719/);
  assert.match(indexHtml, /id="balePrintModalCheckLocalAgentButton"[\s\S]*检测本地打印代理/);
  assert.match(indexHtml, /id="balePrintModalLocalAgentPrintButton"[\s\S]*通过本地代理打印/);
  assert.match(appJs, /fetch\(`\$\{agentUrl\}\/health`, \{ method: "GET" \}\)/);
  assert.match(appJs, /fetch\(`\$\{agentUrl\}\/print\/html`, \{/);
});

test("direct backend print stays available only as an advanced LAN option", () => {
  assert.match(indexHtml, /<details id="balePrintModalAdvancedOptions" class="bale-print-advanced">[\s\S]*id="balePrintModalDirectPrintButton"[\s\S]*直接打印本张（仅本地\/LAN 后端）/);
  assert.match(indexHtml, /id="balePrintModalDirectPrintButton"[\s\S]*直接打印本张（仅本地\/LAN 后端）/);
});

test("store dispatch print confirmation completes only the current modal job", () => {
  assert.match(appJs, /const jobsToComplete = templateScope !== "bale"\s*\?\s*\(currentJob \? \[currentJob\] : \[\]\)\s*:\s*\[\.\.\.jobs\]/);
});

test("browser print fallback does not auto-run bale completion confirmation", () => {
  const browserPrintFunction = appJs.match(/function browserPrintCurrentBaleModalJob\(\) \{[\s\S]*?\n\}/);
  assert.ok(browserPrintFunction, "browser print function should exist");
  assert.doesNotMatch(browserPrintFunction[0], /completeCurrentBalePrintModalJob/);
});

test("local agent print path does not auto-run bale completion confirmation", () => {
  const localAgentPrintFunction = appJs.match(/async function printCurrentBaleModalViaLocalAgent\(\) \{[\s\S]*?\n\}/);
  assert.ok(localAgentPrintFunction, "local agent print function should exist");
  assert.doesNotMatch(localAgentPrintFunction[0], /completeCurrentBalePrintModalJob/);
});

test("sorting task available bale list uses compact rows instead of oversized stock cards", () => {
  assert.match(appJs, /class="sorting-task-item sorting-task-item-compact"/);
  assert.match(appJs, /class="sorting-task-item-kicker"/);
  assert.match(indexHtml, /<div class="split-grid sorting-stock-split-grid">/);
  assert.match(stylesCss, /\.sorting-task-item-compact\s*\{/);
  assert.match(stylesCss, /\.sorting-task-item-line\s*\{/);
  assert.match(stylesCss, /\.sorting-stock-row\s*\{[\s\S]*?min-height:\s*0;/);
  assert.match(stylesCss, /\.sorting-stock-list\s*\{[\s\S]*?align-content:\s*start;/);
});

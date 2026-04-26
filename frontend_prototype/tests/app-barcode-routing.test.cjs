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
  assert.match(appJs, /resolveBarcodeForContext\(baleNo,\s*"store_receiving",\s*\["DISPATCH_BALE"\]\)/);
  assert.match(appJs, /resolveBarcodeForContext\(payload\.bale_no,\s*"store_pda",\s*\["DISPATCH_BALE"\]\)/);
  assert.match(appJs, /resolveBarcodeForContext\(payload\.token_no,\s*"store_pda",\s*\["STORE_ITEM"\]\)/);
  assert.match(appJs, /resolveBarcodeForContext\(payload\.barcode,\s*"pos",\s*\["STORE_ITEM"\]\)/);
  assert.match(appJs, /resolveBarcodeForContext\(identityNo,\s*"identity_ledger",\s*\["RAW_BALE",\s*"DISPATCH_BALE",\s*"STORE_ITEM"\]\)/);
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
  assert.match(appJs, /completeButton\.textContent = alreadyComplete \? "这一类已完成，关闭弹窗" : "确认本类已贴完"/);
  assert.match(appJs, /if \(completionAction\.action === "already_complete"\) \{[\s\S]*?closeBalePrintModal\(\{ force: true \}\)/);
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

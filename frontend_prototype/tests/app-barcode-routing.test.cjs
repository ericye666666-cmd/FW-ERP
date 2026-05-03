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

test("PDA putaway remains STORE_ITEM-only and keeps wrong barcode types out of shelving", () => {
  assert.match(appJs, /resolveBarcodeForContext\(payload\.token_no,\s*"store_pda",\s*\["STORE_ITEM"\]\)/);
  assert.match(appJs, /function getStorePdaScanGuidance/);
  assert.match(appJs, /请扫描 STORE_ITEM 商品码。/);
  assert.match(appJs, /这是 SDO，请去门店收货页面处理。/);
  assert.match(appJs, /这是 SDB \/ LPK 来源包，不能直接上架销售。/);
  assert.match(appJs, /这是 RAW_BALE，门店不能处理。/);
  assert.doesNotMatch(appJs, /resolveBarcodeForContext\(payload\.token_no,\s*"store_pda",\s*\[[^\]]*"RAW_BALE"/);
  assert.doesNotMatch(appJs, /resolveBarcodeForContext\(payload\.token_no,\s*"store_pda",\s*\[[^\]]*"STORE_PREP_BALE"/);
  assert.doesNotMatch(appJs, /resolveBarcodeForContext\(payload\.token_no,\s*"store_pda",\s*\[[^\]]*"LOOSE_PICK_TASK"/);
  assert.doesNotMatch(appJs, /resolveBarcodeForContext\(payload\.token_no,\s*"store_pda",\s*\[[^\]]*"STORE_DELIVERY_EXECUTION"/);
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
  assert.match(appJs, /completeButton\.disabled = !\["complete_group", "complete_current"\]\.includes\(completionAction\.action\) && !alreadyComplete/);
  assert.match(appJs, /completeButton\.textContent = alreadyComplete \? "本包已贴标，关闭弹窗" : "确认本包已贴标"/);
  assert.match(appJs, /if \(completionAction\.action === "already_complete"\) \{[\s\S]*?closeBalePrintModal\(\{ force: true \}\)/);
});

test("bale print modal keeps field operators on primary print actions", () => {
  assert.match(indexHtml, /id="balePrintModalPrimaryPrintButton"[\s\S]*?打印标签/);
  assert.match(indexHtml, /id="balePrintModalCompleteButton"[\s\S]*?确认本包已贴标/);
  assert.match(indexHtml, /id="balePrintModalCloseAndRefreshButton"[\s\S]*?取消并返回/);
  const primaryActions = indexHtml.match(/<div class="bale-print-primary-actions">[\s\S]*?<\/div>/);
  assert.ok(primaryActions, "primary print actions should exist");
  assert.doesNotMatch(primaryActions[0], /balePrintModalPrimaryPrintAllButton/);
  assert.match(indexHtml, /id="balePrintModalAgentFallback"[\s\S]*?打印助手未连接，请先启动 Windows 打印助手。/);
  assert.doesNotMatch(indexHtml, /id="balePrintModalAgentFallback"[\s\S]*?当前打印方式：浏览器打印/);
});

test("bale print modal moves technical print controls into collapsed advanced options", () => {
  const advancedOptions = indexHtml.match(/<details id="balePrintModalAdvancedOptions" class="bale-print-advanced">[\s\S]*?<\/details>/);
  assert.ok(advancedOptions, "advanced print options should exist");
  const advancedHtml = advancedOptions[0];
  assert.match(advancedHtml, /<summary>高级打印选项<\/summary>/);
  assert.doesNotMatch(indexHtml, /<details id="balePrintModalAdvancedOptions"[^>]*open/);
  assert.match(advancedHtml, /id="balePrintModalCheckLocalAgentButton"[\s\S]*?检测打印助手/);
  assert.match(advancedHtml, /id="balePrintModalCheckLocalPrintersButton"[\s\S]*?检测打印机队列/);
  assert.match(advancedHtml, /id="balePrintModalLocalAgentPrintButton"[\s\S]*?高级：重试本张/);
  assert.match(advancedHtml, /id="balePrintModalPrimaryPrintAllButton"[\s\S]*?高级：打印全部/);
  assert.match(advancedHtml, /id="balePrintModalPrintAllButton"[\s\S]*?高级：批量重试/);
  assert.doesNotMatch(advancedHtml, /下载 Windows 打印助手/);
  assert.doesNotMatch(advancedHtml, /查看安装步骤/);
  assert.doesNotMatch(advancedHtml, /直接打印本张/);
  assert.doesNotMatch(advancedHtml, /发送到打印站/);
  assert.doesNotMatch(advancedHtml, /用浏览器打印/);
  assert.doesNotMatch(advancedHtml, /刷新预览/);
});

test("primary bale print action requires local agent and keeps browser print in advanced fallback", () => {
  assert.match(appJs, /async function printCurrentBaleModalPrimaryAction\(\)[\s\S]*?localPrintAgentState\.connected[\s\S]*?printCurrentBaleModalViaLocalAgent\(\)[\s\S]*?checkLocalPrintAgentHealth\(\)[\s\S]*?打印助手未连接，请先启动 Windows 打印助手/);
  assert.match(appJs, /document\.querySelector\("#balePrintModalPrimaryPrintButton"\)\?\.addEventListener\("click"/);
  assert.match(appJs, /selectedPrinterName = "Deli DL-720C"/);
  assert.match(appJs, /打印助手未连接，请先启动 Windows 打印助手。/);
  assert.match(appJs, /浏览器打印仅作高级备用。/);
  assert.doesNotMatch(appJs, /待安装打印机/);
  assert.doesNotMatch(appJs, /当前队列不支持/);
  assert.match(appJs, /function browserPrintCurrentBaleModalJob\(\)/);
  assert.match(appJs, /frameWindow\.print\(\)/);
});

test("bale print modal includes local print agent status and controls", () => {
  assert.match(indexHtml, /id="balePrintModalLocalAgentStatus"[\s\S]*FW-ERP 打印助手/);
  assert.match(indexHtml, /id="balePrintModalLocalAgentStatus"[\s\S]*本地地址：http:\/\/127\.0\.0\.1:8719/);
  assert.match(indexHtml, /id="balePrintModalCheckLocalAgentButton"[\s\S]*检测打印助手/);
  assert.match(indexHtml, /id="balePrintModalLocalAgentPrintButton"[\s\S]*高级：重试本张/);
  assert.match(appJs, /fetch\(`\$\{agentUrl\}\/health`, \{ method: "GET" \}\)/);
  assert.match(appJs, /fetch\(`\$\{agentUrl\}\/print\/label`, \{/);
});

test("field advanced print controls stay limited to safe operator actions", () => {
  const advancedOptions = indexHtml.match(/<details id="balePrintModalAdvancedOptions" class="bale-print-advanced">[\s\S]*?<\/details>/);
  assert.ok(advancedOptions, "advanced print options should exist");
  const advancedHtml = advancedOptions[0];
  assert.match(advancedHtml, /检测打印助手/);
  assert.match(advancedHtml, /检测打印机队列/);
  assert.match(advancedHtml, /高级：重试本张/);
  assert.match(advancedHtml, /高级：打印全部/);
  assert.match(advancedHtml, /高级：批量重试/);
  assert.doesNotMatch(advancedHtml, /balePrintModalDirectPrintButton/);
  assert.doesNotMatch(advancedHtml, /balePrintModalBrowserPrintButton/);
  assert.doesNotMatch(advancedHtml, /balePrintModalSendStationButton/);
});

test("SDO modal primary action has one clear main print button and local-agent offline error", () => {
  const primaryActions = indexHtml.match(/<div class="bale-print-primary-actions">[\s\S]*?<\/div>/);
  assert.ok(primaryActions, "primary print actions should exist");
  assert.match(primaryActions[0], /id="balePrintModalPrimaryPrintButton"[\s\S]*?打印标签/);
  assert.doesNotMatch(primaryActions[0], /balePrintModalPrimaryPrintAllButton/);
  assert.doesNotMatch(primaryActions[0], /打印本轮全部标签/);
  assert.match(appJs, /const isSdoPrint = selectedTemplateCode === "store_dispatch_60x40" \|\| selectedTemplateCode === "transtoshop"/);
  assert.match(appJs, /primaryPrintButton\.textContent = isSdoPrint[\s\S]*?\? "打印 SDO 条码"/);
  assert.match(appJs, /message: "打印助手未连接，请先启动 Windows 打印助手"/);
  assert.match(appJs, /throw new Error\("打印助手未连接，请先启动 Windows 打印助手。"\)/);
  const primaryActionFunction = appJs.match(/async function printCurrentBaleModalPrimaryAction\(\) \{[\s\S]*?\n\}/);
  assert.ok(primaryActionFunction, "primary print action should exist");
  assert.doesNotMatch(primaryActionFunction[0], /browserPrintCurrentBaleModalJob\(\)/);
});

test("print modal uses neutral compact ERP visual styling", () => {
  assert.match(stylesCss, /\.modal-card\s*\{[\s\S]*?border-radius:\s*8px;[\s\S]*?background:\s*#ffffff;[\s\S]*?border:\s*1px solid #e2e8f0;[\s\S]*?box-shadow:\s*0 12px 28px rgba\(15,\s*23,\s*42,\s*0\.12\);/);
  assert.match(stylesCss, /\.bale-print-modal-preview\s*\{[\s\S]*?border-radius:\s*8px;[\s\S]*?border:\s*1px solid #e2e8f0;[\s\S]*?background:\s*#ffffff;/);
  assert.match(stylesCss, /\.bale-print-primary-button\s*\{[\s\S]*?min-height:\s*38px;[\s\S]*?font-size:\s*14px;/);
  assert.match(stylesCss, /\.bale-print-advanced\s*\{[\s\S]*?border:\s*1px solid #e2e8f0;[\s\S]*?border-radius:\s*8px;[\s\S]*?background:\s*#ffffff;[\s\S]*?padding:\s*10px 12px;/);
  assert.match(stylesCss, /\.bale-print-advanced summary\s*\{[\s\S]*?font-weight:\s*600;[\s\S]*?color:\s*#475569;[\s\S]*?min-height:\s*32px;/);
  assert.match(stylesCss, /\.bale-print-modal-side \.flow-summary-note\.warning\s*\{[\s\S]*?border-color:\s*#fecaca;[\s\S]*?background:\s*#fef2f2;[\s\S]*?color:\s*#991b1b;/);
  assert.match(stylesCss, /\.bale-modal-status-row \.warning-pill\s*\{[\s\S]*?border:\s*1px solid #fecaca;[\s\S]*?background:\s*#fef2f2;[\s\S]*?color:\s*#991b1b;/);
  assert.match(stylesCss, /\.bale-print-modal-side \.candidate-row\s*\{[\s\S]*?border-radius:\s*8px;[\s\S]*?border:\s*1px solid #e2e8f0;[\s\S]*?background:\s*#ffffff;/);
  assert.match(stylesCss, /\.bale-preview-card,\n\.printer-status-card\s*\{[\s\S]*?border-radius:\s*8px;[\s\S]*?border:\s*1px solid #e2e8f0;[\s\S]*?background:\s*#ffffff;/);
  assert.match(stylesCss, /\.bale-print-panel-head,\n\.bale-print-workbench-head\s*\{[\s\S]*?border-radius:\s*8px;[\s\S]*?border:\s*1px solid #e2e8f0;[\s\S]*?background:\s*#ffffff;/);
  const printModalCss = [
    stylesCss.match(/\.modal-card\s*\{[\s\S]*?\n\}/)?.[0] || "",
    stylesCss.match(/\.bale-print-modal-preview\s*\{[\s\S]*?\n\}/)?.[0] || "",
    stylesCss.match(/\.bale-print-advanced\s*\{[\s\S]*?\n\}/)?.[0] || "",
    stylesCss.match(/\.bale-print-modal-side \.flow-summary-note\.warning\s*\{[\s\S]*?\n\}/)?.[0] || "",
    stylesCss.match(/\.bale-modal-status-row \.warning-pill\s*\{[\s\S]*?\n\}/)?.[0] || "",
    stylesCss.match(/\.bale-print-modal-side \.candidate-row\s*\{[\s\S]*?\n\}/)?.[0] || "",
    stylesCss.match(/\.bale-preview-card,\n\.printer-status-card\s*\{[\s\S]*?\n\}/)?.[0] || "",
    stylesCss.match(/\.completed-bale-card\s*\{[\s\S]*?\n\}/)?.[0] || "",
    stylesCss.match(/\.bale-print-panel-head,\n\.bale-print-workbench-head\s*\{[\s\S]*?\n\}/)?.[0] || "",
    stylesCss.match(/\.bale-compact-stat\s*\{[\s\S]*?\n\}/)?.[0] || "",
    stylesCss.match(/\.bale-completed-panel\s*\{[\s\S]*?\n\}/)?.[0] || "",
    appJs.match(/function renderDirectOnlyBaleModalPreview[\s\S]*?function deriveBaleLabelDisplayParts/)?.[0] || "",
  ].join("\n");
  assert.doesNotMatch(printModalCss, /#fffaf0|#fff7ed|#fef3c7|#f8f1e5|#f4ede1|#eadfc8|#fffdf9|#f8f3e9|#fff7e7|rgba\(207,\s*192,\s*170|rgba\(205,\s*191,\s*165|rgba\(187,\s*169,\s*139/);
  assert.doesNotMatch(printModalCss, /#fffaf1|#f7f1e6|#d7c8b2|#f7f2e7/);
});

test("print modal labels primary print button by barcode type without changing barcode rules", () => {
  assert.match(appJs, /isSdoPrint[\s\S]*?\? "打印 SDO 条码"/);
  assert.match(appJs, /isLpkPrint[\s\S]*?\? "打印 LPK 条码"/);
  assert.match(appJs, /isSdbPrint[\s\S]*?\? "打印 SDB 标签"/);
  assert.match(appJs, /isStoreItemPrint[\s\S]*?\? "打印 STORE_ITEM 标签"/);
  assert.match(appJs, /isRawBalePrint[\s\S]*?\? "打印 RAW_BALE 标签"/);
  assert.match(appJs, /barcode_value:\s*barcodeValue/);
  assert.doesNotMatch(appJs, /barcode_value:\s*displayCode/);
});

test("store dispatch print confirmation completes only the current modal job", () => {
  assert.match(appJs, /const jobsToComplete = templateScope !== "bale" \|\| completionAction\.action === "complete_current"\s*\?\s*\(currentJob \? \[currentJob\] : \[\]\)\s*:\s*\[\.\.\.jobs\]/);
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

test("print all labels sends every current-round job without confirming them", () => {
  const printAllFunction = appJs.match(/async function printAllBaleModalPrimaryAction\(\) \{[\s\S]*?function renderBalePrintModal/);
  assert.ok(printAllFunction, "print-all function should exist");
  assert.match(printAllFunction[0], /for \(let index = 0; index < jobs\.length; index \+= 1\)/);
  assert.match(printAllFunction[0], /balePrintModalState\.currentIndex = index;[\s\S]*?await printCurrentBaleModalViaLocalAgent\(\);[\s\S]*?printedCount \+= 1/);
  assert.match(printAllFunction[0], /已通过本地打印代理发送 \$\{printedCount\} 张标签/);
  assert.doesNotMatch(printAllFunction[0], /completeCurrentBalePrintModalJob/);
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

test("replenishment main flow keeps default cost inside advanced internal estimate options", () => {
  const headingIndex = indexHtml.indexOf("<h2>4.1 手动补货需求</h2>");
  assert.ok(headingIndex >= 0, "4.1 transfer section should exist");
  const sectionStart = indexHtml.lastIndexOf('<section class="panel" data-workspace-panel="warehouse">', headingIndex);
  const sectionEnd = indexHtml.indexOf('<pre id="transferOutput" class="output hidden-output"></pre>', headingIndex);
  assert.ok(sectionStart >= 0 && sectionEnd > headingIndex, "4.1 transfer section bounds should exist");
  const transferHtml = indexHtml.slice(sectionStart, sectionEnd);
  const advancedOptions = transferHtml.match(/<details class="[^"]*transfer-advanced-options[^"]*">[\s\S]*?<\/details>/);
  assert.ok(advancedOptions, "default cost should be hidden in advanced options");
  const beforeAdvanced = transferHtml.slice(0, transferHtml.indexOf(advancedOptions[0]));
  assert.doesNotMatch(beforeAdvanced, /默认成本价/);
  assert.match(advancedOptions[0], /内部估算 \/ 高级选项/);
  assert.match(advancedOptions[0], /默认成本价/);
  assert.match(advancedOptions[0], /仅用于内部估算，不影响 POS 售价 \/ 条码 \/ 实际库存/);
});

test("replenishment request summary is compact and uses warehouse prep task wording", () => {
  const taskPanel = indexHtml.match(/<div class="candidate-summary warehouse-prep-task-summary">[\s\S]*?<div id="pickingWaveList"/);
  assert.ok(taskPanel, "warehouse prep task summary panel should exist");
  const taskHtml = taskPanel[0];
  assert.match(taskHtml, />生成仓库备货任务</);
  assert.match(taskHtml, /仓库备货任务/);
  assert.match(taskHtml, /把多个补货品类合成一个仓库拣货任务，仓库按这个任务备货。/);
  assert.match(taskHtml, /id="pickingWaveSelectedCount"/);
  assert.match(taskHtml, /id="pickingWaveTotalQty"/);
  assert.match(taskHtml, /id="pickingWaveCategoryCount"/);
  assert.match(taskHtml, /id="pickingWaveShortageQty"/);
  const advancedStart = taskHtml.indexOf("pickingWaveAdvancedSettings");
  const mainTaskHtml = advancedStart >= 0 ? taskHtml.slice(0, advancedStart) : taskHtml;
  assert.doesNotMatch(mainTaskHtml, /备货波次/);
  assert.match(appJs, /\$\{escapeHtml\(storeLabel\)\} 补货单/);
  assert.match(appJs, /共 \$\{escapeHtml\(totalQty\)\} 件 · \$\{escapeHtml\(categoryCount\)\} 个品类/);
  assert.match(appJs, />大类<\/th>[\s\S]*?>小类<\/th>[\s\S]*?>需求数量<\/th>[\s\S]*?>可用库存<\/th>[\s\S]*?>可拣数量<\/th>[\s\S]*?>缺货数量<\/th>[\s\S]*?>建议动作<\/th>/);
  assert.match(appJs, /库存不足/);
  assert.match(appJs, /部分拣货/);
  assert.match(appJs, /可全拣/);
});

test("4.1 manual replenishment page uses compact warehouse workbench layout", () => {
  const headingIndex = indexHtml.indexOf("<h2>4.1 手动补货需求</h2>");
  assert.ok(headingIndex >= 0, "4.1 transfer section should exist");
  const sectionStart = indexHtml.lastIndexOf('<section class="panel" data-workspace-panel="warehouse">', headingIndex);
  const sectionEnd = indexHtml.indexOf('<pre id="transferOutput" class="output hidden-output"></pre>', headingIndex);
  assert.ok(sectionStart >= 0 && sectionEnd > headingIndex, "4.1 transfer section bounds should exist");
  const transferHtml = indexHtml.slice(sectionStart, sectionEnd);

  assert.match(transferHtml, /class="manual-replenishment-context"/);
  assert.match(transferHtml, /<h3>手动补货申请<\/h3>/);
  assert.match(transferHtml, /class="manual-replenishment-meta manual-context-controls"/);
  assert.match(transferHtml, /data-manual-context-field="from_warehouse_code"/);
  assert.match(transferHtml, /data-manual-context-field="to_store_code"/);
  assert.match(transferHtml, /data-manual-context-field="required_arrival_date"/);
  assert.match(transferHtml, /id="manualReplenishmentContextStatus"/);
  assert.match(transferHtml, /填写门店、品类和数量，生成补货申请。/);
  assert.match(transferHtml, /<input name="from_warehouse_code" type="hidden" value="WH1" \/>/);
  assert.match(transferHtml, /<input name="to_store_code" type="hidden" value="UTAWALA" \/>/);
  assert.match(transferHtml, /<input name="required_arrival_date" type="hidden" value="2026-05-03" \/>/);
  assert.match(appJs, /function syncManualReplenishmentContextToForm/);
  assert.match(appJs, /syncManualReplenishmentContextToForm\(\);\n\s*const form = new FormData\(event\.currentTarget\);/);

  assert.match(transferHtml, /class="manual-replenishment-layout"/);
  assert.match(transferHtml, /class="transfer-ops-card manual-replenishment-entry-card"/);
  assert.match(transferHtml, /class="transfer-ops-card manual-replenishment-status-card"/);
  const entryCard = transferHtml.match(/<article class="transfer-ops-card manual-replenishment-entry-card">[\s\S]*?<\/article>/)?.[0] || "";
  assert.doesNotMatch(entryCard, />调出仓库</);
  assert.doesNotMatch(entryCard, />调入门店</);
  assert.doesNotMatch(entryCard, />Required Arrival Date</);
  assert.match(transferHtml, /补货明细/);
  assert.match(transferHtml, /class="transfer-items-table-head"/);
  [">大类<", ">小类<", ">分级<", ">件数<", ">操作<"].forEach((copy) => {
    assert.match(transferHtml, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });
  assert.match(transferHtml, />添加一行</);
  assert.match(transferHtml, /id="transferActionSubmitButton"[\s\S]*?form="transferForm"[\s\S]*?>生成补货申请单</);
  assert.match(appJs, /transferActionSubmitButton[\s\S]*?disabled = !hasRows/);

  assert.match(transferHtml, /下一步动作/);
  assert.match(transferHtml, /本次补货/);
  assert.match(transferHtml, /系统建议/);
  assert.match(transferHtml, /请先添加补货明细/);
  assert.doesNotMatch(transferHtml, /Required Arrival Date/);
  assert.doesNotMatch(transferHtml, /MANUAL|DRAFT|PLAN|Demand type/);
  assert.doesNotMatch(transferHtml, /<span class="eyebrow">Draft<\/span>/);
  assert.doesNotMatch(transferHtml, /<span class="eyebrow">Plan<\/span>/);
  assert.doesNotMatch(transferHtml, /Step 1 创建补货申请/);
  assert.doesNotMatch(transferHtml, /Step 2 系统配货建议/);

  assert.match(stylesCss, /\.manual-replenishment-context\s*\{[\s\S]*?background:\s*#ffffff;[\s\S]*?border:\s*1px solid #e2e8f0;/);
  assert.match(stylesCss, /\.manual-replenishment-layout\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*3fr\) minmax\(320px,\s*2fr\);/);
  assert.match(stylesCss, /\.transfer-items-compact-table\s*\{[\s\S]*?background:\s*#ffffff;[\s\S]*?border:\s*1px solid #e2e8f0;/);
  assert.match(stylesCss, /\.transfer-items-table-head\s*\{[\s\S]*?grid-template-columns:\s*minmax\(120px,\s*1fr\) minmax\(120px,\s*1fr\) minmax\(80px,\s*0\.6fr\) minmax\(82px,\s*0\.6fr\) 72px;/);
  assert.match(appJs, /builderId === "transfer-items" \? "删除" : "删除这一行"/);
  assert.match(appJs, /transfer-items-table-row/);
});

test("warehouse prep task advanced wave parameters are collapsed and optional", () => {
  const taskPanel = indexHtml.match(/<div class="candidate-summary warehouse-prep-task-summary">[\s\S]*?<div id="pickingWaveList"/);
  assert.ok(taskPanel, "warehouse prep task summary panel should exist");
  const taskHtml = taskPanel[0];
  assert.match(taskHtml, /id="pickingWaveStageHint"[\s\S]*?请先生成补货申请单/);
  assert.match(taskHtml, /id="pickingWaveSubmitButton"[\s\S]*?disabled[\s\S]*?>生成仓库备货任务/);
  assert.match(appJs, /pickingWaveStageHint/);
  assert.match(appJs, /pickingWaveSubmitButton[\s\S]*?disabled = !hasRequests/);
  const advancedOptions = taskHtml.match(/<details id="pickingWaveAdvancedSettings"[^>]*>[\s\S]*?<\/details>/);
  assert.ok(advancedOptions, "advanced wave settings should exist");
  assert.doesNotMatch(advancedOptions[0].match(/<details[^>]*>/)?.[0] || "", /\sopen(?:\s|>|=)/);
  assert.match(advancedOptions[0], /高级设置 \/ 备货波次参数/);
  const visibleMain = taskHtml.slice(0, taskHtml.indexOf(advancedOptions[0]));
  [
    "wave_name",
    "warehouse_code",
    "planned_picking_date",
    "required_arrival_date",
    "selected_replenishment_request_nos",
    "notes",
  ].forEach((fieldName) => {
    assert.doesNotMatch(visibleMain, new RegExp(`name="${fieldName}"`));
    assert.match(advancedOptions[0], new RegExp(`name="${fieldName}"`));
  });
  assert.match(appJs, /function getPickingWaveRequestNos/);
  assert.match(appJs, /function buildDefaultPickingWaveName/);
  assert.match(appJs, /const defaultWaveName = buildDefaultPickingWaveName\(requestNos\);/);
  assert.match(appJs, /selected_replenishment_request_nos:\s*requestNos/);
  assert.match(appJs, /wave_name:\s*String\(form\.querySelector\("\[name='wave_name'\]"\)\?\.value \|\| defaultWaveName\)\.trim\(\)/);
  assert.match(appJs, /const defaultWarehouseCode = String\([\s\S]*?"WH1"[\s\S]*?\)\.trim\(\) \|\| "WH1";/);
  assert.match(appJs, /warehouse_code:\s*String\(defaultWarehouseCode \|\| "WH1"\)\.trim\(\)/);
});

test("global shell uses the approved Shadcn compact ERP design tokens", () => {
  [
    "--fw-bg: #f8fafc;",
    "--fw-surface: #ffffff;",
    "--fw-surface-muted: #f1f5f9;",
    "--fw-border: #e2e8f0;",
    "--fw-text: #0f172a;",
    "--fw-primary: #2563eb;",
    "--fw-primary-hover: #1d4ed8;",
    "--fw-sidebar-bg: #0f172a;",
    "--fw-sidebar-active: #1e293b;",
    "--fw-sidebar-text: #e2e8f0;",
  ].forEach((token) => {
    assert.match(stylesCss, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });
  assert.match(stylesCss, /--bg:\s*var\(--fw-bg\);/);
  assert.match(stylesCss, /--panel:\s*var\(--fw-surface\);/);
  assert.match(stylesCss, /--accent:\s*var\(--fw-primary\);/);
  assert.match(stylesCss, /--radius-panel:\s*8px;/);
  assert.match(stylesCss, /--radius-control:\s*6px;/);
  assert.doesNotMatch(stylesCss, /radial-gradient\(circle at top left/);
});

test("global shell styling is dark-sidebar compact-density ERP", () => {
  assert.match(stylesCss, /\.workspace-shell\s*\{[\s\S]*?grid-template-columns:\s*248px minmax\(0,\s*1fr\);/);
  assert.match(stylesCss, /\.workspace-top-panel\s*\{[\s\S]*?min-height:\s*56px;/);
  assert.match(stylesCss, /\.workspace-side-panel\s*\{[\s\S]*?background:\s*var\(--fw-sidebar-bg\);/);
  assert.match(stylesCss, /\.workspace-page-link\s*\{[\s\S]*?min-height:\s*34px;/);
  assert.match(stylesCss, /\.workspace-page-link\.active\s*\{[\s\S]*?background:\s*var\(--fw-sidebar-active\);/);
  assert.match(stylesCss, /\.panel\s*\{[\s\S]*?border-radius:\s*var\(--radius-panel\);/);
  assert.match(stylesCss, /button,\s*input,\s*select,\s*textarea\s*\{[\s\S]*?min-height:\s*34px;/);
  assert.match(stylesCss, /button\[type="submit"\][\s\S]*?background:\s*var\(--fw-primary\);/);
  assert.match(stylesCss, /th\s*\{[\s\S]*?background:\s*var\(--fw-surface-muted\);/);
  assert.match(stylesCss, /td,\s*th\s*\{[\s\S]*?padding:\s*7px 9px;/);
  assert.match(stylesCss, /\.warehouse-prep-task-summary\s*\{[\s\S]*?padding:\s*12px;/);
  assert.match(stylesCss, /\.transfer-advanced-options\s*\{[\s\S]*?padding:\s*10px 12px;/);
});

test("4.1 replenishment form uses neutral compact controls and copy", () => {
  const headingIndex = indexHtml.indexOf("<h2>4.1 手动补货需求</h2>");
  assert.ok(headingIndex > -1, "4.1 replenishment heading should exist");
  const sectionStart = indexHtml.lastIndexOf("<section", headingIndex);
  const outputIndex = indexHtml.indexOf('<pre id="transferOutput"', headingIndex);
  assert.ok(sectionStart > -1 && outputIndex > headingIndex, "4.1 replenishment panel should be bounded");
  const panelHtml = indexHtml.slice(sectionStart, outputIndex);
  [
    "填写门店、品类和数量，生成补货申请。",
    "只填写需求品类和数量；仓库执行时再按库存和 barcode 规则处理。",
    "本次补货",
    "系统建议",
    "可拣数量 / 缺货数量",
    "下一步：确认申请后进入仓库执行；门店收货以 SDO barcode 为准。",
  ].forEach((copy) => assert.match(panelHtml, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
  [
    "手动录入目标门店、类目和数量",
    "一行代表一个商品大类",
    "这里实时汇总本次门店需求件数",
    "系统优先使用现成待送店包",
  ].forEach((copy) => assert.doesNotMatch(panelHtml, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
  [
    "下一步：请先添加补货明细",
    "确认后进入仓库执行；门店收货使用 SDO barcode。",
    "先生成补货申请，再生成仓库备货任务",
    "SDB 不是门店收货 barcode；门店收货使用后续 SDO barcode。",
    "这里显示建议类目和件数。",
  ].forEach((copy) => assert.match(appJs, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));
  [
    "先在上一页加入建议类目",
    "这里会实时显示这张门店调拨草稿",
    "这里会按“补货需求草稿 / 系统配货建议 / 下一步动作”展示仓库执行拆解",
    "系统已把当前补货需求拆成仓库动作",
    "生成建议后，这里会列出建议类目",
  ].forEach((copy) => assert.doesNotMatch(appJs, new RegExp(copy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));

  assert.match(stylesCss, /input,\s*select,\s*textarea\s*\{[\s\S]*?background:\s*#ffffff;[\s\S]*?border:\s*1px solid #e2e8f0;[\s\S]*?color:\s*#0f172a;[\s\S]*?border-radius:\s*6px;[\s\S]*?min-height:\s*36px;[\s\S]*?padding:\s*7px 10px;/);
  assert.match(stylesCss, /input:focus,\s*select:focus,\s*textarea:focus\s*\{[\s\S]*?border-color:\s*#2563eb;[\s\S]*?box-shadow:\s*0 0 0 2px rgba\(37,\s*99,\s*235,\s*0\.12\);/);
  assert.match(stylesCss, /\.line-builder\s*\{[\s\S]*?background:\s*#ffffff;[\s\S]*?border:\s*1px solid #e2e8f0;[\s\S]*?border-radius:\s*8px;[\s\S]*?padding:\s*12px;/);
  assert.match(stylesCss, /\.line-builder-row\s*\{[\s\S]*?background:\s*#f8fafc;[\s\S]*?border:\s*1px solid #e2e8f0;[\s\S]*?border-radius:\s*6px;[\s\S]*?padding:\s*10px;[\s\S]*?gap:\s*8px;/);
  assert.match(stylesCss, /\.line-builder \[data-builder-add\],\s*\.line-builder-remove,\s*\.mini-button\s*\{[\s\S]*?background:\s*#ffffff;[\s\S]*?border:\s*1px solid #cbd5e1;[\s\S]*?color:\s*#2563eb;[\s\S]*?min-height:\s*32px;[\s\S]*?padding:\s*6px 10px;[\s\S]*?font-size:\s*13px;/);
  assert.match(stylesCss, /\.line-builder-remove\s*\{[\s\S]*?border-color:\s*#fecaca;[\s\S]*?color:\s*#dc2626;/);
  assert.match(stylesCss, /\.line-builder-head p\s*\{[\s\S]*?font-size:\s*12px;[\s\S]*?line-height:\s*1\.4;[\s\S]*?color:\s*#64748b;/);

  const lineBuilderBlock = [
    stylesCss.match(/\.line-builder\s*\{[\s\S]*?\n\}/)?.[0] || "",
    stylesCss.match(/\.line-builder-head\s*\{[\s\S]*?\n\}/)?.[0] || "",
    stylesCss.match(/\.line-builder-row\s*\{[\s\S]*?\n\}/)?.[0] || "",
  ].join("\n");
  assert.doesNotMatch(lineBuilderBlock, /#fffaf0|#fff7ed|#fef3c7|#f8f1e5|#f4ede1|#eadfc8|rgba\(207,\s*192,\s*170|rgba\(205,\s*191,\s*165|rgba\(187,\s*169,\s*139/);
});

test("LPK workbench uses a left-right identity and picking-detail layout", () => {
  assert.match(appJs, /这个 LPK 拣了什么/);
  assert.match(appJs, /class="split-grid lpk-picking-layout"/);
  assert.match(appJs, /LPK display_code/);
  assert.match(appJs, /LPK machine_code/);
  assert.match(appJs, /拣货明细/);
  assert.match(appJs, />大类<\/th>[\s\S]*?>小类<\/th>[\s\S]*?>需求数量<\/th>[\s\S]*?>已拣数量<\/th>[\s\S]*?>缺货数量<\/th>[\s\S]*?>来源包 \/ 来源库位<\/th>[\s\S]*?>状态<\/th>/);
  assert.match(appJs, /buildLpkMachineCode\(task\.transferNo/);
  assert.match(appJs, /barcode_value:\s*barcodeValue/);
  assert.doesNotMatch(appJs, /barcode_value:\s*displayCode/);
});

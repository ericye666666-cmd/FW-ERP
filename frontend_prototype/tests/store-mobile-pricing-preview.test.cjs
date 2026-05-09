const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appJs = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const appLegacyJs = fs.readFileSync(path.join(__dirname, "..", "app.legacy.js"), "utf8");
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

function getExecutableFunction(functionName, dependencies = "") {
  return vm.runInNewContext(`${dependencies}\n${extractFunctionSource(appJs, functionName)}\n${functionName};`);
}

test("admin store page exposes an Android PDA batch pricing preview frame", () => {
  assert.match(indexHtml, /id="storeMobilePricingPreviewSummary"/);
  assert.match(indexHtml, /PDA 现场分堆标价 UI Preview/);
  assert.match(appJs, /function renderStoreMobilePricingPreview/);
  assert.match(appJs, /function renderStoreMobileDeviceFrame/);
  assert.match(stylesCss, /\.store-mobile-preview-layout\s*\{/);
  assert.match(stylesCss, /\.android-pda-frame\s*\{/);
});

test("price groups render separately with independent generate and print actions", () => {
  const stateSource = extractFunctionSource(appJs, "createStoreMobilePricingPreviewState");
  const cardSource = extractFunctionSource(appJs, "renderPriceGroupCards");

  assert.match(stateSource, /group_id:\s*"A"/);
  assert.match(stateSource, /group_id:\s*"B"/);
  assert.match(stateSource, /group_id:\s*"S"/);
  assert.match(stateSource, /group_id:\s*"CUSTOM-200"/);
  assert.match(cardSource, /mobile-field-group-card/);
  assert.match(cardSource, /mobile-group-qty/);
  assert.match(cardSource, /生成本组 STORE_ITEM/);
  assert.match(cardSource, /打印本组标签/);
  assert.match(cardSource, /已贴完本组/);
  assert.match(cardSource, /已完成/);
  assert.match(cardSource, /data-mobile-pricing-generate-group/);
  assert.match(cardSource, /data-mobile-pricing-print-group/);
  assert.match(cardSource, /data-mobile-pricing-confirm-stickers/);
  assert.doesNotMatch(cardSource, /generated\.start|generated\.end|STOREITEM|编辑/);
  assert.doesNotMatch(cardSource, /generate-all|print-all|一键生成全部|全部混合打印|混合总任务/);
});

test("mock data uses Utawala SDP display codes with matching price group quantities", () => {
  const stateSource = extractFunctionSource(appJs, "createStoreMobilePricingPreviewState");
  const sdpCardSource = extractFunctionSource(appJs, "renderStoreMobileSdpCard");

  assert.match(stateSource, /display_code:\s*"SDP261250002"/);
  assert.match(stateSource, /machine_code:\s*"6261250002"/);
  assert.match(stateSource, /sdo_code:\s*"SDO260504008"/);
  assert.match(stateSource, /sdo_machine_code:\s*"4260504008"/);
  assert.match(stateSource, /store_name:\s*"UTAWALA"/);
  assert.match(stateSource, /source_type:\s*"SDB"/);
  assert.match(stateSource, /source_code:\s*"SDB-TO202605-002"/);
  assert.match(stateSource, /source_machine_code:\s*"2202605002"/);
  assert.match(stateSource, /total_count:\s*210/);
  assert.match(stateSource, /grouped_count:\s*210/);
  assert.match(stateSource, /taskStatus:\s*"待核对"/);
  assert.match(stateSource, /verified:\s*false/);
  assert.match(stateSource, /assigned_clerk:\s*"Austin"/);
  assert.match(stateSource, /printed_count:\s*0/);
  assert.match(stateSource, /status:\s*"待生成"/);
  assert.match(stateSource, /group_id:\s*"B"[\s\S]*?price_kes:\s*100[\s\S]*?quantity:\s*80[\s\S]*?rack_code:\s*"A-02"/);
  assert.match(stateSource, /group_id:\s*"CUSTOM-200"[\s\S]*?price_kes:\s*200[\s\S]*?quantity:\s*20[\s\S]*?rack_code:\s*"A-03"/);
  assert.doesNotMatch(stateSource, /DLR-上海南京东路店|6002381948213|SDB \/ LPK|SDB261270045|LPK261270002/);
  assert.match(sdpCardSource, /sdp\.display_code/);
  assert.match(sdpCardSource, /sdp\.machine_code/);
  assert.match(sdpCardSource, /sdp\.sdo_code/);
  assert.match(sdpCardSource, /sdp\.source_code/);
});

test("SDP header is compact and uses the requested top statistics", () => {
  const sdpCardSource = extractFunctionSource(appJs, "renderStoreMobileSdpCard");

  assert.match(sdpCardSource, /mobile-code-secondary/);
  assert.match(sdpCardSource, /mobile-sdp-primary-line/);
  assert.match(sdpCardSource, /mobile-sdp-stat-strip/);
  assert.match(sdpCardSource, /getStoreMobileTaskTotals/);
  assert.match(sdpCardSource, /sdp\.category/);
  assert.match(sdpCardSource, /sdp\.total_count/);
  assert.match(sdpCardSource, /总数/);
  assert.match(sdpCardSource, /已生成/);
  assert.match(sdpCardSource, /已贴标/);
  assert.match(sdpCardSource, /价格组/);
  assert.doesNotMatch(sdpCardSource, /未分组/);
  assert.match(stylesCss, /\.mobile-sdp-card\.compact/);
  assert.match(stylesCss, /\.mobile-code-secondary/);
});

test("preview is store clerk only and removes manager role switching", () => {
  const renderSource = extractFunctionSource(appJs, "renderStoreMobilePricingPreview");
  const actionSource = extractFunctionSource(appJs, "handleStoreMobilePricingPreviewAction");

  assert.match(renderSource, /店员 PDA Preview/);
  assert.match(renderSource, /现场分堆标价 UI/);
  assert.match(renderSource, /只读预览，不写后端/);
  assert.doesNotMatch(renderSource, /角色选择|data-mobile-pricing-role|店长/);
  assert.doesNotMatch(actionSource, /mobilePricingRole|selectedRole/);
  assert.doesNotMatch(appJs, /data-mobile-pricing-role|selectedRole|mobilePricingRole/);
});

test("PDA pricing preview keeps #195 page components but runtime bottom nav only shows tasks and my", () => {
  const pageOptionsSource = extractFunctionSource(appJs, "getStoreMobilePageOptions");
  const bottomTabsSource = extractFunctionSource(appJs, "renderStoreMobileBottomTabs");
  const frameSource = extractFunctionSource(appJs, "renderStoreMobileDeviceFrame");

  assert.match(pageOptionsSource, /我的 SDP 任务/);
  assert.match(pageOptionsSource, /SDP 详情/);
  assert.match(pageOptionsSource, /现场分堆标价/);
  assert.match(pageOptionsSource, /价格组列表/);
  assert.match(pageOptionsSource, /本组 STORE_ITEM 生成结果/);
  assert.match(pageOptionsSource, /本组打印任务/);
  assert.match(pageOptionsSource, /打印队列预览/);
  assert.match(bottomTabsSource, /const bottomTabs = \["任务", "我的"\]/);
  assert.doesNotMatch(bottomTabsSource, /扫描/);
  assert.doesNotMatch(bottomTabsSource, /标价/);
  assert.doesNotMatch(bottomTabsSource, /打印/);
  assert.match(stylesCss, /\.mobile-pricing-tabbar\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(frameSource, /renderStoreMobileDeviceScreen\(state\)/);
  assert.doesNotMatch(frameSource, /pending_print|pending_putaway|resolver projection|source_token_refs|lineage payload|transfer projection/);
});

test("clerk PDA task runtime polls assigned SDP endpoint every 3000ms without resetting workflow state", () => {
  const shouldPollClerk = extractFunctionSource(appJs, "shouldPollClerkTasks");
  const loadClerkTasks = extractFunctionSource(appJs, "loadClerkPdaAssignedTasksForPolling");
  const runPoll = extractFunctionSource(appJs, "runPdaRuntimePollOnce");
  const renderRuntime = extractFunctionSource(appJs, "renderStoreMobileRuntimeScreen");
  const actionHandler = extractFunctionSource(appJs, "handleStoreMobilePricingPreviewAction");

  assert.match(appJs, /PDA_RUNTIME_POLL_INTERVAL_MS\s*=\s*3000/);
  assert.match(shouldPollClerk, /isPdaRuntimeMode\(\)/);
  assert.match(shouldPollClerk, /roleCode === "store_clerk"/);
  assert.match(shouldPollClerk, /activePage !== "my"/);
  assert.match(loadClerkTasks, /loadStoreAssignedSdoPackageTasks/);
  assert.match(loadClerkTasks, /render:\s*false/);
  assert.match(loadClerkTasks, /sortStoreMobileAssignedBackendTasks/);
  assert.match(loadClerkTasks, /assignedBackendTasks/);
  assert.doesNotMatch(loadClerkTasks, /selectedSdp\s*=/);
  assert.doesNotMatch(loadClerkTasks, /activePage\s*=\s*"tasks"|activeGroupId\s*=\s*"A"|current_task_group_id\s*=\s*"A"/);
  assert.match(runPoll, /shouldPollClerkTasks/);
  assert.match(runPoll, /loadClerkPdaAssignedTasksForPolling/);
  assert.match(renderRuntime, /renderPdaRuntimeRefreshIndicator/);
  assert.match(actionHandler, /startPdaRuntimePolling/);
});

test("clerk PDA Bluetooth printer test polls native bridge status without touching task polling", () => {
  const stateSource = extractFunctionSource(appJs, "createStoreMobilePricingPreviewState");
  const myTabSource = extractFunctionSource(appJs, "renderStoreMobileMyTab");
  const printerSectionSource = extractFunctionSource(appJs, "renderClerkBluetoothPrinterTestSection");
  const startPrinterPolling = extractFunctionSource(appJs, "startClerkBluetoothPrinterStatusPolling");
  const stopPrinterPolling = extractFunctionSource(appJs, "stopClerkBluetoothPrinterStatusPolling");
  const shouldPollPrinter = extractFunctionSource(appJs, "shouldPollClerkBluetoothPrinterStatus");
  const pollPrinter = extractFunctionSource(appJs, "pollClerkBluetoothPrinterStatus");
  const refreshPairedPrinters = extractFunctionSource(appJs, "refreshClerkBluetoothPairedPrinters");
  const actionHandler = extractFunctionSource(appJs, "handleStoreMobilePricingPreviewAction");
  const clearSession = extractFunctionSource(appJs, "clearSession");

  assert.match(appJs, /CLERK_BLUETOOTH_PRINTER_STATUS_POLL_INTERVAL_MS\s*=\s*3000/);
  assert.match(stateSource, /bluetoothPrinterStatus/);
  assert.match(stateSource, /bluetoothPrinterPairedPrintersLoaded:\s*false/);
  assert.match(myTabSource, /renderClerkBluetoothPrinterTestSection/);
  assert.match(printerSectionSource, /蓝牙打印机测试/);
  assert.match(printerSectionSource, /最近刷新/);
  assert.match(printerSectionSource, /bridge_available/);
  assert.match(printerSectionSource, /bluetooth_enabled/);
  assert.match(printerSectionSource, /connection_status/);
  assert.match(printerSectionSource, /selected_printer_name\/address/);
  assert.match(printerSectionSource, /selected_profile/);
  assert.match(printerSectionSource, /last_error/);
  assert.match(printerSectionSource, /last_protocol_tested/);
  assert.match(printerSectionSource, /last_print_result/);
  assert.match(printerSectionSource, /data-clerk-bluetooth-printer-refresh/);
  assert.match(startPrinterPolling, /pollClerkBluetoothPrinterStatus\(\{\s*reason:\s*"immediate"/);
  assert.match(startPrinterPolling, /window\.setInterval/);
  assert.match(startPrinterPolling, /CLERK_BLUETOOTH_PRINTER_STATUS_POLL_INTERVAL_MS/);
  assert.match(shouldPollPrinter, /activePage === "my"/);
  assert.match(shouldPollPrinter, /document\.visibilityState === "hidden"/);
  assert.match(shouldPollPrinter, /data-clerk-bluetooth-printer-test-section/);
  assert.match(pollPrinter, /DirectLoopPdaPrinter/);
  assert.match(pollPrinter, /getPrinterStatus/);
  assert.doesNotMatch(pollPrinter, /connectPrinter|printTestLabel|listPairedPrinters/);
  assert.match(refreshPairedPrinters, /listPairedPrinters/);
  assert.doesNotMatch(refreshPairedPrinters, /connectPrinter|printTestLabel/);
  assert.match(actionHandler, /refreshClerkBluetoothPairedPrinters/);
  assert.match(clearSession, /stopClerkBluetoothPrinterStatusPolling/);
  assert.match(appJs, /document\.visibilityState === "hidden"[\s\S]*stopClerkBluetoothPrinterStatusPolling/);
  assert.match(appJs, /document\.visibilityState === "visible"[\s\S]*startClerkBluetoothPrinterStatusPolling/);
});

test("assigned backend SDP tasks sort newest assignments before old historical tasks", () => {
  const sortAssignedTasks = getExecutableFunction("sortStoreMobileAssignedBackendTasks");

  const sorted = sortAssignedTasks([
    { display_code: "SDP261250002", assigned_at: "2026-05-06T21:45:42" },
    { display_code: "SDP261290018", assigned_at: "2026-05-09T02:17:24" },
    { display_code: "SDP261290019", assigned_at: "2026-05-09T02:17:36" },
  ]);

  assert.deepEqual([...sorted.map((task) => task.display_code)], [
    "SDP261290019",
    "SDP261290018",
    "SDP261250002",
  ]);
});

test("clerk PDA interval polling preserves scroll around runtime render", () => {
  const runPoll = extractFunctionSource(appJs, "runPdaRuntimePollOnce");
  const scrollContainer = extractFunctionSource(appJs, "getPdaRuntimeScrollContainer");
  const preservingRender = extractFunctionSource(appJs, "renderStoreMobilePricingPreviewPreservingScroll");

  assert.match(scrollContainer, /\.mobile-pricing-screen/);
  assert.match(scrollContainer, /document\.scrollingElement/);
  assert.match(preservingRender, /capturePdaRuntimeScrollState/);
  assert.match(preservingRender, /renderStoreMobilePricingPreview\(\)/);
  assert.match(preservingRender, /restorePdaRuntimeScrollState/);
  assert.match(runPoll, /shouldPreservePdaRuntimeScrollForPoll\(reason\)/);
  assert.match(runPoll, /renderStoreMobilePricingPreviewPreservingScroll\(\)/);
});

test("legacy WebView clerk runtime also uses task-driven two-tab flow", () => {
  const legacyGuard = indexHtml.match(/<script>\s*\(function legacyPdaLoginGuard\(\)[\s\S]*?<\/script>/)?.[0] || "";

  assert.match(legacyGuard, /createLegacyStoreClerkState/);
  assert.match(legacyGuard, /data-legacy-clerk-action="tasks">任务/);
  assert.match(legacyGuard, /data-legacy-clerk-action="my">我的/);
  assert.doesNotMatch(legacyGuard, /<button type="button">扫描<\/button>/);
  assert.doesNotMatch(legacyGuard, /<button type="button" class="is-active">标价<\/button>/);
  assert.doesNotMatch(legacyGuard, /<button type="button">打印<\/button>/);
  assert.match(legacyGuard, /data-legacy-clerk-scan-form/);
  assert.match(legacyGuard, /data-scan-input="true"/);
  assert.match(legacyGuard, /SDP261250002/);
  assert.match(legacyGuard, /6261250002/);
  assert.match(legacyGuard, /生成本组 STORE_ITEM/);
  assert.match(legacyGuard, /打印本组标签/);
  assert.match(legacyGuard, /已贴完本组/);
});

test("task tab renders backend assigned SDP cards before demo fallback", () => {
  const taskListSource = extractFunctionSource(appJs, "renderStoreMobileTaskList");
  const actionSource = extractFunctionSource(appJs, "handleStoreMobilePricingPreviewAction");

  assert.match(taskListSource, /我的 SDP 任务/);
  assert.match(taskListSource, /getStoreMobileAssignedBackendTasks/);
  assert.match(taskListSource, /backendTasks\.length/);
  assert.match(taskListSource, /selectedSdp\?\.backend_task/);
  assert.match(taskListSource, /data-mobile-pricing-select-backend-task/);
  assert.match(taskListSource, /assigned_at/);
  assert.match(taskListSource, /parent_sdo_display_code|sdo_code/);
  assert.match(taskListSource, /content_summary|category/);
  assert.match(taskListSource, /source_type/);
  assert.match(taskListSource, /source_code/);
  assert.match(taskListSource, /received_status/);
  assert.match(taskListSource, /assignment_status/);
  assert.match(taskListSource, /演示任务 \/ Demo only/);
  assert.match(taskListSource, /待核对/);
  assert.match(taskListSource, /data-mobile-pricing-start-task/);
  assert.match(actionSource, /mobilePricingSelectBackendTask/);
  assert.match(actionSource, /selectStoreMobileBackendTask/);
  assert.match(actionSource, /startTask/);
  assert.match(actionSource, /state\.activePage = "verify"/);
});

test("backend task start button is included in the PDA pricing click listener", () => {
  const selectorStart = appJs.indexOf('event.target.closest("[data-mobile-pricing-page]');
  assert.notEqual(selectorStart, -1, "missing store mobile pricing click selector");
  const handlerCall = appJs.indexOf("handleStoreMobilePricingPreviewAction(button);", selectorStart);
  assert.notEqual(handlerCall, -1, "missing store mobile pricing handler call");
  const listenerSource = appJs.slice(selectorStart, handlerCall + "handleStoreMobilePricingPreviewAction(button);".length);

  assert.match(listenerSource, /\[data-mobile-pricing-select-backend-task\]/);
  assert.match(listenerSource, /event\.target\.closest/);
  assert.match(listenerSource, /handleStoreMobilePricingPreviewAction\(button\)/);
  assert.match(appLegacyJs, /\[data-mobile-pricing-select-backend-task\]/);
});

test("backend task selection loads selected SDP into the scan workflow", () => {
  const selectionSource = extractFunctionSource(appJs, "selectStoreMobileBackendTask");

  assert.match(selectionSource, /createStoreMobileSelectedSdpFromBackendTask/);
  assert.match(selectionSource, /buildStoreMobilePricingSourceLines/);
  assert.match(selectionSource, /state\.selectedSdp\s*=/);
  assert.match(selectionSource, /state\.pricingSourceLines\s*=/);
  assert.match(selectionSource, /state\.priceGroups\s*=\s*\[\]/);
  assert.match(selectionSource, /selectedBackendTaskCode/);
  assert.match(selectionSource, /state\.activePage = "verify"/);
  assert.match(selectionSource, /state\.scanError = ""/);
  assert.match(selectionSource, /state\.scanSuccess = ""/);
  assert.doesNotMatch(selectionSource, /freshWorkflow\.priceGroups|createStoreMobilePricingPreviewState\(\{ selectedSdp \}\)/);
});

test("backend selected SDP pricing source lines come from the assigned task, not demo groups", () => {
  const buildSource = extractFunctionSource(appJs, "buildStoreMobilePricingSourceLines");
  const renderSource = extractFunctionSource(appJs, "renderPriceGroupCards");
  const batchSource = extractFunctionSource(appJs, "createStoreMobilePricingBatch");
  const suggestedSource = extractFunctionSource(appJs, "getStoreMobileSuggestedSalePrice");

  assert.match(buildSource, /pricing_source_lines|lines/);
  assert.match(buildSource, /source_type/);
  assert.match(buildSource, /SDB/);
  assert.match(buildSource, /LPK/);
  assert.match(buildSource, /需补充分拣明细/);
  assert.doesNotMatch(buildSource, /SDP261250002|SDO260504008|A-01|A-02|牛仔裤 A/);
  assert.match(renderSource, /pricingSourceLines/);
  assert.match(renderSource, /P 档默认售价/);
  assert.match(renderSource, /S 档默认售价/);
  assert.match(renderSource, /自定义价格/);
  assert.match(renderSource, /需补充分拣明细/);
  assert.match(renderSource, /data-mobile-pricing-create-batch/);
  assert.match(batchSource, /source_sdp_display_code/);
  assert.match(batchSource, /source_sdp_machine_code/);
  assert.match(batchSource, /CUSTOM/);
  assert.match(suggestedSource, /findApparelDefaultSalePriceRecord/);
});

test("backend selected SDP batch quantity validation blocks over-allocation", () => {
  const validateSource = extractFunctionSource(appJs, "validateStoreMobilePricingBatchQuantity");
  const validateBatchQuantity = getExecutableFunction(
    "validateStoreMobilePricingBatchQuantity",
    `
    function toFiniteNumber(value, fallback = 0) {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    }
    function getStoreMobileLineRemainingQty(state, sourceLineKey, currentGroupId = "") {
      const line = (state.pricingSourceLines || []).find((candidate) => candidate.line_key === sourceLineKey);
      if (!line) return 0;
      const reserved = (state.priceGroups || []).reduce((sum, group) => {
        if (group.source_line_key !== sourceLineKey || group.group_id === currentGroupId) return sum;
        return sum + toFiniteNumber(group.quantity, 0);
      }, 0);
      return Math.max(0, toFiniteNumber(line.remaining_qty ?? line.item_count, 0) - reserved);
    }
    `
  );
  const state = {
    pricingSourceLines: [{ line_key: "LPK-1", remaining_qty: 5 }],
    priceGroups: [{ group_id: "BATCH-1", source_line_key: "LPK-1", quantity: 3 }],
  };

  assert.match(validateSource, /quantity must be positive|数量必须大于 0/);
  assert.match(validateSource, /cannot exceed remaining quantity|不能超过剩余数量/);
  assert.equal(validateBatchQuantity(state, { source_line_key: "LPK-1", quantity: 2 }).ok, true);
  assert.equal(validateBatchQuantity(state, { source_line_key: "LPK-1", quantity: 3 }).ok, false);
  assert.equal(validateBatchQuantity(state, { source_line_key: "LPK-1", quantity: 0 }).ok, false);
});

test("real backend SDP batch generation uses STORE_ITEM API and never completes print without bridge response", () => {
  const generateSource = extractFunctionSource(appJs, "generateStoreMobileBatchStoreItems");
  const printSource = extractFunctionSource(appJs, "queueStoreMobileBatchPrintJobs");
  const actionSource = extractFunctionSource(appJs, "handleStoreMobilePricingPreviewAction");

  assert.match(generateSource, /store-delivery-packages/);
  assert.match(generateSource, /store-items\/generate/);
  assert.match(generateSource, /pricing_batch_id/);
  assert.match(generateSource, /source_line_key/);
  assert.match(generateSource, /selected_price/);
  assert.match(generateSource, /source_sdp_display_code/);
  assert.match(printSource, /print-jobs\/item-tokens/);
  assert.match(printSource, /Android print bridge|待打印/);
  assert.doesNotMatch(printSource, /\/print-jobs\/\$\{[^}]+\}\/complete/);
  assert.match(actionSource, /generateStoreMobileBatchStoreItems/);
  assert.match(actionSource, /queueStoreMobileBatchPrintJobs/);
});

test("warehouse sale price management and Clerk PDA read the shared backend sale price API", () => {
  const loadConfigSource = extractFunctionSource(appJs, "loadConfig");
  const runtimeLoadSource = extractFunctionSource(appJs, "loadApparelDefaultSalePricesForPdaRuntime");
  const submitSource = extractFunctionSource(appJs, "submitApparelDefaultSalePrice");

  assert.match(loadConfigSource, /\/warehouse\/apparel-default-sale-prices/);
  assert.match(runtimeLoadSource, /\/apparel-default-sale-prices/);
  assert.match(runtimeLoadSource, /normalizeApparelDefaultSalePriceRows/);
  assert.match(submitSource, /\/warehouse\/apparel-default-sale-prices/);
  assert.match(submitSource, /method:\s*"POST"/);
});

test("barcode verification accepts selected backend SDP display or machine code", () => {
  const scanScreenSource = extractFunctionSource(appJs, "renderStoreMobileScanStep");
  const verifierSource = extractFunctionSource(appJs, "verifyStoreMobileSdpBarcode");
  const submitSource = extractFunctionSource(appJs, "handleStoreMobileScanSubmit");
  const verifyBarcode = getExecutableFunction("verifyStoreMobileSdpBarcode");
  const state = {
    selectedSdp: {
      display_code: "SDP261290019",
      sdp_code: "SDP261290019",
      machine_code: "6261290019",
    },
  };

  assert.match(scanScreenSource, /扫描实体包/);
  assert.match(scanScreenSource, /请扫描 SDP 实体包条码/);
  assert.match(scanScreenSource, /data-scan-input="true"/);
  assert.match(scanScreenSource, /手动确认 \/ 核对/);
  assert.equal(verifyBarcode("SDP261290019", state).ok, true);
  assert.equal(verifyBarcode("6261290019", state).ok, true);
  assert.equal(verifyBarcode("SDP261250002", state).ok, false);
  assert.doesNotMatch(verifierSource, /SDP261250002|6261250002/);
  assert.match(verifierSource, /sdp\.display_code/);
  assert.match(verifierSource, /sdp\.sdp_code/);
  assert.match(verifierSource, /sdp\.machine_code/);
  assert.match(verifierSource, /SDO260504008|4260504008/);
  assert.match(verifierSource, /SDB|LPK/);
  assert.match(verifierSource, /STORE_ITEM/);
  assert.match(verifierSource, /wrong SDP|不是当前 SDP 任务条码/);
  assert.match(submitSource, /state\.verified = true/);
  assert.match(submitSource, /state\.scanSuccess = "核对成功"/);
  assert.match(submitSource, /state\.activePage = "pricing"/);
});

test("price group editor uses PDA-friendly quick controls", () => {
  const editorSource = extractFunctionSource(appJs, "renderPriceGroupEditor");

  assert.match(editorSource, /data-mobile-pricing-grade-choice="A"/);
  assert.match(editorSource, /data-mobile-pricing-grade-choice="B"/);
  assert.match(editorSource, /data-mobile-pricing-grade-choice="S"/);
  assert.match(editorSource, /data-mobile-pricing-price-choice="50"/);
  assert.match(editorSource, /data-mobile-pricing-price-choice="500"/);
  assert.match(editorSource, /data-mobile-pricing-qty-step="-1"/);
  assert.match(editorSource, /data-mobile-pricing-qty-step="\+10"/);
  assert.match(editorSource, /牛仔裤/);
  assert.match(editorSource, /女上衣/);
  assert.match(editorSource, /A-01/);
});

test("label size selector supports 60x40 and 40x30 without mixing groups", () => {
  const printPanelSource = extractFunctionSource(appJs, "renderPriceGroupPrintPanel");
  const queueSource = extractFunctionSource(appJs, "renderPriceGroupPrintQueue");
  const stateSource = extractFunctionSource(appJs, "createStoreMobilePricingPreviewState");
  const cardSource = extractFunctionSource(appJs, "renderPriceGroupCards");

  assert.match(printPanelSource, /data-mobile-pricing-label-size="60×40"/);
  assert.match(printPanelSource, /data-mobile-pricing-label-size="40×30"/);
  assert.match(printPanelSource, /本组打印任务/);
  assert.match(printPanelSource, /当前打印机/);
  assert.match(printPanelSource, /Deli DL-720C/);
  assert.match(printPanelSource, /打印本组标签/);
  assert.match(printPanelSource, /已贴完本组/);
  assert.match(printPanelSource, /getStoreMobileStatusText\(job\.status \|\| "queued"\)/);
  assert.match(printPanelSource, /group\.tier/);
  assert.match(printPanelSource, /group\.quantity/);
  assert.match(cardSource, /group\.tier/);
  assert.match(cardSource, /group\.quantity/);
  assert.match(queueSource, /group\.tier/);
  assert.match(queueSource, /group\.price_kes/);
  assert.match(queueSource, /job\.label_size/);
  assert.match(queueSource, /job\.copies \|\| group\.quantity/);
  assert.match(stateSource, /group_id:\s*"CUSTOM-200"[\s\S]*?price_kes:\s*200[\s\S]*?quantity:\s*20[\s\S]*?rack_code:\s*"A-03"/);
  assert.match(stateSource, /printJobs:\s*\[\]/);
  assert.match(queueSource, /renderStoreMobileStatusBadge/);
  assert.doesNotMatch(queueSource, /混合总任务|全部价格组|all groups/i);
});

test("print task panel starts uncreated and only mock action creates queued job detail", () => {
  const stateSource = extractFunctionSource(appJs, "createStoreMobilePricingPreviewState");
  const printPanelSource = extractFunctionSource(appJs, "renderPriceGroupPrintPanel");
  const actionSource = extractFunctionSource(appJs, "handleStoreMobilePricingPreviewAction");
  const advanceSource = extractFunctionSource(appJs, "advanceStoreMobileGroupWorkflow");

  assert.match(stateSource, /createdPrintJobs:\s*\[\]/);
  assert.match(printPanelSource, /state\.createdPrintJobs/);
  assert.doesNotMatch(printPanelSource, /state\.printJobs/);
  assert.match(printPanelSource, /if \(!job\)/);
  assert.match(printPanelSource, /打印本组标签/);
  assert.match(printPanelSource, /已贴完本组/);
  assert.doesNotMatch(printPanelSource, /创建打印任务/);
  assert.doesNotMatch(printPanelSource, /返回打印队列/);
  assert.doesNotMatch(printPanelSource, /打印任务创建成功/);
  assert.match(actionSource, /advanceStoreMobileGroupWorkflow\(state, printGroup, "print"\)/);
  assert.match(advanceSource, /createdPrintJobs/);
  assert.match(advanceSource, /status:\s*"queued"/);
});

test("print queue has field summary and keeps every price group separate", () => {
  const queueSource = extractFunctionSource(appJs, "renderPriceGroupPrintQueue");
  const stateSource = extractFunctionSource(appJs, "createStoreMobilePricingPreviewState");

  assert.match(stateSource, /printer_name:\s*"Deli DL-720C"/);
  assert.match(stateSource, /pending_label_count:\s*210/);
  assert.match(stateSource, /printed_today_count:\s*0/);
  assert.match(stateSource, /current_task_group_id:\s*"A"/);
  assert.match(queueSource, /当前打印机/);
  assert.match(queueSource, /待打印总张数/);
  assert.match(queueSource, /今日已打印/);
  assert.match(queueSource, /当前任务/);
  assert.match(queueSource, /mobile-print-queue-summary/);
  assert.match(queueSource, /mobile-print-queue-row/);
  assert.match(queueSource, /getStoreMobileStatusText\(job\.status \|\| "queued"\)/);
});

test("generation and print task pages guide the next price group", () => {
  const helperSource = extractFunctionSource(appJs, "renderNextPriceGroupHint");
  const generationSource = extractFunctionSource(appJs, "renderPriceGroupGenerationResult");
  const printPanelSource = extractFunctionSource(appJs, "renderPriceGroupPrintPanel");

  assert.match(helperSource, /下一组/);
  assert.match(helperSource, /全部价格组已处理/);
  assert.match(helperSource, /price_kes/);
  assert.match(generationSource, /renderNextPriceGroupHint/);
  assert.match(printPanelSource, /renderNextPriceGroupHint/);
});

test("per-group workflow advances generate print sticker confirmation and returns to next group", () => {
  const advanceSource = extractFunctionSource(appJs, "advanceStoreMobileGroupWorkflow");
  const nextGroupSource = extractFunctionSource(appJs, "getNextIncompleteStoreMobileGroup");
  const actionSource = extractFunctionSource(appJs, "handleStoreMobilePricingPreviewAction");

  assert.match(advanceSource, /待生成[\s\S]*待打印/);
  assert.match(advanceSource, /待打印[\s\S]*待贴标确认/);
  assert.match(advanceSource, /待贴标确认[\s\S]*已完成/);
  assert.match(advanceSource, /getNextIncompleteStoreMobileGroup/);
  assert.match(advanceSource, /state\.activePage = "pricing"/);
  assert.match(nextGroupSource, /!== "已完成"/);
  assert.match(actionSource, /confirmStickers/);
  assert.match(appJs, /data-mobile-pricing-confirm-stickers/);
});

test("completing all groups marks the assigned SDP task complete with summary", () => {
  const completeSource = extractFunctionSource(appJs, "isStoreMobileTaskComplete");
  const summarySource = extractFunctionSource(appJs, "renderStoreMobileCompletionSummary");
  const advanceSource = extractFunctionSource(appJs, "advanceStoreMobileGroupWorkflow");

  assert.match(completeSource, /every\(\(group\) => String\(group\.status \|\| ""\) === "已完成"\)/);
  assert.match(advanceSource, /state\.taskStatus = "已完成"/);
  assert.match(advanceSource, /state\.activePage = "complete"/);
  assert.match(summarySource, /总数/);
  assert.match(summarySource, /已生成/);
  assert.match(summarySource, /已打印\/贴标/);
  assert.match(summarySource, /价格组 4\/4 已完成/);
  assert.match(summarySource, /返回任务列表/);
});

test("my tab shows clerk PDA account settings, printer test, and logout", () => {
  const mySource = extractFunctionSource(appJs, "renderStoreMobileMyTab");

  assert.match(mySource, /当前账号/);
  assert.match(mySource, /Austin/);
  assert.match(mySource, /门店/);
  assert.match(mySource, /UTAWALA/);
  assert.match(mySource, /角色/);
  assert.match(mySource, /店员/);
  assert.match(mySource, /Direct Loop PDA/);
  assert.match(mySource, /renderClerkBluetoothPrinterTestSection/);
  assert.match(mySource, /data-action="logout"/);
  assert.match(mySource, /重置演示任务状态/);
  assert.doesNotMatch(mySource, /店长|仓库|POS|系统管理|权限/);
});

test("preview statuses are localized for clerk UI", () => {
  const statusSource = extractFunctionSource(appJs, "getStoreMobileStatusText");

  assert.match(statusSource, /queued:\s*"排队中"/);
  assert.match(statusSource, /printing:\s*"打印中"/);
  assert.match(statusSource, /printed:\s*"已打印"/);
  assert.doesNotMatch(statusSource, /Pending Print|pending_putaway|resolver projection/);
});

test("pricing workbench moves price groups close to the top", () => {
  const screenSource = extractFunctionSource(appJs, "renderStoreMobileDeviceScreen");
  const frameSource = extractFunctionSource(appJs, "renderStoreMobileDeviceFrame");
  const sdpIndex = screenSource.indexOf("renderStoreMobileSdpCard");
  const groupsIndex = screenSource.indexOf("renderPriceGroupCards");
  const addIndex = screenSource.indexOf("返回任务");

  assert.ok(sdpIndex > -1, "pricing screen renders compact SDP card");
  assert.ok(groupsIndex > sdpIndex, "price groups follow SDP card");
  assert.ok(addIndex > groupsIndex, "actions stay below price groups");
  assert.doesNotMatch(screenSource.slice(sdpIndex, groupsIndex), /mobile-section-head[\s\S]*?价格组总览/);
  assert.match(frameSource, /mobile-pricing-statusbar/);
  assert.match(frameSource, /mobile-pricing-titlebar/);
  assert.match(stylesCss, /\.mobile-pricing-workbench\s*\{[\s\S]*?gap:\s*8px/);
  assert.match(stylesCss, /\.mobile-pricing-statusbar/);
  assert.match(stylesCss, /\.mobile-pricing-titlebar/);
});

test("preview actions are mock-only and do not call backend mutations or print complete", () => {
  const actionSource = extractFunctionSource(appJs, "handleStoreMobilePricingPreviewAction");
  const renderSource = extractFunctionSource(appJs, "renderStoreMobilePricingPreview");

  assert.doesNotMatch(actionSource, /\brequest\s*\(/);
  assert.doesNotMatch(actionSource, /fetch\s*\(/);
  assert.doesNotMatch(actionSource, /\/print-jobs\/\$\{[^}]+\}\/complete|\/print-jobs\/item-tokens|store-items\/generate/);
  assert.doesNotMatch(renderSource, /\brequest\s*\(/);
  assert.match(actionSource, /storeMobilePricingPreviewState/);
  const advanceSource = extractFunctionSource(appJs, "advanceStoreMobileGroupWorkflow");
  assert.match(advanceSource, /queued/);
});

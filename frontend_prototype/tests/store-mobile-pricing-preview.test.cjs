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
  const functionStart = source.slice(Math.max(0, start - 6), start) === "async " ? start - 6 : start;
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
        return source.slice(functionStart, index + 1);
      }
    }
  }
  throw new Error(`could not extract ${functionName}`);
}

function getExecutableFunction(functionName, dependencies = "") {
  return vm.runInNewContext(`${dependencies}\n${extractFunctionSource(appJs, functionName)}\n${functionName};`);
}

function getExecutableBundle(functionNames = [], dependencies = "", exportExpression = "") {
  const sources = functionNames.map((functionName) => extractFunctionSource(appJs, functionName)).join("\n");
  return vm.runInNewContext(`${dependencies}\n${sources}\n${exportExpression};`);
}

test("admin store page exposes an Android PDA batch pricing preview frame", () => {
  assert.match(indexHtml, /id="storeMobilePricingPreviewSummary"/);
  assert.match(indexHtml, /PDA 现场分堆标价 UI Preview/);
  assert.match(appJs, /function renderStoreMobilePricingPreview/);
  assert.match(appJs, /function renderStoreMobileDeviceFrame/);
  assert.match(stylesCss, /\.store-mobile-preview-layout\s*\{/);
  assert.match(stylesCss, /\.android-pda-frame\s*\{/);
});

test("login page shows compact FW-ERP and Android PR version status", () => {
  const loginVersionSection = indexHtml.match(/<section class="direct-loop-version-info[^"]*" data-direct-loop-version-info="login"[\s\S]*?<\/section>/)?.[0] || "";

  assert.match(indexHtml, /data-direct-loop-version-info="login"/);
  assert.match(loginVersionSection, /FW-ERP 主线 PR:/);
  assert.match(loginVersionSection, /#284/);
  assert.match(loginVersionSection, /Android PR:/);
  assert.match(loginVersionSection, /#35/);
  assert.doesNotMatch(loginVersionSection, /FW-ERP Web:|PDA Bundle:|Android App:|Android Bridge:/);
  assert.doesNotMatch(loginVersionSection, /STORE_ITEM preview print|getPrinterStatus|connectPrinter|disconnectPrinter|printTestLabel|printStoreItemLabelPreview/);
  assert.match(indexHtml, /app\.js\?v=store-shelf-floor-plan-canvas-editor-320/);
  assert.match(indexHtml, /app\.legacy\.js\?v=store-shelf-floor-plan-canvas-editor-320/);
});

test("PDA version info detects Android bridge methods without requiring native app info", () => {
  const versionSource = extractFunctionSource(appJs, "renderDirectLoopVersionInfoBlock");
  const diagnosticsSource = extractFunctionSource(appJs, "renderClerkPrinterDiagnosticDetails");
  const mySource = extractFunctionSource(appJs, "renderStoreMobileMyTab");
  const bridgeInfo = getExecutableBundle(
    ["getDirectLoopAndroidBridgeInfo"],
    `
      const DIRECT_LOOP_ANDROID_PRINTER_METHODS = [
        "getPrinterStatus",
        "connectPrinter",
        "disconnectPrinter",
        "printTestLabel",
        "printStoreItemLabelPreview",
        "printStoreItemLabelPreviewCtplNoLabelMode",
        "printStoreItemLabelPreviewCtplBitmapDemo",
        "printStoreItemLabelPreviewRawTspl",
        "printS1RawTsplMinText",
        "printS1RawTsplBlackBox",
        "getUrovoPrinterStatus",
        "printUrovoK300MinText",
        "printUrovoK300BlackBox",
        "printUrovoK300StoreItemPreview",
        "printK300EscposMinText",
        "printK300CpclMinText",
        "printK300CpclCode128Test",
        "printK300CpclCode128WideTest",
        "printK300CpclCode128TallTest",
        "printK300CpclCode128QuietZoneTest",
        "printK300CpclCode128CompactTopTest",
        "printK300CpclRawPreview",
        "printK300CpclRawBatch",
        "printK300CpclStoreItemPreview",
        "printK300TsplMinText",
        "printK300TsplBlackBox",
        "testK300SppConnection",
      ];
    `,
    "({ getDirectLoopAndroidBridgeInfo })",
  );

  assert.equal(bridgeInfo.getDirectLoopAndroidBridgeInfo(null).bridge_available, false);
  assert.equal(
    bridgeInfo.getDirectLoopAndroidBridgeInfo({ getPrinterStatus() {}, printStoreItemLabelPreview() {} }).supported_methods.printStoreItemLabelPreview,
    true,
  );
  assert.equal(
    bridgeInfo.getDirectLoopAndroidBridgeInfo({ printStoreItemLabelPreviewRawTspl() {} }).supported_methods.printStoreItemLabelPreviewRawTspl,
    true,
  );
  assert.equal(
    bridgeInfo.getDirectLoopAndroidBridgeInfo({ printS1RawTsplMinText() {}, printS1RawTsplBlackBox() {} }).supported_methods.printS1RawTsplMinText,
    true,
  );
  assert.equal(
    bridgeInfo.getDirectLoopAndroidBridgeInfo({ printS1RawTsplMinText() {}, printS1RawTsplBlackBox() {} }).supported_methods.printS1RawTsplBlackBox,
    true,
  );
  assert.equal(
    bridgeInfo.getDirectLoopAndroidBridgeInfo({ printUrovoK300MinText() {}, printUrovoK300BlackBox() {} }).supported_methods.printUrovoK300MinText,
    true,
  );
  assert.equal(
    bridgeInfo.getDirectLoopAndroidBridgeInfo({ printUrovoK300StoreItemPreview() {} }).supported_methods.printUrovoK300StoreItemPreview,
    true,
  );
  assert.equal(
    bridgeInfo.getDirectLoopAndroidBridgeInfo({ printK300EscposMinText() {}, printK300TsplBlackBox() {} }).supported_methods.printK300EscposMinText,
    true,
  );
  assert.equal(
    bridgeInfo.getDirectLoopAndroidBridgeInfo({ printK300CpclMinText() {}, printK300TsplMinText() {} }).supported_methods.printK300TsplMinText,
    true,
  );
  assert.equal(
    bridgeInfo.getDirectLoopAndroidBridgeInfo({ printK300CpclCode128Test() {}, printK300CpclStoreItemPreview() {} }).supported_methods.printK300CpclCode128Test,
    true,
  );
  assert.equal(
    bridgeInfo.getDirectLoopAndroidBridgeInfo({ printK300CpclCode128WideTest() {}, printK300CpclCode128TallTest() {} }).supported_methods.printK300CpclCode128WideTest,
    true,
  );
  assert.equal(
    bridgeInfo.getDirectLoopAndroidBridgeInfo({ printK300CpclCode128QuietZoneTest() {}, printK300CpclCode128CompactTopTest() {} }).supported_methods.printK300CpclCode128CompactTopTest,
    true,
  );
  assert.equal(
    bridgeInfo.getDirectLoopAndroidBridgeInfo({ printK300CpclCode128Test() {}, printK300CpclStoreItemPreview() {} }).supported_methods.printK300CpclStoreItemPreview,
    true,
  );
  assert.equal(
    bridgeInfo.getDirectLoopAndroidBridgeInfo({ printK300CpclRawPreview() {} }).supported_methods.printK300CpclRawPreview,
    true,
  );
  assert.equal(
    bridgeInfo.getDirectLoopAndroidBridgeInfo({ printK300CpclRawBatch() {} }).supported_methods.printK300CpclRawBatch,
    true,
  );
  assert.equal(
    bridgeInfo.getDirectLoopAndroidBridgeInfo({ testK300SppConnection() {} }).supported_methods.testK300SppConnection,
    true,
  );
  assert.equal(
    bridgeInfo.getDirectLoopAndroidBridgeInfo({ getPrinterStatus() {} }).supported_methods.printStoreItemLabelPreview,
    false,
  );
  assert.match(versionSource, /FW-ERP Web:/);
  assert.match(versionSource, /PDA Bundle:/);
  assert.match(versionSource, /Android App:/);
  assert.match(versionSource, /Android Bridge:/);
  assert.match(versionSource, /STORE_ITEM preview print:/);
  assert.match(versionSource, /not supported by current Android APK/);
  assert.match(diagnosticsSource, /renderDirectLoopVersionInfoBlock\("printer_diagnostics"\)/);
  assert.match(mySource, /renderDirectLoopVersionInfoBlock\("clerk_my"\)/);
  assert.match(appLegacyJs, /fw-erp-web-20260511-clerk-pda-daily-workbench-309/);
  assert.match(appLegacyJs, /printStoreItemLabelPreview/);
  assert.match(appLegacyJs, /printStoreItemLabelPreviewCtplNoLabelMode/);
  assert.match(appLegacyJs, /printStoreItemLabelPreviewCtplBitmapDemo/);
  assert.match(appLegacyJs, /printStoreItemLabelPreviewRawTspl/);
  assert.match(appLegacyJs, /printS1RawTsplMinText/);
  assert.match(appLegacyJs, /printS1RawTsplBlackBox/);
  assert.match(appLegacyJs, /printUrovoK300MinText/);
  assert.match(appLegacyJs, /printUrovoK300BlackBox/);
  assert.match(appLegacyJs, /printUrovoK300StoreItemPreview/);
  assert.match(appLegacyJs, /printK300EscposMinText/);
  assert.match(appLegacyJs, /printK300CpclMinText/);
  assert.match(appLegacyJs, /printK300CpclCode128Test/);
  assert.match(appLegacyJs, /printK300CpclCode128WideTest/);
  assert.match(appLegacyJs, /printK300CpclCode128TallTest/);
  assert.match(appLegacyJs, /printK300CpclCode128QuietZoneTest/);
  assert.match(appLegacyJs, /printK300CpclCode128CompactTopTest/);
  assert.match(appLegacyJs, /printK300CpclRawPreview/);
  assert.match(appLegacyJs, /printK300CpclRawBatch/);
  assert.match(appLegacyJs, /printK300CpclStoreItemPreview/);
  assert.match(appLegacyJs, /printK300TsplMinText/);
  assert.match(appLegacyJs, /printK300TsplBlackBox/);
  assert.match(appLegacyJs, /testK300SppConnection/);
});

test("price groups render separately with independent STORE_ITEM generation and preview actions", () => {
  const stateSource = extractFunctionSource(appJs, "createStoreMobilePricingPreviewState");
  const cardSource = extractFunctionSource(appJs, "renderPriceGroupCards");

  assert.match(stateSource, /group_id:\s*"A"/);
  assert.match(stateSource, /group_id:\s*"B"/);
  assert.match(stateSource, /group_id:\s*"S"/);
  assert.match(stateSource, /group_id:\s*"CUSTOM-200"/);
  assert.match(cardSource, /mobile-field-group-card/);
  assert.match(cardSource, /mobile-group-qty/);
  assert.match(cardSource, /生成本批商品码/);
  assert.match(cardSource, /查看标签预览/);
  assert.match(cardSource, /已生成 \/ 待打印/);
  assert.match(cardSource, /data-mobile-pricing-generate-group/);
  assert.match(cardSource, /data-mobile-pricing-preview-labels/);
  assert.doesNotMatch(cardSource, /data-mobile-pricing-print-group/);
  assert.doesNotMatch(cardSource, /data-mobile-pricing-confirm-stickers/);
  assert.doesNotMatch(cardSource, /打印本组标签|打印本批标签|已贴完本组|已贴完本批/);
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

  assert.match(pageOptionsSource, /我的今日工作|我的任务/);
  assert.match(pageOptionsSource, /SDP 详情/);
  assert.match(pageOptionsSource, /分批定价/);
  assert.doesNotMatch(pageOptionsSource, /当前 source line|价格组列表/);
  assert.match(pageOptionsSource, /本批 STORE_ITEM 生成结果/);
  assert.match(pageOptionsSource, /本批标签预览/);
  assert.match(pageOptionsSource, /print payload 预览/);
  assert.match(bottomTabsSource, /const bottomTabs = \["任务", "我的"\]/);
  assert.doesNotMatch(bottomTabsSource, /扫描/);
  assert.doesNotMatch(bottomTabsSource, /标价/);
  assert.doesNotMatch(bottomTabsSource, /打印/);
  assert.match(stylesCss, /\.mobile-pricing-tabbar\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(frameSource, /renderStoreMobileDeviceScreen\(state\)/);
  assert.doesNotMatch(frameSource, /pending_print|pending_putaway|resolver projection|source_token_refs|lineage payload|transfer projection/);
});

test("clerk PDA task home is a daily workbench, not an SDP-only homepage", () => {
  const taskListSource = extractFunctionSource(appJs, "renderStoreMobileTaskList");
  const pageOptionsSource = extractFunctionSource(appJs, "getStoreMobilePageOptions");
  const mySource = extractFunctionSource(appJs, "renderStoreMobileMyTab");

  assert.match(taskListSource, /我的今日工作|我的任务/);
  assert.doesNotMatch(taskListSource, /SDP 分拣首页/);
  assert.match(taskListSource, /当前店员|Austin/);
  assert.match(taskListSource, /当前门店|UTAWALA/);
  assert.match(taskListSource, /今日待办/);
  assert.match(taskListSource, /进行中/);
  assert.match(taskListSource, /待完成入库/);
  assert.match(taskListSource, /已完成/);
  assert.match(taskListSource, /紧急待办/);
  assert.match(taskListSource, /已打印但还没有确认货架，库存暂未计入。/);
  assert.match(taskListSource, /立即处理/);
  assert.match(taskListSource, /我的任务/);
  assert.match(taskListSource, /SDP 分拣 \/ 打标签任务|SDP 分拣/);
  assert.match(taskListSource, /补货任务/);
  assert.match(taskListSource, /清洁任务/);
  assert.match(taskListSource, /日报填写/);
  assert.match(taskListSource, /快捷入口/);
  assert.match(taskListSource, /扫 SDP/);
  assert.match(taskListSource, /未完成入库/);
  assert.match(taskListSource, /补货/);
  assert.match(taskListSource, /打印机/);
  assert.match(taskListSource, /mobile-task-card/);
  assert.doesNotMatch(taskListSource, /<table|form-grid|stock_in_confirmed|legacy|entity_type/);
  assert.match(pageOptionsSource, /我的今日工作|我的任务/);
  assert.match(mySource, /未完成入库/);
  assert.match(appLegacyJs, /我的今日工作/);
  assert.match(appLegacyJs, /补货任务/);
  assert.match(appLegacyJs, /清洁任务/);
  assert.match(appLegacyJs, /日报填写/);
  assert.doesNotMatch(appLegacyJs, /CASHIER_TERMINAL_PREVIEW_STORE|CASHIER_TERMINAL_PREVIEW_ITEMS|CASHIER_TERMINAL_REJECT_MESSAGES/);
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

test("clerk PDA printer connection UI is clerk-friendly and hides protocol diagnostics", () => {
  const stateSource = extractFunctionSource(appJs, "createStoreMobilePricingPreviewState");
  const myTabSource = extractFunctionSource(appJs, "renderStoreMobileMyTab");
  const entrySource = extractFunctionSource(appJs, "renderClerkPrinterConnectionEntryCard");
  const pageSource = extractFunctionSource(appJs, "renderClerkPrinterConnectionPage");
  const diagnosticsSource = extractFunctionSource(appJs, "renderClerkPrinterDiagnosticDetails");
  const badgeSource = extractFunctionSource(appJs, "renderClerkPrinterStatusBadge");
  const screenSource = extractFunctionSource(appJs, "renderStoreMobileDeviceScreen");
  const runtimeSource = extractFunctionSource(appJs, "renderStoreMobileRuntimeScreen");
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
  assert.match(myTabSource, /renderClerkPrinterConnectionEntryCard/);
  assert.match(entrySource, /打印机连接/);
  assert.match(entrySource, /当前打印机/);
  assert.match(entrySource, /data-mobile-pricing-page="printer_connection"/);
  assert.doesNotMatch(myTabSource, /蓝牙打印机测试|打印 TSPL|打印 CPCL|ESC\/POS|RAW 走纸/);
  assert.match(pageSource, /打印机连接/);
  assert.match(pageSource, /打印机状态/);
  assert.match(pageSource, /当前型号/);
  assert.match(pageSource, /最近刷新/);
  assert.match(pageSource, /搜索附近打印机/);
  assert.match(pageSource, /刷新已配对打印机/);
  assert.match(pageSource, /连接打印机/);
  assert.match(pageSource, /断开连接/);
  assert.doesNotMatch(pageSource, /打印测试标签/);
  assert.match(pageSource, /renderClerkPrinterTestPanel/);
  assert.match(diagnosticsSource, /打印测试标签/);
  assert.match(screenSource, /page === "printer_connection"/);
  assert.match(runtimeSource, /renderClerkPrinterStatusBadge/);
  assert.match(badgeSource, /data-clerk-printer-status-badge/);
  assert.match(badgeSource, /data-mobile-pricing-page="printer_connection"/);
  assert.doesNotMatch(myTabSource, /bridge_available|bluetooth_enabled|last_protocol_tested|last_print_result|TSPL_SIMPLE_TEXT|TSPL_DENSITY_TEXT|RAW_LF_FEED/);
  assert.doesNotMatch(pageSource, /TSPL_SIMPLE_TEXT|TSPL_DENSITY_TEXT|RAW_LF_FEED/);
  assert.match(startPrinterPolling, /pollClerkBluetoothPrinterStatus\(\{\s*reason:\s*"immediate"/);
  assert.match(startPrinterPolling, /window\.setInterval/);
  assert.match(startPrinterPolling, /CLERK_BLUETOOTH_PRINTER_STATUS_POLL_INTERVAL_MS/);
  assert.match(shouldPollPrinter, /document\.visibilityState === "hidden"/);
  assert.match(shouldPollPrinter, /data-clerk-printer-status-badge/);
  assert.match(pollPrinter, /DirectLoopPdaPrinter/);
  assert.match(pollPrinter, /getPrinterStatus/);
  assert.doesNotMatch(pollPrinter, /connectPrinter|printTestLabel|listPairedPrinters|startPrinterDiscovery|getDiscoveredPrinters/);
  assert.match(refreshPairedPrinters, /listPairedPrinters/);
  assert.doesNotMatch(refreshPairedPrinters, /connectPrinter|printTestLabel/);
  assert.match(actionHandler, /refreshClerkBluetoothPairedPrinters/);
  assert.match(clearSession, /stopClerkBluetoothPrinterStatusPolling/);
  assert.match(appJs, /document\.visibilityState === "hidden"[\s\S]*stopClerkBluetoothPrinterStatusPolling/);
  assert.match(appJs, /document\.visibilityState === "visible"[\s\S]*startClerkBluetoothPrinterStatusPolling/);
});

test("clerk PDA Bluetooth paired printer rows persist across status polling", () => {
  const stateSource = extractFunctionSource(appJs, "createStoreMobilePricingPreviewState");
  const updateStatus = extractFunctionSource(appJs, "updateClerkBluetoothPrinterStatus");
  const pollPrinter = extractFunctionSource(appJs, "pollClerkBluetoothPrinterStatus");
  const refreshPairedPrinters = extractFunctionSource(appJs, "refreshClerkBluetoothPairedPrinters");
  const printerPageSource = extractFunctionSource(appJs, "renderClerkPrinterConnectionPage");

  assert.match(stateSource, /bluetoothPrinterPairedPrinters:\s*\[\]/);
  assert.match(stateSource, /bluetoothPrinterPairedPrintersLoaded:\s*false/);
  assert.match(stateSource, /bluetoothPrinterPairedPrintersLastRefreshAt:\s*""/);
  assert.match(refreshPairedPrinters, /bluetoothPrinterPairedPrinters\s*=\s*printers/);
  assert.match(refreshPairedPrinters, /bluetoothPrinterPairedPrintersLastRefreshAt\s*=/);
  assert.match(refreshPairedPrinters, /没有已配对的蓝牙打印机，请先在 Android 系统蓝牙设置中配对打印机。/);
  assert.match(printerPageSource, /getClerkBluetoothPrinterRowsForDisplay/);
  assert.match(appJs, /bluetoothPrinterPairedPrintersLoaded[\s\S]*bluetoothPrinterPairedPrinters[\s\S]*status\.paired_printers/);
  assert.match(updateStatus, /selected_printer_name/);
  assert.match(updateStatus, /selected_printer_address/);
  assert.match(updateStatus, /selected_profile/);
  assert.doesNotMatch(pollPrinter, /bluetoothPrinterPairedPrinters\s*=/);
  assert.doesNotMatch(pollPrinter, /connectPrinter|printTestLabel|listPairedPrinters|startPrinterDiscovery|getDiscoveredPrinters/);
  assert.match(indexHtml, /app\.js\?v=store-shelf-floor-plan-canvas-editor-320/);
  assert.match(indexHtml, /app\.legacy\.js\?v=store-shelf-floor-plan-canvas-editor-320/);
  assert.match(appLegacyJs, /bluetoothPrinterPairedPrinters:\s*\[\]/);
  assert.match(appLegacyJs, /bluetoothPrinterPairedPrintersLastRefreshAt/);
});

test("clerk PDA printer connection page uses official Chiteng test print without exposing protocols", () => {
  const printerPageSource = extractFunctionSource(appJs, "renderClerkPrinterConnectionPage");
  const actionHandler = extractFunctionSource(appJs, "handleStoreMobilePricingPreviewAction");
  const discoverySource = extractFunctionSource(appJs, "startClerkBluetoothPrinterDiscovery");

  assert.match(printerPageSource, /CHITENG_S1_OFFICIAL/);
  assert.match(printerPageSource, /驰腾 S1/);
  assert.match(printerPageSource, /Urovo/);
  assert.match(printerPageSource, /通用/);
  assert.match(printerPageSource, /data-clerk-bluetooth-printer-search/);
  assert.match(printerPageSource, /data-clerk-bluetooth-printer-refresh/);
  assert.match(printerPageSource, /请先在 Android 系统蓝牙中完成配对后再连接。/);
  assert.match(actionHandler, /printTestLabel\("CHITENG_S1_OFFICIAL"\)/);
  assert.match(actionHandler, /该型号测试打印暂未配置/);
  assert.match(discoverySource, /startPrinterDiscovery/);
  assert.match(discoverySource, /getDiscoveredPrinters/);
  assert.match(discoverySource, /当前版本暂只支持已配对打印机/);
  assert.doesNotMatch(printerPageSource, /打印 TSPL 测试标签|打印 CPCL 测试标签|打印 ESC\/POS 测试标签|TSPL 简单文字|TSPL 高浓度文字|TSPL 连续纸测试|TSPL 间隙校准测试|RAW 走纸测试|ESC\/POS 文字测试|CPCL 简单文字/);
  assert.doesNotMatch(appLegacyJs, /打印 TSPL 测试标签|打印 CPCL 测试标签|打印 ESC\/POS 测试标签|TSPL 简单文字|TSPL 高浓度文字|TSPL 连续纸测试|TSPL 间隙校准测试|RAW 走纸测试|ESC\/POS 文字测试|CPCL 简单文字/);
  assert.match(appLegacyJs, /data-clerk-printer-status-badge/);
  assert.match(appLegacyJs, /CHITENG_S1_OFFICIAL/);
  assert.doesNotMatch(actionHandler, /STORE_ITEM|marked.*printed|printJobs.*printed/);
});

test("clerk PDA Chiteng S1 badge only shows connected after online and SDK proof", () => {
  const printerBadge = getExecutableBundle(
    [
      "createDefaultClerkBluetoothPrinterStatus",
      "getClerkBluetoothPrinterStatusObject",
      "normalizeClerkBluetoothPrinterRows",
      "getClerkBluetoothBooleanValue",
      "normalizeClerkBluetoothPrinterStatus",
      "getClerkBluetoothPrinterProfileValue",
      "getClerkBluetoothPrinterOnlineStatusValue",
      "isClerkOfficialChitengPrinterProfile",
      "isClerkK300BluetoothPrinterProfile",
      "isClerkOfficialChitengPrinterOnlineReady",
      "getClerkBluetoothPrinterStateLabel",
      "getClerkBluetoothPrinterStatusText",
      "getClerkBluetoothPrinterBadgeText",
      "renderClerkPrinterStatusBadge",
    ],
    `
      const storeMobilePricingPreviewState = {};
      function escapeHtml(value) {
        return String(value ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
      }
    `,
    "({ renderClerkPrinterStatusBadge, getClerkBluetoothPrinterStatusText })",
  );
  const baseStatus = {
    selected_profile: "CHITENG_S1_OFFICIAL",
    selected_printer_name: "S1-3696",
    selected_printer_address: "00:11:22:33",
    connection_status: "connected",
  };

  const unknownHtml = printerBadge.renderClerkPrinterStatusBadge({
    bluetoothPrinterStatus: {
      ...baseStatus,
      printer_online_status: "unknown",
      official_sdk_connected: false,
    },
  });
  assert.doesNotMatch(unknownHtml, /已连接 S1-3696/);
  assert.match(unknownHtml, /未验证 S1-3696/);
  assert.equal(
    printerBadge.getClerkBluetoothPrinterStatusText({
      ...baseStatus,
      printer_online_status: "unknown",
      official_sdk_connected: false,
    }),
    "未验证",
  );

  const onlineHtml = printerBadge.renderClerkPrinterStatusBadge({
    bluetoothPrinterStatus: {
      ...baseStatus,
      printer_online_status: "online",
      official_sdk_connected: true,
    },
  });
  assert.match(onlineHtml, /已连接 S1-3696/);

  const offlineHtml = printerBadge.renderClerkPrinterStatusBadge({
    bluetoothPrinterStatus: {
      ...baseStatus,
      printer_online_status: "offline",
      official_sdk_connected: true,
    },
  });
  assert.match(offlineHtml, /离线 S1-3696/);

  const errorHtml = printerBadge.renderClerkPrinterStatusBadge({
    bluetoothPrinterStatus: {
      ...baseStatus,
      printer_online_status: "error",
      official_sdk_connected: true,
    },
  });
  assert.match(errorHtml, /错误 S1-3696/);
});

test("clerk PDA infers Chiteng S1 profile from selected S1 printer name", () => {
  const printerStatus = getExecutableBundle(
    [
      "createDefaultClerkBluetoothPrinterStatus",
      "getClerkBluetoothPrinterStatusObject",
      "normalizeClerkBluetoothPrinterRows",
      "getClerkBluetoothBooleanValue",
      "normalizeClerkBluetoothPrinterStatus",
      "getClerkBluetoothPrinterProfileValue",
      "getClerkBluetoothPrinterOnlineStatusValue",
      "isClerkOfficialChitengPrinterProfile",
      "isClerkK300BluetoothPrinterProfile",
      "isClerkOfficialChitengPrinterOnlineReady",
      "canRunClerkBluetoothPrinterPreviewPrint",
      "getClerkBluetoothPrinterStateLabel",
      "getClerkBluetoothPrinterBadgeText",
    ],
    "",
    "({ getClerkBluetoothPrinterBadgeText, canRunClerkBluetoothPrinterPreviewPrint })",
  );
  const missingProfileS1 = {
    selected_profile: "GENERIC",
    selected_printer_name: "S1-3696",
    selected_printer_address: "00:11:22:33",
    connection_status: "connected",
  };

  assert.equal(
    printerStatus.getClerkBluetoothPrinterBadgeText({
      ...missingProfileS1,
      printer_online_status: "unknown",
      official_sdk_connected: false,
    }),
    "🖨 未验证 S1-3696",
  );
  assert.equal(
    printerStatus.canRunClerkBluetoothPrinterPreviewPrint({
      ...missingProfileS1,
      printer_online_status: "online",
      official_sdk_connected: true,
    }),
    true,
  );
});

test("clerk PDA Chiteng S1 test print and diagnostics require truthful online status", () => {
  const canRunTestPrint = getExecutableBundle(
    [
      "createDefaultClerkBluetoothPrinterStatus",
      "getClerkBluetoothPrinterStatusObject",
      "normalizeClerkBluetoothPrinterRows",
      "getClerkBluetoothBooleanValue",
      "normalizeClerkBluetoothPrinterStatus",
      "getClerkBluetoothPrinterProfileValue",
      "getClerkBluetoothPrinterOnlineStatusValue",
      "isClerkOfficialChitengPrinterProfile",
      "isClerkOfficialChitengPrinterOnlineReady",
      "canRunClerkBluetoothPrinterTestPrint",
    ],
    "",
    "canRunClerkBluetoothPrinterTestPrint",
  );
  const printerPageSource = extractFunctionSource(appJs, "renderClerkPrinterConnectionPage");
  const diagnosticsSource = extractFunctionSource(appJs, "renderClerkPrinterDiagnosticDetails");
  const baseStatus = {
    selected_profile: "CHITENG_S1_OFFICIAL",
    selected_printer_name: "S1-3696",
    connection_status: "connected",
    printer_online_status: "online",
  };

  assert.equal(canRunTestPrint({ ...baseStatus, official_sdk_connected: true }), true);
  assert.equal(canRunTestPrint({ ...baseStatus, official_sdk_connected: false }), false);
  assert.equal(canRunTestPrint({ ...baseStatus, printer_online_status: "unknown", official_sdk_connected: true }), false);
  assert.equal(canRunTestPrint({ ...baseStatus, printer_online_status: "offline", official_sdk_connected: true }), false);
  assert.equal(canRunTestPrint({ ...baseStatus, selected_profile: "GENERIC", selected_printer_name: "Generic-01", official_sdk_connected: true }), false);
  assert.doesNotMatch(printerPageSource, /canRunClerkBluetoothPrinterTestPrint/);
  assert.match(diagnosticsSource, /canRunClerkBluetoothPrinterTestPrint/);
  assert.doesNotMatch(printerPageSource, /请先连接并确认打印机在线。/);
  assert.doesNotMatch(printerPageSource, /在线状态 printer_online_status/);
  assert.doesNotMatch(printerPageSource, /SDK connected official_sdk_connected/);
  assert.doesNotMatch(printerPageSource, /SDK message official_sdk_last_message/);
  assert.doesNotMatch(printerPageSource, /SDK error official_sdk_last_error/);
  assert.doesNotMatch(printerPageSource, /health checked time printer_health_checked_at/);
  assert.match(diagnosticsSource, /打印测试标签/);
  assert.match(diagnosticsSource, /data-clerk-bluetooth-printer-test/);
  assert.match(diagnosticsSource, /printer_online_status/);
  assert.match(diagnosticsSource, /official_sdk_connected/);
  assert.match(diagnosticsSource, /official_sdk_available/);
  assert.match(diagnosticsSource, /official_sdk_last_message/);
  assert.match(diagnosticsSource, /official_sdk_last_error/);
  assert.match(appLegacyJs, /canRunClerkBluetoothPrinterTestPrint/);
  assert.match(appLegacyJs, /未验证 S1-3696|未验证/);
  assert.match(appLegacyJs, /printer_online_status/);
  assert.match(appLegacyJs, /official_sdk_connected/);
});

test("clerk PDA printer connection page has collapsed developer diagnostics refreshed by status only", () => {
  const stateSource = extractFunctionSource(appJs, "createStoreMobilePricingPreviewState");
  const updateStatus = extractFunctionSource(appJs, "updateClerkBluetoothPrinterStatus");
  const rawJsonSource = extractFunctionSource(appJs, "formatClerkBluetoothPrinterRawStatusJson");
  const diagnosticsSource = extractFunctionSource(appJs, "renderClerkPrinterDiagnosticDetails");
  const printerPageSource = extractFunctionSource(appJs, "renderClerkPrinterConnectionPage");
  const pollPrinter = extractFunctionSource(appJs, "pollClerkBluetoothPrinterStatus");
  const actionHandler = extractFunctionSource(appJs, "handleStoreMobilePricingPreviewAction");

  assert.match(stateSource, /bluetoothPrinterRawStatusJson:\s*""/);
  assert.match(stateSource, /bluetoothPrinterDiagnosticsOpen:\s*false/);
  assert.match(updateStatus, /rawStatusJson/);
  assert.match(rawJsonSource, /JSON\.stringify/);
  assert.match(printerPageSource, /renderClerkPrinterTestPanel/);
  assert.doesNotMatch(printerPageSource, /renderClerkPrinterDiagnosticDetails/);
  assert.match(diagnosticsSource, /<details class="clerk-printer-test-panel clerk-printer-diagnostics"/);
  assert.match(diagnosticsSource, /state\.bluetoothPrinterDiagnosticsOpen\s*\?\s*"open"\s*:\s*""/);
  assert.match(diagnosticsSource, /🧪 打印机测试/);
  assert.match(diagnosticsSource, /诊断详情 \/ Developer diagnostics/);
  assert.match(diagnosticsSource, /bridge_available/);
  assert.match(diagnosticsSource, /bluetooth_enabled/);
  assert.match(diagnosticsSource, /connection_status/);
  assert.match(diagnosticsSource, /printer_online_status/);
  assert.match(diagnosticsSource, /printer_health_checked_at/);
  assert.match(diagnosticsSource, /official_sdk_available/);
  assert.match(diagnosticsSource, /official_sdk_connected/);
  assert.match(diagnosticsSource, /official_sdk_last_message/);
  assert.match(diagnosticsSource, /official_sdk_last_error/);
  assert.match(diagnosticsSource, /selected_printer_name/);
  assert.match(diagnosticsSource, /selected_printer_address/);
  assert.match(diagnosticsSource, /selected_profile/);
  assert.match(diagnosticsSource, /discovery_status/);
  assert.match(diagnosticsSource, /paired_printer_count/);
  assert.match(diagnosticsSource, /discovered_printer_count/);
  assert.match(diagnosticsSource, /last_protocol_tested/);
  assert.match(diagnosticsSource, /last_print_result/);
  assert.match(diagnosticsSource, /last_error/);
  assert.match(diagnosticsSource, /raw JSON from latest getPrinterStatus\(\)/);
  assert.match(diagnosticsSource, /data-clerk-printer-diagnostics-json="true"/);
  assert.match(diagnosticsSource, /清空 raw JSON/);
  assert.match(diagnosticsSource, /data-clerk-printer-json-clear/);
  assert.match(diagnosticsSource, /一键复制 raw JSON/);
  assert.match(diagnosticsSource, /data-clerk-printer-json-copy/);
  assert.match(diagnosticsSource, /刷新诊断状态/);
  assert.match(diagnosticsSource, /data-clerk-bluetooth-printer-diagnostic-refresh/);
  assert.match(diagnosticsSource, /锁定诊断状态/);
  assert.match(actionHandler, /clerkBluetoothPrinterDiagnosticRefresh/);
  assert.match(actionHandler, /pollClerkBluetoothPrinterStatus\(\{\s*reason:\s*"manual"/);
  assert.match(pollPrinter, /const status = await bridge\.getPrinterStatus\(\)/);
  assert.match(pollPrinter, /rawStatusJson:\s*formatClerkBluetoothPrinterRawStatusJson\(status\)/);
  assert.doesNotMatch(pollPrinter, /bluetoothPrinterDiagnosticsOpen\s*=/);
  assert.doesNotMatch(actionHandler, /clerkBluetoothPrinterDiagnosticRefresh[\s\S]{0,240}connectPrinter|clerkBluetoothPrinterDiagnosticRefresh[\s\S]{0,240}printTestLabel|clerkBluetoothPrinterDiagnosticRefresh[\s\S]{0,240}listPairedPrinters/);
  assert.match(appLegacyJs, /🧪 打印机测试/);
  assert.match(appLegacyJs, /诊断详情 \/ Developer diagnostics/);
  assert.match(appLegacyJs, /data-clerk-bluetooth-printer-diagnostic-refresh/);
  assert.match(appLegacyJs, /data-clerk-printer-json-clear/);
  assert.match(appLegacyJs, /data-clerk-printer-json-copy/);
});

test("clerk PDA printer normal page keeps diagnostics behind the printer test panel", () => {
  const printerPageSource = extractFunctionSource(appJs, "renderClerkPrinterConnectionPage");
  const testPanelSource = extractFunctionSource(appJs, "renderClerkPrinterTestPanel");
  const diagnosticsSource = extractFunctionSource(appJs, "renderClerkPrinterDiagnosticDetails");
  const protocolConfigSource = extractFunctionSource(appJs, "getClerkS1PreviewProtocolDiagnostics");

  assert.match(printerPageSource, /打印机状态:/);
  assert.match(printerPageSource, /当前打印机/);
  assert.match(printerPageSource, /打印机型号/);
  assert.match(printerPageSource, /选择 \/ 连接/);
  assert.match(printerPageSource, /连接打印机/);
  assert.match(printerPageSource, /断开连接/);
  assert.match(printerPageSource, /K300 蓝牙可用/);
  assert.match(printerPageSource, /K300 蓝牙未连接/);
  assert.match(printerPageSource, /renderClerkPrinterTestPanel/);
  assert.match(testPanelSource, /renderClerkPrinterDiagnosticDetails/);

  assert.doesNotMatch(printerPageSource, /raw JSON from latest getPrinterStatus\(\)/);
  assert.doesNotMatch(printerPageSource, /一键复制 raw JSON|清空 raw JSON|上报当前诊断状态|刷新诊断状态/);
  assert.doesNotMatch(printerPageSource, /K300 蓝牙协议测试|Urovo K300 测试|测试 Raw TSPL|连续测试 5 张 Code128|连续打印 5 张正式模板|连续打印 5 张 D 微调版/);
  assert.doesNotMatch(printerPageSource, /data-clerk-bluetooth-printer-preview-protocol/);
  assert.doesNotMatch(printerPageSource, /official_sdk_last_message|official_sdk_last_error|last_preview_tspl_command/);
  assert.doesNotMatch(printerPageSource, /data-clerk-bluetooth-printer-test/);

  assert.match(diagnosticsSource, /🧪 打印机测试/);
  assert.match(diagnosticsSource, /K300 蓝牙协议测试/);
  assert.match(diagnosticsSource, /Urovo K300 测试/);
  assert.match(protocolConfigSource, /测试 Raw TSPL/);
  assert.match(diagnosticsSource, /raw JSON from latest getPrinterStatus\(\)/);
  assert.match(diagnosticsSource, /一键复制 raw JSON/);
  assert.match(diagnosticsSource, /清空 raw JSON/);
  assert.match(diagnosticsSource, /上报当前诊断状态/);
  assert.match(diagnosticsSource, /刷新诊断状态/);
  assert.match(appLegacyJs, /🧪 打印机测试/);
  assert.match(appLegacyJs, /K300 蓝牙协议测试/);
});

test("clerk PDA printer diagnostics raw JSON can be cleared or copied", () => {
  const diagnosticsSource = extractFunctionSource(appJs, "renderClerkPrinterDiagnosticDetails");
  const clearSource = extractFunctionSource(appJs, "clearClerkPrinterDiagnosticsRawJson");
  const copySource = extractFunctionSource(appJs, "copyClerkPrinterDiagnosticsRawJson");
  const clipboardSource = extractFunctionSource(appJs, "copyTextToClipboardWithFallback");
  const actionHandler = extractFunctionSource(appJs, "handleStoreMobilePricingPreviewAction");
  const selectorStart = appJs.indexOf('event.target.closest("[data-mobile-pricing-page]');
  const handlerCall = appJs.indexOf("handleStoreMobilePricingPreviewAction(button);", selectorStart);
  const listenerSource = appJs.slice(selectorStart, handlerCall + "handleStoreMobilePricingPreviewAction(button);".length);

  assert.match(diagnosticsSource, /清空 raw JSON/);
  assert.match(diagnosticsSource, /data-clerk-printer-json-clear/);
  assert.match(diagnosticsSource, /一键复制 raw JSON/);
  assert.match(diagnosticsSource, /data-clerk-printer-json-copy/);
  assert.match(listenerSource, /\[data-clerk-printer-json-clear\]/);
  assert.match(listenerSource, /\[data-clerk-printer-json-copy\]/);
  assert.match(actionHandler, /clerkPrinterJsonClear/);
  assert.match(actionHandler, /clearClerkPrinterDiagnosticsRawJson/);
  assert.match(actionHandler, /clerkPrinterJsonCopy/);
  assert.match(actionHandler, /copyClerkPrinterDiagnosticsRawJson/);
  assert.match(clearSource, /bluetoothPrinterRawStatusJson\s*=\s*""/);
  assert.match(clearSource, /raw JSON 已清空。/);
  assert.match(clearSource, /bluetoothPrinterDiagnosticsOpen\s*=\s*true/);
  assert.match(clearSource, /renderStoreMobilePricingPreviewPreservingScroll/);
  assert.doesNotMatch(clearSource, /bluetoothPrinterStatus|selected_printer|last_protocol_tested|disconnectPrinter|connection_status/);
  assert.match(copySource, /没有可复制的 raw JSON，请先刷新诊断状态。/);
  assert.match(copySource, /raw JSON 已复制。/);
  assert.match(copySource, /复制失败，请长按 raw JSON 手动复制。/);
  assert.match(copySource, /copyTextToClipboardWithFallback/);
  assert.match(copySource, /renderStoreMobilePricingPreviewPreservingScroll/);
  assert.match(clipboardSource, /navigator\.clipboard/);
  assert.match(clipboardSource, /writeText/);
  assert.match(clipboardSource, /document\.createElement\("textarea"\)/);
  assert.match(clipboardSource, /select\(\)/);
  assert.match(clipboardSource, /document\.execCommand\("copy"\)/);
  assert.match(appLegacyJs, /清空 raw JSON/);
  assert.match(appLegacyJs, /一键复制 raw JSON/);
  assert.match(appLegacyJs, /data-clerk-printer-json-clear/);
  assert.match(appLegacyJs, /data-clerk-printer-json-copy/);
  assert.match(appLegacyJs, /copyTextToClipboardWithFallback/);
});

test("clerk PDA diagnostics expose explicit S1 preview protocol buttons without online gating", () => {
  const diagnosticsSource = extractFunctionSource(appJs, "renderClerkPrinterDiagnosticDetails");
  const protocolConfigSource = extractFunctionSource(appJs, "getClerkS1PreviewProtocolDiagnostics");
  const visibleProtocolSource = extractFunctionSource(appJs, "getVisibleClerkS1PreviewProtocolDiagnostics");
  const forcePayloadSource = extractFunctionSource(appJs, "buildClerkS1PreviewProtocolDiagnosticPayload");
  const forceActionSource = extractFunctionSource(appJs, "sendClerkS1PreviewProtocolDiagnostic");
  const canRunSource = extractFunctionSource(appJs, "canRunClerkS1PreviewProtocolDiagnostic");
  const actionHandler = extractFunctionSource(appJs, "handleStoreMobilePricingPreviewAction");

  assert.match(protocolConfigSource, /测试 CTPL 不设标签模式/);
  assert.match(protocolConfigSource, /测试 CTPL 官方 Bitmap/);
  assert.match(protocolConfigSource, /测试 Raw TSPL/);
  assert.match(protocolConfigSource, /测试 Raw TSPL 最小文字/);
  assert.match(protocolConfigSource, /测试 Raw TSPL 黑块/);
  assert.match(diagnosticsSource, /data-clerk-bluetooth-printer-preview-protocol/);
  assert.doesNotMatch(diagnosticsSource, /强制发送 TSPL 测试标签/);
  assert.match(protocolConfigSource, /STORE_ITEM_LABEL_PREVIEW_TSPL/);
  assert.match(protocolConfigSource, /STORE_ITEM_LABEL_PREVIEW_CTPL_NO_LABEL_MODE/);
  assert.match(protocolConfigSource, /STORE_ITEM_LABEL_PREVIEW_CTPL_BITMAP_DEMO/);
  assert.match(diagnosticsSource, /last_preview_transport/);
  assert.match(diagnosticsSource, /last_preview_sdk_operations/);
  assert.match(diagnosticsSource, /last_preview_tspl_command/);
  assert.match(diagnosticsSource, /last_preview_tspl_lines/);
  assert.match(diagnosticsSource, /last_preview_tspl_bytes/);
  assert.match(protocolConfigSource, /printStoreItemLabelPreviewCtplNoLabelMode/);
  assert.match(protocolConfigSource, /printStoreItemLabelPreviewCtplBitmapDemo/);
  assert.match(protocolConfigSource, /printStoreItemLabelPreviewRawTspl/);
  assert.match(protocolConfigSource, /printS1RawTsplMinText/);
  assert.match(protocolConfigSource, /printS1RawTsplBlackBox/);
  assert.match(protocolConfigSource, /key:\s*"ctpl_no_label_mode"[\s\S]*?requiresPayload:\s*true/);
  assert.match(protocolConfigSource, /key:\s*"ctpl_bitmap_demo"[\s\S]*?requiresPayload:\s*true/);
  assert.match(protocolConfigSource, /key:\s*"raw_tspl"[\s\S]*?requiresPayload:\s*true/);
  assert.match(protocolConfigSource, /key:\s*"raw_tspl_min_text"[\s\S]*?requiresPayload:\s*false/);
  assert.match(protocolConfigSource, /key:\s*"raw_tspl_black_box"[\s\S]*?requiresPayload:\s*false/);
  assert.match(visibleProtocolSource, /alwaysVisible/);
  assert.match(visibleProtocolSource, /typeof bridge\[protocol\.method\] === "function"/);
  assert.match(diagnosticsSource, /getVisibleClerkS1PreviewProtocolDiagnostics\(status\)/);
  assert.match(canRunSource, /bridge\[protocol\.method\]/);
  assert.match(canRunSource, /selected_printer_address/);
  assert.doesNotMatch(canRunSource, /printer_online_status|official_sdk_connected|connection_status|canRunClerkBluetoothPrinterTestPrint|canRunClerkBluetoothPrinterPreviewPrint/);
  assert.match(forcePayloadSource, /payloadPrinterProfile \|\| "CHITENG_S1_OFFICIAL"/);
  assert.match(forcePayloadSource, /printer_profile:\s*printerProfile/);
  assert.match(forcePayloadSource, /label_template_size:\s*"40x30"/);
  assert.match(forcePayloadSource, /print_mode:\s*"preview_one"/);
  assert.match(forcePayloadSource, /machine_code:\s*"5261300000038"/);
  assert.match(forcePayloadSource, /barcode_value:\s*"5261300000038"/);
  assert.match(forcePayloadSource, /price_kes:\s*410/);
  assert.match(forcePayloadSource, /category_short:\s*"CARGO PANT"/);
  assert.match(forcePayloadSource, /grade:\s*"P"/);
  assert.match(forceActionSource, /protocol\.requiresPayload === false/);
  assert.match(forceActionSource, /bridge\[protocol\.method\]\(\)/);
  assert.match(forceActionSource, /bridge\[protocol\.method\]\(JSON\.stringify\(reportPayload\)\)/);
  assert.match(forceActionSource, /payload:\s*reportPayload/);
  assert.match(forceActionSource, /updateClerkBluetoothPrinterStatus/);
  assert.match(forceActionSource, /rawStatusJson:\s*formatClerkBluetoothPrinterRawStatusJson/);
  assert.match(forceActionSource, /pauseClerkBluetoothPrinterDiagnostics/);
  assert.match(forceActionSource, /测试已返回，请查看 raw JSON 和纸张结果。/);
  assert.doesNotMatch(forceActionSource, /printer_online_status|official_sdk_connected|connection_status|canRunClerkBluetoothPrinterTestPrint|canRunClerkBluetoothPrinterPreviewPrint/);
  assert.match(actionHandler, /clerkBluetoothPrinterPreviewProtocol/);
  assert.match(actionHandler, /sendClerkS1PreviewProtocolDiagnostic/);
  assert.match(appLegacyJs, /测试 CTPL 不设标签模式/);
  assert.match(appLegacyJs, /测试 CTPL 官方 Bitmap/);
  assert.match(appLegacyJs, /测试 Raw TSPL/);
  assert.match(appLegacyJs, /测试 Raw TSPL 最小文字/);
  assert.match(appLegacyJs, /测试 Raw TSPL 黑块/);
  assert.match(appLegacyJs, /sendClerkS1PreviewProtocolDiagnostic/);
  assert.match(appLegacyJs, /pauseClerkBluetoothPrinterDiagnostics/);
  assert.match(appLegacyJs, /STORE_ITEM_LABEL_PREVIEW_TSPL/);
  assert.match(appLegacyJs, /STORE_ITEM_LABEL_PREVIEW_CTPL_NO_LABEL_MODE/);
  assert.match(appLegacyJs, /STORE_ITEM_LABEL_PREVIEW_CTPL_BITMAP_DEMO/);
  assert.match(appLegacyJs, /requiresPayload:\s*false/);
  assert.match(appLegacyJs, /bridge\[protocol\.method\]\(\)/);
  assert.match(appLegacyJs, /JSON\.stringify\(reportPayload\)/);
  assert.doesNotMatch(appLegacyJs, /强制发送 TSPL 测试标签/);
});

test("clerk PDA diagnostics expose Urovo K300 protocol buttons for Android #29", () => {
  const diagnosticsSource = extractFunctionSource(appJs, "renderClerkPrinterDiagnosticDetails");
  const protocolConfigSource = extractFunctionSource(appJs, "getClerkS1PreviewProtocolDiagnostics");
  const visibleProtocolSource = extractFunctionSource(appJs, "getVisibleClerkS1PreviewProtocolDiagnostics");
  const payloadSource = extractFunctionSource(appJs, "buildClerkS1PreviewProtocolDiagnosticPayload");
  const actionSource = extractFunctionSource(appJs, "sendClerkS1PreviewProtocolDiagnostic");
  const canRunSource = extractFunctionSource(appJs, "canRunClerkS1PreviewProtocolDiagnostic");

  assert.match(diagnosticsSource, /Urovo K300 测试/);
  assert.match(diagnosticsSource, /urovoProtocols/);
  assert.match(diagnosticsSource, /data-clerk-bluetooth-printer-preview-protocol/);
  assert.match(diagnosticsSource, /urovo_printer_available/);
  assert.match(diagnosticsSource, /urovo_last_status_code/);
  assert.match(diagnosticsSource, /urovo_last_status_text/);
  assert.match(protocolConfigSource, /测试 Urovo 文字/);
  assert.match(protocolConfigSource, /测试 Urovo 黑块/);
  assert.match(protocolConfigSource, /测试 Urovo STORE_ITEM 预览/);
  assert.match(protocolConfigSource, /key:\s*"urovo_min_text"[\s\S]*?method:\s*"printUrovoK300MinText"[\s\S]*?expectedProtocol:\s*"UROVO_K300_MIN_TEXT"[\s\S]*?expectedTransport:\s*"UROVO_PRINTER_MANAGER"[\s\S]*?requiresPayload:\s*false[\s\S]*?requiresSelectedPrinter:\s*false/);
  assert.match(protocolConfigSource, /key:\s*"urovo_black_box"[\s\S]*?method:\s*"printUrovoK300BlackBox"[\s\S]*?expectedProtocol:\s*"UROVO_K300_BLACK_BOX"[\s\S]*?requiresPayload:\s*false[\s\S]*?requiresSelectedPrinter:\s*false/);
  assert.match(protocolConfigSource, /key:\s*"urovo_store_item_preview"[\s\S]*?method:\s*"printUrovoK300StoreItemPreview"[\s\S]*?expectedProtocol:\s*"UROVO_K300_STORE_ITEM_PREVIEW"[\s\S]*?requiresPayload:\s*true[\s\S]*?payloadPrinterProfile:\s*"UROVO_K300"[\s\S]*?requiresSelectedPrinter:\s*false/);
  assert.match(visibleProtocolSource, /typeof bridge\[protocol\.method\] === "function"/);
  assert.match(payloadSource, /payloadPrinterProfile/);
  assert.match(payloadSource, /printer_profile:\s*printerProfile/);
  assert.match(payloadSource, /machine_code:\s*"5261300000038"/);
  assert.match(payloadSource, /price_kes:\s*410/);
  assert.match(payloadSource, /category_short:\s*"CARGO PANT"/);
  assert.match(payloadSource, /grade:\s*"P"/);
  assert.match(canRunSource, /protocol\.requiresSelectedPrinter !== false/);
  assert.match(canRunSource, /requiresSelectedPrinter/);
  assert.match(actionSource, /buildClerkS1PreviewProtocolDiagnosticPayload\(protocol\)/);
  assert.match(actionSource, /bridge\[protocol\.method\]\(\)/);
  assert.match(actionSource, /bridge\[protocol\.method\]\(JSON\.stringify\(reportPayload\)\)/);
  assert.match(actionSource, /reportPdaDiagnosticEvent/);
  assert.match(actionSource, /pauseClerkBluetoothPrinterDiagnostics/);
  assert.match(appLegacyJs, /Urovo K300 测试/);
  assert.match(appLegacyJs, /测试 Urovo 文字/);
  assert.match(appLegacyJs, /测试 Urovo 黑块/);
  assert.match(appLegacyJs, /测试 Urovo STORE_ITEM 预览/);
  assert.match(appLegacyJs, /printUrovoK300MinText/);
  assert.match(appLegacyJs, /printUrovoK300BlackBox/);
  assert.match(appLegacyJs, /printUrovoK300StoreItemPreview/);
  assert.match(appLegacyJs, /payloadPrinterProfile:\s*"UROVO_K300"/);
});

test("clerk PDA diagnostics expose external K300 Bluetooth SPP protocol buttons for Android #33", () => {
  const diagnosticsSource = extractFunctionSource(appJs, "renderClerkPrinterDiagnosticDetails");
  const protocolConfigSource = extractFunctionSource(appJs, "getClerkS1PreviewProtocolDiagnostics");
  const visibleProtocolSource = extractFunctionSource(appJs, "getVisibleClerkS1PreviewProtocolDiagnostics");
  const actionSource = extractFunctionSource(appJs, "sendClerkS1PreviewProtocolDiagnostic");
  const payloadSource = extractFunctionSource(appJs, "buildClerkS1PreviewProtocolDiagnosticPayload");
  const canRunSource = extractFunctionSource(appJs, "canRunClerkS1PreviewProtocolDiagnostic");
  const statusSource = extractFunctionSource(appJs, "normalizeClerkBluetoothPrinterStatus");
  const defaultStatusSource = extractFunctionSource(appJs, "createDefaultClerkBluetoothPrinterStatus");
  const stateLabelSource = extractFunctionSource(appJs, "getClerkBluetoothPrinterStateLabel");
  const badgeSource = extractFunctionSource(appJs, "getClerkBluetoothPrinterBadgeText");
  const connectionPageSource = extractFunctionSource(appJs, "renderClerkPrinterConnectionPage");
  const connectHelperSource = extractFunctionSource(appJs, "connectClerkBluetoothPrinterViaBridge");
  const actionHandlerSource = extractFunctionSource(appJs, "handleStoreMobilePricingPreviewAction");

  assert.match(diagnosticsSource, /K300 蓝牙协议测试/);
  assert.match(diagnosticsSource, /k300BluetoothProtocols/);
  assert.match(diagnosticsSource, /data-clerk-bluetooth-printer-preview-protocol/);
  assert.match(diagnosticsSource, /k300_spp_available/);
  assert.match(diagnosticsSource, /k300_spp_last_checked_at/);
  assert.match(diagnosticsSource, /k300_spp_last_error/);
  assert.match(connectionPageSource, /k300_spp_available/);
  assert.doesNotMatch(connectionPageSource, /k300_spp_last_checked_at/);
  assert.match(connectionPageSource, /k300_spp_last_error/);
  assert.match(defaultStatusSource, /k300_spp_available:\s*false/);
  assert.match(defaultStatusSource, /k300_spp_last_checked_at:\s*""/);
  assert.match(defaultStatusSource, /k300_spp_last_error:\s*""/);
  assert.match(statusSource, /k300_spp_available:\s*getClerkBluetoothBooleanValue/);
  assert.match(protocolConfigSource, /测试 K300 蓝牙连接/);
  assert.match(protocolConfigSource, /key:\s*"k300_spp_connection"[\s\S]*?method:\s*"testK300SppConnection"[\s\S]*?expectedProtocol:\s*"K300_SPP_CONNECT_TEST"[\s\S]*?expectedTransport:\s*"K300_BLUETOOTH_SPP"[\s\S]*?requiresPayload:\s*false[\s\S]*?requiresSelectedPrinter:\s*true[\s\S]*?group:\s*"k300_bluetooth"/);
  assert.match(protocolConfigSource, /测试 K300 ESC\/POS 文字/);
  assert.match(protocolConfigSource, /测试 K300 CPCL 文字/);
  assert.match(protocolConfigSource, /连续测试 5 张 Code128/);
  assert.match(protocolConfigSource, /连续打印 5 张正式模板/);
  assert.match(protocolConfigSource, /连续打印 5 张 D 微调版/);
  assert.doesNotMatch(protocolConfigSource, /测试 K300 CPCL Code128/);
  assert.match(protocolConfigSource, /测试 Code128 宽条码/);
  assert.match(protocolConfigSource, /测试 Code128 高条码/);
  assert.match(protocolConfigSource, /测试 Code128 留白/);
  assert.match(protocolConfigSource, /测试 Code128 上移/);
  assert.match(protocolConfigSource, /K300 正式服装标签预览/);
  assert.match(protocolConfigSource, /测试 K300 TSPL 文字/);
  assert.match(protocolConfigSource, /测试 K300 TSPL 黑块/);
  assert.match(protocolConfigSource, /key:\s*"k300_escpos_min_text"[\s\S]*?method:\s*"printK300EscposMinText"[\s\S]*?expectedProtocol:\s*"K300_ESCPOS_MIN_TEXT"[\s\S]*?expectedTransport:\s*"K300_BLUETOOTH_SPP"[\s\S]*?requiresPayload:\s*false[\s\S]*?requiresSelectedPrinter:\s*true[\s\S]*?requiresK300SppAvailable:\s*true[\s\S]*?preferredPrinterPattern:\s*\/K300\|ZTO688\/i[\s\S]*?group:\s*"k300_bluetooth"/);
  assert.match(protocolConfigSource, /key:\s*"k300_cpcl_min_text"[\s\S]*?method:\s*"printK300CpclMinText"[\s\S]*?expectedProtocol:\s*"K300_CPCL_MIN_TEXT"[\s\S]*?requiresPayload:\s*false[\s\S]*?requiresSelectedPrinter:\s*true[\s\S]*?requiresK300SppAvailable:\s*true[\s\S]*?preferredPrinterPattern:\s*\/K300\/i/);
  assert.match(protocolConfigSource, /key:\s*"k300_cpcl_code128_test"[\s\S]*?label:\s*"连续测试 5 张 Code128"[\s\S]*?method:\s*"printK300CpclCode128Test"[\s\S]*?batchMethods:\s*\[/);
  assert.match(protocolConfigSource, /method:\s*"printK300CpclCode128Test"[\s\S]*?label:\s*"基础 Code128"[\s\S]*?variantKey:\s*"base"/);
  assert.match(protocolConfigSource, /method:\s*"printK300CpclCode128WideTest"[\s\S]*?label:\s*"宽条码"[\s\S]*?variantKey:\s*"wide"/);
  assert.match(protocolConfigSource, /method:\s*"printK300CpclCode128TallTest"[\s\S]*?label:\s*"高条码"[\s\S]*?variantKey:\s*"tall"/);
  assert.match(protocolConfigSource, /method:\s*"printK300CpclCode128QuietZoneTest"[\s\S]*?label:\s*"留白"[\s\S]*?variantKey:\s*"quiet_zone"/);
  assert.match(protocolConfigSource, /method:\s*"printK300CpclCode128CompactTopTest"[\s\S]*?label:\s*"上移"[\s\S]*?variantKey:\s*"compact_top"/);
  assert.match(protocolConfigSource, /key:\s*"k300_cpcl_raw_formal_batch"[\s\S]*?label:\s*"连续打印 5 张正式模板"[\s\S]*?method:\s*"printK300CpclRawPreview"[\s\S]*?expectedProtocol:\s*"K300_CPCL_RAW_PREVIEW"[\s\S]*?requiresPayload:\s*true[\s\S]*?requiresK300SppAvailable:\s*true/);
  assert.match(protocolConfigSource, /key:\s*"k300_cpcl_code128_wide_test"[\s\S]*?method:\s*"printK300CpclCode128WideTest"[\s\S]*?expectedProtocol:\s*"K300_CPCL_CODE128_WIDE_TEST"[\s\S]*?expectedTransport:\s*"K300_BLUETOOTH_SPP"[\s\S]*?requiresPayload:\s*false[\s\S]*?requiresSelectedPrinter:\s*true[\s\S]*?requiresK300SppAvailable:\s*true[\s\S]*?preferredPrinterPattern:\s*\/K300\|ZTO688\/i[\s\S]*?group:\s*"k300_bluetooth"/);
  assert.match(protocolConfigSource, /key:\s*"k300_cpcl_code128_tall_test"[\s\S]*?method:\s*"printK300CpclCode128TallTest"[\s\S]*?expectedProtocol:\s*"K300_CPCL_CODE128_TALL_TEST"[\s\S]*?requiresPayload:\s*false[\s\S]*?requiresK300SppAvailable:\s*true/);
  assert.match(protocolConfigSource, /key:\s*"k300_cpcl_code128_quiet_zone_test"[\s\S]*?method:\s*"printK300CpclCode128QuietZoneTest"[\s\S]*?expectedProtocol:\s*"K300_CPCL_CODE128_QUIET_ZONE_TEST"[\s\S]*?requiresPayload:\s*false[\s\S]*?requiresK300SppAvailable:\s*true/);
  assert.match(protocolConfigSource, /key:\s*"k300_cpcl_code128_compact_top_test"[\s\S]*?method:\s*"printK300CpclCode128CompactTopTest"[\s\S]*?expectedProtocol:\s*"K300_CPCL_CODE128_COMPACT_TOP_TEST"[\s\S]*?requiresPayload:\s*false[\s\S]*?requiresK300SppAvailable:\s*true/);
  assert.match(protocolConfigSource, /key:\s*"k300_cpcl_template_d_adjustment_batch"[\s\S]*?label:\s*"连续打印 5 张 D 微调版"[\s\S]*?method:\s*"printK300CpclRawBatch"[\s\S]*?expectedProtocol:\s*"K300_CPCL_RAW_BATCH"[\s\S]*?requiresPayload:\s*true[\s\S]*?requiresK300SppAvailable:\s*true/);
  assert.match(protocolConfigSource, /key:\s*"k300_40x30_retail_clothing_store_item"[\s\S]*?label:\s*"K300 正式服装标签预览"[\s\S]*?method:\s*"printK300CpclRawPreview"[\s\S]*?expectedProtocol:\s*"K300_CPCL_RAW_PREVIEW"[\s\S]*?expectedTransport:\s*"K300_BLUETOOTH_SPP"[\s\S]*?requiresPayload:\s*true[\s\S]*?rawCpclStoreItemPreview:\s*true[\s\S]*?templateName:\s*"K300_40X30_RETAIL_CLOTHING_STORE_ITEM"[\s\S]*?businessTemplate:\s*"retail_clothing_store_item"[\s\S]*?requiresSelectedPrinter:\s*true[\s\S]*?requiresK300SppAvailable:\s*true[\s\S]*?preferredPrinterPattern:\s*\/K300\|ZTO688\/i/);
  assert.match(protocolConfigSource, /key:\s*"k300_tspl_min_text"[\s\S]*?method:\s*"printK300TsplMinText"[\s\S]*?expectedProtocol:\s*"K300_TSPL_MIN_TEXT"[\s\S]*?requiresPayload:\s*false[\s\S]*?requiresSelectedPrinter:\s*true[\s\S]*?requiresK300SppAvailable:\s*true[\s\S]*?preferredPrinterPattern:\s*\/K300\/i/);
  assert.match(protocolConfigSource, /key:\s*"k300_tspl_black_box"[\s\S]*?method:\s*"printK300TsplBlackBox"[\s\S]*?expectedProtocol:\s*"K300_TSPL_BLACK_BOX"[\s\S]*?requiresPayload:\s*false[\s\S]*?requiresSelectedPrinter:\s*true[\s\S]*?requiresK300SppAvailable:\s*true[\s\S]*?preferredPrinterPattern:\s*\/K300\/i/);
  assert.match(visibleProtocolSource, /typeof bridge\[protocol\.method\] === "function"/);
  assert.match(canRunSource, /selected_printer_address/);
  assert.match(canRunSource, /preferredPrinterMatches/);
  assert.match(canRunSource, /selected_printer_name/);
  assert.match(canRunSource, /requiresK300SppAvailable/);
  assert.match(canRunSource, /normalizedStatus\.k300_spp_available === true/);
  assert.doesNotMatch(canRunSource, /urovo_printer_available|printer_online_status|official_sdk_connected/);
  assert.match(actionSource, /protocol\.requiresPayload === false/);
  assert.match(actionSource, /bridge\[protocol\.method\]\(\)/);
  assert.match(actionSource, /bridge\[protocol\.method\]\(JSON\.stringify\(reportPayload\)\)/);
  assert.match(actionSource, /sendClerkK300Code128BatchDiagnostic/);
  assert.match(payloadSource, /protocol\.payloadPrinterProfile \|\| "CHITENG_S1_OFFICIAL"/);
  assert.match(payloadSource, /printer_profile:\s*printerProfile/);
  assert.match(actionSource, /requiresK300SppAvailable/);
  assert.match(actionSource, /reportPdaDiagnosticEvent/);
  assert.match(actionSource, /pauseClerkBluetoothPrinterDiagnostics/);
  assert.match(stateLabelSource, /K300 蓝牙可用/);
  assert.match(stateLabelSource, /K300 蓝牙未连接 \/ 错误/);
  assert.match(badgeSource, /已连接 \$\{name\}/);
  assert.match(badgeSource, /K300 蓝牙未连接 \/ 错误/);
  assert.match(actionHandlerSource, /testK300SppConnection/);
  assert.match(actionHandlerSource, /connectClerkBluetoothPrinterViaBridge\(bridge, currentStatus\)/);
  assert.match(actionHandlerSource, /connectClerkBluetoothPrinterViaBridge\(bridge, nextStatus\)/);
  assert.match(connectHelperSource, /bridge\.connectPrinter\(JSON\.stringify\(config\)\)/);
  assert.match(connectHelperSource, /testK300SppConnection/);
  assert.match(connectHelperSource, /last_protocol_tested !== "K300_SPP_CONNECT_TEST"/);
  assert.match(connectHelperSource, /K300 蓝牙连接可用/);
  assert.match(appLegacyJs, /K300 蓝牙协议测试/);
  assert.match(appLegacyJs, /测试 K300 蓝牙连接/);
  assert.match(appLegacyJs, /测试 K300 ESC\/POS 文字/);
  assert.match(appLegacyJs, /测试 K300 CPCL 文字/);
  assert.match(appLegacyJs, /连续测试 5 张 Code128/);
  assert.match(appLegacyJs, /连续打印 5 张正式模板/);
  assert.match(appLegacyJs, /连续打印 5 张 D 微调版/);
  assert.match(appLegacyJs, /测试 Code128 宽条码/);
  assert.match(appLegacyJs, /测试 Code128 高条码/);
  assert.match(appLegacyJs, /测试 Code128 留白/);
  assert.match(appLegacyJs, /测试 Code128 上移/);
  assert.match(appLegacyJs, /K300 正式服装标签预览/);
  assert.match(appLegacyJs, /测试 K300 TSPL 文字/);
  assert.match(appLegacyJs, /测试 K300 TSPL 黑块/);
  assert.match(appLegacyJs, /testK300SppConnection/);
  assert.match(appLegacyJs, /printK300EscposMinText/);
  assert.match(appLegacyJs, /printK300CpclMinText/);
  assert.match(appLegacyJs, /printK300CpclCode128Test/);
  assert.match(appLegacyJs, /printK300CpclCode128WideTest/);
  assert.match(appLegacyJs, /printK300CpclCode128TallTest/);
  assert.match(appLegacyJs, /printK300CpclCode128QuietZoneTest/);
  assert.match(appLegacyJs, /printK300CpclCode128CompactTopTest/);
  assert.match(appLegacyJs, /printK300CpclRawPreview/);
  assert.match(appLegacyJs, /printK300CpclRawBatch/);
  assert.match(appLegacyJs, /sendClerkK300RawCpclFormalBatchDiagnostic/);
  assert.match(appLegacyJs, /sendClerkK300TemplateDAdjustmentBatchDiagnostic/);
  assert.match(appLegacyJs, /sendClerkK300Code128BatchDiagnostic/);
  assert.match(appLegacyJs, /K300_40X30_RETAIL_CLOTHING_STORE_ITEM/);
  assert.match(appLegacyJs, /retail_clothing_store_item/);
  assert.match(appLegacyJs, /printK300CpclStoreItemPreview/);
  assert.match(appLegacyJs, /printK300TsplMinText/);
  assert.match(appLegacyJs, /printK300TsplBlackBox/);
});

test("K300 Code128 batch diagnostic sequentially sends five existing bridge methods", () => {
  const batchSource = extractFunctionSource(appJs, "sendClerkK300Code128BatchDiagnostic");
  const delaySource = extractFunctionSource(appJs, "waitForClerkPrinterDiagnosticDelay");

  assert.match(batchSource, /正在连续打印 5 张 Code128 测试标签，请不要重复点击。/);
  assert.match(batchSource, /正在打印第 \$\{index \+ 1\}\/\$\{batchMethods\.length\} 张：\$\{variant\.label\}/);
  assert.match(batchSource, /5 张 Code128 测试标签已发送，请逐张扫码并记录结果。/);
  assert.match(batchSource, /CLERK_K300_CODE128_BATCH_DIAGNOSTIC_PAUSE_MS/);
  assert.match(batchSource, /CLERK_K300_CODE128_BATCH_STEP_DELAY_MS/);
  assert.match(batchSource, /waitForClerkPrinterDiagnosticDelay\(CLERK_K300_CODE128_BATCH_STEP_DELAY_MS\)/);
  assert.match(delaySource, /setTimeout\(resolve,\s*durationMs\)/);
  assert.match(batchSource, /for \(let index = 0; index < batchMethods\.length; index \+= 1\)/);
  assert.match(batchSource, /const variant = batchMethods\[index\]/);
  assert.match(batchSource, /bridge\[variant\.method\]\(\)/);
  assert.doesNotMatch(batchSource, /JSON\.stringify/);
  assert.match(batchSource, /protocol_key:\s*`k300_cpcl_code128_batch_\$\{variant\.variantKey\}`/);
  assert.match(batchSource, /event_type:\s*"s1_printer_diagnostic_click"/);
  assert.match(batchSource, /event_type:\s*"s1_printer_diagnostic_result"/);
  assert.match(batchSource, /event_type:\s*"s1_printer_diagnostic_error"/);
  assert.match(batchSource, /payload:\s*null/);
  assert.match(batchSource, /updateClerkBluetoothPrinterStatus/);
  assert.match(batchSource, /formatClerkBluetoothPrinterRawStatusJson/);
  assert.match(batchSource, /clerkBluetoothPrinterActionInFlight = true/);
  assert.match(batchSource, /clerkBluetoothPrinterActionInFlight = false/);
  assert.match(appLegacyJs, /正在连续打印 5 张 Code128 测试标签/);
  assert.match(appLegacyJs, /正在打印第/);
  assert.match(appLegacyJs, /k300_cpcl_code128_batch_\$\{variant\.variantKey\}/);
  assert.match(appLegacyJs, /variantKey:\s*"compact_top"/);
});

test("K300 raw CPCL formal batch sends five web-provided templates", () => {
  const protocolConfigSource = extractFunctionSource(appJs, "getClerkS1PreviewProtocolDiagnostics");
  const actionSource = extractFunctionSource(appJs, "sendClerkS1PreviewProtocolDiagnostic");
  const batchSource = extractFunctionSource(appJs, "sendClerkK300RawCpclFormalBatchDiagnostic");
  const delaySource = extractFunctionSource(appJs, "waitForClerkPrinterDiagnosticDelay");

  assert.match(appJs, /const CLERK_K300_RAW_CPCL_FORMAL_BATCH_DIAGNOSTIC_PAUSE_MS = 45000/);
  assert.match(appJs, /const CLERK_K300_RAW_CPCL_FORMAL_BATCH_STEP_DELAY_MS = 2500/);
  assert.match(protocolConfigSource, /label:\s*"连续打印 5 张正式模板"/);
  assert.match(protocolConfigSource, /method:\s*"printK300CpclRawPreview"/);
  assert.match(protocolConfigSource, /rawCpclTemplates:\s*\[/);
  assert.match(protocolConfigSource, /testName:\s*"formal_layout_A"/);
  assert.match(protocolConfigSource, /testName:\s*"formal_layout_B"/);
  assert.match(protocolConfigSource, /testName:\s*"formal_layout_C"/);
  assert.match(protocolConfigSource, /testName:\s*"formal_layout_D"/);
  assert.match(protocolConfigSource, /testName:\s*"formal_layout_E"/);
  assert.match(protocolConfigSource, /TEXT 7 0 14 8 KES 410/);
  assert.match(protocolConfigSource, /BARCODE 128 2 1 70 28 85 5261300000038/);
  assert.match(protocolConfigSource, /BARCODE 128 1 1 85 35 85 5261300000038/);
  assert.match(actionSource, /sendClerkK300RawCpclFormalBatchDiagnostic/);
  assert.match(batchSource, /正在连续打印 5 张正式模板，请不要重复点击。/);
  assert.match(batchSource, /正在打印第 \$\{index \+ 1\}\/\$\{templates\.length\} 张：\$\{template\.label\}/);
  assert.match(batchSource, /5 张正式模板已发送，请逐张扫码并检查版式。/);
  assert.match(batchSource, /CLERK_K300_RAW_CPCL_FORMAL_BATCH_DIAGNOSTIC_PAUSE_MS/);
  assert.match(batchSource, /CLERK_K300_RAW_CPCL_FORMAL_BATCH_STEP_DELAY_MS/);
  assert.match(batchSource, /waitForClerkPrinterDiagnosticDelay\(CLERK_K300_RAW_CPCL_FORMAL_BATCH_STEP_DELAY_MS\)/);
  assert.match(delaySource, /setTimeout\(resolve,\s*durationMs\)/);
  assert.match(batchSource, /bridge\[protocol\.method\]\(JSON\.stringify\(payload\)\)/);
  assert.match(batchSource, /label_template_size:\s*"40x30"/);
  assert.match(batchSource, /protocol:\s*"CPCL"/);
  assert.match(batchSource, /test_name:\s*template\.testName/);
  assert.match(batchSource, /cpcl_command:\s*template\.cpclCommand/);
  assert.match(batchSource, /protocol_key:\s*`k300_cpcl_raw_formal_\$\{template\.templateKey\}`/);
  assert.match(batchSource, /event_type:\s*"s1_printer_diagnostic_click"/);
  assert.match(batchSource, /event_type:\s*"s1_printer_diagnostic_result"/);
  assert.match(batchSource, /event_type:\s*"s1_printer_diagnostic_error"/);
  assert.doesNotMatch(batchSource, /throw error/);
  assert.match(batchSource, /clerkBluetoothPrinterActionInFlight = true/);
  assert.match(batchSource, /clerkBluetoothPrinterActionInFlight = false/);
  assert.match(appLegacyJs, /连续打印 5 张正式模板/);
  assert.match(appLegacyJs, /printK300CpclRawPreview/);
  assert.match(appLegacyJs, /formal_layout_E/);
});

test("K300 Template D adjustment batch uses printK300CpclRawBatch once with five labels", () => {
  const protocolConfigSource = extractFunctionSource(appJs, "getClerkS1PreviewProtocolDiagnostics");
  const actionSource = extractFunctionSource(appJs, "sendClerkS1PreviewProtocolDiagnostic");
  const batchSource = extractFunctionSource(appJs, "sendClerkK300TemplateDAdjustmentBatchDiagnostic");
  const payloadSource = extractFunctionSource(appJs, "buildClerkK300TemplateDAdjustmentBatchPayload");
  const defaultCpclSource = extractFunctionSource(appJs, "buildClerkK300StoreItemPreviewCpclCommand");

  assert.match(protocolConfigSource, /label:\s*"连续打印 5 张 D 微调版"/);
  assert.match(protocolConfigSource, /method:\s*"printK300CpclRawBatch"/);
  assert.match(protocolConfigSource, /expectedProtocol:\s*"K300_CPCL_RAW_BATCH"/);
  assert.match(protocolConfigSource, /preferredPrinterPattern:\s*\/K300\|ZTO688\/i/);
  assert.match(actionSource, /sendClerkK300TemplateDAdjustmentBatchDiagnostic/);

  assert.match(payloadSource, /batch_name:\s*"k300_template_d_adjustment_batch"/);
  assert.match(payloadSource, /labels:\s*\[/);
  assert.match(payloadSource, /test_name:\s*"template_d_01"/);
  assert.match(payloadSource, /test_name:\s*"template_d_05"/);
  assert.match(payloadSource, /BARCODE 128 1 1 85 35 79 5261300000038/);
  assert.match(payloadSource, /BARCODE 128 1 1 85 35 76 5261300000038/);
  assert.match(payloadSource, /BARCODE 128 1 1 78 35 76 5261300000038/);
  assert.match(payloadSource, /BARCODE 128 1 1 82 45 76 5261300000038/);
  assert.match(payloadSource, /BARCODE 128 1 1 85 35 74 5261300000038/);

  assert.match(batchSource, /正在一次性打印 5 张 D 微调模板，请不要重复点击。/);
  assert.match(batchSource, /5 张 D 微调模板已发送，请检查扫码和文字重叠情况。/);
  assert.match(batchSource, /bridge\[protocol\.method\]\(JSON\.stringify\(payload\)\)/);
  assert.doesNotMatch(batchSource, /for \(let index = 0; index < templates\.length/);
  assert.doesNotMatch(batchSource, /printK300CpclRawPreview/);
  assert.match(batchSource, /protocol_key:\s*"k300_template_d_adjustment_batch"/);
  assert.match(batchSource, /event_type:\s*"s1_printer_diagnostic_click"/);
  assert.match(batchSource, /event_type:\s*"s1_printer_diagnostic_result"/);
  assert.match(batchSource, /event_type:\s*"s1_printer_diagnostic_error"/);
  assert.match(batchSource, /k300_batch_last_error/);
  assert.match(batchSource, /CLERK_K300_RAW_CPCL_FORMAL_BATCH_DIAGNOSTIC_PAUSE_MS/);
  assert.match(batchSource, /clerkBluetoothPrinterActionInFlight = true/);
  assert.match(batchSource, /clerkBluetoothPrinterActionInFlight = false/);

  assert.match(defaultCpclSource, /TEXT 7 0 14 8 KES \$\{priceKes\}/);
  assert.match(defaultCpclSource, /TEXT 4 0 14 45 \$\{categoryGrade\}/);
  assert.match(defaultCpclSource, /BARCODE 128 1 1 78 35 76 \$\{machineCode\}/);
  assert.match(defaultCpclSource, /TEXT 4 0 60 180 \$\{machineCode\}/);
  assert.match(appLegacyJs, /连续打印 5 张 D 微调版/);
  assert.match(appLegacyJs, /k300_template_d_adjustment_batch/);
  assert.match(appLegacyJs, /BARCODE 128 1 1 78 35 76/);
  assert.match(appLegacyJs, /TEXT 4 0 60 180/);
});

test("K300 40x30 retail clothing STORE_ITEM template is locked to the successful D3 layout", () => {
  const profileSource = extractFunctionSource(appJs, "getClerkBluetoothPrinterProfileValue");
  const protocolConfigSource = extractFunctionSource(appJs, "getClerkS1PreviewProtocolDiagnostics");
  const payloadSource = extractFunctionSource(appJs, "buildClerkS1PreviewProtocolDiagnosticPayload");
  const mappingSource = extractFunctionSource(appJs, "getClerkK300RetailClothingStoreItemTemplateMapping");
  const payloadBuilderSource = extractFunctionSource(appJs, "buildClerkK300RetailClothingStoreItemPreviewPayload");
  const cpclSource = extractFunctionSource(appJs, "buildClerkK300StoreItemPreviewCpclCommand");
  const directPrintSource = extractFunctionSource(appJs, "printStoreMobileStoreItemLabelPreview");
  const readySource = extractFunctionSource(appJs, "canRunClerkK300RetailClothingStoreItemPreviewPrint");
  const actionSource = extractFunctionSource(appJs, "sendClerkS1PreviewProtocolDiagnostic");

  assert.match(profileSource, /K300\|ZTO688/);
  assert.match(protocolConfigSource, /key:\s*"k300_40x30_retail_clothing_store_item"/);
  assert.match(protocolConfigSource, /label:\s*"K300 正式服装标签预览"/);
  assert.match(protocolConfigSource, /method:\s*"printK300CpclRawPreview"/);
  assert.match(protocolConfigSource, /templateName:\s*"K300_40X30_RETAIL_CLOTHING_STORE_ITEM"/);
  assert.match(protocolConfigSource, /businessTemplate:\s*"retail_clothing_store_item"/);
  assert.match(protocolConfigSource, /preferredPrinterPattern:\s*\/K300\|ZTO688\/i/);
  assert.match(mappingSource, /K300_40X30_RETAIL_CLOTHING_STORE_ITEM/);
  assert.match(mappingSource, /retail_clothing_store_item/);
  assert.match(mappingSource, /label_template_size[\s\S]*40x30/);
  assert.match(mappingSource, /UROVO_K300/);
  assert.match(mappingSource, /K300\|ZTO688/);
  assert.match(payloadSource, /buildClerkK300RetailClothingStoreItemPreviewPayload/);
  assert.match(readySource, /k300_spp_available === true/);
  assert.match(readySource, /selected_printer_address/);
  assert.match(readySource, /getClerkK300RetailClothingStoreItemTemplateMapping/);
  assert.match(directPrintSource, /printK300CpclRawBatch/);
  assert.match(directPrintSource, /JSON\.stringify\(k300Payload\)/);
  assert.match(directPrintSource, /buildClerkK300RetailClothingStoreItemBatchPayload/);
  assert.match(directPrintSource, /请先测试 K300 蓝牙连接，确认 K300 SPP 可用。/);
  assert.match(payloadBuilderSource, /label_template_size:\s*"40x30"/);
  assert.match(payloadBuilderSource, /protocol:\s*"CPCL"/);
  assert.match(payloadBuilderSource, /template_name:\s*K300_40X30_RETAIL_CLOTHING_STORE_ITEM_TEMPLATE_NAME/);
  assert.match(payloadBuilderSource, /business_template:\s*RETAIL_CLOTHING_STORE_ITEM_BUSINESS_TEMPLATE/);
  assert.match(payloadBuilderSource, /test_name:\s*"k300_40x30_retail_clothing_store_item"/);
  assert.match(payloadBuilderSource, /cpcl_command:\s*buildClerkK300StoreItemPreviewCpclCommand/);
  assert.match(cpclSource, /TEXT 7 0 14 8 KES \$\{priceKes\}/);
  assert.match(cpclSource, /TEXT 4 0 14 45 \$\{categoryGrade\}/);
  assert.match(cpclSource, /BARCODE 128 1 1 78 35 76 \$\{machineCode\}/);
  assert.match(cpclSource, /TEXT 4 0 60 180 \$\{machineCode\}/);
  assert.match(cpclSource, /\[\^0-9\]/);
  assert.match(cpclSource, /\^5/);
  assert.match(actionSource, /bridge\[protocol\.method\]\(JSON\.stringify\(reportPayload\)\)/);
  assert.match(actionSource, /protocolKeyForReport/);
  assert.doesNotMatch(actionSource, /printed|sticker_confirmed|mark.*printed/i);
  assert.match(appLegacyJs, /k300_40x30_retail_clothing_store_item/);
  assert.match(appLegacyJs, /K300 正式服装标签预览/);
  assert.match(appLegacyJs, /K300_40X30_RETAIL_CLOTHING_STORE_ITEM/);
});

test("clerk PDA S1 protocol diagnostics pause printer polling for 15 seconds", () => {
  const stateSource = extractFunctionSource(appJs, "createStoreMobilePricingPreviewState");
  const pauseSource = extractFunctionSource(appJs, "pauseClerkBluetoothPrinterDiagnostics");
  const isPausedSource = extractFunctionSource(appJs, "isClerkBluetoothPrinterDiagnosticPollingPaused");
  const resumeSource = extractFunctionSource(appJs, "resumeClerkBluetoothPrinterDiagnostics");
  const startPollingSource = extractFunctionSource(appJs, "startClerkBluetoothPrinterStatusPolling");
  const pollSource = extractFunctionSource(appJs, "pollClerkBluetoothPrinterStatus");
  const pairedSource = extractFunctionSource(appJs, "refreshClerkBluetoothPairedPrinters");
  const discoverySource = extractFunctionSource(appJs, "startClerkBluetoothPrinterDiscovery");
  const diagnosticsSource = extractFunctionSource(appJs, "renderClerkPrinterDiagnosticDetails");
  const printerPageSource = extractFunctionSource(appJs, "renderClerkPrinterConnectionPage");
  const actionSource = extractFunctionSource(appJs, "sendClerkS1PreviewProtocolDiagnostic");

  assert.match(appJs, /const CLERK_S1_PROTOCOL_DIAGNOSTIC_PAUSE_MS = 15000/);
  assert.match(stateSource, /bluetoothPrinterDiagnosticPollingPausedUntil/);
  assert.match(pauseSource, /Date\.now\(\) \+ durationMs/);
  assert.match(pauseSource, /stopClerkBluetoothPrinterStatusPolling\(\)/);
  assert.match(pauseSource, /window\.setTimeout/);
  assert.match(pauseSource, /测试发送中，请等待 15 秒，不要重复点击。/);
  assert.match(resumeSource, /诊断轮询已恢复。/);
  assert.match(resumeSource, /startClerkBluetoothPrinterStatusPolling/);
  assert.match(isPausedSource, /bluetoothPrinterDiagnosticPollingPausedUntil/);
  assert.match(startPollingSource, /isClerkBluetoothPrinterDiagnosticPollingPaused\(\)/);
  assert.match(startPollingSource, /stopClerkBluetoothPrinterStatusPolling\(\)/);
  assert.match(pollSource, /isClerkBluetoothPrinterDiagnosticPollingPaused\(\)/);
  assert.match(pollSource, /return false/);
  assert.match(pairedSource, /isClerkBluetoothPrinterDiagnosticPollingPaused\(\)/);
  assert.match(discoverySource, /isClerkBluetoothPrinterDiagnosticPollingPaused\(\)/);
  assert.match(actionSource, /pauseClerkBluetoothPrinterDiagnostics/);
  assert.match(actionSource, /测试已返回，请查看 raw JSON 和纸张结果。/);
  assert.match(diagnosticsSource, /diagnosticsPaused/);
  assert.match(diagnosticsSource, /canRunProtocol = .*&& !diagnosticsPaused/);
  assert.match(diagnosticsSource, /data-clerk-printer-json-clear/);
  assert.match(diagnosticsSource, /data-clerk-printer-json-copy/);
  assert.doesNotMatch(diagnosticsSource, /data-clerk-printer-json-clear="true" disabled|data-clerk-printer-json-copy="true" disabled/);
  assert.match(printerPageSource, /diagnosticsPaused/);
  assert.match(printerPageSource, /data-clerk-bluetooth-printer-search="true" \$\{[^}]*diagnosticsPaused/);
  assert.match(printerPageSource, /data-clerk-bluetooth-printer-refresh="true" \$\{[^}]*diagnosticsPaused/);
  assert.match(appLegacyJs, /CLERK_S1_PROTOCOL_DIAGNOSTIC_PAUSE_MS = (15000|15e3)/);
  assert.match(appLegacyJs, /测试发送中，请等待 15 秒，不要重复点击。/);
  assert.match(appLegacyJs, /诊断轮询已恢复。/);
});

test("clerk PDA S1 protocol diagnostics report frontend events to backend", () => {
  const diagnosticsSource = extractFunctionSource(appJs, "renderClerkPrinterDiagnosticDetails");
  const reportSource = extractFunctionSource(appJs, "reportPdaDiagnosticEvent");
  const contextSource = extractFunctionSource(appJs, "buildPdaDiagnosticEventContext");
  const statusReportSource = extractFunctionSource(appJs, "reportCurrentPdaDiagnosticStatus");
  const actionSource = extractFunctionSource(appJs, "sendClerkS1PreviewProtocolDiagnostic");
  const actionHandler = extractFunctionSource(appJs, "handleStoreMobilePricingPreviewAction");
  const selectorStart = appJs.indexOf('event.target.closest("[data-mobile-pricing-page]');
  const handlerCall = appJs.indexOf("handleStoreMobilePricingPreviewAction(button);", selectorStart);
  const listenerSource = appJs.slice(selectorStart, handlerCall + "handleStoreMobilePricingPreviewAction(button);".length);

  assert.match(appJs, /function reportPdaDiagnosticEvent/);
  assert.match(reportSource, /\/diagnostics\/pda-events/);
  assert.match(reportSource, /method:\s*"POST"/);
  assert.match(reportSource, /catch/);
  assert.match(contextSource, /currentSession/);
  assert.match(contextSource, /getDirectLoopPdaRuntimeScriptVersion/);
  assert.match(contextSource, /DIRECT_LOOP_WEB_VERSION/);
  assert.match(contextSource, /getDirectLoopAndroidBridgeInfo/);
  assert.match(contextSource, /bluetoothPrinterStatus/);
  assert.match(actionSource, /event_type:\s*"s1_printer_diagnostic_click"/);
  assert.match(actionSource, /event_type:\s*"s1_printer_diagnostic_result"/);
  assert.match(actionSource, /event_type:\s*"s1_printer_diagnostic_error"/);
  assert.match(actionSource, /reportPdaDiagnosticEvent/);
  assert.match(actionSource, /before_status/);
  assert.match(actionSource, /android_result/);
  assert.match(actionSource, /after_status/);
  assert.match(actionSource, /error_message/);
  assert.ok(
    actionSource.indexOf('event_type: "s1_printer_diagnostic_click"') < actionSource.indexOf("await bridge[protocol.method]"),
    "click event should be reported before Android bridge call",
  );
  assert.match(diagnosticsSource, /诊断事件会上报到服务器，方便远程排查。/);
  assert.match(diagnosticsSource, /上报当前诊断状态/);
  assert.match(diagnosticsSource, /data-clerk-printer-report-current/);
  assert.match(statusReportSource, /event_type:\s*"pda_runtime_info"/);
  assert.match(statusReportSource, /bluetoothPrinterRawStatusJson/);
  assert.match(statusReportSource, /getDirectLoopAndroidBridgeInfo/);
  assert.match(actionHandler, /clerkPrinterReportCurrent/);
  assert.match(actionHandler, /reportCurrentPdaDiagnosticStatus/);
  assert.match(listenerSource, /data-clerk-printer-report-current/);
  assert.match(appLegacyJs, /reportPdaDiagnosticEvent/);
  assert.match(appLegacyJs, /s1_printer_diagnostic_click/);
  assert.match(appLegacyJs, /s1_printer_diagnostic_result/);
  assert.match(appLegacyJs, /s1_printer_diagnostic_error/);
  assert.match(appLegacyJs, /上报当前诊断状态/);
  assert.match(appLegacyJs, /诊断事件会上报到服务器，方便远程排查。/);
});

test("clerk PDA printer diagnostics open state and connected badge survive rerender", () => {
  const stateSource = extractFunctionSource(appJs, "createStoreMobilePricingPreviewState");
  const diagnosticsSource = extractFunctionSource(appJs, "renderClerkPrinterDiagnosticDetails");
  const toggleHandler = extractFunctionSource(appJs, "handleClerkPrinterDiagnosticsToggle");
  const badgeSource = extractFunctionSource(appJs, "renderClerkPrinterStatusBadge");

  assert.match(stateSource, /bluetoothPrinterDiagnosticsOpen:\s*false/);
  assert.match(diagnosticsSource, /data-clerk-printer-diagnostics="true"/);
  assert.match(diagnosticsSource, /state\.bluetoothPrinterDiagnosticsOpen\s*\?\s*"open"\s*:\s*""/);
  assert.match(toggleHandler, /bluetoothPrinterDiagnosticsOpen\s*=\s*Boolean\(details\.open\)/);
  assert.match(appJs, /document\.addEventListener\("toggle"/);
  assert.match(appJs, /handleClerkPrinterDiagnosticsToggle/);
  assert.match(badgeSource, /getClerkBluetoothPrinterBadgeText/);
  assert.match(stylesCss, /\.clerk-printer-status-badge\s*\{[\s\S]*?min-height:\s*34px/);
  assert.match(stylesCss, /\.clerk-printer-status-badge\s*\{[\s\S]*?max-width:\s*190px/);
  assert.match(stylesCss, /\.clerk-printer-status-badge\s*\{[\s\S]*?white-space:\s*normal/);
  assert.doesNotMatch(stylesCss, /\.clerk-printer-status-badge\s*\{[\s\S]*?text-overflow:\s*ellipsis/);
  assert.match(appLegacyJs, /bluetoothPrinterDiagnosticsOpen:\s*false/);
  assert.match(appLegacyJs, /handleClerkPrinterDiagnosticsToggle/);
});

test("clerk PDA printer diagnostics raw JSON scroll survives rerender", () => {
  const getJsonNode = extractFunctionSource(appJs, "getClerkPrinterDiagnosticsJsonNode");
  const captureJsonScroll = extractFunctionSource(appJs, "captureClerkPrinterDiagnosticsJsonScrollState");
  const restoreJsonScroll = extractFunctionSource(appJs, "restoreClerkPrinterDiagnosticsJsonScrollState");
  const preservingRender = extractFunctionSource(appJs, "renderStoreMobilePricingPreviewPreservingScroll");
  const diagnosticsSource = extractFunctionSource(appJs, "renderClerkPrinterDiagnosticDetails");
  const pollPrinter = extractFunctionSource(appJs, "pollClerkBluetoothPrinterStatus");

  assert.match(diagnosticsSource, /data-clerk-printer-diagnostics-json="true"/);
  assert.match(getJsonNode, /data-clerk-printer-diagnostics-json="true"/);
  assert.match(captureJsonScroll, /scrollTop/);
  assert.match(captureJsonScroll, /scrollLeft/);
  assert.match(restoreJsonScroll, /node\.scrollTop\s*=\s*Number\(scrollState\.scrollTop/);
  assert.match(restoreJsonScroll, /node\.scrollLeft\s*=\s*Number\(scrollState\.scrollLeft/);
  assert.match(preservingRender, /captureClerkPrinterDiagnosticsJsonScrollState/);
  assert.match(preservingRender, /restoreClerkPrinterDiagnosticsJsonScrollState/);
  assert.doesNotMatch(pollPrinter, /bluetoothPrinterDiagnosticsOpen\s*=/);
  assert.doesNotMatch(pollPrinter, /connectPrinter|printTestLabel|listPairedPrinters|startPrinterDiscovery|getDiscoveredPrinters/);
  assert.match(appLegacyJs, /data-clerk-printer-diagnostics-json="true"/);
  assert.match(appLegacyJs, /restoreClerkPrinterDiagnosticsJsonScrollState/);
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
  assert.match(legacyGuard, /生成本批商品码/);
  assert.match(legacyGuard, /查看标签预览/);
  assert.match(legacyGuard, /data-legacy-label-template-size="60x40"/);
  assert.match(legacyGuard, /data-legacy-label-template-size="40x30"/);
  assert.doesNotMatch(legacyGuard, /打印本组标签|已贴完本组|data-legacy-clerk-action="confirm"|data-legacy-clerk-action="print"/);
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
  assert.match(actionSource, /setStoreMobileActivePage\(state,\s*"verify"/);
});

test("backend task start button is included in the PDA pricing click listener", () => {
  const selectorStart = appJs.indexOf('event.target.closest("[data-mobile-pricing-page]');
  assert.notEqual(selectorStart, -1, "missing store mobile pricing click selector");
  const handlerCall = appJs.indexOf("handleStoreMobilePricingPreviewAction(button);", selectorStart);
  assert.notEqual(handlerCall, -1, "missing store mobile pricing handler call");
  const listenerSource = appJs.slice(selectorStart, handlerCall + "handleStoreMobilePricingPreviewAction(button);".length);

  assert.match(listenerSource, /\[data-mobile-pricing-select-backend-task\]/);
  assert.match(listenerSource, /\[data-clerk-bluetooth-printer-preview-protocol\]/);
  assert.doesNotMatch(listenerSource, /\[data-clerk-bluetooth-printer-force-tspl-preview\]/);
  assert.match(listenerSource, /\[data-clerk-printer-json-clear\]/);
  assert.match(listenerSource, /\[data-clerk-printer-json-copy\]/);
  assert.match(listenerSource, /event\.target\.closest/);
  assert.match(listenerSource, /handleStoreMobilePricingPreviewAction\(button\)/);
  assert.match(appLegacyJs, /\[data-mobile-pricing-select-backend-task\]/);
  assert.match(appLegacyJs, /\[data-clerk-bluetooth-printer-preview-protocol\]/);
  assert.doesNotMatch(appLegacyJs, /\[data-clerk-bluetooth-printer-force-tspl-preview\]/);
  assert.match(appLegacyJs, /\[data-clerk-printer-json-clear\]/);
  assert.match(appLegacyJs, /\[data-clerk-printer-json-copy\]/);
});

test("backend task selection loads selected SDP into the scan workflow", () => {
  const selectionSource = extractFunctionSource(appJs, "selectStoreMobileBackendTask");

  assert.match(selectionSource, /createStoreMobileSelectedSdpFromBackendTask/);
  assert.match(selectionSource, /buildStoreMobilePricingSourceLines/);
  assert.match(selectionSource, /state\.selectedSdp\s*=/);
  assert.match(selectionSource, /state\.pricingSourceLines\s*=/);
  assert.match(selectionSource, /state\.priceGroups\s*=\s*\[\]/);
  assert.match(selectionSource, /selectedBackendTaskCode/);
  assert.match(selectionSource, /setStoreMobileActivePage\(state,\s*"verify"/);
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
  assert.match(renderSource, /分批定价/);
  assert.match(renderSource, /创建新价格组/);
  assert.match(renderSource, /本批数量，可修改/);
  assert.match(renderSource, /先输入这一批数量，再选择售价创建价格组。/);
  assert.match(renderSource, /创建 P档价格组/);
  assert.match(renderSource, /创建 S档价格组/);
  assert.match(renderSource, /创建自定义价格组/);
  assert.match(renderSource, /已创建价格组/);
  assert.match(renderSource, /还没有价格组。请先输入数量并选择售价。/);
  assert.match(renderSource, /需补充分拣明细/);
  assert.match(renderSource, /data-mobile-pricing-create-batch/);
  assert.match(batchSource, /source_sdp_display_code/);
  assert.match(batchSource, /source_sdp_machine_code/);
  assert.match(batchSource, /CUSTOM/);
  assert.match(suggestedSource, /findApparelDefaultSalePriceRecord/);
});

test("pricing split page explains source line progress and created price groups in clerk language", () => {
  const renderCards = getExecutableBundle(
    [
      "getStoreMobileTaskGroups",
      "getStoreMobilePricingSourceLines",
      "getStoreMobileLineAllocatedQty",
      "getStoreMobileGroupGeneratedQty",
      "getStoreMobileLineGeneratedQty",
      "getStoreMobileSourceLineProgress",
      "getStoreMobilePriceGroupWorkflowStatus",
      "isStoreMobilePriceGroupLocked",
      "getStoreMobilePriceGroupStatus",
      "getStoreMobilePricingTone",
      "renderStoreMobilePricingBadge",
      "normalizeStoreItemForLabelPreview",
      "getStoreMobileGeneratedStoreItems",
      "getStoreMobilePendingPrintCount",
      "renderPriceGroupCards",
    ],
    `
    function escapeHtml(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    }
    function getStoreMobileSuggestedSalePrice(categoryMain, categorySub, grade) {
      if (grade === "P") return 410;
      if (grade === "S") return 312;
      return 0;
    }
    `,
    "renderPriceGroupCards",
  );
  const state = {
    selectedSdp: {
      backend_task: true,
      display_code: "SDP261290019",
      machine_code: "6261290019",
      total_count: 100,
    },
    pricingSourceLines: [{
      line_key: "line-100",
      category_main: "pants",
      category_sub: "cargo pant",
      category_short: "Cargo",
      total_qty: 100,
      item_count: 100,
      remaining_qty: 100,
      source_sdp_display_code: "SDP261290019",
      source_sdp_machine_code: "6261290019",
    }],
    priceGroups: [],
  };

  const emptyHtml = renderCards(state);
  assert.match(emptyHtml, /pants \/ cargo pant/);
  assert.match(emptyHtml, /总数[\s\S]*100/);
  assert.match(emptyHtml, /已分批[\s\S]*0/);
  assert.match(emptyHtml, /已生成[\s\S]*0/);
  assert.match(emptyHtml, /剩余[\s\S]*100/);
  assert.match(emptyHtml, /创建新价格组/);
  assert.match(emptyHtml, /本批数量，可修改/);
  assert.match(emptyHtml, /先输入这一批数量，再选择售价创建价格组。/);
  assert.match(emptyHtml, /创建 P档价格组 · KSh 410/);
  assert.match(emptyHtml, /创建 S档价格组 · KSh 312/);
  assert.match(emptyHtml, /创建自定义价格组/);
  assert.match(emptyHtml, /已创建价格组/);
  assert.match(emptyHtml, /还没有价格组。请先输入数量并选择售价。/);

  state.priceGroups = [{
    group_id: "BATCH-01-P",
    source_line_key: "line-100",
    category_main: "pants",
    category_sub: "cargo pant",
    category_short: "Cargo",
    tier: "P档",
    grade: "P",
    price_kes: 410,
    quantity: 30,
    status: "待生成 STORE_ITEM",
    workflow_status: "draft",
  }];
  const draftHtml = renderCards(state);
  assert.match(draftHtml, /剩余[\s\S]*70/);
  assert.match(draftHtml, /价格组 1/);
  assert.match(draftHtml, /P档 · KSh 410 · 30件/);
  assert.match(draftHtml, /状态：待生成商品码/);
  assert.match(draftHtml, /生成本批商品码/);
  assert.match(draftHtml, />删除</);

  state.priceGroups[0].status = "已生成 / 待打印";
  state.priceGroups[0].workflow_status = "locked";
  state.priceGroups[0].generated_store_items = Array.from({ length: 30 }, (_, index) => ({
    machine_code: `526129000${String(index + 1).padStart(3, "0")}`,
    print_status: "pending_print",
  }));
  const generatedHtml = renderCards(state);
  assert.match(generatedHtml, /状态：已生成 \/ 待打印/);
  assert.match(generatedHtml, /已生成：30件/);
  assert.match(generatedHtml, /查看标签预览/);
  assert.match(generatedHtml, /locked \/ 不可删除/);
  assert.doesNotMatch(generatedHtml, /data-mobile-pricing-delete-group/);
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

test("incremental pricing batches track allocated, generated, and remaining quantities per source line", () => {
  const helpers = getExecutableBundle(
    [
      "getStoreMobileTaskGroups",
      "getStoreMobilePricingSourceLines",
      "getStoreMobileLineAllocatedQty",
      "getStoreMobileGroupGeneratedQty",
      "getStoreMobileLineGeneratedQty",
      "getStoreMobileSourceLineProgress",
      "getStoreMobileLineRemainingQty",
      "validateStoreMobilePricingBatchQuantity",
      "createStoreMobilePricingBatch",
    ],
    `
    class HTMLInputElement {
      constructor(value, dataset) {
        this.value = String(value);
        this.dataset = dataset || {};
      }
    }
    var mockQuantity = 30;
    var mockCustomPrice = 999;
    var document = {
      querySelectorAll(selector) {
        if (selector === "[data-mobile-pricing-batch-qty]") {
          return [new HTMLInputElement(mockQuantity, { mobilePricingBatchQty: "line-100" })];
        }
        if (selector === "[data-mobile-pricing-custom-price]") {
          return [new HTMLInputElement(mockCustomPrice, { mobilePricingCustomPrice: "line-100" })];
        }
        return [];
      },
    };
    function getStoreMobileSuggestedSalePrice(categoryMain, categorySub, grade) {
      if (grade === "P") return 410;
      if (grade === "S") return 312;
      return 0;
    }
    `,
    `({
      setMockInputs(quantity, customPrice) {
        mockQuantity = quantity;
        mockCustomPrice = customPrice;
      },
      getStoreMobileSourceLineProgress,
      createStoreMobilePricingBatch,
    })`,
  );
  const state = {
    selectedSdp: {
      display_code: "SDP261290019",
      machine_code: "6261290019",
      total_count: 100,
      backend_task: true,
    },
    pricingSourceLines: [{
      line_key: "line-100",
      category_main: "Pants",
      category_sub: "Cargo Pant",
      item_count: 100,
      remaining_qty: 100,
      source_sdp_display_code: "SDP261290019",
      source_sdp_machine_code: "6261290019",
    }],
    priceGroups: [],
  };

  helpers.setMockInputs(30, 0);
  const pBatch = helpers.createStoreMobilePricingBatch(state, "line-100||P");
  assert.equal(pBatch.quantity, 30);
  assert.equal(pBatch.price_kes, 410);
  assert.equal(pBatch.workflow_status, "draft");
  assert.equal(pBatch.generated_store_items, undefined);
  assert.equal(state.priceGroups.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(helpers.getStoreMobileSourceLineProgress(state, "line-100"))), {
    source_line_key: "line-100",
    total_qty: 100,
    allocated_qty: 30,
    generated_qty: 0,
    remaining_qty: 70,
  });

  pBatch.workflow_status = "locked";
  pBatch.status = "已生成 / 待打印";
  pBatch.generated_store_items = Array.from({ length: 30 }, (_, index) => ({ machine_code: `526129000${String(index + 1).padStart(3, "0")}` }));
  assert.equal(helpers.getStoreMobileSourceLineProgress(state, "line-100").remaining_qty, 70);
  assert.equal(helpers.getStoreMobileSourceLineProgress(state, "line-100").generated_qty, 30);

  helpers.setMockInputs(50, 0);
  const sBatch = helpers.createStoreMobilePricingBatch(state, "line-100||S");
  assert.equal(sBatch.quantity, 50);
  assert.equal(sBatch.price_kes, 312);
  assert.equal(helpers.getStoreMobileSourceLineProgress(state, "line-100").remaining_qty, 20);

  helpers.setMockInputs(20, 275);
  const customBatch = helpers.createStoreMobilePricingBatch(state, "line-100||CUSTOM");
  assert.equal(customBatch.quantity, 20);
  assert.equal(customBatch.price_kes, 275);
  assert.equal(helpers.getStoreMobileSourceLineProgress(state, "line-100").remaining_qty, 0);
});

test("pricing batch creation refuses missing quantity input instead of using source line total", () => {
  const helpers = getExecutableBundle(
    [
      "getStoreMobileTaskGroups",
      "getStoreMobilePricingSourceLines",
      "getStoreMobileLineAllocatedQty",
      "getStoreMobileLineRemainingQty",
      "validateStoreMobilePricingBatchQuantity",
      "createStoreMobilePricingBatch",
    ],
    `
    class HTMLInputElement {
      constructor(value, dataset) {
        this.value = String(value);
        this.dataset = dataset || {};
      }
    }
    var includeQuantityInput = false;
    var document = {
      querySelectorAll(selector) {
        if (selector === "[data-mobile-pricing-batch-qty]") {
          return includeQuantityInput ? [new HTMLInputElement(20, { mobilePricingBatchQty: "line-100" })] : [];
        }
        if (selector === "[data-mobile-pricing-custom-price]") {
          return [new HTMLInputElement(0, { mobilePricingCustomPrice: "line-100" })];
        }
        return [];
      },
    };
    function getStoreMobileSuggestedSalePrice(categoryMain, categorySub, grade) {
      return grade === "P" ? 410 : 312;
    }
    `,
    "({ createStoreMobilePricingBatch })",
  );
  const state = {
    selectedSdp: {
      display_code: "SDP261290018",
      machine_code: "6261290018",
      total_count: 100,
      backend_task: true,
    },
    pricingSourceLines: [{
      line_key: "line-100",
      category_main: "pants",
      category_sub: "cargo pant",
      item_count: 100,
      remaining_qty: 100,
    }],
    priceGroups: [],
  };

  const result = helpers.createStoreMobilePricingBatch(state, "line-100||P");

  assert.equal(result, null);
  assert.equal(state.priceGroups.length, 0);
  assert.match(state.pricingSourceLineMessage, /请输入本批数量/);
});

test("STORE_ITEM generation request uses exact pricing group quantity and preview counts", async () => {
  const helpers = getExecutableBundle(
    [
      "normalizeStoreMobilePdaPage",
      "getStoreMobilePdaPageSnapshot",
      "pushStoreMobilePdaBrowserHistory",
      "setStoreMobileActivePage",
      "getStoreMobileTaskGroups",
      "getStoreMobilePricingSourceLines",
      "getStoreMobileLineAllocatedQty",
      "getStoreMobileGroupGeneratedQty",
      "getStoreMobileLineGeneratedQty",
      "getStoreMobileSourceLineProgress",
      "getStoreMobileLineRemainingQty",
      "validateStoreMobilePricingBatchQuantity",
      "createStoreMobilePricingBatch",
      "isStoreMobileTaskComplete",
      "getStoreMobileTaskStatus",
      "getStoreMobileTaskTotals",
      "syncStoreMobileTaskCounters",
      "getStoreMobilePricingTypeForGroup",
      "getStoreMobileGeneratedStoreItems",
      "getStoreMobilePendingPrintCount",
      "getStoreItemLabelSizeConfig",
      "applyStoreMobileLabelSize",
      "normalizeStoreItemForLabelPreview",
      "buildStoreItemLabelPreviewPayload",
      "renderCode128BarcodePreview",
      "renderStoreItemLabelPreview",
      "generateStoreMobileBatchStoreItems",
    ],
    `
    class HTMLInputElement {
      constructor(value, dataset) {
        this.value = String(value);
        this.dataset = dataset || {};
      }
    }
    var mockQuantity = 20;
    var mockCustomPrice = 0;
    var capturedRequests = [];
    var currentSession = { user: { username: "Austin", store_code: "UTAWALA" } };
    var document = {
      querySelectorAll(selector) {
        if (selector === "[data-mobile-pricing-batch-qty]") {
          return [new HTMLInputElement(mockQuantity, { mobilePricingBatchQty: "line-100" })];
        }
        if (selector === "[data-mobile-pricing-custom-price]") {
          return [new HTMLInputElement(mockCustomPrice, { mobilePricingCustomPrice: "line-100" })];
        }
        return [];
      },
    };
    function escapeHtml(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    }
    function getStoreMobileSuggestedSalePrice(categoryMain, categorySub, grade) {
      if (grade === "P") return 410;
      if (grade === "S") return 312;
      return 0;
    }
    function getCurrentStoreCodeFallback() {
      return "UTAWALA";
    }
    function getCurrentStoreWorkerFallback() {
      return "Austin";
    }
    async function request(url, options) {
      const payload = JSON.parse(options.body);
      capturedRequests.push({ url, payload });
      return {
        pricing_batch_id: payload.pricing_batch_id,
        store_items: Array.from({ length: payload.quantity }, (_, index) => ({
          machine_code: "526129" + String(capturedRequests.length).padStart(2, "0") + String(index + 1).padStart(4, "0"),
          barcode_value: "526129" + String(capturedRequests.length).padStart(2, "0") + String(index + 1).padStart(4, "0"),
          sale_price_kes: payload.sale_price_kes,
          category_short: payload.category_short,
          grade: payload.grade,
          pricing_type: payload.pricing_type,
          print_status: "pending_print",
          sticker_status: "pending",
        })),
        tokens: [],
        pending_print_count: payload.quantity,
      };
    }
    `,
    `({
      setMockQuantity(value) {
        mockQuantity = value;
      },
      capturedRequests,
      createStoreMobilePricingBatch,
      generateStoreMobileBatchStoreItems,
      getStoreMobileSourceLineProgress,
      buildStoreItemLabelPreviewPayload,
      renderStoreItemLabelPreview,
    })`,
  );
  const state = {
    selectedSdp: {
      display_code: "SDP261290018",
      machine_code: "6261290018",
      total_count: 100,
      store_name: "UTAWALA",
      assigned_clerk: "Austin",
      backend_task: true,
    },
    pricingSourceLines: [{
      line_key: "line-100",
      category_main: "pants",
      category_sub: "cargo pant",
      category_short: "CARGO PANT",
      item_count: 100,
      remaining_qty: 100,
      source_sdp_display_code: "SDP261290018",
      source_sdp_machine_code: "6261290018",
    }],
    priceGroups: [],
    generatedRanges: {},
  };

  helpers.setMockQuantity(20);
  const pBatch = helpers.createStoreMobilePricingBatch(state, "line-100||P");
  assert.equal(pBatch.quantity, 20);
  assert.notEqual(pBatch.quantity, 100);
  assert.equal(pBatch.requested_quantity ?? pBatch.quantity, 20);
  assert.equal(state.priceGroups.length, 1);
  assert.equal(helpers.getStoreMobileSourceLineProgress(state, "line-100").allocated_qty, 20);
  assert.equal(helpers.getStoreMobileSourceLineProgress(state, "line-100").remaining_qty, 80);
  assert.equal(pBatch.generated_store_items, undefined);

  await helpers.generateStoreMobileBatchStoreItems(state, pBatch.group_id);
  assert.equal(helpers.capturedRequests[0].url, "/store-items/generate-from-pricing-batch");
  assert.equal(helpers.capturedRequests[0].payload.quantity, 20);
  assert.equal(helpers.capturedRequests[0].payload.sale_price_kes, 410);
  assert.equal(helpers.capturedRequests[0].payload.pricing_batch_id, pBatch.group_id);
  assert.equal(helpers.capturedRequests[0].payload.source_sdp_display_code, "SDP261290018");
  assert.equal(pBatch.generated_store_items.length, 20);
  assert.match(helpers.renderStoreItemLabelPreview(pBatch.generated_store_items, "60x40", pBatch), /第 1 \/ 20 张/);
  assert.equal(helpers.buildStoreItemLabelPreviewPayload("60x40", pBatch.generated_store_items, pBatch).labels.length, 20);

  helpers.setMockQuantity(30);
  const sBatch = helpers.createStoreMobilePricingBatch(state, "line-100||S");
  assert.equal(sBatch.quantity, 30);
  assert.equal(helpers.getStoreMobileSourceLineProgress(state, "line-100").remaining_qty, 50);
  await helpers.generateStoreMobileBatchStoreItems(state, sBatch.group_id);
  assert.equal(helpers.capturedRequests[1].payload.quantity, 30);
  assert.equal(helpers.capturedRequests[1].payload.sale_price_kes, 312);
  assert.equal(sBatch.generated_store_items.length, 30);
  assert.match(helpers.renderStoreItemLabelPreview(sBatch.generated_store_items, "60x40", sBatch), /第 1 \/ 30 张/);
  assert.equal(helpers.buildStoreItemLabelPreviewPayload("60x40", sBatch.generated_store_items, sBatch).labels.length, 30);
});

test("generated pricing groups are locked and draft pricing groups remain deletable", () => {
  const lockHelpers = getExecutableBundle(
    ["getStoreMobileGeneratedStoreItems", "getStoreMobileGroupGeneratedQty", "isStoreMobilePriceGroupLocked", "getStoreMobilePriceGroupWorkflowStatus"],
    "",
    "({ isStoreMobilePriceGroupLocked, getStoreMobilePriceGroupWorkflowStatus })",
  );
  const cardSource = extractFunctionSource(appJs, "renderPriceGroupCards");
  const actionSource = extractFunctionSource(appJs, "handleStoreMobilePricingPreviewAction");

  assert.equal(lockHelpers.getStoreMobilePriceGroupWorkflowStatus({ workflow_status: "draft", status: "待生成 STORE_ITEM" }), "draft");
  assert.equal(lockHelpers.isStoreMobilePriceGroupLocked({ workflow_status: "draft", status: "待生成 STORE_ITEM" }), false);
  assert.equal(lockHelpers.getStoreMobilePriceGroupWorkflowStatus({ workflow_status: "generated", generated_store_items: [{ machine_code: "526129000123" }] }), "generated");
  assert.equal(lockHelpers.isStoreMobilePriceGroupLocked({ workflow_status: "generated", generated_store_items: [{ machine_code: "526129000123" }] }), true);
  assert.equal(lockHelpers.getStoreMobilePriceGroupWorkflowStatus({ workflow_status: "preview" }), "preview");
  assert.equal(lockHelpers.getStoreMobilePriceGroupWorkflowStatus({ workflow_status: "locked" }), "locked");
  assert.match(cardSource, /data-mobile-pricing-delete-group/);
  assert.match(cardSource, /isStoreMobilePriceGroupLocked/);
  assert.match(actionSource, /deleteStoreMobilePricingBatch/);
});

test("real backend SDP batch generation uses pricing batch STORE_ITEM API and stays preview-only", () => {
  const generateSource = extractFunctionSource(appJs, "generateStoreMobileBatchStoreItems");
  const previewActionSource = extractFunctionSource(appJs, "prepareStoreMobileBatchLabelPreview");
  const actionSource = extractFunctionSource(appJs, "handleStoreMobilePricingPreviewAction");

  assert.match(generateSource, /store-items\/generate-from-pricing-batch/);
  assert.match(generateSource, /pricing_batch_id/);
  assert.match(generateSource, /source_line_key/);
  assert.match(generateSource, /sale_price_kes/);
  assert.match(generateSource, /pricing_type/);
  assert.match(generateSource, /category_short/);
  assert.match(generateSource, /assigned_clerk/);
  assert.match(generateSource, /source_sdp_display_code/);
  assert.match(generateSource, /生成数量异常，请返回重新创建价格组。/);
  assert.match(previewActionSource, /buildStoreItemLabelPreviewPayload/);
  assert.match(previewActionSource, /preview_only/);
  assert.doesNotMatch(previewActionSource, /print-jobs\/item-tokens|DirectLoopPdaPrinter|printTestLabel|sticker_confirmed|marked.*printed/i);
  assert.doesNotMatch(generateSource, /print-jobs\/item-tokens|DirectLoopPdaPrinter|printTestLabel/);
  assert.match(actionSource, /generateStoreMobileBatchStoreItems/);
  assert.match(actionSource, /prepareStoreMobileBatchLabelPreview/);
});

test("generated STORE_ITEM list shows only clerk-facing item fields", () => {
  const listSource = extractFunctionSource(appJs, "renderStoreMobileGeneratedStoreItemList");
  const renderList = getExecutableFunction(
    "renderStoreMobileGeneratedStoreItemList",
    `
    function escapeHtml(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    }
    ${extractFunctionSource(appJs, "normalizeStoreItemForLabelPreview")}
    `,
  );
  const html = renderList({
    generated_store_items: [{
      machine_code: "526129000123",
      barcode_value: "526129000123",
      sale_price_kes: 450,
      category_short: "Cargo",
      grade: "P",
      print_status: "pending_print",
      sticker_status: "pending",
      display_code: "STOREITEM26129000123",
      source_sdp_display_code: "SDP261290019",
      parent_sdo_display_code: "SDO260504008",
      transfer_no: "TO202605-001",
      pricing_batch_id: "PB-1",
      store_code: "UTAWALA",
    }],
  });

  assert.match(listSource, /machine_code/);
  assert.match(listSource, /price_kes/);
  assert.match(listSource, /category_short/);
  assert.match(listSource, /print_status/);
  assert.match(listSource, /sticker_status/);
  assert.match(html, /526129000123/);
  assert.match(html, /KES 450/);
  assert.match(html, /Cargo/);
  assert.match(html, /pending_print/);
  assert.match(html, /pending/);
  assert.doesNotMatch(html, /SDO260504008|SDP261290019|SDB|LPK|TO202605-001|PB-1|UTAWALA|STOREITEM26129000123/);
});

test("STORE_ITEM label preview payload uses machine_code and excludes source chain fields", () => {
  const buildPayload = getExecutableFunction(
    "buildStoreItemLabelPreviewPayload",
    `
    ${extractFunctionSource(appJs, "getStoreItemLabelSizeConfig")}
    ${extractFunctionSource(appJs, "normalizeStoreItemForLabelPreview")}
    `,
  );
  const payload = buildPayload("60x40", [{
    machine_code: "526129000123",
    barcode_value: "SHOULD-NOT-WIN",
    sale_price_kes: 450,
    category_short: "Cargo",
    grade: "P",
    display_code: "STOREITEM26129000123",
    source_sdp_display_code: "SDP261290019",
    parent_sdo_display_code: "SDO260504008",
    source_code: "SDB-TO202605-002",
    transfer_no: "TO202605-001",
    pricing_batch_id: "PB-1",
    store_code: "UTAWALA",
  }]);

  assert.deepEqual(JSON.parse(JSON.stringify(payload)), {
    printer_profile: "CHITENG_S1_OFFICIAL",
    label_template_size: "60x40",
    label_width_mm: 60,
    label_height_mm: 40,
    print_mode: "preview_only",
    labels: [{
      machine_code: "526129000123",
      barcode_value: "526129000123",
      price_kes: 450,
      category_short: "Cargo",
      grade: "P",
    }],
  });
  assert.doesNotMatch(JSON.stringify(payload), /SDO|SDP|SDB|LPK|transfer_no|pricing_batch_id|source_sdp|store_code|display_code|STOREITEM|UTAWALA/);
});

test("STORE_ITEM one-label preview print payload keeps only the first customer label", () => {
  const buildPrintPayload = getExecutableFunction(
    "buildStoreItemLabelPreviewPrintPayload",
    `
    ${extractFunctionSource(appJs, "getStoreItemLabelSizeConfig")}
    ${extractFunctionSource(appJs, "normalizeStoreItemForLabelPreview")}
    ${extractFunctionSource(appJs, "buildStoreItemLabelPreviewPayload")}
    `,
  );
  const payload = buildPrintPayload("40x30", [{
    machine_code: "526129000123",
    sale_price_kes: 450,
    category_short: "Cargo",
    grade: "P",
    display_code: "STOREITEM26129000123",
    source_sdp_display_code: "SDP261290019",
    parent_sdo_display_code: "SDO260504008",
    source_code: "SDB-TO202605-002",
    transfer_no: "TO202605-001",
    pricing_batch_id: "PB-1",
    store_code: "UTAWALA",
  }, {
    machine_code: "526129000124",
    sale_price_kes: 450,
    category_short: "Cargo",
    grade: "P",
  }]);

  assert.deepEqual(JSON.parse(JSON.stringify(payload)), {
    printer_profile: "CHITENG_S1_OFFICIAL",
    label_template_size: "40x30",
    label_width_mm: 40,
    label_height_mm: 30,
    print_mode: "preview_one",
    labels: [{
      machine_code: "526129000123",
      barcode_value: "526129000123",
      price_kes: 450,
      category_short: "Cargo",
      grade: "P",
    }],
  });
  assert.equal(payload.labels.length, 1);
  assert.doesNotMatch(JSON.stringify(payload), /526129000124|SDO|SDP|SDB|LPK|transfer_no|pricing_batch_id|source_sdp|store_code|display_code|STOREITEM|UTAWALA/);
});

test("STORE_ITEM label preview renders one Code128 barcode under text for both sizes", () => {
  const renderPreview = getExecutableFunction(
    "renderStoreItemLabelPreview",
    `
    function escapeHtml(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    }
    ${extractFunctionSource(appJs, "getStoreItemLabelSizeConfig")}
    ${extractFunctionSource(appJs, "normalizeStoreItemForLabelPreview")}
    ${extractFunctionSource(appJs, "buildStoreItemLabelPreviewPayload")}
    ${extractFunctionSource(appJs, "renderCode128BarcodePreview")}
    `,
  );
  const items = [{
    machine_code: "526129000123",
    sale_price_kes: 450,
    category_short: "Cargo Pant",
    grade: "P",
    source_sdp_display_code: "SDP261290019",
    parent_sdo_display_code: "SDO260504008",
    transfer_no: "TO202605-001",
    pricing_batch_id: "PB-1",
    store_code: "UTAWALA",
    display_code: "STOREITEM26129000123",
  }];
  const html60 = renderPreview(items, "60x40");
  const html40 = renderPreview(items, "40x30");

  for (const html of [html60, html40]) {
    assert.equal((html.match(/data-code128-barcode=/g) || []).length, 1);
    assert.match(html, /Code128/);
    assert.doesNotMatch(html, /QR|qrcode|SDO260504008|SDP261290019|SDB|LPK|TO202605-001|PB-1|UTAWALA|STOREITEM26129000123|source_sdp|pricing_batch_id|transfer_no|store_code|display_code/);
    assert.ok(html.indexOf("Cargo Pant") < html.indexOf("KES 450"), "category/grade must render above price");
    assert.ok(html.indexOf("KES 450") < html.indexOf("data-code128-barcode"), "price must render above barcode");
    assert.ok(html.indexOf("data-code128-barcode") < html.lastIndexOf("526129000123"), "machine_code text must render below barcode");
  }
  assert.match(html60, /data-label-template-size="60x40"/);
  assert.match(html40, /data-label-template-size="40x30"/);
  assert.match(stylesCss, /\.store-item-label-header[\s\S]*?order:\s*1/);
  assert.match(stylesCss, /\.store-item-label-price[\s\S]*?order:\s*2/);
  assert.match(stylesCss, /\.store-item-code128-barcode[\s\S]*?order:\s*3/);
  assert.match(stylesCss, /\.store-item-label-machine-code[\s\S]*?order:\s*4/);
});

test("legacy PDA bundle contains the same STORE_ITEM list and label preview logic", () => {
  const legacyPreviewSource = extractFunctionSource(appLegacyJs, "prepareStoreMobileBatchLabelPreview");
  const legacyQueueSource = extractFunctionSource(appLegacyJs, "queueStoreMobileBatchPrintJobs");
  const legacyActionSource = extractFunctionSource(appLegacyJs, "handleStoreMobilePricingPreviewAction");
  const legacyPreviewBranch = legacyActionSource.slice(legacyActionSource.indexOf("if (previewLabels)"), legacyActionSource.indexOf("if (labelSize)"));

  assert.match(appLegacyJs, /function renderStoreMobileGeneratedStoreItemList/);
  assert.match(appLegacyJs, /function buildStoreItemLabelPreviewPayload/);
  assert.match(appLegacyJs, /function buildStoreItemLabelPreviewPrintPayload/);
  assert.match(appLegacyJs, /function renderStoreItemLabelPreview/);
  assert.match(appLegacyJs, /data-code128-barcode/);
  assert.match(appLegacyJs, /label_template_size/);
  assert.match(appLegacyJs, /preview_only/);
  assert.match(appLegacyJs, /preview_one/);
  assert.match(appLegacyJs, /printStoreItemLabelPreview/);
  assert.doesNotMatch(appLegacyJs, /direct_print|printStoreItemLabels/);
  assert.match(appLegacyJs, /生成本批商品码/);
  assert.match(appLegacyJs, /查看标签预览/);
  assert.doesNotMatch(legacyPreviewBranch, /data-mobile-pricing-confirm-stickers|DirectLoopPdaPrinter|printTestLabel|print-jobs\/item-tokens/);
  assert.doesNotMatch(legacyPreviewSource, /DirectLoopPdaPrinter|printTestLabel|print-jobs\/item-tokens/);
  assert.doesNotMatch(legacyQueueSource, /DirectLoopPdaPrinter|printTestLabel|print-jobs\/item-tokens/);
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
  assert.match(submitSource, /setStoreMobileActivePage\(state,\s*"pricing_split"/);
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

test("STORE_ITEM label preview supports 60x40 and 40x30 with batch print action", () => {
  const printPanelSource = extractFunctionSource(appJs, "renderPriceGroupPrintPanel");
  const queueSource = extractFunctionSource(appJs, "renderPriceGroupPrintQueue");
  const stateSource = extractFunctionSource(appJs, "createStoreMobilePricingPreviewState");
  const cardSource = extractFunctionSource(appJs, "renderPriceGroupCards");
  const sizeSource = extractFunctionSource(appJs, "getStoreItemLabelSizeConfig");
  const payloadSource = extractFunctionSource(appJs, "buildStoreItemLabelPreviewPayload");
  const printPayloadSource = extractFunctionSource(appJs, "buildStoreItemLabelPreviewPrintPayload");

  assert.match(printPanelSource, /data-mobile-pricing-label-size="60x40"/);
  assert.match(printPanelSource, /data-mobile-pricing-label-size="40x30"/);
  assert.match(printPanelSource, /本批标签预览/);
  assert.match(printPanelSource, /renderStoreItemLabelPreview/);
  assert.match(printPanelSource, /buildStoreItemLabelPreviewPrintPayload/);
  assert.match(sizeSource, /label_template_size:\s*"60x40"[\s\S]*label_width_mm:\s*60[\s\S]*label_height_mm:\s*40/);
  assert.match(sizeSource, /label_template_size:\s*"40x30"[\s\S]*label_width_mm:\s*40[\s\S]*label_height_mm:\s*30/);
  assert.match(payloadSource, /print_mode:\s*"preview_only"/);
  assert.match(payloadSource, /printer_profile:\s*"CHITENG_S1_OFFICIAL"/);
  assert.match(printPayloadSource, /print_mode:\s*"preview_one"/);
  assert.match(printPayloadSource, /slice\(0,\s*1\)/);
  assert.match(printPanelSource, /打印本批标签/);
  assert.match(printPanelSource, /本批共/);
  assert.match(printPanelSource, /data-mobile-pricing-print-labels/);
  assert.match(printPanelSource, /请先连接并确认打印机在线/);
  assert.match(printPanelSource, /payload\.labels\.length\s*\?\s*""\s*:\s*"disabled"/);
  assert.doesNotMatch(printPanelSource, /printerReady\s*&&\s*payload\.labels\.length\s*\?\s*""\s*:\s*"disabled"/);
  assert.doesNotMatch(printPanelSource, /打印一张预览标签/);
  assert.doesNotMatch(printPanelSource, /已贴完本组|已贴完本批|data-mobile-pricing-confirm-stickers/);
  assert.match(printPanelSource, /group\.tier/);
  assert.match(printPanelSource, /group\.quantity/);
  assert.match(cardSource, /group\.tier/);
  assert.match(cardSource, /group\.quantity/);
  assert.match(queueSource, /group\.tier/);
  assert.match(queueSource, /group\.price_kes/);
  assert.match(queueSource, /label_template_size/);
  assert.match(queueSource, /preview_only/);
  assert.match(stateSource, /group_id:\s*"CUSTOM-200"[\s\S]*?price_kes:\s*200[\s\S]*?quantity:\s*20[\s\S]*?rack_code:\s*"A-03"/);
  assert.match(stateSource, /label_template_size:\s*"60x40"/);
  assert.match(stateSource, /label_width_mm:\s*60/);
  assert.match(stateSource, /label_height_mm:\s*40/);
  assert.doesNotMatch(queueSource, /混合总任务|全部价格组|all groups/i);
});

test("K300 40x30 label preview batch print uses raw CPCL batch without printed state changes", () => {
  const stateSource = extractFunctionSource(appJs, "createStoreMobilePricingPreviewState");
  const printPanelSource = extractFunctionSource(appJs, "renderPriceGroupPrintPanel");
  const actionSource = extractFunctionSource(appJs, "handleStoreMobilePricingPreviewAction");
  const directPrintSource = extractFunctionSource(appJs, "printStoreMobileStoreItemLabelPreview");
  const printPayloadSource = extractFunctionSource(appJs, "buildStoreItemLabelPreviewPrintPayload");
  const advanceSource = extractFunctionSource(appJs, "advanceStoreMobileGroupWorkflow");
  const batchPayloadSource = extractFunctionSource(appJs, "buildClerkK300RetailClothingStoreItemBatchPayload");

  assert.match(stateSource, /createdPrintJobs:\s*\[\]/);
  assert.doesNotMatch(printPanelSource, /state\.createdPrintJobs/);
  assert.doesNotMatch(printPanelSource, /state\.printJobs/);
  assert.match(printPanelSource, /renderStoreItemLabelPreview/);
  assert.match(printPanelSource, /JSON preview payload/);
  assert.doesNotMatch(printPanelSource, /if \(!job\)/);
  assert.match(printPanelSource, /打印本批标签/);
  assert.match(actionSource, /printStoreMobileStoreItemLabelPreview/);
  assert.match(actionSource, /mobilePricingPrintLabels/);
  assert.match(appJs, /printStoreItemLabelPreview/);
  assert.match(appJs, /buildStoreItemLabelPreviewPrintPayload/);
  assert.match(appJs, /canRunClerkStoreItemLabelPreviewPrint/);
  assert.match(directPrintSource, /buildClerkK300RetailClothingStoreItemBatchPayload/);
  assert.match(directPrintSource, /buildStoreItemLabelPreviewPrintPayload/);
  assert.match(printPayloadSource, /print_mode:\s*"preview_one"/);
  assert.match(printPayloadSource, /slice\(0,\s*1\)/);
  assert.match(directPrintSource, /printStoreItemLabelPreview/);
  assert.match(directPrintSource, /printK300CpclRawBatch/);
  assert.doesNotMatch(directPrintSource, /printK300CpclRawPreview/);
  assert.doesNotMatch(directPrintSource, /buildClerkK300RetailClothingStoreItemPreviewPayload\(payload\.labels\[0\]/);
  assert.match(directPrintSource, /getClerkK300RetailClothingStoreItemTemplateMapping/);
  assert.match(directPrintSource, /当前 Android 版本不支持 STORE_ITEM 预览打印，请升级 Direct Loop PDA Android App。/);
  assert.match(directPrintSource, /updateClerkBluetoothPrinterStatus/);
  assert.match(directPrintSource, /last_print_result !== "success"/);
  assert.match(batchPayloadSource, /batch_name:\s*"k300_store_item_batch"/);
  assert.match(batchPayloadSource, /label_template_size:\s*"40x30"/);
  assert.match(batchPayloadSource, /protocol:\s*"CPCL"/);
  assert.match(batchPayloadSource, /template_name:\s*K300_40X30_RETAIL_CLOTHING_STORE_ITEM_TEMPLATE_NAME/);
  assert.match(batchPayloadSource, /business_template:\s*RETAIL_CLOTHING_STORE_ITEM_BUSINESS_TEMPLATE/);
  assert.match(batchPayloadSource, /buildClerkK300StoreItemPreviewCpclCommand/);
  assert.doesNotMatch(directPrintSource, /printStoreItemLabels|direct_print/);
  assert.doesNotMatch(actionSource, /printTestLabel\([^)]*STORE_ITEM|printTestLabel\([^)]*label/i);
  assert.doesNotMatch(printPanelSource, /已贴完本组|data-mobile-pricing-confirm-stickers/);
  assert.doesNotMatch(printPanelSource, /创建打印任务/);
  assert.doesNotMatch(printPanelSource, /返回打印队列/);
  assert.doesNotMatch(printPanelSource, /打印任务创建成功/);
  assert.doesNotMatch(actionSource, /\/print-jobs\/item-tokens|\/print-jobs\/\$\{[^}]+\}\/complete|sticker_confirmed|marked.*printed/i);
  assert.match(actionSource, /prepareStoreMobileBatchLabelPreview\(state, previewLabels\)/);
  assert.doesNotMatch(advanceSource, /createdPrintJobs|status:\s*"queued"|待贴标确认|已完成/);
});

test("shelf stock-in selector appears only after STORE_ITEM print success", () => {
  const printPanelSource = extractFunctionSource(appJs, "renderPriceGroupPrintPanel");

  assert.match(printPanelSource, /renderStoreMobileStockInConfirmationPanel/);
  assert.match(printPanelSource, /previewPrintStatus === "sent_to_printer"/);
  assert.match(appJs, /确认完成入库/);
  assert.match(appJs, /data-mobile-pricing-confirm-stock-in/);
  assert.match(appJs, /data-mobile-stock-in-location/);
});

test("print success does not auto-confirm stock-in", () => {
  const directPrintSource = extractFunctionSource(appJs, "printStoreMobileStoreItemLabelPreview");

  assert.match(directPrintSource, /preview_print_status = "sent_to_printer"/);
  assert.doesNotMatch(directPrintSource, /confirmStoreMobileStoreItemStockIn/);
  assert.doesNotMatch(directPrintSource, /confirm-stock-in/);
});

test("shelf stock-in defaults by item category and falls back to backroom", () => {
  const defaultSource = extractFunctionSource(appJs, "getDefaultStoreMobileStockInLocationCode");
  const optionsSource = extractFunctionSource(appJs, "getStoreMobileActiveStockInLocations");

  assert.match(defaultSource, /category_name/);
  assert.match(defaultSource, /category_short/);
  assert.match(defaultSource, /category_hint/);
  assert.match(defaultSource, /location_type[\s\S]*?SHELF/);
  assert.match(defaultSource, /location_type[\s\S]*?BACKROOM/);
  assert.match(optionsSource, /active !== false/);
  assert.match(optionsSource, /location_type[\s\S]*?SHELF/);
  assert.match(optionsSource, /location_type[\s\S]*?BACKROOM/);
});

test("confirm stock-in calls the 301 API per STORE_ITEM and treats idempotent statuses as success", () => {
  const confirmSource = extractFunctionSource(appJs, "confirmStoreMobileStoreItemStockIn");
  const actionSource = extractFunctionSource(appJs, "handleStoreMobilePricingPreviewAction");
  const statusLabelSource = extractFunctionSource(appJs, "getStoreMobileStockInStatusLabel");

  assert.match(confirmSource, /\/stores\/\$\{encodeURIComponent\(storeCode\)\}\/store-items\/\$\{encodeURIComponent\(machineCode\)\}\/confirm-stock-in/);
  assert.match(confirmSource, /location_code/);
  assert.match(confirmSource, /confirmed_by/);
  assert.match(confirmSource, /already_confirmed/);
  assert.match(confirmSource, /stock_in_status/);
  assert.match(confirmSource, /已入库/);
  assert.match(confirmSource, /已确认入库/);
  assert.doesNotMatch(confirmSource, /location_updated|已换货架/);
  assert.match(statusLabelSource, /confirmed[\s\S]*?已入库/);
  assert.match(statusLabelSource, /already_confirmed[\s\S]*?已确认/);
  assert.doesNotMatch(statusLabelSource, /location_updated|已换货架/);
  assert.match(actionSource, /confirmStoreMobileStoreItemStockIn/);
  assert.match(appJs, /data-mobile-pricing-confirm-stock-in/);
});

test("failed print does not expose stock-in confirmation or call stock-in API", () => {
  const printPanelSource = extractFunctionSource(appJs, "renderPriceGroupPrintPanel");
  const directPrintSource = extractFunctionSource(appJs, "printStoreMobileStoreItemLabelPreview");

  assert.match(printPanelSource, /previewPrintStatus === "sent_to_printer"/);
  assert.match(printPanelSource, /renderStoreMobileStockInConfirmationPanel/);
  assert.doesNotMatch(directPrintSource, /stock_in_confirmed\s*=\s*true/);
  assert.doesNotMatch(directPrintSource, /confirm-stock-in/);
});

test("stock-in API failure keeps the PDA confirmation retryable per STORE_ITEM", () => {
  const actionSource = extractFunctionSource(appJs, "handleStoreMobilePricingPreviewAction");
  const panelSource = extractFunctionSource(appJs, "renderStoreMobileStockInConfirmationPanel");

  assert.match(actionSource, /stock_in_status = "failed"/);
  assert.match(actionSource, /stock_in_error = formatErrorMessage\(error\)/);
  assert.match(panelSource, /data-mobile-pricing-confirm-stock-in/);
  assert.match(panelSource, /确认完成入库/);
  assert.doesNotMatch(actionSource, /disabled.*failed|failed.*disabled/);
});

test("clerk PDA exposes an unfinished stock-in list that reuses the 301 API", () => {
  const mySource = extractFunctionSource(appJs, "renderStoreMobileMyTab");
  const listSource = extractFunctionSource(appJs, "renderStoreMobileUnconfirmedStockInList");
  const loadSource = extractFunctionSource(appJs, "loadStoreMobileUnconfirmedStockInItems");
  const confirmSource = extractFunctionSource(appJs, "confirmStoreMobileUnconfirmedStockInItem");
  const actionSource = extractFunctionSource(appJs, "handleStoreMobilePricingPreviewAction");

  assert.match(mySource, /未完成入库/);
  assert.match(listSource, /未完成入库：/);
  assert.match(listSource, /立即处理/);
  assert.match(listSource, /mobile-stock-in-entry-card/);
  assert.match(listSource, /mobile-stock-in-card/);
  assert.match(listSource, /建议货架 \/ 后仓/);
  assert.doesNotMatch(listSource, /stock_in_confirmed|legacy|未确认 \/ 历史未确认/);
  assert.match(listSource, /data-mobile-pricing-load-unconfirmed-stock-in/);
  assert.match(listSource, /STORE_ITEM/);
  assert.match(listSource, /suggested_location_code/);
  assert.match(listSource, /data-mobile-unconfirmed-stock-in-location/);
  assert.match(listSource, /data-mobile-unconfirmed-stock-in-confirm/);
  assert.match(loadSource, /inventory-overview\/unconfirmed-items/);
  assert.match(confirmSource, /confirm-stock-in/);
  assert.match(confirmSource, /confirmed|already_confirmed/);
  assert.doesNotMatch(confirmSource, /location_updated|已换货架/);
  assert.match(actionSource, /失败，请重试/);
  assert.match(actionSource, /loadStoreMobileUnconfirmedStockInItems/);
  assert.match(actionSource, /confirmStoreMobileUnconfirmedStockInItem/);
});

test("legacy PDA bundle contains shelf confirmation without cashier terminal preview changes", () => {
  assert.match(appLegacyJs, /renderStoreMobileStockInConfirmationPanel/);
  assert.match(appLegacyJs, /renderStoreMobileUnconfirmedStockInList/);
  assert.match(appLegacyJs, /data-mobile-pricing-confirm-stock-in/);
  assert.match(appLegacyJs, /data-mobile-unconfirmed-stock-in-confirm/);
  assert.match(appLegacyJs, /confirm-stock-in/);
  assert.doesNotMatch(appLegacyJs, /CASHIER_TERMINAL_PREVIEW_STORE/);
  assert.doesNotMatch(appLegacyJs, /CASHIER_TERMINAL_PREVIEW_ITEMS/);
  assert.doesNotMatch(appLegacyJs, /CASHIER_TERMINAL_REJECT_MESSAGES/);
});

test("K300 batch payload contains every generated STORE_ITEM label with locked template metadata", () => {
  const batchBuilder = getExecutableBundle(
    [
      "sanitizeClerkK300CpclText",
      "getClerkK300RetailClothingStoreItemTemplateMapping",
      "buildClerkK300StoreItemPreviewCpclCommand",
      "buildClerkK300RetailClothingStoreItemBatchPayload",
    ],
    `
      const K300_40X30_RETAIL_CLOTHING_STORE_ITEM_TEMPLATE_NAME = "K300_40X30_RETAIL_CLOTHING_STORE_ITEM";
      const RETAIL_CLOTHING_STORE_ITEM_BUSINESS_TEMPLATE = "retail_clothing_store_item";
      function getClerkBluetoothPrinterProfileValue(profile = "", printerName = "") {
        const normalized = String(profile || "GENERIC").trim().toUpperCase();
        if (normalized === "UROVO_K300") return "UROVO_K300";
        const normalizedName = String(printerName || "").trim().toUpperCase();
        if (/UROVO|K300|ZTO688/.test(normalizedName)) return "UROVO_K300";
        return "GENERIC";
      }
    `,
    "({ buildClerkK300RetailClothingStoreItemBatchPayload })",
  );
  const payload = batchBuilder.buildClerkK300RetailClothingStoreItemBatchPayload(
    [
      { machine_code: "5261300000038", barcode_value: "5261300000038", price_kes: 410, category_short: "CARGO PANT", grade: "P" },
      { machine_code: "5261300000052", barcode_value: "5261300000052", price_kes: 410, category_short: "CARGO PANT", pricing_type: "S" },
    ],
    { printer_profile: "UROVO_K300", printer_name: "ZTO688_001" },
  );

  assert.equal(payload.label_template_size, "40x30");
  assert.equal(payload.protocol, "CPCL");
  assert.equal(payload.batch_name, "k300_store_item_batch");
  assert.equal(payload.template_name, "K300_40X30_RETAIL_CLOTHING_STORE_ITEM");
  assert.equal(payload.business_template, "retail_clothing_store_item");
  assert.equal(payload.labels.length, 2);
  assert.deepEqual(payload.labels.map((label) => label.test_name), ["store_item_1", "store_item_2"]);
  assert.match(payload.labels[0].cpcl_command, /BARCODE 128 1 1 78 35 76 5261300000038/);
  assert.match(payload.labels[1].cpcl_command, /BARCODE 128 1 1 78 35 76 5261300000052/);
  assert.match(payload.labels[0].cpcl_command, /TEXT 7 0 14 8 KES 410/);
  assert.match(payload.labels[0].cpcl_command, /TEXT 4 0 14 45 CARGO PANT \/ P/);
  assert.match(payload.labels[1].cpcl_command, /TEXT 4 0 14 45 CARGO PANT \/ S/);
});

test("print payload preview has field summary and keeps every price group separate", () => {
  const queueSource = extractFunctionSource(appJs, "renderPriceGroupPrintQueue");
  const stateSource = extractFunctionSource(appJs, "createStoreMobilePricingPreviewState");

  assert.match(stateSource, /printer_name:\s*"Deli DL-720C"/);
  assert.match(stateSource, /pending_label_count:\s*210/);
  assert.match(stateSource, /printed_today_count:\s*0/);
  assert.match(stateSource, /current_task_group_id:\s*"A"/);
  assert.match(queueSource, /print payload 预览/);
  assert.match(queueSource, /待打印总张数/);
  assert.match(queueSource, /preview_only/);
  assert.match(queueSource, /当前任务/);
  assert.match(queueSource, /mobile-print-queue-summary/);
  assert.match(queueSource, /mobile-print-queue-row/);
  assert.match(queueSource, /buildStoreItemLabelPreviewPayload/);
  assert.doesNotMatch(queueSource, /print-jobs\/item-tokens|Android print bridge|printed/);
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
  assert.match(generationSource, /返回分批定价/);
  assert.match(generationSource, /查看标签预览/);
  assert.match(generationSource, /继续分下一批/);
  assert.match(printPanelSource, /返回本批生成结果/);
  assert.match(printPanelSource, /返回分批定价/);
  assert.doesNotMatch(printPanelSource, /返回价格组列表|继续分下一批/);
});

test("per-group workflow advances generate then preview without sticker confirmation", () => {
  const advanceSource = extractFunctionSource(appJs, "advanceStoreMobileGroupWorkflow");
  const nextGroupSource = extractFunctionSource(appJs, "getNextIncompleteStoreMobileGroup");
  const actionSource = extractFunctionSource(appJs, "handleStoreMobilePricingPreviewAction");

  assert.match(advanceSource, /draft[\s\S]*已生成 \/ 待打印/);
  assert.match(advanceSource, /preview/);
  assert.doesNotMatch(advanceSource, /待贴标确认|已完成|status:\s*"queued"|createdPrintJobs/);
  assert.match(advanceSource, /getNextIncompleteStoreMobileGroup/);
  assert.match(advanceSource, /setStoreMobileActivePage\(state,\s*"label_preview"/);
  assert.match(nextGroupSource, /getStoreMobilePriceGroupWorkflowStatus\(group\) === "draft"/);
  assert.match(actionSource, /previewLabels/);
  assert.doesNotMatch(actionSource, /confirmStickers/);
  assert.doesNotMatch(appJs, /data-mobile-pricing-confirm-stickers/);
});

test("clerk PDA internal back stack restores prior pages without clearing pricing state", () => {
  const navigation = getExecutableBundle(
    [
      "normalizeStoreMobilePdaPage",
      "getStoreMobilePdaPageSnapshot",
      "restoreStoreMobilePdaPageSnapshot",
      "pushStoreMobilePdaBrowserHistory",
      "setStoreMobileActivePage",
      "navigateStoreMobilePdaBack",
    ],
    `
    var pushEvents = [];
    var window = {
      history: {
        pushState(state) {
          pushEvents.push(state);
        },
      },
      location: { href: "https://fw-erp.example/app" },
    };
    `,
    "({ setStoreMobileActivePage, navigateStoreMobilePdaBack, pushEvents })",
  );
  const selectedSdp = { display_code: "SDP261290019", total_count: 100 };
  const generatedItems = Array.from({ length: 30 }, (_, index) => ({ machine_code: `526129000${String(index + 1).padStart(3, "0")}` }));
  const state = {
    activePage: "tasks",
    activeGroupId: "",
    current_task_group_id: "",
    selectedSdp,
    priceGroups: [{ group_id: "P-30", workflow_status: "locked", generated_store_items: generatedItems }],
    pdaPageStack: [],
  };

  navigation.setStoreMobileActivePage(state, "pricing_split", { source: "button" });
  navigation.setStoreMobileActivePage(state, "group_generated", { groupId: "P-30", source: "generate" });
  assert.equal(state.activePage, "group_generated");
  assert.equal(navigation.navigateStoreMobilePdaBack(state), true);
  assert.equal(state.activePage, "pricing_split");
  assert.equal(state.priceGroups.length, 1);
  assert.equal(state.priceGroups[0].generated_store_items.length, 30);
  assert.equal(state.selectedSdp, selectedSdp);

  navigation.setStoreMobileActivePage(state, "group_generated", { groupId: "P-30", source: "button" });
  navigation.setStoreMobileActivePage(state, "label_preview", { groupId: "P-30", source: "button" });
  assert.equal(state.activePage, "label_preview");
  assert.equal(navigation.navigateStoreMobilePdaBack(state), true);
  assert.equal(state.activePage, "group_generated");
  assert.equal(state.priceGroups[0].generated_store_items.length, 30);
  assert.equal(state.selectedSdp, selectedSdp);
  assert.ok(navigation.pushEvents.length >= 4);
});

test("clerk PDA browser popstate handles Android back through the internal page stack", () => {
  const browserBack = getExecutableBundle(
    [
      "normalizeStoreMobilePdaPage",
      "getStoreMobilePdaPageSnapshot",
      "restoreStoreMobilePdaPageSnapshot",
      "navigateStoreMobilePdaBack",
      "handleStoreMobilePdaPopState",
    ],
    `
    var renderCount = 0;
    var storeMobilePricingPreviewState = {
      activePage: "label_preview",
      activeGroupId: "P-30",
      current_task_group_id: "P-30",
      selectedSdp: { display_code: "SDP261290019" },
      priceGroups: [{ group_id: "P-30", generated_store_items: [{ machine_code: "526129000123" }] }],
      pdaPageStack: [
        { page: "pricing_split", activeGroupId: "P-30", current_task_group_id: "P-30" },
        { page: "group_generated", activeGroupId: "P-30", current_task_group_id: "P-30" },
      ],
    };
    function renderStoreMobilePricingPreview() {
      renderCount += 1;
    }
    `,
    "({ handleStoreMobilePdaPopState, getState() { return storeMobilePricingPreviewState; }, getRenderCount() { return renderCount; } })",
  );

  assert.equal(browserBack.handleStoreMobilePdaPopState({ state: { directLoopClerkPda: true } }), true);
  assert.equal(browserBack.getState().activePage, "group_generated");
  assert.equal(browserBack.getState().priceGroups[0].generated_store_items.length, 1);
  assert.equal(browserBack.getState().selectedSdp.display_code, "SDP261290019");
  assert.equal(browserBack.getRenderCount(), 1);
});

test("clerk PDA hash back keeps the runtime on the PDA pricing panel", () => {
  const route = getExecutableBundle(
    ["applyHashRoute"],
    `
    var activeWorkspace = "store";
    var activePanelKey = "store-pda-pricing";
    var setCalls = [];
    var replaceCalls = [];
    var currentSession = { token: "token", user: { role_code: "store_clerk", store_code: "UTAWALA" } };
    var window = {
      location: { hash: "#store-clerk-home" },
      history: {
        state: { directLoopClerkPda: true },
        replaceState(state, title, nextHash) {
          replaceCalls.push(nextHash);
          window.location.hash = nextHash;
        },
      },
    };
    var workspacePanelsList = [
      { dataset: { panelKey: "store-clerk-home", workspacePanel: "store", panelTitle: "6.2 我的当前 bale" } },
      { dataset: { panelKey: "store-pda-pricing", workspacePanel: "store", panelTitle: "PDA 现场分堆标价 UI Preview" } },
    ];
    function getHashPanelKey() {
      return "store-clerk-home";
    }
    function setActiveWorkspace(workspace) {
      activeWorkspace = workspace;
    }
    function setActivePanel(panelKey, options) {
      setCalls.push({ panelKey: panelKey, options: options });
      activePanelKey = panelKey;
    }
    function getNormalizedRoleCode(user) {
      return String(user && (user.role_code || user.role || "") || "");
    }
    function isPdaRuntimeMode() {
      return true;
    }
    function requiresRoleLanding() {
      return true;
    }
    function getUserRoleLanding() {
      return { workspace: "store", panelTitle: "PDA 现场分堆标价 UI Preview" };
    }
    function getPanelKeyByTitle(workspace, panelTitlePrefix) {
      var target = workspacePanelsList.find(function (panel) {
        return panel.dataset.workspacePanel === workspace
          && String(panel.dataset.panelTitle || "").indexOf(panelTitlePrefix) === 0;
      });
      return target ? target.dataset.panelKey : "";
    }
    `,
    "({ applyHashRoute, getSetCalls() { return setCalls; }, getReplaceCalls() { return replaceCalls; }, getActivePanelKey() { return activePanelKey; } })",
  );

  assert.equal(route.applyHashRoute(), true);
  assert.equal(route.getSetCalls()[0].panelKey, "store-pda-pricing");
  assert.equal(route.getSetCalls()[0].options.syncHash, false);
  assert.equal(route.getReplaceCalls()[0], "#store-pda-pricing");
  assert.equal(route.getActivePanelKey(), "store-pda-pricing");
});

test("clerk PDA back supports printer connection to my, then my to tasks", () => {
  const navigation = getExecutableBundle(
    [
      "normalizeStoreMobilePdaPage",
      "getStoreMobilePdaPageSnapshot",
      "restoreStoreMobilePdaPageSnapshot",
      "pushStoreMobilePdaBrowserHistory",
      "setStoreMobileActivePage",
      "navigateStoreMobilePdaBack",
    ],
    `
    var window = {
      history: { pushState() {} },
      location: { href: "https://fw-erp.example/app" },
    };
    `,
    "({ setStoreMobileActivePage, navigateStoreMobilePdaBack })",
  );
  const state = { activePage: "tasks", pdaPageStack: [], selectedSdp: { display_code: "SDP261290019" }, priceGroups: [] };

  navigation.setStoreMobileActivePage(state, "my", { source: "tab" });
  navigation.setStoreMobileActivePage(state, "printer_connection", { source: "button" });
  assert.equal(navigation.navigateStoreMobilePdaBack(state), true);
  assert.equal(state.activePage, "my");
  assert.equal(navigation.navigateStoreMobilePdaBack(state), true);
  assert.equal(state.activePage, "tasks");
  assert.equal(navigation.navigateStoreMobilePdaBack(state), false);
});

test("clerk PDA navigation names explicit split, generated, and label preview pages", () => {
  const optionsSource = extractFunctionSource(appJs, "getStoreMobilePageOptions");
  const screenSource = extractFunctionSource(appJs, "renderStoreMobileDeviceScreen");
  const actionSource = extractFunctionSource(appJs, "handleStoreMobilePricingPreviewAction");

  assert.match(optionsSource, /pricing_split/);
  assert.match(optionsSource, /group_generated/);
  assert.match(optionsSource, /label_preview/);
  assert.match(screenSource, /page === "pricing_split"/);
  assert.match(screenSource, /page === "group_generated"/);
  assert.match(screenSource, /page === "label_preview"/);
  assert.match(actionSource, /setStoreMobileActivePage/);
  assert.match(appJs, /window\.addEventListener\("popstate",\s*handleStoreMobilePdaPopState/);
  assert.match(appJs, /window\.history\.pushState/);
});

test("STORE_ITEM label preview does not mark printed or sticker-confirmed", () => {
  const summarySource = extractFunctionSource(appJs, "renderStoreMobileCompletionSummary");
  const advanceSource = extractFunctionSource(appJs, "advanceStoreMobileGroupWorkflow");
  const actionSource = extractFunctionSource(appJs, "handleStoreMobilePricingPreviewAction");

  assert.doesNotMatch(actionSource, /sticker_confirmed|marked.*printed|print_status\s*=\s*"printed"|sticker_status\s*=\s*"confirmed"/i);
  assert.doesNotMatch(advanceSource, /sticker_confirmed|marked.*printed|print_status\s*=\s*"printed"|sticker_status\s*=\s*"confirmed"|state\.taskStatus = "已完成"|state\.activePage = "complete"/i);
  assert.match(summarySource, /总数/);
  assert.match(summarySource, /已生成/);
  assert.match(summarySource, /待打印/);
  assert.match(summarySource, /返回任务列表/);
});

test("my tab shows clerk PDA account settings, printer connection entry, and logout", () => {
  const mySource = extractFunctionSource(appJs, "renderStoreMobileMyTab");

  assert.match(mySource, /当前账号/);
  assert.match(mySource, /Austin/);
  assert.match(mySource, /门店/);
  assert.match(mySource, /UTAWALA/);
  assert.match(mySource, /角色/);
  assert.match(mySource, /店员/);
  assert.match(mySource, /Direct Loop PDA/);
  assert.match(mySource, /renderClerkPrinterConnectionEntryCard/);
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
  assert.match(screenSource, /<h3>分批定价<\/h3>/);
  assert.doesNotMatch(screenSource, /返回价格组列表/);
  assert.doesNotMatch(screenSource.slice(sdpIndex, groupsIndex), /mobile-section-head[\s\S]*?价格组总览/);
  assert.match(frameSource, /mobile-pricing-statusbar/);
  assert.match(frameSource, /mobile-pricing-titlebar/);
  assert.match(stylesCss, /\.mobile-pricing-workbench\s*\{[\s\S]*?gap:\s*8px/);
  assert.match(stylesCss, /\.mobile-pricing-statusbar/);
  assert.match(stylesCss, /\.mobile-pricing-titlebar/);
});

test("preview actions do not print; one-label preview print action does not call backend completion endpoints", () => {
  const actionSource = extractFunctionSource(appJs, "handleStoreMobilePricingPreviewAction");
  const renderSource = extractFunctionSource(appJs, "renderStoreMobilePricingPreview");
  const previewSource = extractFunctionSource(appJs, "prepareStoreMobileBatchLabelPreview");
  const queueSource = extractFunctionSource(appJs, "queueStoreMobileBatchPrintJobs");
  const previewBranch = actionSource.slice(actionSource.indexOf("if (previewLabels)"), actionSource.indexOf("if (labelSize)"));
  const printBranch = actionSource.slice(actionSource.indexOf("if (printLabels)"), actionSource.indexOf("if (labelSize)"));

  assert.doesNotMatch(actionSource, /\brequest\s*\(/);
  assert.doesNotMatch(actionSource, /fetch\s*\(/);
  assert.match(printBranch, /printStoreMobileStoreItemLabelPreview/);
  assert.match(appJs, /printStoreItemLabelPreview/);
  assert.doesNotMatch(appJs, /printStoreItemLabels|direct_print/);
  assert.doesNotMatch(previewBranch, /DirectLoopPdaPrinter|printTestLabel|printStoreItemLabelPreview|\/print-jobs\/\$\{[^}]+\}\/complete|\/print-jobs\/item-tokens/);
  assert.doesNotMatch(previewSource, /DirectLoopPdaPrinter|printTestLabel|printStoreItemLabelPreview|\/print-jobs\/\$\{[^}]+\}\/complete|\/print-jobs\/item-tokens/);
  assert.doesNotMatch(queueSource, /DirectLoopPdaPrinter|printTestLabel|printStoreItemLabelPreview|\/print-jobs\/\$\{[^}]+\}\/complete|\/print-jobs\/item-tokens/);
  assert.doesNotMatch(printBranch, /\/print-jobs\/\$\{[^}]+\}\/complete|\/print-jobs\/item-tokens|sticker_confirmed|marked.*printed/i);
  assert.doesNotMatch(renderSource, /\brequest\s*\(/);
  assert.match(actionSource, /storeMobilePricingPreviewState/);
  const advanceSource = extractFunctionSource(appJs, "advanceStoreMobileGroupWorkflow");
  assert.match(advanceSource, /preview/);
});

test("legacy PDA bundle includes incremental split and Android back behavior", () => {
  assert.match(appLegacyJs, /getStoreMobileSourceLineProgress/);
  assert.match(appLegacyJs, /setStoreMobileActivePage/);
  assert.match(appLegacyJs, /handleStoreMobilePdaPopState/);
  assert.match(appLegacyJs, /pricing_split/);
  assert.match(appLegacyJs, /group_generated/);
  assert.match(appLegacyJs, /label_preview/);
  assert.match(appLegacyJs, /分批定价/);
  assert.match(appLegacyJs, /创建新价格组/);
  assert.match(appLegacyJs, /创建 P档价格组/);
  assert.match(appLegacyJs, /创建 S档价格组/);
  assert.match(appLegacyJs, /创建自定义价格组/);
  assert.match(appLegacyJs, /返回分批定价/);
  assert.match(appLegacyJs, /继续分下一批/);
});

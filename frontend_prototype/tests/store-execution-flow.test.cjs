const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function loadStoreExecutionFlow() {
  const filePath = path.join(__dirname, "..", "store-execution-flow.js");
  const code = fs.readFileSync(filePath, "utf8");
  delete globalThis.StoreExecutionFlow;
  vm.runInThisContext(code, { filename: filePath });
  return globalThis.StoreExecutionFlow;
}

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

const {
  getStoreRoleLanding,
  getStoreWorkerDefault,
  getStoreAssignmentNavigation,
  getStoreManagerProgressNavigation,
  getStoreClerkCompletionNavigation,
  buildClerkAssignment,
  buildClerkShelvingTask,
  bucketStoreManagerDispatchBales,
} = loadStoreExecutionFlow();

const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const stylesCss = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");
const storeDispatchSectionHtml = (indexHtml.match(/<section class="panel store-support-panel(?: hidden-screen)?" data-workspace-panel="store">[\s\S]*?<form id="storeDispatchBaleAcceptForm"[\s\S]*?<pre id="storeDispatchBaleOutput" class="output hidden-output"><\/pre>\s*<\/section>/) || [""])[0];
const storeDispatchAssignmentSectionHtml = (indexHtml.match(/<form id="storeDispatchAssignmentForm" class="sorting-task-form warehouse-step-form">[\s\S]*?<pre id="storeDispatchAssignmentOutput" class="output hidden-output"><\/pre>/) || [""])[0];
const testingToolsSectionHtml = (indexHtml.match(/<section class="panel" data-workspace-panel="testing">[\s\S]*?<h2>测试工具<\/h2>[\s\S]*?<pre id="storeRecentSalesSimulationOutput" class="output hidden-output"><\/pre>\s*<\/section>/) || [""])[0];
const storeManagerConsoleSectionHtml = (indexHtml.match(/<section class="panel store-role-panel store-role-panel-manager" data-workspace-panel="store">[\s\S]*?<h2>5\. 门店收货主控台<\/h2>[\s\S]*?<pre id="storeManagerConsoleOutput" class="output hidden-output"><\/pre>\s*<\/section>/) || [""])[0];
const storePdaWorkbenchSectionHtml = (indexHtml.match(/<section class="panel store-support-panel(?: [^"]*)?" data-workspace-panel="store">[\s\S]*?<h2>7\. 店员 PDA 上架工作台<\/h2>[\s\S]*?<pre id="storeTokenEditOutput" class="output hidden-output"><\/pre>\s*<\/section>/) || [""])[0];
const appJs = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

test("getStoreRoleLanding sends store clerks to my current bale instead of the manager console", () => {
  const result = getStoreRoleLanding("store_clerk", true);

  assert.deepEqual(result, {
    workspace: "store",
    panelTitle: "6.2 我的当前 bale",
    label: "店员端 / 我的当前 bale",
  });
});

test("getStoreWorkerDefault keeps clerk pages bound to the logged-in store clerk, not cashier", () => {
  assert.equal(getStoreWorkerDefault("store_clerk", "store_clerk_1"), "store_clerk_1");
  assert.equal(getStoreWorkerDefault("cashier", "cashier_1"), "");
});

test("getStoreAssignmentNavigation keeps manager on manager-side page and sends clerk through current bale first", () => {
  const result = getStoreAssignmentNavigation({
    flowType: "sorting",
    assignedEmployee: "clerk_1",
  });

  assert.deepEqual(result, {
    managerPanelTitle: "6.1 门店分配店员",
    clerkHomePanelTitle: "6.2 我的当前 bale",
    workbenchTitle: "7. 店员 PDA 上架工作台",
    shouldAutoOpenWorkbench: false,
    assignmentMessage: "门店配货 bale 已绑定给 clerk_1。店员下一步从“6.2 我的当前 bale”进入，再进入“7. 店员 PDA 上架工作台”。",
  });
});

test("getStoreAssignmentNavigation points direct-hang work to clerk home before the direct-hang bench", () => {
  const result = getStoreAssignmentNavigation({
    flowType: "direct_hang",
    assignedEmployee: "clerk_2",
  });

  assert.equal(result.managerPanelTitle, "6.1 门店分配店员");
  assert.equal(result.clerkHomePanelTitle, "6.2 我的当前 bale");
  assert.equal(result.workbenchTitle, "7.2 直挂店员工作台");
  assert.equal(result.shouldAutoOpenWorkbench, false);
  assert.match(result.assignmentMessage, /6\.2 我的当前 bale/);
  assert.match(result.assignmentMessage, /7\.2 直挂店员工作台/);
});

test("getStoreManagerProgressNavigation keeps progress viewing on the manager-side page", () => {
  const result = getStoreManagerProgressNavigation();

  assert.deepEqual(result, {
    panelTitle: "6.1 门店分配店员",
    actionLabel: "查看处理进度",
    note: "店长只看分配、进度和异常，不直接进入店员主工作台。",
  });
});

test("getStoreClerkCompletionNavigation returns the clerk to current bale after finishing one bale", () => {
  const result = getStoreClerkCompletionNavigation({ baleNo: "SDB-001" });

  assert.deepEqual(result, {
    panelTitle: "6.2 我的当前 bale",
    completionMessage: "当前 bale SDB-001 已完成，返回“6.2 我的当前 bale”接下一包。",
  });
});

test("buildClerkAssignment makes the one-bale-one-clerk handoff explicit", () => {
  const result = buildClerkAssignment({
    baleNo: "SDB-001",
    storeCode: "UTAWALA",
    assignedEmployee: "store_clerk_1",
    flowType: "sorting",
    itemCount: 12,
    assignedAt: "2026-04-23T08:00:00Z",
    note: "一个 bale 只分配给一个店员处理",
    status: "assigned",
  });

  assert.deepEqual(result, {
    entityType: "clerk_assignment",
    baleNo: "SDB-001",
    storeCode: "UTAWALA",
    assignedEmployee: "store_clerk_1",
    flowType: "sorting",
    itemCount: 12,
    assignedAt: "2026-04-23T08:00:00Z",
    note: "一个 bale 只分配给一个店员处理",
    status: "assigned",
  });
});

test("buildClerkShelvingTask makes the shelving session explicit for the clerk workbench", () => {
  const result = buildClerkShelvingTask({
    sessionNo: "SRS-20260423-001",
    baleNo: "SDB-001",
    storeCode: "UTAWALA",
    assignedEmployee: "store_clerk_1",
    status: "open",
    tokenCount: 12,
    placedCount: 7,
    pendingCount: 5,
  });

  assert.deepEqual(result, {
    entityType: "clerk_shelving_task",
    sessionNo: "SRS-20260423-001",
    baleNo: "SDB-001",
    storeCode: "UTAWALA",
    assignedEmployee: "store_clerk_1",
    status: "open",
    tokenCount: 12,
    placedCount: 7,
    pendingCount: 5,
  });
});

test("store clerk fields use dynamic user directory options instead of static clerk names", () => {
  assert.match(indexHtml, /<datalist id="storeClerkOptions">/);
  assert.doesNotMatch(indexHtml, /<option value="Austin">Austin<\/option>/);
  assert.doesNotMatch(indexHtml, /<option value="Swahili">Swahili<\/option>/);
  assert.match(appJs, /function refreshAssignableUserPickers/);

  const pickerMatches = indexHtml.match(/list="storeClerkOptions"/g) || [];
  assert.ok(pickerMatches.length >= 6);
});

test("store receiving surfaces use SDP package projection instead of source bale rows", () => {
  assert.equal(Boolean(storeDispatchSectionHtml), true);
  assert.doesNotMatch(storeDispatchSectionHtml, /name="shipment_no"/);
  assert.doesNotMatch(storeDispatchSectionHtml, /name="task_no"/);
  assert.doesNotMatch(storeDispatchSectionHtml, /name="status"/);
  assert.doesNotMatch(storeDispatchSectionHtml, />读取门店配货 bale</);
  assert.match(storeDispatchSectionHtml, /name="transfer_no" placeholder="先选择调拨单/);
  assert.match(storeDispatchSectionHtml, /<textarea name="bale_no" class="bulk-scan-input"/);
  assert.match(storeDispatchSectionHtml, /打开 SDO \/ SDP 收货/);
  assert.match(storeDispatchSectionHtml, /SDB \/ LPK 只作来源码核对/);
  assert.match(appJs, /function getStoreReceivingPackageCode/);
  assert.match(appJs, /function getStoreReceivingPackageRows/);
  assert.match(appJs, /function groupStoreReceivingPackagesBySdo/);
  assert.match(appJs, /function findStoreReceivingPackageByCode/);
  assert.match(appJs, /function renderStoreReceivingPackageDetail/);
  assert.match(appJs, /function getStoreReceiptSdoStatusText/);
  assert.match(appJs, /function renderStoreReceiptTransferPackageList/);
  assert.match(appJs, /async function receiveStoreReceivingPackage/);
  assert.match(appJs, /async function markStoreReceivingPackageException/);
  assert.match(appJs, /async function assignStoreReceivingPackagesToClerk/);
  assert.match(appJs, /resolveBarcodeForContext\(scannedCodes\[0\], "store_receiving", \["STORE_DELIVERY_EXECUTION", "STORE_DELIVERY_PACKAGE"\]\)/);
  assert.match(appJs, /SDB \/ LPK 是仓库来源包，请扫描 SDO 或 SDP 实体包码。/);
  assert.match(appJs, /STORE_ITEM 只能用于 POS 销售。/);
  assert.match(appJs, /\^5\\d\{9\}\$[\s\S]*\^5\\d\{12\}\$/);
  assert.match(appJs, /SDB \/ LPK 只作为来源码显示，不作为门店正式收货对象/);
  assert.match(indexHtml, /SDP 收货、异常和分配状态以后端状态为准/);
  assert.doesNotMatch(appJs, /当前版本先完成识别与信息展示；逐包收货回写将在后续版本补充/);
  assert.doesNotMatch(appJs, /本机前端状态，不提供跨设备后端持久化/);
  assert.match(appJs, /#storeDispatchBaleAcceptForm \[name='bale_no'\][\s\S]*addEventListener\("input"/);
});

test("page 5 statistics are counted by SDP packages", () => {
  const summarySource = extractFunctionSource(appJs, "renderStoreManagerConsoleSummary");
  const normalizeSource = extractFunctionSource(appJs, "normalizeStoreReceivingPackageRow");

  assert.match(summarySource, /const packageRows = getStoreReceivingPackageRows\(storeCode\)/);
  assert.match(summarySource, /pendingReceiptPackages/);
  assert.match(summarySource, /receivedUnassignedPackages/);
  assert.match(summarySource, /assignedPackages/);
  assert.match(summarySource, /exceptionPackages/);
  assert.match(normalizeSource, /merged\.received_status[\s\S]*statusState\.received_status/);
  assert.match(normalizeSource, /merged\.assignment_status[\s\S]*assignmentState\.assignment_status/);
  assert.match(summarySource, /待收货/);
  assert.match(summarySource, /已收货未分配/);
  assert.match(summarySource, /已分配/);
  assert.doesNotMatch(summarySource, /inTransitSdoGroups\.length/);
  assert.doesNotMatch(summarySource, /acceptedRows\.length/);
});

test("store receiving scan routing opens SDO package lists and SDP package detail", () => {
  const submitSource = extractFunctionSource(appJs, "submitStoreDispatchBaleAccept");

  assert.match(submitSource, /\^5\\d\{9\}\$/);
  assert.match(submitSource, /\^5\\d\{12\}\$/);
  assert.match(submitSource, /STORE_ITEM 只能用于 POS 销售。/);
  assert.match(submitSource, /resolvedType === "STORE_DELIVERY_EXECUTION"/);
  assert.match(submitSource, /storeCommandCenterState\.selected_sdo_code =/);
  assert.match(submitSource, /storeCommandCenterState\.step = "sdo_packages"/);
  assert.match(submitSource, /renderStoreReceiptTransferPackageList/);
  assert.match(submitSource, /resolvedType === "STORE_DELIVERY_PACKAGE"/);
  assert.match(submitSource, /storeCommandCenterState\.selected_package_code =/);
  assert.match(submitSource, /storeCommandCenterState\.step = "package_detail"/);
  assert.match(submitSource, /renderStoreReceivingPackageDetail/);
  assert.doesNotMatch(submitSource, /请先选择调拨单，再验收这张调拨单下的门店配货 bale/);
});

test("page 5 load recent refreshes SDO package data before rendering", () => {
  assert.match(appJs, /button\.dataset\.storeReceiptLoadRecent !== undefined[\s\S]*await loadTransferOrders\(\);[\s\S]*renderStoreManagerConsoleSummary/);
});

test("page 5 receiving actions call backend package endpoints", () => {
  const receiveSource = extractFunctionSource(appJs, "receiveStoreReceivingPackage");
  const exceptionSource = extractFunctionSource(appJs, "markStoreReceivingPackageException");
  const clickSource = appJs.slice(appJs.indexOf("if (button.dataset.storeReceiptPackageAction)"));

  assert.match(receiveSource, /\/store-delivery-packages\/\$\{encodeURIComponent\(packageCode\)\}\/receive/);
  assert.match(receiveSource, /method: "POST"/);
  assert.match(exceptionSource, /\/store-delivery-packages\/\$\{encodeURIComponent\(packageCode\)\}\/exception/);
  assert.match(exceptionSource, /exception_reason/);
  assert.match(clickSource, /await receiveStoreReceivingPackage/);
  assert.match(clickSource, /await markStoreReceivingPackageException/);
  assert.match(clickSource, /await loadTransferOrders\(\)/);
  assert.doesNotMatch(clickSource, /storeReceiptPackageStatusState\[packageCode\] =/);
});

test("page 6 package detail exposes SDP identity and clear flow return buttons", () => {
  const detailSource = extractFunctionSource(appJs, "renderStoreReceivingPackageDetail");

  assert.match(detailSource, /sdo_package_display_code/);
  assert.match(detailSource, /sdo_package_machine_code/);
  assert.match(detailSource, /parent_sdo_display_code/);
  assert.match(detailSource, /source_code/);
  assert.match(detailSource, /item_count/);
  assert.match(detailSource, /content_summary/);
  assert.match(detailSource, /received_status/);
  assert.match(detailSource, /assigned_clerk/);
  assert.match(detailSource, /exception_status/);
  assert.match(detailSource, /返回到货列表/);
  assert.match(detailSource, /返回当前 SDO 包列表/);
  assert.match(detailSource, /重新扫描/);
  assert.match(detailSource, /确认收到/);
  assert.match(detailSource, /标记异常/);
  assert.match(detailSource, /去分配店员/);
});

test("page 6.1 assignment stores one clerk per received SDP package", () => {
  const assignSource = extractFunctionSource(appJs, "assignStoreReceivingPackagesToClerk");
  const overviewSource = extractFunctionSource(appJs, "renderStoreDispatchAssignmentOverview");
  const assignableSource = extractFunctionSource(appJs, "isStoreReceivingPackageAssignable");

  assert.match(assignSource, /const sdoPackageCode = getStoreReceivingPackageCode/);
  assert.match(assignSource, /\/store-delivery-packages\/\$\{encodeURIComponent\(sdoPackageCode\)\}\/assign/);
  assert.match(assignSource, /method: "POST"/);
  assert.match(assignSource, /received_status !== "received"/);
  assert.match(assignSource, /exception_status === "exception"/);
  assert.match(assignSource, /assigned_clerk/);
  assert.match(assignSource, /不能分配给多个店员/);
  assert.doesNotMatch(assignSource, /storeReceiptPackageAssignmentState\[sdoPackageCode\] =/);
  assert.doesNotMatch(assignSource, /assignmentState\[baleNo\]/);
  assert.match(overviewSource, /getStoreReceivingPackageRows\(storeCode\)/);
  assert.match(overviewSource, /isStoreReceivingPackageAssignable\(row\)/);
  assert.match(assignableSource, /assignment_status[\s\S]*!== "assigned"/);
  assert.match(overviewSource, /data-store-assignment-pkg="\$\{escapeHtml\(getStoreReceivingPackageCode\(row\)\)\}"/);
});

test("store manager can assign received SDP packages in one submit", () => {
  assert.equal(Boolean(storeDispatchAssignmentSectionHtml), true);
  assert.match(indexHtml, /data-action="load-store-dispatch-assignment"/);
  assert.match(storeDispatchAssignmentSectionHtml, /sorting-task-flow-step/);
  assert.match(storeDispatchAssignmentSectionHtml, /确认批量分配给店员/);
  assert.match(storeDispatchAssignmentSectionHtml, /name="transfer_no"[\s\S]*SDO 主单/);
  assert.match(storeDispatchAssignmentSectionHtml, /<textarea name="bale_no"[\s\S]*已收货未分配 SDP/);
  assert.match(storeDispatchAssignmentSectionHtml, /一次可把本批多个包分给同一人/);
  assert.match(storeDispatchAssignmentSectionHtml, /每个 SDP 只能对应一个店员/);
  assert.doesNotMatch(storeDispatchAssignmentSectionHtml, /门店配货 bale/);
  assert.match(appJs, /function groupStoreDispatchRowsByTransfer/);
  assert.match(appJs, /function parseStoreDispatchAssignmentBaleNos/);
  assert.match(appJs, /async function resolveStoreDispatchAssignmentTargets/);
  assert.match(appJs, /function renderStoreDispatchAssignmentOverview/);
  assert.match(appJs, /function assignStoreReceivingPackagesToClerk/);
  assert.match(appJs, /SDB \/ LPK 仅作来源码核对/);
  assert.match(appJs, /data-store-receipt-transfer-fill/);
  assert.match(appJs, /transfer_no/);
  assert.match(appJs, /Promise\.all/);
  assert.match(appJs, /renderStoreDispatchAssignmentResultSummary\(results\)/);
});

test("top workspace tabs expose testing tools as a first-level workspace", () => {
  assert.match(indexHtml, /<button class="workspace-tab" data-workspace-target="testing" type="button">测试工具<\/button>/);
});

test("testing tools includes the 14 day simulated sales generator and page 5 no longer carries it", () => {
  assert.equal(Boolean(testingToolsSectionHtml), true);
  assert.match(testingToolsSectionHtml, /<form id="storeRecentSalesSimulationForm" class="form-grid compact">/);
  assert.match(testingToolsSectionHtml, /name="max_items" type="number" min="1" max="200" value="14"/);
  assert.match(testingToolsSectionHtml, />生成最近 14 天模拟销售</);
  assert.match(testingToolsSectionHtml, /id="storeRecentSalesSimulationSummary"/);

  assert.equal(Boolean(storeManagerConsoleSectionHtml), true);
  assert.doesNotMatch(storeManagerConsoleSectionHtml, /storeRecentSalesSimulationForm/);
  assert.doesNotMatch(storeManagerConsoleSectionHtml, /storeRecentSalesSimulationSummary/);
});

test("testing tools includes the retail demo seed form and page 5 no longer carries it", () => {
  assert.equal(Boolean(testingToolsSectionHtml), true);
  assert.match(testingToolsSectionHtml, /<form id="storeRetailSeedForm" class="form-grid compact">/);
  assert.match(testingToolsSectionHtml, /name="max_items" type="number" min="1" max="200" value="24"/);
  assert.match(testingToolsSectionHtml, />一键生成门店零售演练样本</);
  assert.match(testingToolsSectionHtml, /id="storeRetailSeedSummary"/);

  assert.equal(Boolean(storeManagerConsoleSectionHtml), true);
  assert.doesNotMatch(storeManagerConsoleSectionHtml, /storeRetailSeedForm/);
  assert.doesNotMatch(storeManagerConsoleSectionHtml, /storeRetailSeedSummary/);
});

test("store PDA putaway page uses a mobile touch scan-first layout", () => {
  const summarySource = extractFunctionSource(appJs, "renderStoreTokenEditSummary");

  assert.equal(Boolean(storePdaWorkbenchSectionHtml), true);
  assert.match(storePdaWorkbenchSectionHtml, /store-pda-page/);
  assert.match(summarySource, /store-pda-mobile-shell/);
  assert.match(summarySource, /store-pda-mobile-status/);
  assert.match(summarySource, /扫描 STORE_ITEM 商品码/);
  assert.match(summarySource, /store-pda-mobile-scan-zone/);
  assert.match(summarySource, /store-pda-current-item-card/);
  assert.match(summarySource, /data-pda-confirm-putaway/);
  assert.match(summarySource, /store-pda-task-list/);
  assert.match(summarySource, /store-pda-bottom-actions/);
  assert.match(summarySource, /离线暂存，联网后同步/);
  assert.match(stylesCss, /\.store-pda-mobile-shell\s*\{/);
  assert.match(stylesCss, /\.store-pda-mobile-scan-zone\s*\{/);
  assert.match(stylesCss, /\.store-pda-bottom-actions\s*\{/);
});

test("store PDA scan guidance rejects non STORE_ITEM codes with next-step copy", () => {
  const guidanceSource = extractFunctionSource(appJs, "getStorePdaScanGuidance");

  assert.match(guidanceSource, /请扫描 STORE_ITEM 商品码。/);
  assert.match(guidanceSource, /这是 SDO \/ SDP，请去门店收货页面处理。/);
  assert.match(guidanceSource, /这是 SDB \/ LPK 来源包，不能直接上架销售。/);
  assert.match(guidanceSource, /这是 RAW_BALE，门店不能处理。/);
  assert.match(appJs, /resolveBarcodeForContext\(payload\.token_no,\s*"store_pda",\s*\["STORE_ITEM"\]\)/);
  assert.doesNotMatch(appJs, /resolveBarcodeForContext\(payload\.token_no,\s*"store_pda",\s*\[[^\]]*"RAW_BALE"/);
  assert.doesNotMatch(appJs, /resolveBarcodeForContext\(payload\.token_no,\s*"store_pda",\s*\[[^\]]*"STORE_DELIVERY_EXECUTION"/);
});

test("bucketStoreManagerDispatchBales keeps received and processing bales visible to the manager console", () => {
  const result = bucketStoreManagerDispatchBales([
    { bale_no: "SDB-001", status: "in_transit" },
    { bale_no: "SDB-002", status: "received" },
    { bale_no: "SDB-003", status: "processing" },
    { bale_no: "SDB-004", status: "completed" },
  ]);

  assert.deepEqual(result.arrivalQueue.map((row) => row.bale_no), ["SDB-001"]);
  assert.deepEqual(result.assignmentQueue.map((row) => row.bale_no), ["SDB-002"]);
  assert.deepEqual(result.activeQueue.map((row) => row.bale_no), ["SDB-003"]);
  assert.deepEqual(result.completedQueue.map((row) => row.bale_no), ["SDB-004"]);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  getStoreRoleLanding,
  getStoreWorkerDefault,
  getStoreAssignmentNavigation,
  getStoreManagerProgressNavigation,
  getStoreClerkCompletionNavigation,
  buildClerkAssignment,
  buildClerkShelvingTask,
  bucketStoreManagerDispatchBales,
} = require("../store-execution-flow.js");

const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const storeDispatchSectionHtml = (indexHtml.match(/<section class="panel store-support-panel" data-workspace-panel="store">[\s\S]*?<h2>6\. 门店验收配货 bale<\/h2>[\s\S]*?<pre id="storeDispatchBaleOutput" class="output hidden-output"><\/pre>\s*<\/section>/) || [""])[0];
const storeDispatchAssignmentSectionHtml = (indexHtml.match(/<form id="storeDispatchAssignmentForm" class="sorting-task-form warehouse-step-form">[\s\S]*?<pre id="storeDispatchAssignmentOutput" class="output hidden-output"><\/pre>/) || [""])[0];
const testingToolsSectionHtml = (indexHtml.match(/<section class="panel" data-workspace-panel="testing">[\s\S]*?<h2>测试工具<\/h2>[\s\S]*?<pre id="storeRecentSalesSimulationOutput" class="output hidden-output"><\/pre>\s*<\/section>/) || [""])[0];
const storeManagerConsoleSectionHtml = (indexHtml.match(/<section class="panel store-role-panel store-role-panel-manager" data-workspace-panel="store">[\s\S]*?<h2>5\. 门店执行控制台<\/h2>[\s\S]*?<pre id="storeManagerConsoleOutput" class="output hidden-output"><\/pre>\s*<\/section>/) || [""])[0];
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

test("store clerk fields expose Austin and Swahili as selectable clerk options", () => {
  assert.match(indexHtml, /<datalist id="storeClerkOptions">[\s\S]*<option value="Austin">/);
  assert.match(indexHtml, /<datalist id="storeClerkOptions">[\s\S]*<option value="Swahili">/);

  const pickerMatches = indexHtml.match(/list="storeClerkOptions"/g) || [];
  assert.ok(pickerMatches.length >= 6);
});

test("store dispatch acceptance page removes directory filters and keeps only barcode-driven receipt entry", () => {
  assert.equal(Boolean(storeDispatchSectionHtml), true);
  assert.doesNotMatch(storeDispatchSectionHtml, /name="shipment_no"/);
  assert.doesNotMatch(storeDispatchSectionHtml, /name="task_no"/);
  assert.doesNotMatch(storeDispatchSectionHtml, /name="status"/);
  assert.doesNotMatch(storeDispatchSectionHtml, />读取门店配货 bale</);
  assert.match(storeDispatchSectionHtml, /name="transfer_no" placeholder="先选择调拨单/);
  assert.match(storeDispatchSectionHtml, /<textarea name="bale_no" class="bulk-scan-input"/);
  assert.match(storeDispatchSectionHtml, /验收完成：批量确认本调拨单全部 bale/);
  assert.match(appJs, /function resolveStoreReceiptBaleNo/);
  assert.match(appJs, /function parseStoreReceiptScannedBaleNos/);
  assert.match(appJs, /function splitStoreReceiptContinuousChunk/);
  assert.match(appJs, /function buildStoreReceiptBatchPlan/);
  assert.match(appJs, /function normalizeStoreReceiptBaleInputFromForm/);
  assert.match(appJs, /function renderStoreReceiptTransferBaleList/);
  assert.match(appJs, /SDB026042500005/);
  assert.match(appJs, /genericShort = remaining\.match\(/);
  assert.match(appJs, /\^SDB\\d\{1,3\}/);
  assert.match(appJs, /if \(remaining === "SDB"\)/);
  assert.match(appJs, /if \(unresolvedRows\.length === 1\)/);
  assert.match(appJs, /#storeDispatchBaleAcceptForm \[name='bale_no'\][\s\S]*addEventListener\("input"/);
});

test("store manager can assign a transfer order batch or pasted dispatch bales in one submit", () => {
  assert.equal(Boolean(storeDispatchAssignmentSectionHtml), true);
  assert.match(indexHtml, /data-action="load-store-dispatch-assignment"/);
  assert.match(storeDispatchAssignmentSectionHtml, /sorting-task-flow-step/);
  assert.match(storeDispatchAssignmentSectionHtml, /确认批量分配给店员/);
  assert.match(storeDispatchAssignmentSectionHtml, /name="transfer_no"[\s\S]*总单/);
  assert.match(storeDispatchAssignmentSectionHtml, /<textarea name="bale_no"[\s\S]*一行一个/);
  assert.match(storeDispatchAssignmentSectionHtml, /一次可把本批多个包分给同一人/);
  assert.match(appJs, /function groupStoreDispatchRowsByTransfer/);
  assert.match(appJs, /function parseStoreDispatchAssignmentBaleNos/);
  assert.match(appJs, /async function resolveStoreDispatchAssignmentTargets/);
  assert.match(appJs, /function renderStoreDispatchAssignmentOverview/);
  assert.match(appJs, /待签收总单 \/ bale/);
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

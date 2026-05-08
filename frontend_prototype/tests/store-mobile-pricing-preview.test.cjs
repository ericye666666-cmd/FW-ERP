const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appJs = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
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

test("task tab shows assigned SDP task and opens barcode verification", () => {
  const taskListSource = extractFunctionSource(appJs, "renderStoreMobileTaskList");
  const actionSource = extractFunctionSource(appJs, "handleStoreMobilePricingPreviewAction");

  assert.match(taskListSource, /我的 SDP 任务/);
  assert.match(taskListSource, /SDP261250002/);
  assert.match(taskListSource, /牛仔裤/);
  assert.match(taskListSource, /210 件/);
  assert.match(taskListSource, /UTAWALA/);
  assert.match(taskListSource, /来源 \$\{sdoCode\}/);
  assert.match(taskListSource, /待核对/);
  assert.match(taskListSource, /开始任务/);
  assert.match(taskListSource, /data-mobile-pricing-start-task/);
  assert.match(actionSource, /startTask/);
  assert.match(actionSource, /state\.activePage = "verify"/);
});

test("barcode verification accepts only the assigned SDP display or machine code", () => {
  const scanScreenSource = extractFunctionSource(appJs, "renderStoreMobileScanStep");
  const verifierSource = extractFunctionSource(appJs, "verifyStoreMobileSdpBarcode");
  const submitSource = extractFunctionSource(appJs, "handleStoreMobileScanSubmit");

  assert.match(scanScreenSource, /扫描实体包/);
  assert.match(scanScreenSource, /请扫描 SDP 实体包条码/);
  assert.match(scanScreenSource, /data-scan-input="true"/);
  assert.match(scanScreenSource, /手动确认 \/ 核对/);
  assert.match(verifierSource, /SDP261250002/);
  assert.match(verifierSource, /6261250002/);
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

test("my tab shows only clerk PDA account settings and logout", () => {
  const mySource = extractFunctionSource(appJs, "renderStoreMobileMyTab");

  assert.match(mySource, /当前账号/);
  assert.match(mySource, /Austin/);
  assert.match(mySource, /门店/);
  assert.match(mySource, /UTAWALA/);
  assert.match(mySource, /角色/);
  assert.match(mySource, /店员/);
  assert.match(mySource, /Direct Loop PDA/);
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

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
  assert.match(cardSource, /data-mobile-pricing-generate-group="\$\{escapeHtml\(group\.group_id\)\}"/);
  assert.match(cardSource, /data-mobile-pricing-print-group="\$\{escapeHtml\(group\.group_id\)\}"/);
  assert.doesNotMatch(cardSource, /generate-all|print-all|一键生成全部|全部混合打印|混合总任务/);
});

test("mock data uses Utawala SDP display codes with matching price group quantities", () => {
  const stateSource = extractFunctionSource(appJs, "createStoreMobilePricingPreviewState");
  const sdpCardSource = extractFunctionSource(appJs, "renderStoreMobileSdpCard");

  assert.match(stateSource, /display_code:\s*"SDP261250002"/);
  assert.match(stateSource, /machine_code:\s*"6261250002"/);
  assert.match(stateSource, /sdo_code:\s*"SDO260504008"/);
  assert.match(stateSource, /sdo_machine_code:\s*"4260504008"/);
  assert.match(stateSource, /store_name:\s*"Direct Loop Utawala"/);
  assert.match(stateSource, /source_type:\s*"SDB"/);
  assert.match(stateSource, /source_code:\s*"SDB-TO202605-002"/);
  assert.match(stateSource, /source_machine_code:\s*"2202605002"/);
  assert.match(stateSource, /total_count:\s*210/);
  assert.match(stateSource, /grouped_count:\s*210/);
  assert.match(stateSource, /pending_generate_count:\s*130/);
  assert.match(stateSource, /pending_print_count:\s*80/);
  assert.match(stateSource, /generated_count:\s*80/);
  assert.match(stateSource, /printed_count:\s*0/);
  assert.match(stateSource, /group_id:\s*"B"[\s\S]*?price_kes:\s*100[\s\S]*?quantity:\s*80[\s\S]*?rack_code:\s*"A-02"/);
  assert.match(stateSource, /group_id:\s*"CUSTOM-200"[\s\S]*?price_kes:\s*200[\s\S]*?quantity:\s*20[\s\S]*?rack_code:\s*"A-03"/);
  assert.doesNotMatch(stateSource, /DLR-上海南京东路店|6002381948213|SDB \/ LPK|SDB261270045|LPK261270002/);
  assert.match(sdpCardSource, /sdp\.display_code/);
  assert.match(sdpCardSource, /sdp\.machine_code/);
  assert.match(sdpCardSource, /sdp\.sdo_machine_code/);
  assert.match(sdpCardSource, /sdp\.source_machine_code/);
});

test("SDP header is compact and uses the requested top statistics", () => {
  const sdpCardSource = extractFunctionSource(appJs, "renderStoreMobileSdpCard");

  assert.match(sdpCardSource, /mobile-code-secondary/);
  assert.match(sdpCardSource, /mobile-sdp-stat-strip/);
  assert.match(sdpCardSource, /总数/);
  assert.match(sdpCardSource, /已分组/);
  assert.match(sdpCardSource, /待生成/);
  assert.match(sdpCardSource, /待打印/);
  assert.match(sdpCardSource, /已打印/);
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

test("PDA pricing preview includes the requested clerk workflow pages and Chinese-only statuses", () => {
  const frameSource = extractFunctionSource(appJs, "renderStoreMobileDeviceFrame");

  assert.match(frameSource, /我的 SDP 任务/);
  assert.match(frameSource, /SDP 详情/);
  assert.match(frameSource, /现场分堆标价/);
  assert.match(frameSource, /价格组列表/);
  assert.match(frameSource, /本组 STORE_ITEM 生成结果/);
  assert.match(frameSource, /本组打印任务/);
  assert.match(frameSource, /打印队列预览/);
  assert.match(frameSource, /任务/);
  assert.match(frameSource, /扫描/);
  assert.match(frameSource, /标价/);
  assert.match(frameSource, /打印/);
  assert.match(frameSource, /我的/);
  assert.doesNotMatch(frameSource, /pending_print|pending_putaway|resolver projection|source_token_refs|lineage payload|transfer projection/);
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
  assert.match(stateSource, /group_id:\s*"CUSTOM-200"[\s\S]*?copies:\s*20[\s\S]*?status:\s*"queued"/);
  assert.match(queueSource, /renderStoreMobileStatusBadge/);
  assert.doesNotMatch(queueSource, /混合总任务|全部价格组|all groups/i);
});

test("print task panel starts uncreated and only mock action creates queued job detail", () => {
  const stateSource = extractFunctionSource(appJs, "createStoreMobilePricingPreviewState");
  const printPanelSource = extractFunctionSource(appJs, "renderPriceGroupPrintPanel");
  const actionSource = extractFunctionSource(appJs, "handleStoreMobilePricingPreviewAction");

  assert.match(stateSource, /createdPrintJobs:\s*\[\]/);
  assert.match(printPanelSource, /state\.createdPrintJobs/);
  assert.doesNotMatch(printPanelSource, /state\.printJobs/);
  assert.match(printPanelSource, /if \(!job\)/);
  assert.match(printPanelSource, /创建打印任务/);
  assert.equal((printPanelSource.match(/创建打印任务/g) || []).length, 1);
  assert.match(printPanelSource, /返回打印队列/);
  assert.match(printPanelSource, /data-mobile-pricing-page="print_queue"/);
  assert.doesNotMatch(printPanelSource, /打印任务创建成功/);
  assert.match(actionSource, /createdPrintJobs/);
  assert.match(actionSource, /status:\s*"queued"/);
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
  const sdpIndex = screenSource.indexOf("renderStoreMobileSdpCard");
  const groupsIndex = screenSource.indexOf("renderPriceGroupCards");
  const addIndex = screenSource.indexOf("新增价格组");

  assert.ok(sdpIndex > -1, "pricing screen renders compact SDP card");
  assert.ok(groupsIndex > sdpIndex, "price groups follow SDP card");
  assert.ok(addIndex > groupsIndex, "actions stay below price groups");
  assert.doesNotMatch(screenSource.slice(sdpIndex, groupsIndex), /mobile-section-head[\s\S]*?价格组总览/);
  assert.match(stylesCss, /\.mobile-pricing-workbench\s*\{[\s\S]*?gap:\s*8px/);
});

test("preview actions are mock-only and do not call backend mutations or print complete", () => {
  const actionSource = extractFunctionSource(appJs, "handleStoreMobilePricingPreviewAction");
  const renderSource = extractFunctionSource(appJs, "renderStoreMobilePricingPreview");

  assert.doesNotMatch(actionSource, /\brequest\s*\(/);
  assert.doesNotMatch(actionSource, /fetch\s*\(/);
  assert.doesNotMatch(actionSource, /\/print-jobs\/\$\{[^}]+\}\/complete|\/print-jobs\/item-tokens|store-items\/generate/);
  assert.doesNotMatch(renderSource, /\brequest\s*\(/);
  assert.match(actionSource, /storeMobilePricingPreviewState/);
  assert.match(actionSource, /queued/);
});

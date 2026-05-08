const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const appJs = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const stylesCss = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");

function functionSource(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `missing function ${functionName}`);
  const signatureEnd = source.indexOf(") {", start);
  assert.notEqual(signatureEnd, -1, `missing body for ${functionName}`);
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

function executableFunction(source, functionName) {
  return vm.runInNewContext(`(${functionSource(source, functionName)})`);
}

test("store manager PDA runtime bottom nav keeps the original four manager tabs", () => {
  const renderPreview = functionSource(appJs, "renderStoreManagerPdaPreview");
  const bottomTabs = functionSource(appJs, "renderStoreManagerPdaBottomTabs");
  const legacyGuard = indexHtml.match(/<script>\s*\(function legacyPdaLoginGuard\(\)[\s\S]*?<\/script>/)?.[0] || "";

  assert.match(renderPreview, /isPdaRuntimeMode\(\)/);
  assert.match(renderPreview, /renderStoreManagerPdaRuntimeScreen/);
  assert.match(bottomTabs, /STORE_MANAGER_PDA_TABS\.map/);
  ["经营总览", "收退货", "经营日志", "其他"].forEach((label) => {
    assert.match(appJs, new RegExp(`label: "${label}"`), `missing manager tab ${label}`);
    assert.match(legacyGuard, new RegExp(`>${label}<`), `legacy guard missing manager tab ${label}`);
  });
  assert.match(bottomTabs, /data-store-manager-pda-tab/);
  assert.doesNotMatch(bottomTabs, /const bottomTabs = \["任务", "我的"\]/);
  assert.doesNotMatch(legacyGuard, /data-legacy-manager-action="tasks">任务/);
  assert.doesNotMatch(legacyGuard, /data-legacy-manager-action="my">我的/);
});

test("PDA bottom nav is fixed or sticky at the physical screen bottom for manager and clerk", () => {
  assert.match(stylesCss, /body\.pda-runtime-mode\s+\.store-manager-pda-bottom-tabs[\s\S]*position:\s*(sticky|fixed)/);
  assert.match(stylesCss, /body\.pda-runtime-mode\s+\.store-manager-pda-bottom-tabs[\s\S]*bottom:\s*0/);
  assert.match(stylesCss, /body\.pda-runtime-mode\s+\.store-manager-pda-bottom-tabs[\s\S]*z-index:\s*(1[0-9]|2[0-9]|[3-9][0-9])/);
  assert.match(stylesCss, /body\.pda-runtime-mode\s+\.store-manager-pda-bottom-tabs[\s\S]*env\(safe-area-inset-bottom\)/);
  assert.match(stylesCss, /body\.pda-runtime-mode\s+\.store-mobile-runtime-screen\s+\.mobile-pricing-tabbar[\s\S]*position:\s*(sticky|fixed)/);
  assert.match(stylesCss, /body\.pda-runtime-mode\s+\.store-mobile-runtime-screen\s+\.mobile-pricing-tabbar[\s\S]*bottom:\s*0/);
  assert.match(stylesCss, /body\.pda-runtime-mode\s+\.store-mobile-runtime-screen\s+\.mobile-pricing-tabbar[\s\S]*z-index:\s*(1[0-9]|2[0-9]|[3-9][0-9])/);
  assert.match(stylesCss, /body\.pda-runtime-mode\s+\.store-mobile-runtime-screen\s+\.mobile-pricing-tabbar[\s\S]*env\(safe-area-inset-bottom\)/);
  assert.match(stylesCss, /body\.pda-runtime-mode\s+\.store-manager-pda-screen[\s\S]*padding-bottom:\s*calc/);
  assert.match(stylesCss, /body\.pda-runtime-mode\s+\.store-mobile-runtime-screen\s+\.mobile-pricing-screen[\s\S]*padding-bottom:\s*calc/);
});

test("manager task list shows the SDO260504008 demo receiving task", () => {
  const stateSource = functionSource(appJs, "createStoreManagerPdaTaskState");
  const taskList = functionSource(appJs, "renderStoreManagerPdaTaskList");
  const runtimeBody = functionSource(appJs, "renderStoreManagerPdaRuntimeBody");

  assert.match(appJs, /retail_ops_pda_demo_store_task_state/);
  assert.match(stateSource, /activeTab:\s*"receiving"/);
  assert.match(stateSource, /display_code:\s*"SDO260504008"/);
  assert.match(stateSource, /machine_code:\s*"4260504008"/);
  assert.match(stateSource, /store_code:\s*"UTAWALA"/);
  assert.match(stateSource, /source_code:\s*"SDB-TO202605-002"/);
  assert.match(stateSource, /display_code:\s*"SDP261250002"/);
  assert.match(stateSource, /machine_code:\s*"6261250002"/);
  assert.match(stateSource, /category:\s*"牛仔裤"/);
  assert.match(stateSource, /item_count:\s*210/);
  assert.match(stateSource, /display_code:\s*"SDP261250003"/);
  assert.match(stateSource, /category:\s*"女装上衣"/);
  assert.match(stateSource, /item_count:\s*180/);
  assert.match(taskList, /SDO260504008/);
  assert.match(taskList, /开始收货/);
  assert.match(taskList, /data-store-manager-pda-start-task/);
  assert.match(runtimeBody, /activeTab === "receiving"/);
  assert.match(runtimeBody, /renderStoreManagerPdaTaskFlow/);
});

test("starting manager task opens SDO scan verification with scanner input", () => {
  const scanStep = functionSource(appJs, "renderStoreManagerPdaSdoScanStep");
  const actionHandler = functionSource(appJs, "handleStoreManagerPdaTaskAction");

  assert.match(scanStep, /扫描 SDO 主单码/);
  assert.match(scanStep, /请扫描仓库送货单 SDO/);
  assert.match(scanStep, /data-scan-input="true"/);
  assert.match(scanStep, /手动确认 \/ 核对/);
  assert.match(actionHandler, /storeManagerPdaStartTask/);
  assert.match(actionHandler, /activePage = "scan"/);
});

test("manager SDO verification accepts only the assigned SDO display or machine code", () => {
  const validate = executableFunction(appJs, "validateStoreManagerPdaSdoScanCode");
  const taskVerifier = functionSource(appJs, "verifyStoreManagerPdaSdoBarcode");

  assert.equal(validate("SDO260504008").ok, true);
  assert.equal(validate("4260504008").ok, true);
  [
    ["SDP261250002", /SDP 是 SDO 内包明细/],
    ["6261250002", /SDP 是 SDO 内包明细/],
    ["SDB-TO202605-002", /SDB \/ LPK 是仓库来源包/],
    ["LPK260500001", /SDB \/ LPK 是仓库来源包/],
    ["STORE_ITEM-DEMO-A-001", /STORE_ITEM 只能用于 POS 销售/],
    ["SDO999999999", /不是当前 SDO 收货任务/],
  ].forEach(([code, pattern]) => {
    const result = validate(code);
    assert.equal(result.ok, false, `${code} should be rejected`);
    assert.match(result.error, pattern);
  });
  assert.match(taskVerifier, /SDO260504008/);
  assert.match(taskVerifier, /4260504008/);
  assert.match(taskVerifier, /不是当前 SDO 收货任务/);
});

test("successful SDO scan opens detail with both SDP packages", () => {
  const submitScan = functionSource(appJs, "handleStoreManagerPdaSdoScanSubmit");
  const detail = functionSource(appJs, "renderStoreManagerPdaSdoDetail");

  assert.match(submitScan, /state\.verified = true/);
  assert.match(submitScan, /state\.scanSuccess = "核对成功"/);
  assert.match(submitScan, /state\.activePage = "detail"/);
  assert.match(detail, /SDO260504008/);
  assert.match(detail, /Package count|包裹数/);
  assert.match(detail, /Total item count|总件数/);
  assert.match(detail, /renderStoreManagerPdaPackageCard/);
  assert.match(appJs, /display_code:\s*"SDP261250002"/);
  assert.match(appJs, /display_code:\s*"SDP261250003"/);
});

test("package receiving, exception, assignment, and completion state transitions are implemented", () => {
  const receivePackage = functionSource(appJs, "receiveStoreManagerPdaPackage");
  const markException = functionSource(appJs, "markStoreManagerPdaPackageException");
  const assignPackage = functionSource(appJs, "assignStoreManagerPdaPackageToClerk");
  const updateCompletion = functionSource(appJs, "updateStoreManagerPdaTaskCompletion");
  const packageCard = functionSource(appJs, "renderStoreManagerPdaPackageCard");
  const completion = functionSource(appJs, "renderStoreManagerPdaCompletionSummary");

  assert.match(receivePackage, /status = "已收货 \/ 待分配"/);
  assert.match(markException, /status = "异常"/);
  assert.match(assignPackage, /if \(pkg\.status === "异常"\)/);
  assert.match(assignPackage, /return state/);
  assert.match(assignPackage, /assigned_clerk = clerkName/);
  assert.match(assignPackage, /status = "已分配"/);
  assert.match(packageCard, /分配店员/);
  assert.match(packageCard, /Austin/);
  assert.match(packageCard, /Nancy/);
  assert.match(packageCard, /Kevin/);
  assert.match(packageCard, /已推送给 Austin/);
  assert.match(updateCompletion, /status = "已完成"/);
  assert.match(updateCompletion, /activePage = "complete"/);
  assert.match(completion, /Packages 2\/2 processed|包裹 2\/2 已处理/);
  assert.match(completion, /Assigned 2|已分配 2/);
  assert.match(completion, /Exceptions 0|异常 0/);
  assert.match(completion, /返回任务列表/);
});

test("manager other tab is scoped to PDA account settings", () => {
  const myTab = functionSource(appJs, "renderStoreManagerPdaMyTab");

  assert.match(myTab, /当前账号/);
  assert.match(myTab, /store_manager_1/);
  assert.match(myTab, /门店/);
  assert.match(myTab, /UTAWALA/);
  assert.match(myTab, /角色/);
  assert.match(myTab, /店长/);
  assert.match(myTab, /PDA mode \/ version/);
  assert.match(myTab, /退出登录/);
  assert.match(myTab, /重置演示任务状态/);
  assert.match(myTab, /其他/);
  assert.doesNotMatch(myTab, /warehouse|POS|经营总览|收退货|经营日志/i);
});

test("PDA runtime does not render the desktop preview shell", () => {
  const runtimeScreen = functionSource(appJs, "renderStoreManagerPdaRuntimeScreen");
  const renderPreview = functionSource(appJs, "renderStoreManagerPdaPreview");

  assert.match(runtimeScreen, /data-pda-runtime-surface="store-manager"/);
  assert.match(runtimeScreen, /renderStoreManagerPdaBottomTabs/);
  assert.doesNotMatch(runtimeScreen, /store-manager-pda-device-bar/);
  assert.doesNotMatch(runtimeScreen, /预览数据|Android PDA preview|PDA 现场分堆标价 UI Preview/);
  assert.match(renderPreview, /STORE_MANAGER_PDA_TABS/);
});

test("clerk PDA from #208 still keeps only tasks and my tabs", () => {
  const bottomTabs = functionSource(appJs, "renderStoreMobileBottomTabs");
  const actionHandler = functionSource(appJs, "handleStoreMobilePricingPreviewAction");

  assert.match(bottomTabs, /const bottomTabs = \["任务", "我的"\]/);
  assert.doesNotMatch(bottomTabs, /扫描|标价|打印/);
  assert.match(actionHandler, /mobilePricingStartTask/);
  assert.match(actionHandler, /advanceStoreMobileGroupWorkflow/);
});

test("manager PDA cache-busts app and style assets", () => {
  assert.match(indexHtml, /<link rel="stylesheet" href="\.\/styles\.css\?v=manager-pda-task-flow-209" \/>/);
  assert.match(indexHtml, /<script src="\.\/app\.js\?v=manager-pda-task-flow-209"><\/script>/);
});

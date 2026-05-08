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

function executableStoreManagerSdoVerifier() {
  return vm.runInNewContext(`
    ${functionSource(appJs, "validateStoreManagerPdaSdoScanCode")}
    ${functionSource(appJs, "verifyStoreManagerPdaSdoBarcode")}
    verifyStoreManagerPdaSdoBarcode;
  `, {
    getCurrentStoreCodeFallback: () => "UTAWALA",
  });
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

test("manager runtime state is backend-backed, store scoped, and no longer seeds demo SDO data", () => {
  const stateSource = functionSource(appJs, "createStoreManagerPdaTaskState");
  const backendLoad = functionSource(appJs, "loadStoreManagerPdaBackendState");
  const taskList = functionSource(appJs, "renderStoreManagerPdaTaskList");
  const renderPreview = functionSource(appJs, "renderStoreManagerPdaPreview");

  assert.doesNotMatch(appJs, /retail_ops_pda_demo_store_task_state/);
  assert.match(stateSource, /sdoTasks:\s*\[\]/);
  assert.match(stateSource, /sdoTask:\s*null/);
  assert.doesNotMatch(stateSource, /SDO260504008/);
  assert.doesNotMatch(stateSource, /SDP261250002/);
  assert.match(backendLoad, /await loadTransferOrders\(\)/);
  assert.match(backendLoad, /await refreshUserDirectoryForPickers/);
  assert.match(backendLoad, /getStoreManagerPdaSdoTasksForStore\(getCurrentStoreCodeFallback\(\)\)/);
  assert.match(backendLoad, /getAssignableStoreClerks\(storeCode\)/);
  assert.match(taskList, /暂无待收货 SDO，请先在仓库端完成 SDO 发货。/);
  assert.match(renderPreview, /loadStoreManagerPdaBackendState/);
});

test("manager SDO task adapter maps real transfer SDO package data and keeps SDB/LPK as source references", () => {
  const adapter = functionSource(appJs, "getStoreManagerPdaSdoTasksForStore");
  const normalizeTask = functionSource(appJs, "normalizeStoreManagerPdaSdoTask");
  const normalizePackage = functionSource(appJs, "normalizeStoreManagerPdaPackage");

  assert.match(adapter, /getStoreReceivingPackageRows\(storeCode\)/);
  assert.match(adapter, /groupStoreReceivingPackagesBySdo/);
  assert.match(adapter, /store_code/);
  assert.match(normalizeTask, /display_code/);
  assert.match(normalizeTask, /machine_code/);
  assert.match(normalizeTask, /source_code/);
  assert.match(normalizeTask, /package_count/);
  assert.match(normalizeTask, /total_item_count/);
  assert.match(normalizeTask, /packages/);
  assert.match(normalizePackage, /sdo_package_display_code/);
  assert.match(normalizePackage, /sdo_package_machine_code/);
  assert.match(normalizePackage, /source_code/);
  assert.match(normalizePackage, /received_status/);
  assert.match(normalizePackage, /exception_status/);
  assert.match(normalizePackage, /assigned_clerk/);
  assert.match(normalizePackage, /assignment_status/);
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

test("manager SDO verification accepts only SDO display or 4-prefix machine code for the current store", () => {
  const validate = executableFunction(appJs, "validateStoreManagerPdaSdoScanCode");
  const verifier = functionSource(appJs, "verifyStoreManagerPdaSdoBarcode");

  assert.equal(validate("SDO260504008").ok, true);
  assert.equal(validate("4260504008").ok, true);
  [
    ["SDP261250002", /SDP 是 SDO 内包明细/],
    ["6261250002", /SDP 是 SDO 内包明细/],
    ["SDB-TO202605-002", /SDB \/ LPK 是仓库来源包/],
    ["LPK260500001", /SDB \/ LPK 是仓库来源包/],
    ["STORE_ITEM-DEMO-A-001", /STORE_ITEM 只能用于 POS 销售/],
  ].forEach(([code, pattern]) => {
    const result = validate(code);
    assert.equal(result.ok, false, `${code} should be rejected`);
    assert.match(result.error, pattern);
  });
  assert.match(verifier, /state\?\.sdoTask/);
  assert.match(verifier, /task\.store_code/);
  assert.match(verifier, /不属于当前门店/);
  assert.match(verifier, /当前选中的 SDO/);
  assert.doesNotMatch(verifier, /SDO260504008/);
  assert.doesNotMatch(verifier, /4260504008/);
});

test("manager SDO verification accepts only the selected current SDO task", () => {
  const verify = executableStoreManagerSdoVerifier();
  const currentTask = {
    display_code: "SDO260504001",
    machine_code: "4260504001",
    store_code: "UTAWALA",
  };
  const siblingTask = {
    display_code: "SDO260504002",
    machine_code: "4260504002",
    store_code: "UTAWALA",
  };
  const state = {
    sdoTask: currentTask,
    sdoTasks: [currentTask, siblingTask],
  };

  assert.equal(verify("SDO260504001", state).ok, true);
  assert.equal(verify("4260504001", state).ok, true);

  const siblingDisplay = verify("SDO260504002", state);
  const siblingMachine = verify("4260504002", state);
  assert.equal(siblingDisplay.ok, false);
  assert.equal(siblingMachine.ok, false);
  assert.match(siblingDisplay.error, /当前选中的 SDO/);
  assert.match(siblingMachine.error, /当前选中的 SDO/);
});

test("manager SDO verification rejects selected SDO if it belongs to another store", () => {
  const verify = executableStoreManagerSdoVerifier();
  const otherStoreTask = {
    display_code: "SDO260504099",
    machine_code: "4260504099",
    store_code: "KAWANGWARE",
  };
  const result = verify("SDO260504099", {
    sdoTask: otherStoreTask,
    sdoTasks: [otherStoreTask],
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /不属于当前门店/);
});

test("manager SDO task adapter scopes SDO cards to the manager store", () => {
  const getTasks = vm.runInNewContext(`
    ${functionSource(appJs, "getStoreManagerPdaPackageStatus")}
    ${functionSource(appJs, "normalizeStoreManagerPdaPackage")}
    ${functionSource(appJs, "normalizeStoreManagerPdaSdoTask")}
    ${functionSource(appJs, "getStoreManagerPdaSdoTasksForStore")}
    getStoreManagerPdaSdoTasksForStore;
  `, {
    getCurrentStoreCodeFallback: () => "UTAWALA",
    getStoreReceivingPackageCode: (row) => row.sdo_package_display_code || row.display_code || "",
    normalizeStoreReceivingPackageRow: (row) => row,
    getStoreReceivingPackageRows: () => [],
    groupStoreReceivingPackagesBySdo: () => [
      {
        sdo_display_code: "SDO260504001",
        sdo_machine_code: "4260504001",
        store_code: "UTAWALA",
        item_count: 210,
        packages: [
          {
            sdo_package_display_code: "SDP261250002",
            sdo_package_machine_code: "6261250002",
            store_code: "UTAWALA",
            source_code: "SDB-TO202605-002",
            received_status: "pending",
            exception_status: "normal",
            assignment_status: "unassigned",
          },
        ],
      },
      {
        sdo_display_code: "SDO260504099",
        sdo_machine_code: "4260504099",
        store_code: "KAWANGWARE",
        item_count: 50,
        packages: [
          {
            sdo_package_display_code: "SDP261250099",
            sdo_package_machine_code: "6261250099",
            store_code: "KAWANGWARE",
            source_code: "LPK260504001",
            received_status: "pending",
            exception_status: "normal",
            assignment_status: "unassigned",
          },
        ],
      },
    ],
  });

  const tasks = getTasks("UTAWALA");
  assert.deepEqual(tasks.map((task) => task.display_code), ["SDO260504001"]);
  assert.equal(tasks[0].packages[0].source_code, "SDB-TO202605-002");
});

test("successful SDO scan opens backend package detail rows", () => {
  const submitScan = functionSource(appJs, "handleStoreManagerPdaSdoScanSubmit");
  const detail = functionSource(appJs, "renderStoreManagerPdaSdoDetail");
  const packageCard = functionSource(appJs, "renderStoreManagerPdaPackageCard");

  assert.match(submitScan, /state\.verified = true/);
  assert.match(submitScan, /state\.scanSuccess = "核对成功"/);
  assert.match(submitScan, /state\.activePage = "detail"/);
  assert.match(submitScan, /state\.sdoTask = validation\.task/);
  assert.match(detail, /Package count|包裹数/);
  assert.match(detail, /Total item count|总件数/);
  assert.match(detail, /renderStoreManagerPdaPackageCard/);
  assert.match(packageCard, /source_code/);
  assert.match(packageCard, /SDB \/ LPK 只作为来源参考/);
  assert.doesNotMatch(detail, /演示任务：真实跨设备推送将在后端持久化阶段接入/);
});

test("package receive, exception, assignment, and completion use backend package helpers", () => {
  const receivePackage = functionSource(appJs, "receiveStoreManagerPdaPackage");
  const markException = functionSource(appJs, "markStoreManagerPdaPackageException");
  const assignPackage = functionSource(appJs, "assignStoreManagerPdaPackageToClerk");
  const packageCard = functionSource(appJs, "renderStoreManagerPdaPackageCard");
  const completion = functionSource(appJs, "renderStoreManagerPdaCompletionSummary");

  assert.match(receivePackage, /await receiveStoreReceivingPackage/);
  assert.match(markException, /await markStoreReceivingPackageException/);
  assert.match(assignPackage, /await assignStoreReceivingPackagesToClerk/);
  assert.match(receivePackage, /await loadTransferOrders\(\)/);
  assert.match(assignPackage, /await loadStoreAssignedSdoPackageTasks/);
  assert.match(assignPackage, /已分配给/);
  assert.match(packageCard, /分配店员/);
  assert.match(packageCard, /availableClerks/);
  assert.doesNotMatch(packageCard, /const clerkOptions = \["Austin", "Nancy", "Kevin"\]/);
  assert.match(completion, /Packages|包裹/);
  assert.match(completion, /Assigned|已分配/);
  assert.match(completion, /Exceptions|异常/);
  assert.match(completion, /返回任务列表/);
});

test("manager available clerk list is data-driven from active UTAWALA store_clerk users", () => {
  const backendLoad = functionSource(appJs, "loadStoreManagerPdaBackendState");
  const packageCard = functionSource(appJs, "renderStoreManagerPdaPackageCard");

  assert.match(backendLoad, /getAssignableStoreClerks\(storeCode\)/);
  assert.match(backendLoad, /buildAssignableUserOptionRows/);
  assert.match(packageCard, /state\.availableClerks/);
  assert.match(packageCard, /data-store-manager-pda-clerk/);
  assert.match(packageCard, /当前没有可分配店员/);
  assert.doesNotMatch(packageCard, /已推送给 Austin/);
});

test("manager other tab is scoped to PDA account settings without demo reset", () => {
  const myTab = functionSource(appJs, "renderStoreManagerPdaMyTab");

  assert.match(myTab, /当前账号/);
  assert.match(myTab, /currentSession\.user/);
  assert.match(myTab, /门店/);
  assert.match(myTab, /getCurrentStoreCodeFallback/);
  assert.match(myTab, /角色/);
  assert.match(myTab, /店长/);
  assert.match(myTab, /PDA mode \/ version/);
  assert.match(myTab, /退出登录/);
  assert.doesNotMatch(myTab, /重置演示任务状态/);
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

test("clerk PDA from #208 still keeps two tabs and visibly notes that real assigned SDP linkage is not wired", () => {
  const bottomTabs = functionSource(appJs, "renderStoreMobileBottomTabs");
  const taskList = functionSource(appJs, "renderStoreMobileTaskList");
  const actionHandler = functionSource(appJs, "handleStoreMobilePricingPreviewAction");

  assert.match(bottomTabs, /const bottomTabs = \["任务", "我的"\]/);
  assert.doesNotMatch(bottomTabs, /扫描|标价|打印/);
  assert.match(taskList, /当前店员端为演示流程；真实 assigned SDP 接入在后续 PR。/);
  assert.match(actionHandler, /mobilePricingStartTask/);
  assert.match(actionHandler, /advanceStoreMobileGroupWorkflow/);
});

test("manager PDA cache-busts app and style assets", () => {
  assert.match(indexHtml, /<link rel="stylesheet" href="\.\/styles\.css\?v=manager-pda-backend-210" \/>/);
  assert.match(indexHtml, /<script src="\.\/app\.js\?v=sdo-package-allocation-211"><\/script>/);
  assert.match(indexHtml, /<script src="\.\/operations-fulfillment-flow\.js\?v=sdo-package-allocation-211"><\/script>/);
});

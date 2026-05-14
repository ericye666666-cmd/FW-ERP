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

const {
  getAssignableStoreClerks,
  getAssignableWarehouseStaff,
  getActiveCashiers,
} = loadStoreExecutionFlow();

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

function extractHtmlElementById(source, tagName, id) {
  return source.match(new RegExp(`<${tagName}[^>]*id="${id}"[\\s\\S]*?<\\/${tagName}>`))?.[0] || "";
}

const users = [
  { username: "austin", full_name: "Austin", role_code: "store_clerk", store_code: "UTAWALA", status: "active", is_active: true },
  { username: "inactive_clerk", full_name: "Inactive Clerk", role_code: "store_clerk", store_code: "UTAWALA", status: "inactive", is_active: false },
  { username: "cashier_1", full_name: "Cashier One", role_code: "cashier", store_code: "UTAWALA", status: "active", is_active: true },
  { username: "kawangware_clerk", full_name: "Kawangware Clerk", role_code: "store_clerk", store_code: "KAWANGWARE", status: "active", is_active: true },
  { username: "warehouse_clerk_1", full_name: "Warehouse Clerk", role_code: "warehouse_clerk", warehouse_code: "WH1", status: "active", is_active: true },
  { username: "warehouse_manager_1", full_name: "Warehouse Manager", role_code: "warehouse_manager", warehouse_code: "WH1", status: "active", is_active: true },
  { username: "warehouse_other", full_name: "Other Warehouse", role_code: "warehouse_clerk", warehouse_code: "WH2", status: "active", is_active: true },
];

test("store clerk assignment only shows active store_clerk users from the same store", () => {
  const rows = getAssignableStoreClerks(users, "UTAWALA");

  assert.deepEqual(rows.map((row) => row.username), ["austin"]);
  assert.equal(rows.some((row) => row.username === "inactive_clerk"), false);
  assert.equal(rows.some((row) => row.username === "cashier_1"), false);
  assert.equal(rows.some((row) => row.username === "kawangware_clerk"), false);
  assert.equal(rows.some((row) => row.username === "warehouse_clerk_1"), false);
});

test("Utawala clerk picker includes every active store_clerk, not only Austin", () => {
  const rows = getAssignableStoreClerks([
    { username: "store_clerk_1", full_name: "Store Clerk One", role_code: "store_clerk", store_code: "UTAWALA", status: "active", is_active: true },
    { username: "Austin", full_name: "Austin", role_code: "store_clerk", store_code: "UTAWALA", status: "active", is_active: true },
    { username: "Swahili", full_name: "Swahili", role_code: "store_clerk", store_code: "UTAWALA", status: "active", is_active: true },
    { username: "cashier_1", full_name: "Cashier One", role_code: "cashier", store_code: "UTAWALA", status: "active", is_active: true },
    { username: "inactive_utawala", full_name: "Inactive", role_code: "store_clerk", store_code: "UTAWALA", status: "inactive", is_active: false },
    { username: "other_store", full_name: "Other Store", role_code: "store_clerk", store_code: "KAWANGWARE", status: "active", is_active: true },
  ], "UTAWALA");

  assert.deepEqual(rows.map((row) => row.username), ["store_clerk_1", "Austin", "Swahili"]);
});

test("warehouse staff picker only shows active warehouse workers from the same warehouse", () => {
  const rows = getAssignableWarehouseStaff(users, "WH1");

  assert.deepEqual(rows.map((row) => row.username), ["warehouse_clerk_1", "warehouse_manager_1"]);
  assert.equal(rows.some((row) => row.role_code === "store_clerk"), false);
  assert.equal(rows.some((row) => row.username === "warehouse_other"), false);
});

test("cashier picker only shows active cashiers from the same store", () => {
  const rows = getActiveCashiers(users, "UTAWALA");

  assert.deepEqual(rows.map((row) => row.username), ["cashier_1"]);
  assert.equal(rows.some((row) => row.role_code === "store_clerk"), false);
});

test("user status and role edits immediately change picker membership", () => {
  const disabled = users.map((row) => row.username === "austin" ? { ...row, status: "inactive", is_active: false } : row);
  assert.deepEqual(getAssignableStoreClerks(disabled, "UTAWALA").map((row) => row.username), []);

  const enabled = disabled.map((row) => row.username === "austin" ? { ...row, status: "active", is_active: true } : row);
  assert.deepEqual(getAssignableStoreClerks(enabled, "UTAWALA").map((row) => row.username), ["austin"]);

  const cashierAustin = enabled.map((row) => row.username === "austin" ? { ...row, role_code: "cashier" } : row);
  assert.deepEqual(getAssignableStoreClerks(cashierAustin, "UTAWALA").map((row) => row.username), []);
  assert.deepEqual(getActiveCashiers(cashierAustin, "UTAWALA").map((row) => row.username), ["austin", "cashier_1"]);
});

test("frontend reuses central user picker helpers instead of static staff lists", () => {
  assert.match(appJs, /function refreshAssignableUserPickers/);
  assert.match(appJs, /getAssignableStoreClerks/);
  assert.match(appJs, /getAssignableWarehouseStaff/);
  assert.match(appJs, /getActiveCashiers/);
  const refreshFunction = appJs.match(/function refreshAssignableUserPickers[\s\S]*?async function refreshUserDirectoryForPickers/)?.[0] || "";
  assert.match(refreshFunction, /compressionEmployeeState\s*=\s*getAssignableWarehouseStaff\(warehouseCode\)/);
  assert.match(refreshFunction, /renderJsonBuilder\("sorting-handler-names"\)/);
  assert.match(appJs, /No active staff available/);
  assert.doesNotMatch(indexHtml, /<option value="Austin">Austin<\/option>/);
  assert.doesNotMatch(indexHtml, /<option value="Swahili">Swahili<\/option>/);
  assert.doesNotMatch(appJs, /const fallback = \["Austin", "Swahili", "Josephine"\]/);
});

test("role access profiles keep each account inside its operational workspace", () => {
  const profileSource = extractFunctionSource(appJs, "getRoleAccessProfile");
  const warehouseWorkerBlock = profileSource.slice(
    profileSource.indexOf("const warehouseWorkerRoles"),
    profileSource.indexOf("const managerRoles"),
  );
  const cashierBlock = profileSource.slice(
    profileSource.indexOf("const cashierRoles"),
    profileSource.indexOf("return createRoleAccessProfile([], {})"),
  );

  assert.match(profileSource, /const warehouseManagerRoles = new Set\(\["warehouse_manager", "warehouse_supervisor"\]\)/);
  assert.match(profileSource, /warehouse:\s*\["inbound", "departmentInbound", "workorder", "replenishment", "baleSales", "general", "china"\]/);
  assert.match(profileSource, /const warehouseWorkerRoles = new Set\(\["warehouse_clerk", "warehouse_staff", "sorter", "sorting_clerk", "dispatcher", "packer", "warehouse_dispatcher"\]\)/);
  assert.match(profileSource, /return createRoleAccessProfile\(\["warehouse"\], \{\s*warehouse:\s*\["inbound", "departmentInbound", "workorder"\]/);
  assert.match(profileSource, /const cashierRoles = new Set\(\["cashier", "store_cashier"\]\)/);
  assert.match(profileSource, /return createRoleAccessProfile\(\["store"\], \{\s*store:\s*\["cashier"\]/);
  assert.match(profileSource, /const clerkRoles = new Set\(\["store_clerk", "clerk", "store_staff", "sales_clerk"\]\)/);
  assert.match(profileSource, /return createRoleAccessProfile\(\["store"\], \{\s*store:\s*\["clerk"\]/);
  assert.match(profileSource, /if \(roleCode === "area_supervisor"\)/);
  assert.match(profileSource, /operations:\s*\["areaHome", "areaStores", "areaStaff", "areaOverview", "areaSettings"\]/);
  assert.match(profileSource, /const regionalRoles = new Set\(\["regional_manager", "area_manager", "operations_manager"\]\)/);
  assert.match(profileSource, /return createRoleAccessProfile\(\["operations"\], \{\s*operations:\s*\["insight", "action", "governance"\]/);
  assert.doesNotMatch(cashierBlock, /warehouse:\s*\[/);
  assert.doesNotMatch(warehouseWorkerBlock, /store:\s*\["cashier"\]/);
});

test("area supervisor gets a launch console entry without exposing admin-only user roles", () => {
  const profileSource = extractFunctionSource(appJs, "getRoleAccessProfile");
  const areaSupervisorBlock = profileSource.slice(
    profileSource.indexOf("roleCode === \"area_supervisor\""),
    profileSource.indexOf("const regionalRoles"),
  );
  const regionalBlock = profileSource.slice(
    profileSource.indexOf("const regionalRoles"),
    profileSource.indexOf("const warehouseManagerRoles"),
  );
  const userCreateForm = indexHtml.match(/<form id="areaSupervisorUserCreateForm"[\s\S]*?<\/form>/)?.[0] || "";
  const allowedRoles = appJs.match(/const AREA_SUPERVISOR_STORE_EMPLOYEE_ROLES[\s\S]*?\]\);/)?.[0] || "";

  assert.match(appJs, /const AREA_SUPERVISOR_STORE_EMPLOYEE_ROLES = Object\.freeze\(\["store_manager", "store_clerk", "cashier"\]\)/);
  assert.doesNotMatch(allowedRoles, /admin|area_supervisor|warehouse_|external_auditor/);
  assert.match(areaSupervisorBlock, /operations:\s*\["areaHome", "areaStores", "areaStaff", "areaOverview", "areaSettings"\]/);
  assert.doesNotMatch(regionalBlock, /area_supervisor/);
  assert.match(appJs, /match: "区域主管工作台"/);
  assert.match(appJs, /match: "门店管理"/);
  assert.match(appJs, /match: "员工管理"/);
  assert.match(extractFunctionSource(appJs, "getUserRoleLanding"), /roleCode === "area_supervisor"[\s\S]*panelTitle: "区域主管工作台"/);
  assert.match(
    extractFunctionSource(appJs, "initWorkspacePageRegistry"),
    /area-supervisor-page-head h3[\s\S]*area-supervisor-topbar h2/,
  );
  assert.match(extractFunctionSource(appJs, "setActivePanel"), /area-supervisor-workspace-mode/);
  assert.match(indexHtml, /id="areaSupervisorWorkbench"/);
  assert.match(indexHtml, /id="areaSupervisorStoreManagement"/);
  assert.match(indexHtml, /id="areaSupervisorStaffManagement"/);
  assert.match(userCreateForm, /value="store_manager"/);
  assert.match(userCreateForm, /value="store_clerk"/);
  assert.match(userCreateForm, /value="cashier"/);
  assert.doesNotMatch(userCreateForm, /value="admin"|value="area_supervisor"|warehouse_|external_auditor/);
  assert.doesNotMatch(userCreateForm, />[^<]*(store_manager|store_clerk|cashier)[^<]*<\/option>/);
});

test("area supervisor launch console reuses existing store and user RBAC APIs", () => {
  const requiredFunctions = [
    "loadAreaSupervisorLaunchConsoleData",
    "submitAreaSupervisorStoreCreate",
    "submitAreaSupervisorStoreUpdate",
    "submitAreaSupervisorUserCreate",
    "submitAreaSupervisorPasswordReset",
    "deactivateAreaSupervisorStoreUser",
    "renderAreaSupervisorLaunchError",
  ];

  requiredFunctions.forEach((functionName) => {
    assert.match(appJs, new RegExp(`function ${functionName}|async function ${functionName}`), `missing ${functionName}`);
  });
  assert.match(appJs, /request\("\/stores"\)/);
  assert.match(appJs, /request\("\/stores",\s*\{\s*method:\s*"POST"/);
  assert.match(appJs, /request\(`\/stores\/\$\{encodeURIComponent\(storeCode\)\}`,\s*\{\s*method:\s*"PATCH"/);
  assert.match(appJs, /request\("\/users"\)/);
  assert.match(appJs, /request\("\/users",\s*\{\s*method:\s*"POST"/);
  assert.match(appJs, /request\(`\/users\/\$\{encodeURIComponent\(userId\)\}`,\s*\{\s*method:\s*"PATCH"/);
  assert.match(
    extractFunctionSource(appJs, "deactivateAreaSupervisorStoreUser"),
    /request\(`\/users\/\$\{encodeURIComponent\(normalizedUserId\)\}`,\s*\{\s*method:\s*"PATCH",[\s\S]*status:\s*"inactive"[\s\S]*is_active:\s*false/,
  );
  assert.match(extractFunctionSource(appJs, "renderAreaSupervisorLaunchError"), /formatErrorMessage\(error\)/);
});

test("area supervisor store and staff pages stay business-facing and avoid dashboard clutter", () => {
  const areaSupervisorHtml = indexHtml.match(/<section[^>]*id="areaSupervisorWorkbench"[\s\S]*?<pre id="areaSupervisorLaunchOutput"/)?.[0] || "";
  const storePage = extractHtmlElementById(indexHtml, "section", "areaSupervisorStoreManagement");
  const staffPage = extractHtmlElementById(indexHtml, "section", "areaSupervisorStaffManagement");
  const drawer = indexHtml.match(/<div id="areaSupervisorDrawer"[\s\S]*?<pre id="areaSupervisorLaunchOutput"/)?.[0] || "";

  assert.match(areaSupervisorHtml, /区域主管工作台/);
  assert.match(areaSupervisorHtml, /当前用户：区域主管/);
  assert.match(areaSupervisorHtml, /在线/);
  assert.match(storePage, /门店管理/);
  assert.match(storePage, /录入和维护门店基础资料/);
  assert.match(storePage, /全部门店/);
  assert.match(storePage, /营业中/);
  assert.match(storePage, /暂停营业/);
  assert.match(storePage, /已关闭/);
  assert.match(storePage, /搜索门店名称 \/ 门店代码/);
  assert.match(storePage, /全部状态/);
  assert.match(storePage, /门店详情/);
  assert.match(staffPage, /员工管理/);
  assert.match(staffPage, /创建门店员工账号，维护账号状态/);
  assert.match(staffPage, /搜索员工姓名 \/ 用户名 \/ 手机号/);
  assert.match(staffPage, /所属门店/);
  assert.match(staffPage, /角色/);
  assert.match(staffPage, /状态/);
  assert.match(drawer, /id="areaSupervisorStoreCreateForm"/);
  assert.match(drawer, /id="areaSupervisorStoreUpdateForm"/);
  assert.match(drawer, /id="areaSupervisorUserCreateForm"/);
  assert.match(drawer, /id="areaSupervisorPasswordResetForm"/);
  assert.match(drawer, /id="areaSupervisorDeactivateConfirm"/);
  assert.match(drawer, /地图链接/);
  assert.doesNotMatch(storePage, /<form id="areaSupervisorStore(Create|Update)Form"/);
  assert.doesNotMatch(staffPage, /<form id="areaSupervisorUserCreateForm"|<form id="areaSupervisorPasswordResetForm"/);
  assert.doesNotMatch(areaSupervisorHtml, /销售额|订单数|销售趋势|库存预警|CreateStoreDetails|DefaultAccount|raw json|Delete|删除门店|删除员工|详情链接/);
  assert.match(stylesCss, /\.area-supervisor-form\[hidden\][\s\S]*display:\s*none/);
  assert.match(stylesCss, /\.area-supervisor-card-actions \.secondary-inline[\s\S]*width:\s*auto/);
  assert.match(stylesCss, /area-supervisor-workspace-mode \.workspace-page-search[\s\S]*display:\s*none/);
});

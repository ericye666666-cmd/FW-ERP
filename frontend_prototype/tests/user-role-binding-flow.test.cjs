const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const appJs = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const seedDataPy = fs.readFileSync(path.join(__dirname, "..", "..", "backend", "app", "core", "seed_data.py"), "utf8");

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

const userFormHtml = (indexHtml.match(/<form id="userForm"[\s\S]*?<\/form>/) || [""])[0];

test("system user form uses role dropdown and role-specific organization fields", () => {
  assert.match(userFormHtml, /<select name="role_code"/);
  [
    "store_clerk",
    "store_manager",
    "cashier",
    "area_supervisor",
    "warehouse_clerk",
    "warehouse_manager",
    "admin",
  ].forEach((roleCode) => assert.match(userFormHtml, new RegExp(`value="${roleCode}"`)));
  assert.match(userFormHtml, /name="store_code"[\s\S]*data-user-org-field="store"/);
  assert.match(userFormHtml, /name="warehouse_code"[\s\S]*data-user-org-field="warehouse"/);
  assert.match(userFormHtml, /name="area_code"[\s\S]*data-user-org-field="area"/);
  assert.match(userFormHtml, /name="managed_store_codes"[\s\S]*data-user-org-field="area"/);
  assert.match(userFormHtml, /name="status"/);
});

test("demo seed exposes direct login users for each test role", () => {
  [
    ["admin_1", "admin"],
    ["warehouse_clerk_1", "warehouse_clerk"],
    ["warehouse_manager_1", "warehouse_manager"],
    ["store_manager_1", "store_manager"],
    ["store_clerk_1", "store_clerk"],
    ["cashier_1", "cashier"],
    ["area_supervisor_1", "area_supervisor"],
  ].forEach(([username, roleCode]) => {
    assert.match(seedDataPy, new RegExp(`"username": "${username}"[\\s\\S]*?"role_code": "${roleCode}"`));
  });
});

test("role access profiles keep POS cashier-only and map each Direct Loop role to its workspace", () => {
  const profileSource = extractFunctionSource(appJs, "getRoleAccessProfile");
  assert.match(appJs, /const DIRECT_LOOP_ROLE_OPTIONS = \[/);
  assert.match(profileSource, /regionalRoles = new Set\(\["area_supervisor", "regional_manager", "area_manager", "operations_manager"\]\)/);
  assert.match(profileSource, /warehouseManagerRoles = new Set\(\["warehouse_manager", "warehouse_supervisor"\]\)/);
  assert.match(profileSource, /managerRoles = new Set\(\["store_manager", "manager", "store_supervisor", "shop_manager"\]\)/);
  assert.match(profileSource, /clerkRoles = new Set\(\["store_clerk", "clerk", "store_staff", "sales_clerk"\]\)/);
  assert.match(profileSource, /cashierRoles = new Set\(\["cashier", "store_cashier"\]\)/);
  assert.match(profileSource, /store:\s*\["cashier"\]/);
  assert.doesNotMatch(profileSource, /store:\s*\["manager", "cashier"\]/);
  assert.match(appJs, /function isPosPanelAllowedForUser/);
  assert.match(appJs, /只有收银员可以进入收银区/);
});

test("Direct Loop role visibility follows the first-cut operations matrix", () => {
  const profileSource = extractFunctionSource(appJs, "getRoleAccessProfile");
  const warehouseMeta = (appJs.match(/const WAREHOUSE_PANEL_NAV_META = \[[\s\S]*?\n\];/) || [""])[0];
  const storeMeta = (appJs.match(/const STORE_PANEL_NAV_META = \[[\s\S]*?\n\];/) || [""])[0];

  assert.match(profileSource, /operations:\s*\["insight"\]/);
  assert.match(profileSource, /regionalRoles[\s\S]*?createRoleAccessProfile\(\["operations"\]/);
  assert.doesNotMatch(profileSource, /operations:\s*\["insight", "action", "governance"\]/);
  assert.match(profileSource, /warehouse:\s*\["inbound", "workorder", "replenishment", "general", "china", "admin"\]/);
  assert.match(profileSource, /warehouseManagerRoles[\s\S]*?createRoleAccessProfile\(\["warehouse"\]/);
  assert.match(profileSource, /warehouse:\s*\["workorder"\]/);
  assert.match(profileSource, /store:\s*\["manager"\]/);
  assert.doesNotMatch(profileSource, /store:\s*\["manager", "general"\]/);

  assert.match(warehouseMeta, /match: "5\.1 补差打包工单",\n\s*section: "replenishment"/);
  assert.match(warehouseMeta, /match: "6\. 仓库执行单 \/ 出库打印"[\s\S]*?section: "replenishment"/);
  assert.match(warehouseMeta, /match: "6\.1 配送批次 \/ 门店收货跟踪"[\s\S]*?section: "replenishment"/);
  assert.match(storeMeta, /match: "8\. 门店货架位"[\s\S]*?section: "manager"/);
  assert.match(storeMeta, /match: "10\. 周期退仓"[\s\S]*?section: "general"/);
  assert.match(storeMeta, /match: "实时数据查看"[\s\S]*?section: "general"/);
});

test("user submit normalizes organization binding and renders role labels in user list", () => {
  const submitSource = extractFunctionSource(appJs, "submitUser");
  const payloadSource = extractFunctionSource(appJs, "buildUserPayloadFromForm");
  const listSource = extractFunctionSource(appJs, "renderUserRowsTable");
  assert.match(appJs, /function syncUserOrganizationFields/);
  assert.match(appJs, /function buildUserPayloadFromForm/);
  assert.match(submitSource, /buildUserPayloadFromForm/);
  assert.match(payloadSource, /managed_store_codes/);
  assert.match(payloadSource, /请先填写所属门店/);
  assert.match(payloadSource, /请先填写所属仓库/);
  assert.match(listSource, /角色中文名/);
  assert.match(listSource, /绑定门店 \/ 仓库 \/ 区域/);
  assert.match(listSource, /active \/ inactive/);
});

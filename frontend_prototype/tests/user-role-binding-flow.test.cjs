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
    profileSource.indexOf("return createRoleAccessProfile([\"overview\"], {})"),
  );

  assert.match(profileSource, /const warehouseManagerRoles = new Set\(\["warehouse_manager", "warehouse_supervisor"\]\)/);
  assert.match(profileSource, /warehouse:\s*\["inbound", "workorder", "replenishment", "baleSales", "general"\]/);
  assert.match(profileSource, /const warehouseWorkerRoles = new Set\(\["warehouse_clerk", "warehouse_staff", "sorter", "sorting_clerk", "dispatcher", "packer", "warehouse_dispatcher"\]\)/);
  assert.match(profileSource, /return createRoleAccessProfile\(\["warehouse"\], \{\s*warehouse:\s*\["inbound", "workorder"\]/);
  assert.match(profileSource, /const cashierRoles = new Set\(\["cashier", "store_cashier"\]\)/);
  assert.match(profileSource, /return createRoleAccessProfile\(\["store"\], \{\s*store:\s*\["cashier"\]/);
  assert.match(profileSource, /const clerkRoles = new Set\(\["store_clerk", "clerk", "store_staff", "sales_clerk"\]\)/);
  assert.match(profileSource, /return createRoleAccessProfile\(\["store"\], \{\s*store:\s*\["clerk"\]/);
  assert.match(profileSource, /const regionalRoles = new Set\(\["regional_manager", "area_manager", "operations_manager", "area_supervisor"\]\)/);
  assert.match(profileSource, /return createRoleAccessProfile\(\["overview", "operations"\], \{\s*operations:\s*\["insight", "action", "governance"\]/);
  assert.doesNotMatch(cashierBlock, /warehouse:\s*\[/);
  assert.doesNotMatch(warehouseWorkerBlock, /store:\s*\["cashier"\]/);
});

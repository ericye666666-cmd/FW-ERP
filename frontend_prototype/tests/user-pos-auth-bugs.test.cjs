const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const appJs = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const stylesCss = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");

const userPanelHtml = (indexHtml.match(/<section class="panel" data-workspace-panel="admin">[\s\S]*?<h2>账号 \/ 用户<\/h2>[\s\S]*?<pre id="userOutput" class="output hidden-output"><\/pre>\s*<\/section>/) || [""])[0];
const cashierHeaderHtml = (indexHtml.match(/<div id="cashierTerminalShell" class="cashier-terminal-shell"[\s\S]*?<section id="cashierTerminalStatusBar"/) || [""])[0];

test("admin user form supports create edit and inactive soft-delete fields", () => {
  assert.match(userPanelHtml, /<input[^>]+name="user_id"[^>]+type="hidden"/);
  assert.match(userPanelHtml, /<select[^>]+name="role_code"/);
  assert.match(userPanelHtml, /value="store_clerk"/);
  assert.match(userPanelHtml, /value="warehouse_manager"/);
  assert.match(userPanelHtml, /<input[^>]+name="warehouse_code"/);
  assert.match(userPanelHtml, /<input[^>]+name="area_code"/);
  assert.match(userPanelHtml, /<input[^>]+name="managed_store_codes"/);
  assert.match(userPanelHtml, /<select[^>]+name="status"/);
  assert.match(userPanelHtml, /value="inactive"/);
  assert.match(userPanelHtml, /data-action="reset-user-form"/);
  assert.match(appJs, /function hydrateUserFormForEdit/);
  assert.match(appJs, /async function deactivateUserFromList/);
  assert.match(appJs, /PATCH`,\s*body: JSON\.stringify\(payload\)/);
  assert.match(appJs, /method: "DELETE"/);
});

test("admin user list renders clear non-overlapping cards with edit and deactivate controls", () => {
  assert.match(userPanelHtml, /id="userList"/);
  assert.match(appJs, /function renderUserList/);
  assert.match(appJs, /user-management-list/);
  assert.match(appJs, /data-user-edit-id/);
  assert.match(appJs, /data-user-deactivate-id/);
  assert.match(appJs, /data-user-activate-id/);
  assert.match(appJs, /启用/);
  assert.match(appJs, /function activateUserFromList/);
  assert.match(appJs, /function isCurrentUserAdmin/);
  assert.match(appJs, /admin_1 不能被停用/);
  assert.match(appJs, /managed_store_codes/);
  assert.match(stylesCss, /\.user-management-list/);
  assert.match(stylesCss, /\.user-card/);
  assert.match(stylesCss, /\.user-card-action-buttons/);
  assert.match(stylesCss, /word-break:\s*break-word/);
});

test("admin user list groups accounts by organization and exposes protected test delete", () => {
  assert.match(appJs, /function buildUserOrganizationGroups/);
  assert.match(appJs, /function renderUserOrganizationGroup/);
  assert.match(appJs, /function deleteUserFromList/);
  assert.match(appJs, /data-user-delete-id/);
  assert.match(appJs, /确认删除该用户？此操作仅用于测试环境。/);
  assert.match(appJs, /生产环境应使用 soft delete/);
  assert.match(appJs, /当前登录账号不能删除自己/);
  assert.match(appJs, /admin_1 不能被删除/);
  assert.match(appJs, /仓库 \/ Warehouse/);
  assert.match(appJs, /区域主管 \/ Area Supervisors/);
  assert.match(appJs, /门店 \/ Stores/);
  assert.match(appJs, /系统管理员 \/ Admin/);
  assert.match(appJs, /总账号数/);
  assert.match(appJs, /门店用户数/);
  assert.match(appJs, /仓库用户数/);
  assert.match(appJs, /区域主管数/);
  assert.match(appJs, /refreshAssignableUserPickers\(\)/);
  assert.match(appJs, /closest\(['"]\[data-user-edit-id\], \[data-user-deactivate-id\], \[data-user-activate-id\], \[data-user-delete-id\]['"]\)/);
  assert.match(stylesCss, /\.user-organization-section/);
  assert.match(stylesCss, /\.user-organization-grid/);
  assert.match(stylesCss, /\.user-management-stats/);
});

test("cashier terminal top-right always exposes session identity and logout", () => {
  assert.match(cashierHeaderHtml, /id="cashierTerminalSessionStrip"/);
  assert.match(cashierHeaderHtml, /data-action="logout"/);
  assert.doesNotMatch(cashierHeaderHtml, /data-terminal-action="logout"/);
  assert.match(appJs, /function renderCashierTerminalSessionStrip/);
  assert.match(appJs, /function handleGlobalLogoutClick/);
  assert.match(appJs, /closest\(['"]\[data-action="logout"\]['"]\)/);
  assert.match(appJs, /await submitLogout\(\);/);
  assert.match(stylesCss, /\.cashier-terminal-session-strip/);
});

test("cashier terminal side drawer stays hidden until explicitly opened", () => {
  assert.match(indexHtml, /id="cashierTerminalDrawerBackdrop"[^>]+hidden/);
  assert.match(indexHtml, /id="cashierTerminalDrawer"[^>]+hidden/);
  assert.match(stylesCss, /body\.cashier-terminal-mode \.side-drawer\[hidden\]/);
  assert.match(stylesCss, /body\.cashier-terminal-mode \.drawer-backdrop\[hidden\]/);
  assert.match(stylesCss, /display:\s*none\s*!important/);
});

test("test environment does not restore login from storage and always clears password", () => {
  assert.doesNotMatch(appJs, /token:\s*localStorage\.getItem\(STORAGE_KEYS\.token\)/);
  assert.doesNotMatch(appJs, /user:\s*safeParse\(localStorage\.getItem\(STORAGE_KEYS\.user\)/);
  assert.doesNotMatch(appJs, /localStorage\.setItem\(STORAGE_KEYS\.token/);
  assert.doesNotMatch(appJs, /localStorage\.setItem\(STORAGE_KEYS\.user/);
  assert.doesNotMatch(indexHtml, /<input name="password" type="password" placeholder="密码" value=/);
  assert.doesNotMatch(indexHtml, /name="password"[^>]+autocomplete="current-password"/);
  assert.match(indexHtml, /<form id="loginForm"[^>]+autocomplete="off"/);
  assert.match(appJs, /function clearLoginPasswordField/);
  assert.match(appJs, /passwordInput\.defaultValue\s*=\s*""/);
  assert.match(appJs, /passwordInput\.removeAttribute\("value"\)/);
  assert.match(appJs, /function ensureLoginPasswordCleared/);
  assert.match(appJs, /window\.setTimeout\(clearLoginPasswordField,\s*120\)/);
  assert.match(appJs, /window\.addEventListener\("pageshow",\s*ensureLoginPasswordCleared\)/);
  assert.match(appJs, /clearLoginPasswordField\(\);[\s\S]*authPage\?\.classList\.remove\("hidden-screen"\)/);
});

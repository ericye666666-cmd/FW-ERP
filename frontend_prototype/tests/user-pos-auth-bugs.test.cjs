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
  assert.match(appJs, /managed_store_codes/);
  assert.match(stylesCss, /\.user-management-list/);
  assert.match(stylesCss, /\.user-card/);
  assert.match(stylesCss, /word-break:\s*break-word/);
});

test("cashier terminal top-right always exposes session identity and logout", () => {
  assert.match(cashierHeaderHtml, /id="cashierTerminalSessionStrip"/);
  assert.match(cashierHeaderHtml, /data-terminal-action="logout"/);
  assert.match(appJs, /function renderCashierTerminalSessionStrip/);
  assert.match(appJs, /case "logout":\s*await submitLogout\(\);/);
  assert.match(stylesCss, /\.cashier-terminal-session-strip/);
});

test("test environment does not restore login from storage and always clears password", () => {
  assert.doesNotMatch(appJs, /token:\s*localStorage\.getItem\(STORAGE_KEYS\.token\)/);
  assert.doesNotMatch(appJs, /user:\s*safeParse\(localStorage\.getItem\(STORAGE_KEYS\.user\)/);
  assert.doesNotMatch(appJs, /localStorage\.setItem\(STORAGE_KEYS\.token/);
  assert.doesNotMatch(appJs, /localStorage\.setItem\(STORAGE_KEYS\.user/);
  assert.doesNotMatch(indexHtml, /<input name="password" type="password" placeholder="密码" value=/);
  assert.match(appJs, /function clearLoginPasswordField/);
  assert.match(appJs, /clearLoginPasswordField\(\);[\s\S]*authPage\?\.classList\.remove\("hidden-screen"\)/);
});

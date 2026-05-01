const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

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

test("all routes are gated by login and unauthenticated deep links become pending redirects", () => {
  assert.match(indexHtml, /<section id="authPage" class="auth-page"/);
  assert.match(indexHtml, /<div id="appShell" class="app-shell hidden-screen"/);
  assert.match(indexHtml, /name="username"/);
  assert.match(indexHtml, /name="password"/);
  assert.match(indexHtml, /type="submit"[^>]*>登录并进入终端 \/ 工作区/);

  assert.match(appJs, /pendingRedirect: "retail_ops_pending_redirect"/);
  const profileSource = extractFunctionSource(appJs, "getRoleAccessProfile");
  assert.match(profileSource, /if \(!roleCode\) \{\s*return createRoleAccessProfile\(\[\], \{\}\);/);
  const guardSource = extractFunctionSource(appJs, "enforceAuthenticatedRoute");
  const resolveRouteSource = extractFunctionSource(appJs, "resolveRoutePanelKey");
  assert.match(guardSource, /savePendingRedirectFromHash\(\)/);
  assert.match(guardSource, /authPage\?\.classList\.remove\("hidden-screen"\)/);
  assert.match(guardSource, /appShell\?\.classList\.add\("hidden-screen"\)/);
  assert.match(appJs, /if \(currentSession\.token\) \{\s*if \(!applyHashRoute\(\)\)/);
  assert.match(appJs, /else \{\s*enforceAuthenticatedRoute\(\);/);
  assert.match(resolveRouteSource, /normalizedHash === "pos"/);
  assert.match(resolveRouteSource, /startsWith\(normalizedKey\)/);
});

test("login resolves pending redirect by role access and otherwise lands on role default", () => {
  const setSessionSource = extractFunctionSource(appJs, "setSession");
  const submitLoginSource = extractFunctionSource(appJs, "submitLogin");
  const resolveSource = extractFunctionSource(appJs, "resolvePendingRedirectAfterLogin");
  const defaultSource = extractFunctionSource(appJs, "redirectToRoleDefaultWorkspace");
  const hashSource = extractFunctionSource(appJs, "applyHashRoute");
  const landingSource = extractFunctionSource(appJs, "getUserRoleLanding");

  assert.match(setSessionSource, /resolvePendingRedirectAfterLogin\(session\.user\)/);
  assert.match(submitLoginSource, /latestAuthRouteNotice/);
  assert.match(submitLoginSource, /renderAuthResultSummary\("notice"/);
  assert.match(resolveSource, /getPendingRedirect\(\)/);
  assert.match(resolveSource, /isPanelAccessible\(targetPanel, user\)/);
  assert.match(resolveSource, /当前账号无权限访问该页面，已进入你的工作台/);
  assert.match(resolveSource, /clearPendingRedirect\(\)/);
  assert.match(defaultSource, /getUserRoleLanding\(user\)/);
  assert.match(hashSource, /当前账号无权限访问该页面/);
  assert.match(hashSource, /redirectToRoleDefaultWorkspace/);
  assert.match(landingSource, /roleCode === "admin"/);
  assert.match(landingSource, /CASHIER_ROLE_CODES\.has\(roleCode\)/);
  assert.match(landingSource, /roleCode === "store_clerk"/);
  assert.match(landingSource, /roleCode === "store_manager"/);
  assert.match(landingSource, /roleCode === "warehouse_manager"/);
  assert.match(landingSource, /roleCode === "warehouse_clerk"/);
  assert.match(landingSource, /roleCode === "area_supervisor"/);
});

test("logout clears session, route state, and prevents back navigation from revealing business panels", () => {
  const logoutSource = extractFunctionSource(appJs, "submitLogout");
  const clearSource = extractFunctionSource(appJs, "clearSession");
  const hashListenerSource = appJs.slice(appJs.indexOf('window.addEventListener("hashchange"'));

  assert.match(logoutSource, /clearSession\([^)]*clearPending: true[\s\S]*replaceRoute: true/);
  assert.match(clearSource, /localStorage\.removeItem\(STORAGE_KEYS\.token\)/);
  assert.match(clearSource, /localStorage\.removeItem\(STORAGE_KEYS\.user\)/);
  assert.match(clearSource, /clearPendingRedirect\(\)/);
  assert.match(clearSource, /window\.history\.replaceState/);
  assert.match(clearSource, /authPage\?\.classList\.remove\("hidden-screen"\)/);
  assert.match(clearSource, /appShell\?\.classList\.add\("hidden-screen"\)/);
  assert.match(hashListenerSource, /if \(!enforceAuthenticatedRoute\(\)\) \{\s*return;/);
});

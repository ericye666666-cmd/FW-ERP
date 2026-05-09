const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const appJs = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const stylesCss = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");

function extractFunctionSource(name) {
  const start = appJs.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} should exist`);

  let depth = 0;
  let sawBody = false;
  for (let index = start; index < appJs.length; index += 1) {
    const char = appJs[index];
    if (char === "{") {
      depth += 1;
      sawBody = true;
    }
    if (char === "}") {
      depth -= 1;
      if (sawBody && depth === 0) {
        return appJs.slice(start, index + 1);
      }
    }
  }

  throw new Error(`${name} source could not be extracted`);
}

test("staging PDA host defaults API base to the FW-ERP staging API", () => {
  const defaultApiBase = extractFunctionSource("defaultApiBase");

  assert.match(appJs, /const PDA_STAGING_HOST = "fw-erp-34-35-52-250\.nip\.io";/);
  assert.match(appJs, /const PDA_STAGING_API_BASE = "https:\/\/fw-erp-34-35-52-250\.nip\.io\/api\/v1";/);
  assert.match(appJs, /const PDA_STAGING_ORIGIN = `https:\/\/\$\{PDA_STAGING_HOST\}`;/);
  assert.match(appJs, /function isStagingAppOrigin/);
  assert.match(defaultApiBase, /isStagingAppOrigin\(\)/);
  assert.match(defaultApiBase, /return PDA_STAGING_API_BASE;/);
});

test("static login API field defaults to the staging API for PDA-safe fallback", () => {
  assert.match(indexHtml, /<input id="apiBase" value="https:\/\/fw-erp-34-35-52-250\.nip\.io\/api\/v1" \/>/);
  assert.doesNotMatch(indexHtml, /<input id="apiBase" value="http:\/\/127\.0\.0\.1:8000\/api\/v1" \/>/);
});

test("localhost and 127.0.0.1 keep the local development API default", () => {
  const defaultApiBase = extractFunctionSource("defaultApiBase");
  const isLocalDevHost = extractFunctionSource("isLocalDevHost");

  assert.match(appJs, /const LOCAL_DEV_API_BASE = "http:\/\/127\.0\.0\.1:8000\/api\/v1";/);
  assert.match(isLocalDevHost, /host === "127\.0\.0\.1"/);
  assert.match(isLocalDevHost, /host === "localhost"/);
  assert.match(defaultApiBase, /isLocalDevHost\(\)/);
  assert.match(defaultApiBase, /return LOCAL_DEV_API_BASE;/);
});

test("saved API base is restored on load and default resolution does not overwrite it", () => {
  const getApiBase = extractFunctionSource("getApiBase");
  const defaultApiBase = extractFunctionSource("defaultApiBase");
  const resolveApiBaseForCurrentOrigin = extractFunctionSource("resolveApiBaseForCurrentOrigin");

  assert.match(getApiBase, /localStorage\.getItem\(STORAGE_KEYS\.apiBase\)/);
  assert.match(getApiBase, /return resolveApiBaseForCurrentOrigin\(current, saved\);/);
  assert.match(resolveApiBaseForCurrentOrigin, /return savedBase \|\| currentBase \|\| defaultApiBase\(\);/);
  assert.match(appJs, /apiBaseInput\.value = getInitialApiBase\(\);/);
  assert.doesNotMatch(defaultApiBase, /localStorage\.setItem\(STORAGE_KEYS\.apiBase/);
});

test("staging host ignores saved or current loopback API base", () => {
  const getInitialApiBase = extractFunctionSource("getInitialApiBase");
  const resolveApiBaseForCurrentOrigin = extractFunctionSource("resolveApiBaseForCurrentOrigin");

  assert.match(appJs, /function isLoopbackApiBase/);
  assert.match(appJs, /apiBase\.startsWith\("http:\/\/127\.0\.0\.1"\)/);
  assert.match(appJs, /apiBase\.startsWith\("http:\/\/localhost"\)/);
  assert.match(resolveApiBaseForCurrentOrigin, /if \(isStagingAppOrigin\(\)\)/);
  assert.match(resolveApiBaseForCurrentOrigin, /return PDA_STAGING_API_BASE;/);
  assert.match(getInitialApiBase, /return resolveApiBaseForCurrentOrigin\(current, saved\);/);
});

test("login page exposes a subtle staging API mode indicator", () => {
  const renderApiModeIndicator = extractFunctionSource("renderApiModeIndicator");

  assert.match(indexHtml, /id="apiModeIndicator"/);
  assert.match(indexHtml, /class="subtle small api-mode-indicator"/);
  assert.match(renderApiModeIndicator, /API mode: staging/);
  assert.match(renderApiModeIndicator, /isStagingAppOrigin\(\)/);
  assert.match(appJs, /renderApiModeIndicator\(\);/);
});

test("login page keeps cache-busted app and style assets", () => {
  assert.match(indexHtml, /<link rel="stylesheet" href="\.\/styles\.css\?v=[^"]+" \/>/);
  assert.match(indexHtml, /<script src="\.\/app\.js\?v=pda-runtime-polling-215"><\/script>/);
});

test("login form cannot fall back to native GET with credentials in the URL", () => {
  const loginFormHtml = indexHtml.match(/<form id="loginForm"[\s\S]*?<\/form>/)?.[0] || "";

  assert.match(loginFormHtml, /method="post"/);
  assert.match(loginFormHtml, /action="javascript:void\(0\)"/);
  assert.match(loginFormHtml, /novalidate/);
  assert.match(loginFormHtml, /id="loginSubmitButton"/);
  assert.doesNotMatch(loginFormHtml, /method="get"/i);
});

test("staging PDA username field does not hardcode admin_1", () => {
  const loginFormHtml = indexHtml.match(/<form id="loginForm"[\s\S]*?<\/form>/)?.[0] || "";
  const getDefaultLoginUsername = extractFunctionSource("getDefaultLoginUsername");
  const restoreLoginUsername = extractFunctionSource("restoreLoginUsername");

  assert.match(loginFormHtml, /name="username"/);
  assert.doesNotMatch(loginFormHtml, /name="username"[^>]*value="admin_1"/);
  assert.match(getDefaultLoginUsername, /localStorage\.getItem\(STORAGE_KEYS\.loginUsername\)/);
  assert.match(getDefaultLoginUsername, /isStagingAppOrigin\(\) \|\| isDirectLoopPdaUserAgent\(\)/);
  assert.match(getDefaultLoginUsername, /return "";/);
  assert.match(restoreLoginUsername, /loginUsernameInput\.value = getDefaultLoginUsername\(\)/);
});

test("submitLogin blocks native form submission before making the auth request", () => {
  const submitLogin = extractFunctionSource("submitLogin");

  assert.match(submitLogin, /function submitLogin\(event\) {\s*event\.preventDefault\(\);\s*event\.stopPropagation\(\);/);
  assert.match(submitLogin, /return submitLoginFromForm\(form\);/);
});

test("login button click fallback invokes JS login without native form GET", () => {
  const bindLoginSubmitFallback = extractFunctionSource("bindLoginSubmitFallback");

  assert.match(appJs, /const loginSubmitButton = document\.querySelector\("#loginSubmitButton"\);/);
  assert.match(appJs, /function submitLoginFromForm/);
  assert.match(bindLoginSubmitFallback, /addEventListener\("click"/);
  assert.match(bindLoginSubmitFallback, /event\.preventDefault\(\);/);
  assert.match(bindLoginSubmitFallback, /event\.stopPropagation\(\);/);
  assert.match(bindLoginSubmitFallback, /submitLoginFromForm\(form\)/);
  assert.match(appJs, /bindLoginSubmitFallback\(\);/);
});

test("legacy WebView guard prevents GET fallback when app.js cannot parse", () => {
  const legacyGuard = indexHtml.match(/<script>\s*\(function legacyPdaLoginGuard\(\)[\s\S]*?<\/script>/)?.[0] || "";
  const legacyGuardPosition = indexHtml.indexOf("function legacyPdaLoginGuard");
  const appScriptPosition = indexHtml.search(/<script src="\.\/app\.js\?v=[^"]+"><\/script>/);

  assert.notEqual(legacyGuardPosition, -1, "legacy guard should exist");
  assert.ok(legacyGuardPosition < appScriptPosition, "legacy guard should bind before app.js loads");
  assert.match(legacyGuard, /supportsModernSyntax/);
  assert.match(legacyGuard, /row\?\.user\?\.name/);
  assert.match(legacyGuard, /loginForm\.addEventListener\("submit", handleLegacyLogin\)/);
  assert.match(legacyGuard, /loginSubmitButton\.addEventListener\("click", handleLegacyLogin\)/);
  assert.match(legacyGuard, /event\.preventDefault/);
  assert.match(legacyGuard, /event\.stopPropagation/);
  assert.match(legacyGuard, /fetch\(getLegacyApiBase\(\) \+ "\/auth\/login"/);
  assert.match(legacyGuard, /method: "POST"/);
  assert.match(legacyGuard, /retail_ops_access_token/);
  assert.match(legacyGuard, /retail_ops_current_user/);
  assert.match(legacyGuard, /retail_ops_api_base/);
  assert.match(legacyGuard, /PDA 现场分堆标价 UI Preview/);
  assert.doesNotMatch(legacyGuard, /searchParams\.get\("password"\)/);
});

test("legacy WebView guard restores and persists last login username without password", () => {
  const legacyGuard = indexHtml.match(/<script>\s*\(function legacyPdaLoginGuard\(\)[\s\S]*?<\/script>/)?.[0] || "";

  assert.match(legacyGuard, /restoreLegacyLoginUsername/);
  assert.match(legacyGuard, /localStorage\.getItem\("retail_ops_login_username"\)/);
  assert.match(legacyGuard, /loginForm\.elements\.username\.value = savedUsername/);
  assert.match(legacyGuard, /localStorage\.setItem\("retail_ops_login_username", username\)/);
  assert.doesNotMatch(legacyGuard, /localStorage\.setItem\("retail_ops_login_password"/);
});

test("username and password query params are stripped without reading password", () => {
  const removeUnsafeLoginQueryParams = extractFunctionSource("removeUnsafeLoginQueryParams");
  const persistLoginUsername = extractFunctionSource("persistLoginUsername");
  const restoreLoginUsername = extractFunctionSource("restoreLoginUsername");

  assert.match(removeUnsafeLoginQueryParams, /new URL\(window\.location\.href\)/);
  assert.match(removeUnsafeLoginQueryParams, /searchParams\.has\("username"\)/);
  assert.match(removeUnsafeLoginQueryParams, /searchParams\.has\("password"\)/);
  assert.match(removeUnsafeLoginQueryParams, /searchParams\.delete\("username"\)/);
  assert.match(removeUnsafeLoginQueryParams, /searchParams\.delete\("password"\)/);
  assert.match(removeUnsafeLoginQueryParams, /window\.history\.replaceState/);
  assert.doesNotMatch(removeUnsafeLoginQueryParams, /searchParams\.get\("password"\)/);
  assert.doesNotMatch(removeUnsafeLoginQueryParams, /passwordInput\.value/);
  assert.doesNotMatch(persistLoginUsername, /password/);
  assert.doesNotMatch(restoreLoginUsername, /password/);
  assert.match(appJs, /removeUnsafeLoginQueryParams\(\);/);
});

test("login username is persisted and failed login does not force admin_1", () => {
  const submitLoginFromForm = extractFunctionSource("submitLoginFromForm");
  const bindForm = extractFunctionSource("bindForm");

  assert.match(appJs, /loginUsername: "retail_ops_login_username"/);
  assert.match(appJs, /function persistLoginUsername/);
  assert.match(appJs, /loginUsernameInput\.addEventListener\("input", persistLoginUsername\)/);
  assert.match(submitLoginFromForm, /persistLoginUsername\(\);/);
  assert.doesNotMatch(bindForm, /admin_1/);
});

test("successful PDA login persists token and user before role routing", () => {
  const setSession = extractFunctionSource("setSession");
  const persistSession = extractFunctionSource("persistSession");
  const beforeSessionInit = appJs.slice(0, appJs.indexOf("let currentSession = getStoredSession();"));

  assert.match(appJs, /let currentSession = getStoredSession\(\);/);
  assert.doesNotMatch(beforeSessionInit, /localStorage\.removeItem\(STORAGE_KEYS\.token\);\s*localStorage\.removeItem\(STORAGE_KEYS\.user\);/);
  assert.match(persistSession, /localStorage\.setItem\(STORAGE_KEYS\.token,\s*currentSession\.token\)/);
  assert.match(persistSession, /localStorage\.setItem\(STORAGE_KEYS\.user,\s*JSON\.stringify\(currentSession\.user\)\)/);
  assert.match(setSession, /persistSession\(currentSession\)/);
});

test("successful store clerk PDA login routes to clerk workbench", () => {
  const landing = extractFunctionSource("getUserRoleLanding");
  const setSession = extractFunctionSource("setSession");
  const submitLogin = extractFunctionSource("submitLogin");

  assert.match(landing, /roleCode === "store_clerk"/);
  assert.match(landing, /PDA 现场分堆标价 UI Preview/);
  assert.match(setSession, /applyUserDefaultLanding\(currentSession\.user,\s*\{ force: true \}\)/);
  assert.match(setSession, /renderLoginRoutingFailure\(currentSession\.user\)/);
  assert.doesNotMatch(submitLogin, /Promise\.all\(\[loadDashboard\(\), loadConfig\(\), refreshIntegrationSummaries\(\)\]\)/);
});

test("successful store manager PDA login routes to manager workbench", () => {
  const landing = extractFunctionSource("getUserRoleLanding");
  const setSession = extractFunctionSource("setSession");

  assert.match(landing, /roleCode === "store_manager"/);
  assert.match(landing, /店长 PDA 工作台/);
  assert.match(setSession, /applyUserDefaultLanding\(currentSession\.user,\s*\{ force: true \}\)/);
});

test("failed PDA login keeps staging API base and typed username", () => {
  const submitLoginFromForm = extractFunctionSource("submitLoginFromForm");
  const bindForm = extractFunctionSource("bindForm");
  const clearSession = extractFunctionSource("clearSession");

  assert.match(submitLoginFromForm, /persistLoginUsername\(\);/);
  assert.doesNotMatch(bindForm, /admin_1/);
  assert.doesNotMatch(clearSession, /admin_1/);
  assert.doesNotMatch(bindForm, /apiBaseInput\.value\s*=/);
  assert.doesNotMatch(clearSession, /apiBaseInput\.value\s*=/);
  assert.match(bindForm, /renderErrorSummary\(summarySelector, message\)/);
});

test("PDA logout does not reset username to admin_1", () => {
  const clearSession = extractFunctionSource("clearSession");
  const submitLogout = extractFunctionSource("submitLogout");

  assert.doesNotMatch(clearSession, /loginUsernameInput\.value/);
  assert.doesNotMatch(clearSession, /admin_1/);
  assert.doesNotMatch(submitLogout, /admin_1/);
});

test("mobile PDA auth layout hides Test Home before the login card", () => {
  const authPageHtml = indexHtml.match(/<section id="authPage"[\s\S]*?<\/section>\s*<div id="appShell"/)?.[0] || "";

  assert.match(authPageHtml, /class="test-home-entry panel"/);
  assert.match(authPageHtml, /class="auth-card"/);
  assert.match(stylesCss, /@media \(max-width: 880px\)[\s\S]*\.test-home-entry\s*{[\s\S]*display:\s*none\s*!important;/);
  assert.match(stylesCss, /@media \(max-width: 880px\)[\s\S]*\.auth-brand\s*{[\s\S]*display:\s*none;/);
  assert.match(stylesCss, /@media \(max-width: 880px\)[\s\S]*\.auth-page\s*{[\s\S]*justify-content:\s*flex-start;/);
});

test("login inputs scroll into view when focused on mobile keyboards", () => {
  const bindPdaLoginFocusHandling = extractFunctionSource("bindPdaLoginFocusHandling");
  const scrollLoginInputIntoView = extractFunctionSource("scrollLoginInputIntoView");

  assert.match(appJs, /function bindPdaLoginFocusHandling/);
  assert.match(bindPdaLoginFocusHandling, /#loginForm input, #apiBase/);
  assert.match(bindPdaLoginFocusHandling, /addEventListener\("focus", scrollLoginInputIntoView\)/);
  assert.match(scrollLoginInputIntoView, /scrollIntoView\(\{[\s\S]*block: "center"[\s\S]*inline: "nearest"[\s\S]*\}\)/);
  assert.match(stylesCss, /\.auth-card :is\(input, button\)\s*{[\s\S]*scroll-margin:/);
});

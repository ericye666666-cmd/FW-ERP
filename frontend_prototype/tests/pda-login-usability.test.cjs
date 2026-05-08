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
  assert.match(defaultApiBase, /host === PDA_STAGING_HOST/);
  assert.match(defaultApiBase, /return PDA_STAGING_API_BASE;/);
});

test("localhost and 127.0.0.1 keep the local development API default", () => {
  const defaultApiBase = extractFunctionSource("defaultApiBase");

  assert.match(appJs, /const LOCAL_DEV_API_BASE = "http:\/\/127\.0\.0\.1:8000\/api\/v1";/);
  assert.match(defaultApiBase, /host === "127\.0\.0\.1"/);
  assert.match(defaultApiBase, /host === "localhost"/);
  assert.match(defaultApiBase, /return LOCAL_DEV_API_BASE;/);
});

test("saved API base is restored on load and default resolution does not overwrite it", () => {
  const getApiBase = extractFunctionSource("getApiBase");
  const defaultApiBase = extractFunctionSource("defaultApiBase");

  assert.match(getApiBase, /localStorage\.getItem\(STORAGE_KEYS\.apiBase\)/);
  assert.match(getApiBase, /return current \|\| saved \|\| defaultApiBase\(\);/);
  assert.match(appJs, /apiBaseInput\.value = \(localStorage\.getItem\(STORAGE_KEYS\.apiBase\) \|\| ""\)\.trim\(\) \|\| defaultApiBase\(\);/);
  assert.doesNotMatch(defaultApiBase, /localStorage\.setItem\(STORAGE_KEYS\.apiBase/);
});

test("login username is persisted and failed login does not force admin_1", () => {
  const submitLogin = extractFunctionSource("submitLogin");
  const bindForm = extractFunctionSource("bindForm");

  assert.match(appJs, /loginUsername: "retail_ops_login_username"/);
  assert.match(appJs, /function persistLoginUsername/);
  assert.match(appJs, /loginUsernameInput\.addEventListener\("input", persistLoginUsername\)/);
  assert.match(submitLogin, /persistLoginUsername\(\);/);
  assert.doesNotMatch(bindForm, /admin_1/);
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

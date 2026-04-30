const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const appJs = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

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

test("global Chinese English toggle is fixed in the top-right and drives full-page translation", () => {
  assert.match(indexHtml, /id="globalLanguageSwitch"/);
  assert.match(indexHtml, /class="workspace-language-switch"/);
  assert.match(indexHtml, /data-locale-option="zh"/);
  assert.match(indexHtml, /data-locale-option="en"/);
  assert.match(indexHtml, /class="[^"]*global-language-switch/);
  assert.match(indexHtml, /中文/);
  assert.match(indexHtml, /EN/);

  assert.match(appJs, /appLocale: "retail_ops_app_locale"/);
  assert.match(appJs, /const APP_LOCALE_PHRASE_DICTIONARY = \{/);
  [
    "店铺进销存工作台",
    "今日总览",
    "仓库功能区",
    "运营中心",
    "门店功能区",
    "系统管理",
    "退出登录",
    "登录系统",
    "用户名",
    "密码",
    "搜索当前页面...",
  ].forEach((phrase) => assert.match(appJs, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))));

  const setLocaleSource = extractFunctionSource(appJs, "setAppLocale");
  const applySource = extractFunctionSource(appJs, "applyAppLanguage");
  const shellClassSource = extractFunctionSource(appJs, "syncAuthenticatedShellClass");
  assert.match(shellClassSource, /app-authenticated/);
  assert.match(setLocaleSource, /localStorage\.setItem\(STORAGE_KEYS\.appLocale/);
  assert.match(setLocaleSource, /applyAppLanguage\(\)/);
  assert.match(applySource, /document\.createTreeWalker/);
  assert.match(applySource, /translateLocaleText/);
  assert.match(appJs, /MutationObserver/);
  assert.match(appJs, /querySelectorAll\("\[data-locale-option\]"\)/);
});

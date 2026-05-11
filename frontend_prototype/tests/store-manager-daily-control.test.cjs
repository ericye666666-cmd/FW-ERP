const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

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

function extractAsyncFunctionSource(source, functionName) {
  const asyncStart = source.indexOf(`async function ${functionName}`);
  if (asyncStart === -1) {
    return extractFunctionSource(source, functionName);
  }
  const signatureEnd = source.indexOf(") {", asyncStart);
  assert.notEqual(signatureEnd, -1, `missing async function body for ${functionName}`);
  const braceStart = signatureEnd + 2;
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(asyncStart, index + 1);
      }
    }
  }
  throw new Error(`could not extract async ${functionName}`);
}

const managerDailySectionHtml = (indexHtml.match(/<section class="panel store-role-panel store-role-panel-manager store-manager-daily-control-panel" data-workspace-panel="store">[\s\S]*?<div id="storeManagerDailyControlRoot"[\s\S]*?<\/section>/) || [""])[0];
const cashierTerminalSectionHtml = (indexHtml.match(/<section class="panel store-role-panel store-role-panel-cashier cashier-terminal-panel"[\s\S]*?<\/section>/) || [""])[0];

test("store manager workspace exposes Daily Control only in manager area", () => {
  assert.match(appJs, /match:\s*"今日执行台"/);
  assert.match(appJs, /navTitle:\s*"今日执行台"/);
  assert.match(appJs, /navTitleEn:\s*"Store Manager Daily Control"/);
  assert.match(managerDailySectionHtml, /今日执行台/);
  assert.match(managerDailySectionHtml, /storeManagerDailyControlRoot/);
  assert.doesNotMatch(cashierTerminalSectionHtml, /今日执行台|Store Manager Daily Control/);
});

test("manager daily control web dashboard renders tasks flow signals feedback and cashier risk", () => {
  const renderSource = extractFunctionSource(appJs, "renderStoreManagerDailyControl");
  assert.match(renderSource, /今日任务/);
  assert.match(renderSource, /待收货 SDO/);
  assert.match(renderSource, /货物流转/);
  assert.match(renderSource, /热卖 \/ 需补货/);
  assert.match(renderSource, /滞销 \/ 需促销/);
  assert.match(renderSource, /市场反馈/);
  assert.match(renderSource, /收银风险摘要/);
  assert.match(renderSource, /store-manager-daily-task-grid/);
  assert.match(renderSource, /store-manager-daily-flow/);
  assert.doesNotMatch(renderSource, /来源链|RAW_BALE|SDB|LPK/);
});

test("manager daily control uses real aggregate and feedback APIs", () => {
  const loadSource = extractAsyncFunctionSource(appJs, "loadStoreManagerDailyControl");
  const feedbackSource = extractAsyncFunctionSource(appJs, "submitStoreManagerMarketFeedback");
  assert.match(loadSource, /\/stores\/\$\{encodeURIComponent\(storeCode\)\}\/manager-daily-control\?date=\$\{encodeURIComponent\(dateValue\)\}/);
  assert.match(feedbackSource, /\/stores\/\$\{encodeURIComponent\(storeCode\)\}\/manager-market-feedback/);
  assert.match(feedbackSource, /method:\s*"POST"/);
  assert.match(feedbackSource, /await loadStoreManagerDailyControl\(dateValue\)/);
});

test("store manager PDA daily view is lightweight cards and shares the daily control data", () => {
  const tabsSource = appJs.match(/const STORE_MANAGER_PDA_TABS = \[[\s\S]*?\];/)?.[0] || "";
  const overviewSource = extractFunctionSource(appJs, "renderStoreManagerPdaOverview");
  const dailySource = extractFunctionSource(appJs, "renderStoreManagerPdaDailyControl");
  const runtimeSource = extractFunctionSource(appJs, "renderStoreManagerPdaRuntimeBody");

  assert.match(tabsSource, /id:\s*"daily"/);
  assert.match(overviewSource, /今日执行台/);
  assert.match(overviewSource, /查看今日任务、货物流转、热卖补货、滞销促销、市场反馈/);
  assert.match(dailySource, /今日必须处理/);
  assert.match(dailySource, /store-manager-pda-daily-card/);
  assert.match(dailySource, /要补货/);
  assert.match(dailySource, /要促销/);
  assert.match(dailySource, /快速反馈/);
  assert.match(runtimeSource, /renderStoreManagerPdaDailyControl\(state\)/);
  assert.doesNotMatch(dailySource, /<table|来源链|RAW_BALE|SDB|LPK/);
});

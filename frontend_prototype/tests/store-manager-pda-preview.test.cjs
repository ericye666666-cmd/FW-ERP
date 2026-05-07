const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const appJs = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const stylesCss = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");

function objectBlockForMatch(source, matchText) {
  const marker = `match: "${matchText}"`;
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `missing nav meta match: ${matchText}`);
  const start = source.lastIndexOf("{", markerIndex);
  const end = source.indexOf("\n  },", markerIndex);
  assert.notEqual(start, -1, `missing nav meta object start: ${matchText}`);
  assert.notEqual(end, -1, `missing nav meta object end: ${matchText}`);
  return source.slice(start, end + 5);
}

function functionSource(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `missing function ${functionName}`);
  const signatureEnd = source.indexOf(") {", start);
  assert.notEqual(signatureEnd, -1, `missing body for ${functionName}`);
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

test("store manager PDA preview is the visible manager entry with four bottom tabs", () => {
  assert.match(indexHtml, /<h2>店长 PDA 工作台<\/h2>/);
  assert.match(indexHtml, /id="storeManagerPdaPreview"/);

  const tabsBlock = appJs.slice(appJs.indexOf("const STORE_MANAGER_PDA_TABS"), appJs.indexOf("const STORE_MANAGER_PDA_MOCK"));
  const tabLabels = [...tabsBlock.matchAll(/label: "([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(tabLabels, ["经营总览", "收退货", "经营日志", "其他"]);
  assert.match(tabsBlock, /title:\s*"SDO 收退货"/);
  assert.match(appJs, /SDP261250002/);
  assert.match(functionSource(appJs, "renderStoreManagerPdaReceiving"), /machine_code/);
});

test("store manager receiving mock uses #195-aligned SDP machine code", () => {
  assert.match(appJs, /displayCode:\s*"SDP261250002"/);
  assert.match(appJs, /machineCode:\s*"6261250002"/);
  assert.doesNotMatch(appJs, new RegExp(["612", "6250002"].join("")));
});

test("store manager receiving preview presents SDO as the official receiving target", () => {
  const receivingSource = functionSource(appJs, "renderStoreManagerPdaReceiving");
  assert.match(receivingSource, /SDO 门店收退货/);
  assert.match(receivingSource, /STORE_DELIVERY_EXECUTION/);
  assert.match(receivingSource, /正式收货入口/);
  assert.match(receivingSource, /SDB \/ LPK 只显示为来源参考/);
  assert.match(receivingSource, /POS 仍只接受 STORE_ITEM/);
  assert.match(receivingSource, /不作为门店收货码/);
  assert.doesNotMatch(receivingSource, /SDP 包裹列表/);
  assert.doesNotMatch(receivingSource, /扫描 SDP/);
  assert.doesNotMatch(receivingSource, /SDP.*正式收货入口/);
  assert.doesNotMatch(receivingSource, /确认收到/);
});

test("store manager package detail cards show SDO source package and category context", () => {
  ["sdoCode", "sourceCode", "packageNo", "category", "itemCount", "currentClerk"].forEach((field) => {
    assert.match(appJs, new RegExp(`${field}:`), `missing ${field} in mock state`);
  });
  assert.match(appJs, /SDO260504008/);
  assert.match(appJs, /SDB-TO202605-002/);
  assert.match(appJs, new RegExp('packageNo:\\s*"2/3"'));
  assert.match(appJs, /category:\s*"牛仔裤"/);
  assert.match(appJs, /itemCount:\s*"210 件"/);

  const receivingSource = functionSource(appJs, "renderStoreManagerPdaReceiving");
  assert.match(receivingSource, /SDO 内包明细 \/ internal package detail/);
  ["所属 SDO", "来源", "包号", "品类", "件数", "当前店员"].forEach((label) => {
    assert.match(receivingSource, new RegExp(label), `missing rendered label ${label}`);
  });
});

test("store manager logs tab shows operation entry cards before timeline", () => {
  ["客户反馈", "总部任务", "每日日报", "门店照片", "异常上报"].forEach((label) => {
    assert.match(appJs, new RegExp(label), `missing operation entry ${label}`);
  });
  const logsSource = functionSource(appJs, "renderStoreManagerPdaLogs");
  assert.match(logsSource, /operationEntries/);
  assert.match(logsSource, /今天门店动作/);
});

test("store manager other tab is refocused on PDA settings cards", () => {
  ["货架位管理", "打印机设置", "标签纸设置", "账号登录", "语言", "网络状态", "版本信息"].forEach((label) => {
    assert.match(appJs, new RegExp(label), `missing settings card ${label}`);
  });
  const otherSource = functionSource(appJs, "renderStoreManagerPdaOther");
  assert.match(otherSource, /settingsCards/);
  ["员工当班", "门店盘点", "关店检查"].forEach((label) => {
    assert.doesNotMatch(otherSource, new RegExp(label), `${label} should not render in Other tab`);
  });
});

test("store manager receiving tab renders return-to-warehouse mock action", () => {
  const receivingSource = functionSource(appJs, "renderStoreManagerPdaReceiving");
  assert.match(receivingSource, /发起退仓/);
  assert.match(receivingSource, /data-store-manager-pda-return-code/);

  const returnPreviewSource = functionSource(appJs, "renderStoreManagerPdaReturnPreview");
  ["提交退仓申请", "返回", "品类不适合", "质量差", "重复配送", "异常退回", "其他"].forEach((label) => {
    assert.match(returnPreviewSource, new RegExp(label), `missing return preview label ${label}`);
  });
  assert.match(returnPreviewSource, /内包明细 code/);
  ["displayCode", "itemCount", "currentClerk"].forEach((field) => {
    assert.match(returnPreviewSource, new RegExp(field), `missing return preview field ${field}`);
  });
});

test("store manager PDA preview stays mock-only and does not call backend APIs", () => {
  [
    "renderStoreManagerPdaPreview",
    "renderStoreManagerPdaOverview",
    "renderStoreManagerPdaReceiving",
    "renderStoreManagerPdaLogs",
    "renderStoreManagerPdaOther",
  ].forEach((name) => {
    assert.doesNotMatch(functionSource(appJs, name), /request\s*\(/);
  });
});

test("store nav hides old manager and clerk web menus by default", () => {
  assert.doesNotMatch(objectBlockForMatch(appJs, "店长 PDA 工作台"), /hiddenInNav:\s*true/);
  assert.doesNotMatch(objectBlockForMatch(appJs, "PDA 现场分堆标价 UI Preview"), /hiddenInNav:\s*true/);
  assert.match(objectBlockForMatch(appJs, "PDA 现场分堆标价 UI Preview"), /navTitle:\s*"店员 PDA 工作台"/);

  [
    "5. 门店收货主控台",
    "6.2 我的当前 bale",
    "内部兼容：门店验收 SDO / SDP",
    "内部兼容：门店分配店员",
    "7. 店员 PDA 上架工作台",
    "7.1 打印任务 / 重打",
    "7.2 直挂店员工作台",
    "8. 上架会话 / 异常核对",
    "8. 门店货架位",
    "10. 周期退仓",
  ].forEach((matchText) => {
    assert.match(objectBlockForMatch(appJs, matchText), /hiddenInNav:\s*true/, `${matchText} should be hidden`);
  });
});

test("store manager PDA styling is vertical and touch-oriented", () => {
  assert.match(stylesCss, /\.store-manager-pda-shell\s*\{[\s\S]*?width:\s*min\(390px,\s*100%\)/);
  assert.match(stylesCss, /\.store-manager-pda-bottom-tabs\s*\{[\s\S]*?grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(stylesCss, /\.store-manager-pda-primary-action\s*\{[\s\S]*?min-height:\s*52px/);
  assert.match(stylesCss, /\.store-manager-pda-bottom-tabs button\s*\{[\s\S]*?min-height:\s*50px/);
});

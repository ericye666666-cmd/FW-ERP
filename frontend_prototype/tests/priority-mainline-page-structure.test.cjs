const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const appJs = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const stylesCss = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");

function cssMediaBlocks(query) {
  const marker = `@media (${query})`;
  const blocks = [];
  let searchFrom = 0;
  while (searchFrom < stylesCss.length) {
    const markerIndex = stylesCss.indexOf(marker, searchFrom);
    if (markerIndex === -1) {
      break;
    }
    const openIndex = stylesCss.indexOf("{", markerIndex);
    assert.notEqual(openIndex, -1, `missing media block opener: ${query}`);
    let depth = 0;
    let endIndex = openIndex;
    for (; endIndex < stylesCss.length; endIndex += 1) {
      if (stylesCss[endIndex] === "{") {
        depth += 1;
      } else if (stylesCss[endIndex] === "}") {
        depth -= 1;
        if (depth === 0) {
          break;
        }
      }
    }
    assert.equal(depth, 0, `unclosed media block: ${query}`);
    blocks.push(stylesCss.slice(markerIndex, endIndex + 1));
    searchFrom = endIndex + 1;
  }
  return blocks;
}

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

function assertHiddenInNav(matchText) {
  assert.match(objectBlockForMatch(appJs, matchText), /hiddenInNav:\s*true/);
}

function assertVisibleInNav(matchText) {
  assert.doesNotMatch(objectBlockForMatch(appJs, matchText), /hiddenInNav:\s*true/);
}

function sectionBlock(source, constantName) {
  const start = source.indexOf(`const ${constantName} = [`);
  assert.notEqual(start, -1, `missing ${constantName}`);
  const end = source.indexOf("\n];", start);
  assert.notEqual(end, -1, `missing end for ${constantName}`);
  return source.slice(start, end + 3);
}

test("test home points store PDA testing to the new 6.2 clerk bale page", () => {
  assert.match(indexHtml, /data-test-home-panel-prefix="PDA 现场分堆标价 UI Preview"/);
  assert.doesNotMatch(indexHtml, /data-test-home-panel-prefix="7\. 店员 PDA 上架工作台"/);
});

test("warehouse secondary navigation uses the six approved business groups", () => {
  assert.match(appJs, /warehouse:\s*WAREHOUSE_NAV_SECTIONS\.filter\(\(section\) => section\.id !== "china"\)/);
  const warehouseSections = sectionBlock(appJs, "WAREHOUSE_NAV_SECTIONS");
  const titles = [...warehouseSections.matchAll(/title: "([^"]+)"/g)].map((match) => match[1]).filter((title) => title !== "中方管理");
  assert.deepEqual(titles, [
    "服装入仓",
    "百货入仓",
    "工单管理",
    "门店补货",
    "Bales销售",
    "仓库综合管理",
  ]);
  ["打包拣货打印", "出库 / SDO / 配送", "管理员管理"].forEach((legacyTitle) => {
    assert.doesNotMatch(warehouseSections, new RegExp(legacyTitle));
  });
});

test("warehouse pages are grouped by function and operating demand", () => {
  [
    ["0. 运输 / 关单主档", "inbound"],
    ["0.1 条码 / 打印确认", "inbound"],
    ["0.1 创建分拣任务", "workorder"],
    ["0.1.1 分拣任务管理", "workorder"],
    ["0.1.2 压缩工单管理", "workorder"],
    ["0.2 分拣确认入库", "workorder"],
    ["4. 门店补货建议", "replenishment"],
    ["4.1 手动补货需求", "replenishment"],
    ["5.1 LPK 补差拣货", "replenishment"],
    ["6. 仓库执行单 / 出库打印", "replenishment"],
    ["6.1 配送批次 / 门店收货跟踪", "replenishment"],
    ["0.3 分拣库存 / 中转区库存", "workorder"],
    ["4.8 分拣库位管理", "general"],
    ["4.2 中方来源 Bale 录入", "china"],
    ["4.3 中方来源列表 / 补填成本", "china"],
    ["4.1 打印模版管理", "general"],
  ].forEach(([matchText, section]) => {
    assert.match(objectBlockForMatch(appJs, matchText), new RegExp(`section: "${section}"`));
  });
});

test("priority 1 mainline pages stay visible in navigation", () => {
  [
    "0. 运输 / 关单主档",
    "0.1 条码 / 打印确认",
    "0.1 创建分拣任务",
    "0.1.1 分拣任务管理",
    "0.1.2 压缩工单管理",
    "4.8 分拣库位管理",
    "4.2 中方来源 Bale 录入",
    "4.3 中方来源列表 / 补填成本",
    "4.1 打印模版管理",
    "4. 门店补货建议",
    "4.1 手动补货需求",
    "0.4 待售包裹工单",
    "5.1 LPK 补差拣货",
    "6. 仓库执行单 / 出库打印",
    "6.1 配送批次 / 门店收货跟踪",
    "Bales销售｜真实出库",
    "9. 收银销售",
    "1. 区域经营驾驶舱",
    "角色 / 权限矩阵",
    "账号 / 用户",
    "数据管理 / Test Data Tools",
  ].forEach(assertVisibleInNav);
});

test("legacy, support, and non-priority pages are hidden from the left navigation", () => {
  [
    "0. 主档库",
    "0. 包裹批次目录",
    "门店送货执行单",
    "B2B 已售包裹",
    "0.2 分拣确认入库",
    "0.3 分拣库存 / 中转区库存",
    "6.2 我的当前 bale",
    "8. 门店货架位",
    "7. 店员 PDA 上架工作台",
    "7.2 直挂店员工作台",
  ].forEach(assertHiddenInNav);
});

test("desktop workbench keeps the top status bar and left menu visible", () => {
  assert.match(stylesCss, /@media \(max-width: 1240px\)[\s\S]*?\.workspace-shell\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
  assert.match(stylesCss, /@media \(max-width: 1240px\)[\s\S]*?\.workspace-side-panel\s*\{[\s\S]*?position:\s*static/);
  assert.notEqual(cssMediaBlocks("max-width: 960px").length, 0, "expected narrower-screen media blocks");
});

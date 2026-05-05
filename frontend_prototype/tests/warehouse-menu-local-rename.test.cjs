const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appJs = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

function sectionBlock(source, constantName) {
  const start = source.indexOf(`const ${constantName} = [`);
  assert.notEqual(start, -1, `missing ${constantName}`);
  const end = source.indexOf("\n];", start);
  assert.notEqual(end, -1, `missing end for ${constantName}`);
  return source.slice(start, end + 3);
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

function functionBlock(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `missing function ${functionName}`);
  const nextFunction = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, nextFunction === -1 ? undefined : nextFunction);
}

function assertNavMeta(matchText, expectations) {
  const block = objectBlockForMatch(appJs, matchText);
  for (const [field, value] of Object.entries(expectations)) {
    if (typeof value === "boolean") {
      assert.match(block, new RegExp(`${field}:\\s*${value}`), `${matchText} should set ${field}: ${value}`);
    } else {
      assert.match(
        block,
        new RegExp(`${field}:\\s*"${String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`),
        `${matchText} should set ${field}: ${value}`,
      );
    }
  }
}

test("warehouse sidebar groups match the local menu rename request", () => {
  const warehouseSections = sectionBlock(appJs, "WAREHOUSE_NAV_SECTIONS");
  const titles = [...warehouseSections.matchAll(/title: "([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(titles, [
    "服装入仓",
    "百货入仓",
    "工单管理",
    "门店补货",
    "Bales销售",
    "仓库综合管理",
    "中方管理",
  ]);
});

test("warehouse sidebar moves department-store inbound pages and removes numeric prefixes", () => {
  [
    ["0. 运输 / 关单主档", { section: "inbound", navTitle: "服装整柜入库" }],
    ["0.1 条码 / 打印确认", { section: "inbound", navTitle: "条码 / 打印确认" }],
    ["1. 新建商品", { section: "departmentInbound", navTitle: "新建商品" }],
    ["2. 生成内部商品码", { section: "departmentInbound", navTitle: "内部商品码" }],
    ["3. 仓库收货", { section: "departmentInbound", navTitle: "仓库收货" }],
  ].forEach(([matchText, expectations]) => assertNavMeta(matchText, expectations));
});

test("warehouse work-order menu labels hide only independent duplicate entries", () => {
  [
    ["0.1 原始 Bale 总库存", { section: "workorder", navTitle: "服装库存总览" }],
    ["0.1 创建分拣任务", { section: "workorder", navTitle: "创建分拣任务" }],
    ["0.1.1 分拣任务管理", { section: "workorder", navTitle: "分拣任务管理" }],
    ["0.1.2 压缩工单管理", { section: "workorder", navTitle: "压缩工单管理" }],
    ["0.4 待售包裹工单", { section: "workorder", navTitle: "待售包裹工单" }],
  ].forEach(([matchText, expectations]) => assertNavMeta(matchText, expectations));

  assertNavMeta("0.2 分拣确认入库", { section: "workorder", navTitle: "分拣确认入库", hiddenInNav: true });
  assertNavMeta("门店送货执行单", { hiddenInNav: true });
  assertNavMeta("B2B 已售包裹", { hiddenInNav: true });
});

test("store replenishment sidebar removes the flow placeholder and numeric prefixes", () => {
  assertNavMeta("门店补货流程页", { hiddenInNav: true });
  [
    ["4. 门店补货建议", { section: "replenishment", navTitle: "自动补货" }],
    ["4.1 手动补货需求", { section: "replenishment", navTitle: "手动补货" }],
    ["5.1 LPK 补差拣货", { section: "replenishment", navTitle: "LPK 补差拣货" }],
    ["6. 仓库执行单 / 出库打印", { section: "replenishment", navTitle: "SDO 出库单制作" }],
    ["6.1 配送批次 / 门店收货跟踪", { section: "replenishment", navTitle: "门店配送" }],
  ].forEach(([matchText, expectations]) => assertNavMeta(matchText, expectations));
});

test("warehouse comprehensive management owns general admin pages without numeric prefixes", () => {
  [
    ["4. 货架位管理", { section: "general", navTitle: "货架位管理" }],
    ["4.1 打印模版管理", { section: "general", navTitle: "打印模版管理" }],
    ["4.8 分拣库位管理", { section: "general", navTitle: "分拣库位管理" }],
    ["4.4 商品身份证 ID 台账", { section: "general", navTitle: "商品身份证 ID 台账" }],
    ["4.7 默认成本价管理", { section: "general", navTitle: "默认成本价管理" }],
    ["5. 耗材管理", { section: "general", navTitle: "耗材管理" }],
    ["6. 固定资产", { section: "general", navTitle: "固定资产" }],
    ["7. 综合看板", { section: "general", navTitle: "综合看板" }],
    ["8. 需求提报", { section: "general", navTitle: "需求提报" }],
  ].forEach(([matchText, expectations]) => assertNavMeta(matchText, expectations));

  assertNavMeta("0. 主档库", { hiddenInNav: true });
  assertNavMeta("4.5 直挂拆包计件 / 成本确认", { hiddenInNav: true });
});

test("china management section owns China-side source and cost pages", () => {
  assertNavMeta("4.2 中方来源 Bale 录入", { section: "china", navTitle: "服装整柜录入" });
  assertNavMeta("4.3 中方来源列表 / 补填成本", { section: "china", navTitle: "船单三段成本补齐" });
});

test("visible page headings are synchronized from the sidebar nav titles", () => {
  const panelTitleSource = functionBlock(appJs, "getWorkspacePanelTitle");
  assert.match(panelTitleSource, /const zh = meta\.navTitle \|\| panel\?\.dataset\?\.panelTitle \|\| "当前页面"/);

  const syncSource = functionBlock(appJs, "syncWorkspacePanelHeadingsToNavTitles");
  assert.match(syncSource, /panel\.querySelector\("\.panel-head h2"\)/);
  assert.match(syncSource, /heading\.textContent = getWorkspaceNavTitle\(panel\)/);

  assert.match(appJs, /initWorkspacePageRegistry\(\);\s*syncWorkspacePanelHeadingsToNavTitles\(\);/);
});

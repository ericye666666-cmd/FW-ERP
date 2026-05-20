const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

test('china procurement has garment/general merch nav sections and four pages', () => {
  assert.match(appJs, /id: "china", title: "服装采购"/);
  assert.match(appJs, /id: "generalMerch", title: "百货采购"/);
  assert.match(appJs, /chinaProcurement: WAREHOUSE_PANEL_NAV_META\.filter\(\(item\) => item\.section === "china" \|\| item\.section === "generalMerch"\)/);
  assert.match(appJs, /chinaProcurement: \["china", "generalMerch"\],\n      warehouse: \["inbound", "departmentInbound", "general"\],/);
  assert.match(appJs, /chinaProcurement: \["china", "generalMerch"\],\n      warehouse: \["general"\],/);
  [
    '百货采购：整款 / 整杂款商品录入',
    '百货采购：尾货 / 按重量采购录入',
    '百货采购：百货箱单录入 / 打印',
    '百货采购：百货采购档案 / 财务成本',
  ].forEach((title) => assert.match(indexHtml, new RegExp(title)));
  ['整款 / 整杂款商品录入', '尾货 / 按重量采购录入', '箱单录入 / 打印', '采购档案 / 财务成本'].forEach((title) => {
    assert.match(appJs, new RegExp(`navTitle: "${title}"`));
  });
  assert.doesNotMatch(appJs, /navTitle: "百货采购：/);
  assert.doesNotMatch(appJs, /页面 22/);
  assert.doesNotMatch(indexHtml, />\s*中方管理\s*<\/h2>/);
});

test('spu + sku table fields and summary are present', () => {
  ['商品主信息 / SPU', '采购图片', '商超三级类目', 'SKU 明细表', '新增 SKU 行', '采购汇总', 'SKU规格名称', '数量类型', '供应商原条码', '建议售价', '需要系统标签', 'SKU 行数', '总采购数量', '总采购金额\\(RMB\\)'].forEach((t) => assert.match(indexHtml, new RegExp(t)));
});

test('by-weight, carton, label and finance required copy + ui classes exist', () => {
  ['采购基础信息', '重量与金额重点计算区', '采购图片上传卡片', '采购重量 kg', '采购总价 RMB', '单公斤价格 RMB/kg', '后续处理规则', '箱规与体积重点卡', 'CBM = 长 × 宽 × 高 ÷ 1,000,000', '已关联内容预览', 'GM_CARTON 标签预览 / 打印', 'GM_CARTON 为箱码，不可用于 POS 销售；不是正式商品码；不是门店收货码。', '装箱摘要', '基础信息', '供应商与金额', '付款信息', '票据附件', '成本规则说明', '应付合计高亮汇总区：采购金额 \\+ 其他费用 = 应付合计'].forEach((t) => assert.match(indexHtml, new RegExp(t)));
  ['gmWeightUnitPrice', 'gmCartonCbm', 'gmFinancePayableTotal'].forEach((id) => assert.match(indexHtml, new RegExp(id)));

  ['gm-card', 'gm-upload-grid', 'gm-upload-tile', 'gm-summary-grid', 'gm-metric', 'gm-metric-highlight', 'gm-label-preview', 'gm-label-head', 'gm-label-code-placeholder', 'gm-table-scroll', 'gm-rule-grid', 'gm-rule-switch'].forEach((cls) => assert.match(indexHtml, new RegExp(cls)));
  assert.doesNotMatch(indexHtml, /百货采购：百货箱码打印/);
  assert.doesNotMatch(appJs, /百货箱码打印/);
  assert.match(appJs, /bindGeneralMerchPrototypeCalculations/);
});

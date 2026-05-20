const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

test('china procurement has garment/general merch nav sections and four pages', () => {
  assert.match(appJs, /id: "china", title: "服装采购"/);
  assert.match(appJs, /id: "generalMerch", title: "百货采购"/);
  [
    '百货采购：整款 / 整杂款商品录入',
    '百货采购：尾货 / 按重量采购录入',
    '百货采购：百货箱单录入 / 打印',
    '百货采购：百货采购档案 / 财务成本',
  ].forEach((title) => assert.match(indexHtml, new RegExp(title)));
});

test('spu + sku table fields and summary are present', () => {
  ['商品主信息 / SPU', '采购图片', '商超三级类目', 'SKU 明细表', '新增 SKU 行', '采购汇总', 'SKU规格名称', '数量类型', '供应商原条码', '建议售价', '需要系统标签', 'SKU 行数', '总采购数量', '总采购金额\\(RMB\\)'].forEach((t) => assert.match(indexHtml, new RegExp(t)));
});

test('by-weight, carton, label and finance required copy exists', () => {
  ['采购基础信息', '重量与金额重点计算区', '采购图片上传卡片', '采购重量 kg', '采购总价 RMB', '单公斤价格 RMB/kg', '后续处理规则', '箱规与体积重点卡', 'CBM = 长 × 宽 × 高 ÷ 1,000,000', '已关联内容预览', 'GM_CARTON 标签预览 / 打印', 'GM_CARTON 为箱码，不可用于 POS 销售；不是正式商品码；不是门店收货码。', '装箱摘要', '基础信息', '供应商与金额', '付款信息', '票据附件', '成本规则说明', '应付合计高亮汇总区：采购金额 \\+ 其他费用 = 应付合计'].forEach((t) => assert.match(indexHtml, new RegExp(t)));
  ['gmWeightUnitPrice', 'gmCartonCbm', 'gmFinancePayableTotal'].forEach((id) => assert.match(indexHtml, new RegExp(id)));
  assert.match(appJs, /bindGeneralMerchPrototypeCalculations/);
});

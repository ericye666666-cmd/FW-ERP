const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

test('china procurement has garment/general merch nav sections and five pages', () => {
  assert.match(appJs, /id: "china", title: "服装采购"/);
  assert.match(appJs, /id: "generalMerch", title: "百货采购"/);
  [
    '百货采购：整款 / 整杂款商品录入',
    '百货采购：尾货 / 按重量采购录入',
    '百货采购：百货箱单录入',
    '百货采购：百货箱码打印',
    '百货采购：百货采购档案 / 财务成本',
  ].forEach((title) => assert.match(indexHtml, new RegExp(title)));
});

test('spu + sku table fields and summary are present', () => {
  ['商品主信息 / SPU', 'SKU 明细表（手动多行）', 'SKU规格名称', '数量类型', '供应商原条码', '建议售价', '系统标签', 'SKU 行数', '总采购数量', '总采购金额 RMB'].forEach((t) => assert.match(indexHtml, new RegExp(t)));
});

test('by-weight, carton, label and finance required copy exists', () => {
  ['采购日期', '大类 / 商超一级类目', '预估品类描述', '现场照片（3-5张）', '是否需要肯尼亚拆分标准 SKU', '箱内类型', '关联商品或采购记录', 'GM_CARTON（仅箱码，不可用于 POS 销售，不可作为正式商品码，不可作为门店收货码）', '按箱体积 CBM 分摊', '不作为百货默认运清分摊依据'].forEach((t) => assert.match(indexHtml, new RegExp(t)));
  assert.match(appJs, /bindGeneralMerchPrototypeCalculations/);
});

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appJs = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const appLegacyJs = fs.readFileSync(path.join(__dirname, "..", "app.legacy.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

function extractSectionByHeading(heading) {
  const headingIndex = indexHtml.indexOf(`<h2>${heading}</h2>`);
  assert.notEqual(headingIndex, -1, `missing section heading ${heading}`);
  const sectionStart = indexHtml.lastIndexOf("<section", headingIndex);
  const sectionEnd = indexHtml.indexOf("</section>", headingIndex);
  assert.notEqual(sectionStart, -1, `missing section start for ${heading}`);
  assert.notEqual(sectionEnd, -1, `missing section end for ${heading}`);
  return indexHtml.slice(sectionStart, sectionEnd + "</section>".length);
}

test("store manager menu includes inventory overview and shelf editor under PDA workbench", () => {
  const pdaIndex = appJs.indexOf('match: "店长 PDA 工作台"');
  const overviewIndex = appJs.indexOf('match: "库存总览"');
  const shelfIndex = appJs.indexOf('match: "货架位编辑"');

  assert.notEqual(pdaIndex, -1);
  assert.notEqual(overviewIndex, -1);
  assert.notEqual(shelfIndex, -1);
  assert.ok(pdaIndex < overviewIndex, "库存总览 should be after 店长 PDA 工作台");
  assert.ok(overviewIndex < shelfIndex, "货架位编辑 should be after 库存总览");
});

test("shelf editor page is a floor-plan canvas editor, not only a form table", () => {
  const section = extractSectionByHeading("货架位编辑");

  assert.match(section, /平面图模式|货架地图/);
  assert.match(section, /上传平面图/);
  assert.match(section, /使用默认模板/);
  assert.match(section, /重置 demo 模板/);
  assert.match(section, /storeShelfFloorPlanCanvas/);
  assert.match(section, /添加货架/);
  assert.match(section, /添加后仓/);
  assert.match(section, /添加收银台/);
  assert.match(section, /添加入口/);
  assert.match(section, /选中货架详情/);
  assert.match(section, /storeShelfLocationForm/);
  assert.match(section, /storeShelfLocationList/);
  assert.match(section, /layout_x/);
  assert.match(section, /layout_y/);
  assert.match(section, /layout_width/);
  assert.match(section, /layout_height/);
  assert.match(section, /layout_json/);
  assert.match(section, /aria-label="货架布局"/);
  assert.match(section, /placeholder="例如 PT-CR/);
  assert.match(section, /placeholder="例如 CARGO PANT/);
  assert.match(section, /placeholder="例如 10/);
  assert.doesNotMatch(section, /aria-label="layout_json"|placeholder="location_code|placeholder="location_name|placeholder="category_name|placeholder="sort_order/);
  assert.doesNotMatch(section, />[^<]*(location_code|location_name|location_type|category_name|active|sort_order)[^<]*</);
  assert.match(section, /<label>货架编号/);
  assert.match(section, /<label>绑定品类/);
  assert.match(section, /<label>状态/);
  assert.match(section, /停用货架/);
  assert.doesNotMatch(section, />删除<\/button>/);
  assert.match(section, /SHELF/);
  assert.match(section, /BACKROOM/);
  assert.doesNotMatch(section, /<option value="BACKROOM"/);
  assert.match(section, /后仓由系统固定为/);
  assert.doesNotMatch(section, /barcode 打印|打印货架|货架 barcode/i);
  const firstFormIndex = section.indexOf("storeShelfLocationForm");
  const canvasIndex = section.indexOf("storeShelfFloorPlanCanvas");
  assert.ok(canvasIndex !== -1 && canvasIndex < firstFormIndex, "canvas should appear before the detail form");
  assert.doesNotMatch(section, /<main[^>]*class="[^"]*form-grid/i);
});

test("shelf editor frontend uses rack-location APIs without touching POS or STORE_ITEM generation", () => {
  assert.match(appJs, /submitStoreShelfLocationLoad/);
  assert.match(appJs, /submitStoreShelfLocationSave/);
  assert.match(appJs, /renderStoreShelfFloorPlanCanvas/);
  assert.match(appJs, /handleStoreShelfFloorPlanUpload/);
  assert.match(appJs, /new FileReader/);
  assert.match(appJs, /backgroundImageDataUrl/);
  assert.match(appJs, /readAsDataURL/);
  assert.match(appJs, /updateStoreShelfLayoutPreviewFromForm/);
  assert.match(appJs, /layout_json/);
  assert.ok(appJs.includes("/stores/${encodeURIComponent(storeCode)}/rack-locations"));
  assert.match(appJs, /\/stores\/\$\{encodeURIComponent\((?:storeCode|normalizedStoreCode)\)\}\/rack-locations\/initialize/);
  assert.ok(appJs.includes("/stores/${encodeURIComponent(storeCode)}/rack-locations/${encodeURIComponent(locationCode)}"));
  assert.doesNotMatch(appJs, /STORE_LOCATION.*pos_allowed\\s*=\\s*true/);
  assert.doesNotMatch(extractSectionByHeading("货架位编辑"), /POS|Cashier|收银台预览|销售写入/);
});

test("legacy PDA bundle includes the store shelf editor menu and handlers", () => {
  assert.match(appLegacyJs, /货架位编辑/);
  assert.match(appLegacyJs, /submitStoreShelfLocationLoad/);
  assert.match(appLegacyJs, /submitStoreShelfLocationSave/);
  assert.match(appLegacyJs, /renderStoreShelfFloorPlanCanvas/);
  assert.match(indexHtml, /app\.js\?v=area-supervisor-i18n-hotfix-323/);
  assert.match(indexHtml, /app\.legacy\.js\?v=store-shelf-floor-plan-canvas-editor-320/);
});

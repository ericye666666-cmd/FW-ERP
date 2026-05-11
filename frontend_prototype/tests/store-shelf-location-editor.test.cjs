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

test("shelf editor page exposes store, location type, category binding, active and sort controls", () => {
  const section = extractSectionByHeading("货架位编辑");

  assert.match(section, /storeShelfLocationForm/);
  assert.match(section, /storeShelfLocationList/);
  assert.match(section, /location_type/);
  assert.match(section, /SHELF/);
  assert.match(section, /BACKROOM/);
  assert.doesNotMatch(section, /<option value="BACKROOM"/);
  assert.match(section, /后仓由系统固定为/);
  assert.match(section, /category_name/);
  assert.match(section, /active/);
  assert.match(section, /sort_order/);
  assert.doesNotMatch(section, /barcode 打印|打印货架|货架 barcode/i);
});

test("shelf editor frontend uses rack-location APIs without touching POS or STORE_ITEM generation", () => {
  assert.match(appJs, /submitStoreShelfLocationLoad/);
  assert.match(appJs, /submitStoreShelfLocationSave/);
  assert.ok(appJs.includes("/stores/${encodeURIComponent(storeCode)}/rack-locations"));
  assert.match(appJs, /\/stores\/\$\{encodeURIComponent\((?:storeCode|normalizedStoreCode)\)\}\/rack-locations\/initialize/);
  assert.ok(appJs.includes("/stores/${encodeURIComponent(storeCode)}/rack-locations/${encodeURIComponent(locationCode)}"));
  assert.doesNotMatch(appJs, /STORE_LOCATION.*pos_allowed\\s*=\\s*true/);
});

test("legacy PDA bundle includes the store shelf editor menu and handlers", () => {
  assert.match(appLegacyJs, /货架位编辑/);
  assert.match(appLegacyJs, /submitStoreShelfLocationLoad/);
  assert.match(appLegacyJs, /submitStoreShelfLocationSave/);
  assert.match(indexHtml, /app\.js\?v=unconfirmed-store-item-stock-in-list-304/);
  assert.match(indexHtml, /app\.legacy\.js\?v=unconfirmed-store-item-stock-in-list-304/);
});

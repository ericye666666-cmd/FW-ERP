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

function extractFunctionSource(source, name) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `missing function ${name}`);
  const nextFunction = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, nextFunction === -1 ? undefined : nextFunction);
}

test("inventory overview page has store switcher, tabs, metrics, and detail targets", () => {
  const section = extractSectionByHeading("库存总览");

  assert.match(section, /storeInventoryOverviewForm/);
  assert.match(section, /当前门店/);
  assert.match(section, /UTAWALA/);
  assert.match(section, /PAIPLINE/);
  assert.match(section, /KINNO/);
  assert.match(section, /门店总库存/);
  assert.match(section, /已上货架/);
  assert.match(section, /后仓/);
  assert.match(section, /未关联货架/);
  assert.match(section, /今日新增入库/);
  assert.match(section, /未确认/);
  assert.match(section, /按品类/);
  assert.match(section, /按货架/);
  assert.match(section, /storeInventoryOverviewDetail/);
  assert.doesNotMatch(section, /placeholder|下一步接入/i);
});

test("inventory overview frontend calls overview and detail APIs", () => {
  assert.match(appJs, /loadStoreInventoryOverview/);
  assert.match(appJs, /renderStoreInventoryOverview/);
  assert.match(appJs, /renderStoreInventoryOverviewDetail/);
  assert.match(appJs, /未确认 \/ 历史未确认/);
  assert.match(appJs, /stock_in_confirmed=true/);
  assert.ok(appJs.includes("/stores/${encodeURIComponent(storeCode)}/inventory-overview"));
  assert.ok(appJs.includes("/stores/${encodeURIComponent(storeCode)}/inventory-overview/locations/${encodeURIComponent(locationCode)}/items"));
  assert.ok(appJs.includes("/stores/${encodeURIComponent(storeCode)}/inventory-overview/categories/${encodeURIComponent(categoryName)}/items"));
  assert.ok(appJs.includes("/stores/${encodeURIComponent(storeCode)}/inventory-overview/unconfirmed-items"));
  assert.ok(appJs.includes("/stores/${encodeURIComponent(storeCode)}/store-items/${encodeURIComponent(machineCode)}/confirm-stock-in"));
});

test("inventory overview rows can open location and category details", () => {
  assert.match(appJs, /data-store-inventory-location-detail/);
  assert.match(appJs, /data-store-inventory-category-detail/);
  assert.match(appJs, /current_location_code/);
  assert.match(appJs, /source_sdp_display_code/);
});

test("inventory overview detail table is wired for confirmed STORE_ITEM stock-in trace", () => {
  assert.match(appJs, /machine_code/);
  assert.match(appJs, /stock_in_confirmed_by/);
  assert.match(appJs, /stock_in_confirmed_at/);
  assert.match(appJs, /source_sdp_display_code/);
  assert.match(appJs, /parent_sdo_display_code/);
  assert.match(appJs, /unconfirmed_items/);
});

test("inventory overview unconfirmed metric opens a recoverable stock-in list", () => {
  const metricSource = extractFunctionSource(appJs, "renderStoreInventoryOverviewMetrics");
  const listSource = extractFunctionSource(appJs, "renderStoreInventoryUnconfirmedItems");
  const confirmSource = extractFunctionSource(appJs, "confirmStoreInventoryUnconfirmedItemStockIn");

  assert.match(metricSource, /data-store-inventory-unconfirmed-detail/);
  assert.match(metricSource, /未确认 \/ 历史未确认/);
  assert.match(listSource, /未确认 \/ 待完成入库/);
  assert.match(listSource, /suggested_location_code/);
  assert.match(listSource, /source_sdp_display_code/);
  assert.match(listSource, /parent_sdo_display_code/);
  assert.match(listSource, /printed_by/);
  assert.match(listSource, /data-store-inventory-unconfirmed-location/);
  assert.match(listSource, /data-store-inventory-unconfirmed-confirm/);
  assert.match(confirmSource, /confirm-stock-in/);
  assert.match(confirmSource, /loadStoreInventoryUnconfirmedItems/);
  assert.match(confirmSource, /loadStoreInventoryOverview/);
  assert.match(confirmSource, /确认完成入库/);
});

test("legacy bundle includes inventory overview page logic and cache key", () => {
  assert.match(appLegacyJs, /loadStoreInventoryOverview/);
  assert.match(appLegacyJs, /data-store-inventory-location-detail/);
  assert.match(appLegacyJs, /data-store-inventory-category-detail/);
  assert.match(appLegacyJs, /loadStoreInventoryUnconfirmedItems/);
  assert.match(appLegacyJs, /data-store-inventory-unconfirmed-confirm/);
  assert.match(indexHtml, /app\.js\?v=unconfirmed-store-item-stock-in-list-304/);
  assert.match(indexHtml, /app\.legacy\.js\?v=unconfirmed-store-item-stock-in-list-304/);
});

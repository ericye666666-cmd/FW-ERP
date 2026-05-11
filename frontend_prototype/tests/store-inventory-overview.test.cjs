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
  assert.match(section, /待完成入库/);
  assert.match(section, /按品类/);
  assert.match(section, /按货架/);
  assert.match(section, /storeInventoryOverviewDetail/);
  assert.doesNotMatch(section, /placeholder|下一步接入/i);
});

test("inventory overview frontend calls overview and detail APIs", () => {
  assert.match(appJs, /loadStoreInventoryOverview/);
  assert.match(appJs, /renderStoreInventoryOverview/);
  assert.match(appJs, /renderStoreInventoryOverviewDetail/);
  assert.match(appJs, /待完成入库/);
  assert.match(appJs, /已点击确认完成入库/);
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

test("inventory overview copy keeps sold items outside active store inventory", () => {
  const metricSource = extractFunctionSource(appJs, "renderStoreInventoryOverviewMetrics");
  const detailSource = extractFunctionSource(appJs, "renderStoreInventoryOverviewDetail");

  assert.match(metricSource, /主库存只统计已点击确认完成入库的 STORE_ITEM/);
  assert.match(metricSource, /待完成入库单独处理/);
  assert.match(detailSource, /STORE_ITEM machine_code \/ barcode/);
  assert.match(detailSource, /当前货架位/);
  assert.doesNotMatch(detailSource, /sale_no|sold_at|sold_by/);
});

test("inventory overview unconfirmed metric opens a recoverable stock-in list", () => {
  const metricSource = extractFunctionSource(appJs, "renderStoreInventoryOverviewMetrics");
  const listSource = extractFunctionSource(appJs, "renderStoreInventoryUnconfirmedItems");
  const confirmSource = extractFunctionSource(appJs, "confirmStoreInventoryUnconfirmedItemStockIn");

  assert.match(metricSource, /data-store-inventory-unconfirmed-detail/);
  assert.match(metricSource, /待完成入库/);
  assert.match(metricSource, /overview\.unconfirmed_items/);
  assert.match(metricSource, /已生成或已打印 STORE_ITEM/);
  assert.match(metricSource, /已入库但没有有效货架/);
  assert.doesNotMatch(metricSource, /<strong>未确认 \/ 历史未确认<\/strong>/);
  assert.match(listSource, /待完成入库/);
  assert.match(listSource, /这些商品不会进入主库存/);
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

test("inventory overview problem cards and table labels use store-manager wording", () => {
  const metricSource = extractFunctionSource(appJs, "renderStoreInventoryOverviewMetrics");
  const categoryRowsSource = extractFunctionSource(appJs, "renderStoreInventoryOverviewCategoryRows");
  const locationRowsSource = extractFunctionSource(appJs, "renderStoreInventoryOverviewLocationRows");

  assert.ok(metricSource.indexOf("待完成入库") < metricSource.indexOf("未关联货架"));
  assert.ok(metricSource.indexOf("未关联货架") < metricSource.indexOf("后仓"));
  assert.ok(metricSource.indexOf("后仓") < metricSource.indexOf("已上货架"));
  assert.ok(metricSource.indexOf("已上货架") < metricSource.indexOf("门店总库存"));
  assert.match(metricSource, /store-metric problem-card/);
  assert.match(categoryRowsSource, /货架上/);
  assert.match(categoryRowsSource, /查看/);
  assert.doesNotMatch(categoryRowsSource, /已上货架/);
  assert.match(locationRowsSource, /location_type/);
  assert.match(locationRowsSource, /BACKROOM/);
  assert.match(locationRowsSource, /UNASSIGNED/);
});

test("legacy bundle includes inventory overview page logic and cache key", () => {
  assert.match(appLegacyJs, /loadStoreInventoryOverview/);
  assert.match(appLegacyJs, /data-store-inventory-location-detail/);
  assert.match(appLegacyJs, /data-store-inventory-category-detail/);
  assert.match(appLegacyJs, /loadStoreInventoryUnconfirmedItems/);
  assert.match(appLegacyJs, /data-store-inventory-unconfirmed-confirm/);
  assert.match(indexHtml, /app\.js\?v=inventory-overview-ui-polish-305/);
  assert.match(indexHtml, /app\.legacy\.js\?v=inventory-overview-ui-polish-305/);
});

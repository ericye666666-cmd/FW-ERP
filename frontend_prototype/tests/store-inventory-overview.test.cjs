const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appJs = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const appLegacyJs = fs.readFileSync(path.join(__dirname, "..", "app.legacy.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const terminologyTs = fs.readFileSync(path.join(__dirname, "..", "..", "src", "i18n", "terminology.ts"), "utf8");
const englishDictionary = fs.readFileSync(path.join(__dirname, "..", "..", "src", "i18n", "dictionaries", "en-KE.ts"), "utf8");
const chineseDictionary = fs.readFileSync(path.join(__dirname, "..", "..", "src", "i18n", "dictionaries", "zh-CN.ts"), "utf8");

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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

test("inventory, shelf, and trace copy is backed by business dictionary keys", () => {
  const requiredKeys = {
    inventoryOverview: "inventory.overview.title",
    switchStore: "store.switch",
    currentStore: "store.current",
    shelf: "inventory.location.shelf",
    backroom: "inventory.location.backroom",
    unassignedLocation: "inventory.location.unassigned",
    inStock: "inventory.item.inStock",
    sold: "inventory.item.sold",
    pendingStockIn: "inventory.stockIn.pending",
    stockInCompleted: "inventory.stockIn.completed",
    storeItem: "store.item.code",
    sourcePackage: "inventory.source.package",
    storeDeliveryOrder: "store.delivery.order",
    stockInTime: "inventory.stockIn.time",
    saleTime: "inventory.sale.time",
    entityType: "inventory.field.entityType",
    shelfLayout: "inventory.shelf.layout",
  };

  Object.values(requiredKeys).forEach((key) => {
    const keyPattern = new RegExp(escapeRegex(`"${key}"`));
    assert.match(terminologyTs, keyPattern);
    assert.match(englishDictionary, keyPattern);
    assert.match(chineseDictionary, keyPattern);
  });

  assert.match(appJs, /STORE_INVENTORY_TERMINOLOGY_KEYS/);
  assert.match(appJs, /function storeInventoryTerm/);
  assert.match(appJs, /function getStoreInventoryCopy/);

  [
    "renderStoreInventoryOverviewMetrics",
    "renderStoreInventoryOverviewCategoryRows",
    "renderStoreInventoryOverviewLocationRows",
    "renderStoreInventoryOverviewDetail",
    "renderStoreInventoryUnconfirmedItems",
    "renderStoreItemTraceLookupResult",
    "renderStoreShelfFloorPlanCanvas",
    "renderStoreShelfLocationSummary",
  ].forEach((name) => {
    assert.match(extractFunctionSource(appJs, name), /getStoreInventoryCopy|storeInventoryTerm/);
  });
});

test("inventory overview page has store switcher, tabs, metrics, and detail targets", () => {
  const section = extractSectionByHeading("库存总览");

  assert.match(section, /storeInventoryOverviewForm/);
  assert.match(section, /当前门店/);
  assert.match(section, /UTAWALA/);
  assert.match(section, /PAIPLINE/);
  assert.match(section, /KINNO/);
  assert.match(section, /门店总库存/);
  assert.match(section, /货架/);
  assert.match(section, /后仓/);
  assert.match(section, /未关联位置/);
  assert.match(section, /今日新增入库/);
  assert.match(section, /已售/);
  assert.match(section, /销售出库摘要/);
  assert.match(section, /门店商品码查询/);
  assert.match(section, /请输入 \/ 扫描门店商品码/);
  assert.match(section, /<input name="machine_code"[^>]+data-field-label="门店商品码"/);
  assert.match(section, /待完成入库/);
  assert.doesNotMatch(section, /Machine Code/);
  assert.match(section, /按品类/);
  assert.match(section, /按货架/);
  assert.match(section, /storeInventoryOverviewDetail/);
  assert.doesNotMatch(section, />[^<]*(entity_type|stock_in_confirmed|source_entity_id|layout_json|machine_code)[^<]*</);
  assert.doesNotMatch(section, /placeholder|下一步接入/i);
});

test("inventory overview STORE_ITEM trace lookup is wired as read-only", () => {
  const section = extractSectionByHeading("库存总览");
  const lookupSource = extractFunctionSource(appJs, "lookupStoreItemTrace");
  const renderSource = extractFunctionSource(appJs, "renderStoreItemTraceLookupResult");

  assert.match(section, /storeItemTraceLookupForm/);
  assert.match(section, /storeItemTraceLookupResult/);
  assert.match(appJs, /lookupStoreItemTrace/);
  assert.match(appJs, /renderStoreItemTraceLookupResult/);
  assert.ok(lookupSource.includes("/stores/${encodeURIComponent(storeCode)}/store-items/${encodeURIComponent(machineCode)}/trace"));
  assert.match(renderSource, /copy\.inStock/);
  assert.match(renderSource, /copy\.pendingStockIn/);
  assert.match(renderSource, /copy\.sold/);
  assert.match(renderSource, /copy\.unassignedLocation/);
  assert.match(renderSource, /不是门店商品码/);
  assert.match(renderSource, /未找到/);
  assert.doesNotMatch(renderSource, /STORE_ITEM<\/strong>|SDP \/ SDO|确认入库<\/strong>|销售<\/strong>/);
  assert.doesNotMatch(lookupSource, /confirm-stock-in|method:\s*"POST"/);
});

test("inventory overview frontend calls overview and detail APIs", () => {
  assert.match(appJs, /loadStoreInventoryOverview/);
  assert.match(appJs, /renderStoreInventoryOverview/);
  assert.match(appJs, /renderStoreInventoryOverviewDetail/);
  assert.match(appJs, /待完成入库/);
  assert.match(appJs, /sold_today_items/);
  assert.match(appJs, /sold_by_category/);
  assert.match(appJs, /sold_by_location/);
  assert.match(appJs, /stockInCompleted/);
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

  assert.match(metricSource, /copy\.stockInCompleted/);
  assert.match(metricSource, /copy\.storeItem/);
  assert.match(metricSource, /copy\.pendingStockIn/);
  assert.match(metricSource, /POS 销售成功后从库存扣减/);
  assert.match(detailSource, /copy\.storeItem/);
  assert.match(detailSource, /copy\.shelf/);
  assert.match(detailSource, /copy\.sourcePackage/);
  assert.match(detailSource, /copy\.storeDeliveryOrder/);
  assert.match(detailSource, /copy\.stockInTime/);
  assert.doesNotMatch(detailSource, /sale_no|sold_at|sold_by/);
});

test("inventory overview unconfirmed metric opens a recoverable stock-in list", () => {
  const metricSource = extractFunctionSource(appJs, "renderStoreInventoryOverviewMetrics");
  const listSource = extractFunctionSource(appJs, "renderStoreInventoryUnconfirmedItems");
  const confirmSource = extractFunctionSource(appJs, "confirmStoreInventoryUnconfirmedItemStockIn");

  assert.match(metricSource, /data-store-inventory-unconfirmed-detail/);
  assert.match(metricSource, /copy\.pendingStockIn/);
  assert.match(metricSource, /overview\.unconfirmed_items/);
  assert.match(metricSource, /copy\.storeItem/);
  assert.match(metricSource, /copy\.shelf/);
  assert.doesNotMatch(metricSource, /<strong>未确认 \/ 历史未确认<\/strong>/);
  assert.match(listSource, /copy\.pendingStockIn/);
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
  assert.match(confirmSource, /stockInCompleted/);
});

test("inventory overview problem cards and table labels use store-manager wording", () => {
  const metricSource = extractFunctionSource(appJs, "renderStoreInventoryOverviewMetrics");
  const categoryRowsSource = extractFunctionSource(appJs, "renderStoreInventoryOverviewCategoryRows");
  const locationRowsSource = extractFunctionSource(appJs, "renderStoreInventoryOverviewLocationRows");

  assert.ok(metricSource.indexOf("pendingStockIn") < metricSource.indexOf("unassignedLocation"));
  assert.ok(metricSource.indexOf("unassignedLocation") < metricSource.indexOf("backroom"));
  assert.ok(metricSource.indexOf("backroom") < metricSource.indexOf("shelf"));
  assert.ok(metricSource.indexOf("shelf") < metricSource.indexOf("门店总库存"));
  assert.ok(metricSource.indexOf("门店总库存") < metricSource.indexOf("今日新增入库"));
  assert.ok(metricSource.indexOf("今日新增入库") < metricSource.indexOf("sold"));
  assert.match(metricSource, /store-metric problem-card/);
  assert.match(categoryRowsSource, /copy\.shelf/);
  assert.match(categoryRowsSource, /查看/);
  assert.doesNotMatch(categoryRowsSource, /已上货架/);
  assert.match(locationRowsSource, /location_type/);
  assert.match(locationRowsSource, /copy\.backroom/);
  assert.match(locationRowsSource, /copy\.unassignedLocation/);
});

test("inventory overview renders read-only sold summary by category and location", () => {
  assert.match(appJs, /renderStoreInventorySoldSummary/);
  const soldSummarySource = extractFunctionSource(appJs, "renderStoreInventorySoldSummary");

  assert.match(soldSummarySource, /销售出库摘要/);
  assert.match(soldSummarySource, /按品类售出/);
  assert.match(soldSummarySource, /copy\.shelf/);
  assert.match(soldSummarySource, /copy\.sold/);
  assert.match(soldSummarySource, /今日销售额/);
  assert.match(soldSummarySource, /今天还没有 POS 销售出库/);
  assert.match(appJs, /renderStoreInventorySoldSummary\(overview\)/);
});

test("legacy bundle includes inventory overview page logic and cache key", () => {
  assert.match(appLegacyJs, /loadStoreInventoryOverview/);
  assert.match(appLegacyJs, /data-store-inventory-location-detail/);
  assert.match(appLegacyJs, /data-store-inventory-category-detail/);
  assert.match(appLegacyJs, /loadStoreInventoryUnconfirmedItems/);
  assert.match(appLegacyJs, /data-store-inventory-unconfirmed-confirm/);
  assert.match(indexHtml, /app\.js\?v=store-shelf-floor-plan-canvas-editor-320/);
  assert.match(indexHtml, /app\.legacy\.js\?v=store-shelf-floor-plan-canvas-editor-320/);
});

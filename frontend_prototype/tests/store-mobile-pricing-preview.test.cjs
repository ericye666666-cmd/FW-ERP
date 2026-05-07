const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appJs = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const stylesCss = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");

function extractFunctionSource(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `missing function ${functionName}`);
  const signatureEnd = source.indexOf(") {", start);
  assert.notEqual(signatureEnd, -1, `missing function body for ${functionName}`);
  const braceStart = signatureEnd + 2;
  let depth = 0;
  for (let index = braceStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  throw new Error(`could not extract ${functionName}`);
}

test("admin store page exposes an Android PDA batch pricing preview frame", () => {
  assert.match(indexHtml, /id="storeMobilePricingPreviewSummary"/);
  assert.match(indexHtml, /PDA 现场分堆标价 UI Preview/);
  assert.match(appJs, /function renderStoreMobilePricingPreview/);
  assert.match(appJs, /function renderStoreMobileDeviceFrame/);
  assert.match(stylesCss, /\.store-mobile-preview-layout\s*\{/);
  assert.match(stylesCss, /\.android-pda-frame\s*\{/);
});

test("price groups render separately with independent generate and print actions", () => {
  const stateSource = extractFunctionSource(appJs, "createStoreMobilePricingPreviewState");
  const cardSource = extractFunctionSource(appJs, "renderPriceGroupCards");

  assert.match(stateSource, /group_id:\s*"A"/);
  assert.match(stateSource, /group_id:\s*"B"/);
  assert.match(stateSource, /group_id:\s*"S"/);
  assert.match(stateSource, /group_id:\s*"CUSTOM-200"/);
  assert.match(cardSource, /data-mobile-pricing-generate-group="\$\{escapeHtml\(group\.group_id\)\}"/);
  assert.match(cardSource, /data-mobile-pricing-print-group="\$\{escapeHtml\(group\.group_id\)\}"/);
  assert.doesNotMatch(cardSource, /generate-all|print-all|一键生成全部|全部混合打印|混合总任务/);
});

test("PDA pricing preview includes the requested clerk workflow pages and Chinese-only statuses", () => {
  const frameSource = extractFunctionSource(appJs, "renderStoreMobileDeviceFrame");

  assert.match(frameSource, /我的 SDP 任务/);
  assert.match(frameSource, /SDP 详情/);
  assert.match(frameSource, /现场分堆标价/);
  assert.match(frameSource, /价格组列表/);
  assert.match(frameSource, /本组 STORE_ITEM 生成结果/);
  assert.match(frameSource, /本组打印任务/);
  assert.match(frameSource, /打印队列预览/);
  assert.match(frameSource, /任务/);
  assert.match(frameSource, /扫描/);
  assert.match(frameSource, /标价/);
  assert.match(frameSource, /打印/);
  assert.match(frameSource, /我的/);
  assert.doesNotMatch(frameSource, /pending_print|pending_putaway|resolver projection|source_token_refs|lineage payload|transfer projection/);
});

test("price group editor uses PDA-friendly quick controls", () => {
  const editorSource = extractFunctionSource(appJs, "renderPriceGroupEditor");

  assert.match(editorSource, /data-mobile-pricing-grade-choice="A"/);
  assert.match(editorSource, /data-mobile-pricing-grade-choice="B"/);
  assert.match(editorSource, /data-mobile-pricing-grade-choice="S"/);
  assert.match(editorSource, /data-mobile-pricing-price-choice="50"/);
  assert.match(editorSource, /data-mobile-pricing-price-choice="500"/);
  assert.match(editorSource, /data-mobile-pricing-qty-step="-1"/);
  assert.match(editorSource, /data-mobile-pricing-qty-step="\+10"/);
  assert.match(editorSource, /牛仔裤/);
  assert.match(editorSource, /女上衣/);
  assert.match(editorSource, /A-01/);
});

test("label size selector supports 60x40 and 40x30 without mixing groups", () => {
  const printPanelSource = extractFunctionSource(appJs, "renderPriceGroupPrintPanel");
  const queueSource = extractFunctionSource(appJs, "renderPriceGroupPrintQueue");

  assert.match(printPanelSource, /data-mobile-pricing-label-size="60×40"/);
  assert.match(printPanelSource, /data-mobile-pricing-label-size="40×30"/);
  assert.match(printPanelSource, /打印本组标签/);
  assert.match(printPanelSource, /状态：queued/);
  assert.match(queueSource, /group\.tier/);
  assert.match(queueSource, /group\.price_kes/);
  assert.match(queueSource, /job\.label_size/);
  assert.doesNotMatch(queueSource, /混合总任务|全部价格组|all groups/i);
});

test("preview actions are mock-only and do not call backend mutations or print complete", () => {
  const actionSource = extractFunctionSource(appJs, "handleStoreMobilePricingPreviewAction");
  const renderSource = extractFunctionSource(appJs, "renderStoreMobilePricingPreview");

  assert.doesNotMatch(actionSource, /\brequest\s*\(/);
  assert.doesNotMatch(actionSource, /fetch\s*\(/);
  assert.doesNotMatch(actionSource, /\/print-jobs\/\$\{[^}]+\}\/complete|\/print-jobs\/item-tokens|store-items\/generate/);
  assert.doesNotMatch(renderSource, /\brequest\s*\(/);
  assert.match(actionSource, /storeMobilePricingPreviewState/);
  assert.match(actionSource, /queued/);
});

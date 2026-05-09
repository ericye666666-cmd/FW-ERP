const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const frontendRoot = path.join(__dirname, "..");
const indexHtml = fs.readFileSync(path.join(frontendRoot, "index.html"), "utf8");

function readFrontendFile(filename) {
  return fs.readFileSync(path.join(frontendRoot, filename), "utf8");
}

function assertLegacyBundleDoesNotUseModernSyntax(filename) {
  const source = readFrontendFile(filename);

  assert.doesNotMatch(source, /\?\./, `${filename} should not contain optional chaining`);
  assert.doesNotMatch(source, /\?\?/, `${filename} should not contain nullish coalescing`);
}

test("index.html selects legacy PDA scripts when modern syntax is not supported", () => {
  assert.match(indexHtml, /__directLoopPdaSupportsModernSyntax/);
  assert.match(indexHtml, /operations-fulfillment-flow\.legacy\.js\?v=pda-legacy-webview-217/);
  assert.match(indexHtml, /app\.legacy\.js\?v=pda-legacy-webview-217/);
  assert.match(indexHtml, /loadPdaRuntimeScript/);
  assert.match(indexHtml, /pda-legacy-bundle-failed/);

  assert.doesNotMatch(indexHtml, /<script src="\.\/app\.js\?v=pda-runtime-polling-215"><\/script>/);
  assert.doesNotMatch(indexHtml, /<script src="\.\/operations-fulfillment-flow\.js\?v=sdo-package-allocation-211"><\/script>/);
});

test("legacy PDA app build keeps runtime features and Chrome 74 syntax compatibility", () => {
  const source = readFrontendFile("app.legacy.js");

  assertLegacyBundleDoesNotUseModernSyntax("app.legacy.js");
  assert.match(source, /function installPdaLegacyPolyfills/);
  assert.match(source, /String\.prototype\.replaceAll/);
  assert.match(source, /PDA_RUNTIME_POLL_INTERVAL_MS = (?:3000|3e3)/);
  assert.match(source, /function startPdaRuntimePolling/);
  assert.match(source, /function loadStoreManagerPdaBackendState/);
  assert.match(source, /function renderStoreManagerPdaRuntimeScreen/);
  assert.match(source, /function renderStoreMobileRuntimeScreen/);
});

test("legacy operations fulfillment build keeps globals and Chrome 74 syntax compatibility", () => {
  const source = readFrontendFile("operations-fulfillment-flow.legacy.js");

  assertLegacyBundleDoesNotUseModernSyntax("operations-fulfillment-flow.legacy.js");
  assert.match(source, /root\.OperationsFulfillmentFlow = exports/);
  assert.match(source, /buildTransferPreparationPlan/);
  assert.match(source, /buildLoosePackingTasks/);
});

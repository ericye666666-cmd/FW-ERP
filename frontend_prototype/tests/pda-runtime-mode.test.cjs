const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const appJs = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const stylesCss = fs.readFileSync(path.join(__dirname, "..", "styles.css"), "utf8");

function extractFunctionSource(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  assert.notEqual(start, -1, `${functionName} should exist`);

  let depth = 0;
  let sawBody = false;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
      sawBody = true;
    }
    if (char === "}") {
      depth -= 1;
      if (sawBody && depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  throw new Error(`${functionName} source could not be extracted`);
}

test("DirectLoopPDA userAgent or small PDA role enables pda runtime mode", () => {
  const isDirectLoopPdaUserAgent = extractFunctionSource(appJs, "isDirectLoopPdaUserAgent");
  const isPdaRuntimeRole = extractFunctionSource(appJs, "isPdaRuntimeRole");
  const isPdaRuntimeMode = extractFunctionSource(appJs, "isPdaRuntimeMode");
  const syncPdaRuntimeMode = extractFunctionSource(appJs, "syncPdaRuntimeMode");

  assert.match(isDirectLoopPdaUserAgent, /DirectLoopPDA\/1\.0/);
  assert.match(isPdaRuntimeRole, /store_clerk/);
  assert.match(isPdaRuntimeRole, /store_manager/);
  assert.match(isPdaRuntimeRole, /CASHIER_ROLE_CODES\.has/);
  assert.match(isPdaRuntimeMode, /isDirectLoopPdaUserAgent\(\)/);
  assert.match(isPdaRuntimeMode, /isSmallPdaViewport\(\) && isPdaRuntimeRole/);
  assert.match(syncPdaRuntimeMode, /document\.body\.classList\.toggle\("pda-runtime-mode"/);
  assert.match(syncPdaRuntimeMode, /appShell\?\.classList\.toggle\("pda-runtime-mode"/);
  assert.match(appJs, /syncPdaRuntimeMode\(currentSession\.user\);/);
});

test("PDA runtime mode hides desktop workspace shell navigation", () => {
  assert.match(stylesCss, /body\.pda-runtime-mode\s+\.workspace-top-panel[\s\S]*display:\s*none\s*!important/);
  assert.match(stylesCss, /body\.pda-runtime-mode\s+\.workspace-side-panel[\s\S]*display:\s*none\s*!important/);
  assert.match(stylesCss, /body\.pda-runtime-mode\s+\.workspace-tabs[\s\S]*display:\s*none\s*!important/);
  assert.match(stylesCss, /body\.pda-runtime-mode\s+\.workspace-page-bar[\s\S]*display:\s*none\s*!important/);
  assert.match(stylesCss, /body\.pda-runtime-mode\s+#workspacePanels\s*>\s*\.panel:not\(\.workspace-hidden\):not\(\.panel-hidden\)\s*>\s*\.panel-head[\s\S]*display:\s*none\s*!important/);
});

test("store clerk PDA runtime renders direct screen content without preview wrapper or phone frame", () => {
  const renderStoreMobilePricingPreview = extractFunctionSource(appJs, "renderStoreMobilePricingPreview");
  const renderStoreMobileRuntimeScreen = extractFunctionSource(appJs, "renderStoreMobileRuntimeScreen");

  assert.match(renderStoreMobilePricingPreview, /if \(isPdaRuntimeMode\(\)\)/);
  assert.match(renderStoreMobilePricingPreview, /store-mobile-runtime-shell/);
  assert.match(renderStoreMobilePricingPreview, /renderStoreMobileRuntimeScreen\(state\)/);
  assert.match(renderStoreMobileRuntimeScreen, /data-pda-runtime-surface="store-clerk"/);
  assert.match(renderStoreMobileRuntimeScreen, /renderStoreMobileDeviceScreen\(state\)/);
  assert.match(renderStoreMobileRuntimeScreen, /mobile-pricing-tabbar/);
  assert.doesNotMatch(renderStoreMobileRuntimeScreen, /PDA 现场分堆标价 UI Preview/);
  assert.doesNotMatch(renderStoreMobileRuntimeScreen, /店员 PDA Preview/);
  assert.doesNotMatch(renderStoreMobileRuntimeScreen, /只读预览/);
  assert.doesNotMatch(renderStoreMobileRuntimeScreen, /当前 mock SDP/);
  assert.doesNotMatch(renderStoreMobileRuntimeScreen, /store-mobile-preview-controls/);
  assert.doesNotMatch(renderStoreMobileRuntimeScreen, /android-pda-frame/);
  assert.match(stylesCss, /body\.pda-runtime-mode\s+\.store-mobile-runtime-screen\s*\{/);
});

test("store manager PDA runtime hides desktop shell and shows manager bottom-tab interface directly", () => {
  const renderStoreManagerPdaPreview = extractFunctionSource(appJs, "renderStoreManagerPdaPreview");

  assert.match(renderStoreManagerPdaPreview, /data-pda-runtime-surface="store-manager"/);
  assert.match(renderStoreManagerPdaPreview, /store-manager-pda-bottom-tabs/);
  assert.match(stylesCss, /body\.pda-runtime-mode\s+\.store-manager-pda-shell[\s\S]*border:\s*0/);
  assert.match(stylesCss, /body\.pda-runtime-mode\s+\.store-manager-pda-device-bar[\s\S]*display:\s*none\s*!important/);
  assert.match(stylesCss, /body\.pda-runtime-mode\s+\.store-manager-pda-bottom-tabs[\s\S]*position:\s*sticky/);
});

test("desktop preview shell remains available outside PDA runtime", () => {
  const renderStoreMobilePricingPreview = extractFunctionSource(appJs, "renderStoreMobilePricingPreview");
  const renderStoreMobileDeviceFrame = extractFunctionSource(appJs, "renderStoreMobileDeviceFrame");

  assert.match(indexHtml, /<h2>PDA 现场分堆标价 UI Preview<\/h2>/);
  assert.match(renderStoreMobilePricingPreview, /store-mobile-preview-layout/);
  assert.match(renderStoreMobilePricingPreview, /store-mobile-preview-controls/);
  assert.match(renderStoreMobileDeviceFrame, /android-pda-frame/);
  assert.match(renderStoreMobileDeviceFrame, /Android PDA preview/);
});

test("PDA runtime PR cache-busts app and style assets", () => {
  assert.match(indexHtml, /<link rel="stylesheet" href="\.\/styles\.css\?v=pda-runtime-mode-206" \/>/);
  assert.match(indexHtml, /<script src="\.\/app\.js\?v=pda-runtime-mode-206"><\/script>/);
});

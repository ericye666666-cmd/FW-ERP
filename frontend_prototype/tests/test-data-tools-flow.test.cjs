const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.join(__dirname, "..", "..");
const indexHtml = fs.readFileSync(path.join(repoRoot, "frontend_prototype", "index.html"), "utf8");
const appJs = fs.readFileSync(path.join(repoRoot, "frontend_prototype", "app.js"), "utf8");
const gitignore = fs.readFileSync(path.join(repoRoot, ".gitignore"), "utf8");

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

test("admin workspace exposes a Test Data Tools panel with guarded actions", () => {
  assert.match(indexHtml, /<h2>数据管理 \/ Test Data Tools<\/h2>/);
  [
    "testDataEnvironmentSummary",
    "testDataStatsSummary",
    "testDataExportText",
    "testDataImportText",
    "testDataOutput",
  ].forEach((id) => assert.match(indexHtml, new RegExp(`id="${id}"`)));
  [
    "load-test-data-tools",
    "clear-local-test-data",
    "reset-demo-seed",
    "export-test-data-json",
    "import-test-data-json",
  ].forEach((action) => assert.match(indexHtml, new RegExp(`data-action="${action}"`)));
  assert.match(appJs, /match: "数据管理 \/ Test Data Tools"/);
});

test("Test Data Tools separates environment, stats, export, import and production guard", () => {
  [
    "getCurrentRuntimeEnvironment",
    "isProductionRuntimeEnvironment",
    "collectTestDataStats",
    "buildTestDataExportPayload",
    "renderTestDataTools",
    "guardTestDataMutation",
    "clearLocalRuntimeTestData",
    "resetDemoSeedData",
    "exportTestDataJson",
    "importTestDataJson",
  ].forEach((functionName) => extractFunctionSource(appJs, functionName));

  assert.match(appJs, /正式环境禁止执行测试数据清理操作/);
  assert.match(appJs, /runtime_test_data/);
  assert.match(appJs, /demo seed data/);
  assert.match(appJs, /production business data/);
  assert.match(appJs, /STORAGE_KEYS\.storeSdoPackageItemTokens/);
  assert.match(appJs, /STORAGE_KEYS\.posStoreItemSaleRecords/);
});

test("Test Data Tools actions are wired into the global action handler", () => {
  const actionHandlerSource = appJs.slice(appJs.indexOf('document.querySelectorAll("[data-action]")'));
  [
    "load-test-data-tools",
    "clear-local-test-data",
    "reset-demo-seed",
    "export-test-data-json",
    "import-test-data-json",
  ].forEach((action) => assert.match(actionHandlerSource, new RegExp(`action === "${action}"`)));
});

test("gitignore blocks runtime data, exports, dumps, backups, secrets, cache, node modules and print logs", () => {
  [
    "node_modules/",
    "backend/data/",
    "backend/data_exports/",
    "exports/",
    "*.sql",
    "*.sqlite3",
    "*.db",
    "*.bak",
    "*.backup",
    "*.zip",
    "*.tar.gz",
    ".cache/",
    "*.cache/",
    ".env",
    ".env.*",
    "secrets/",
    "print_logs/",
    "backend/data/print_debug/",
    "*.tspl",
  ].forEach((pattern) => assert.match(gitignore, new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m")));
});

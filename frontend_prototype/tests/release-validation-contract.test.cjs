const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "../..");
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const validationScriptPath = path.join(repoRoot, "scripts/validate-release.mjs");
const validationDocPath = path.join(repoRoot, "docs/release_validation.md");

test("package exposes a single release validation command", () => {
  assert.equal(packageJson.scripts["validate:release"], "node scripts/validate-release.mjs");
});

test("release validation script runs the required build, barcode, print, and token checks", () => {
  const script = fs.readFileSync(validationScriptPath, "utf8");
  [
    "git diff --check",
    "node --check frontend_prototype/app.js",
    "python3 -m py_compile ops/local_print_agent/agent.py",
    "backend/tests/test_typed_barcode_resolver_contract.py",
    "backend/tests/test_global_barcode_rules.py",
    "backend/tests/test_windows_local_print_agent.py",
    "backend/tests/test_main_sorting_flow_state.py::MainSortingFlowStateTest::test_bale_scan_token_is_short_and_used_for_print_payload_and_sorting_lookup",
    "frontend_prototype/tests/app-barcode-routing.test.cjs",
    "frontend_prototype/tests/barcode-print-payload.test.cjs",
    "frontend_prototype/tests/bale-print-flow.test.cjs",
    "frontend_prototype/tests/store-prep-bale-flow.test.cjs",
    "frontend_prototype/tests/sdo-store-item-flow.test.cjs",
    "frontend_prototype/tests/pos-store-item-sale-flow.test.cjs",
    "frontend_prototype/tests/print-agent-helper-ui.test.cjs",
    "frontend_prototype/tests/user-pos-auth-bugs.test.cjs",
    "frontend_prototype/tests/user-role-binding-flow.test.cjs",
    "npm run build",
  ].forEach((needle) => {
    assert.match(script, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });
});

test("release validation docs explain the preflight command and deployment checks", () => {
  const doc = fs.readFileSync(validationDocPath, "utf8");
  [
    "npm run validate:release",
    "RAW_BALE = 1",
    "RAW_BALE machine_code repair/backfill",
    "SDB = 2",
    "LPK = 3",
    "SDO = 4",
    "STORE_ITEM = 5",
    "barcode_value = machine_code",
    "Windows Print Agent",
    "/health",
    "/printers",
    "/print/label",
    "/downloads/fw-erp-print-agent-windows.zip",
    "Cloud SQL",
    "runtime data",
    "DATABASE_URL",
    "Historical Tests Not In The Blocking Gate",
    "frontend_prototype/tests/auth-route-guard-flow.test.cjs",
    "frontend_prototype/tests/priority-mainline-page-structure.test.cjs",
    "frontend_prototype/tests/test-data-tools-flow.test.cjs",
  ].forEach((needle) => {
    assert.match(doc, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });
});

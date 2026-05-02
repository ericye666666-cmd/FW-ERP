#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const pythonBin = process.env.PYTHON_BIN || "python3";

const checks = [
  {
    name: "Git whitespace check",
    command: "git",
    args: ["diff", "--check"],
    display: "git diff --check",
  },
  {
    name: "Frontend prototype syntax check",
    command: "node",
    args: ["--check", "frontend_prototype/app.js"],
    display: "node --check frontend_prototype/app.js",
  },
  {
    name: "Windows Print Agent syntax check",
    command: pythonBin,
    args: ["-m", "py_compile", "ops/local_print_agent/agent.py"],
    display: "python3 -m py_compile ops/local_print_agent/agent.py",
  },
  {
    name: "Backend barcode, print agent, and RAW_BALE hydration tests",
    command: pythonBin,
    args: [
      "-m",
      "pytest",
      "-q",
      "backend/tests/test_typed_barcode_resolver_contract.py",
      "backend/tests/test_global_barcode_rules.py",
      "backend/tests/test_windows_local_print_agent.py",
      "backend/tests/test_main_sorting_flow_state.py::MainSortingFlowStateTest::test_bale_scan_token_is_short_and_used_for_print_payload_and_sorting_lookup",
      "backend/tests/test_main_sorting_flow_state.py::MainSortingFlowStateTest::test_confirm_bale_barcode_labelled_is_idempotent_for_current_bale",
      "backend/tests/test_main_sorting_flow_state.py::MainSortingFlowStateTest::test_failed_bale_print_job_does_not_mark_raw_bale_labelled",
    ],
    display:
      "python3 -m pytest -q backend/tests/test_typed_barcode_resolver_contract.py backend/tests/test_global_barcode_rules.py backend/tests/test_windows_local_print_agent.py backend/tests/test_main_sorting_flow_state.py::MainSortingFlowStateTest::test_bale_scan_token_is_short_and_used_for_print_payload_and_sorting_lookup backend/tests/test_main_sorting_flow_state.py::MainSortingFlowStateTest::test_confirm_bale_barcode_labelled_is_idempotent_for_current_bale backend/tests/test_main_sorting_flow_state.py::MainSortingFlowStateTest::test_failed_bale_print_job_does_not_mark_raw_bale_labelled",
  },
  {
    name: "Frontend barcode, print, token, POS, auth, user binding, and release validation tests",
    command: "node",
    args: [
      "--test",
      "frontend_prototype/tests/app-barcode-routing.test.cjs",
      "frontend_prototype/tests/barcode-resolver-test-tools.test.cjs",
      "frontend_prototype/tests/bale-print-flow.test.cjs",
      "frontend_prototype/tests/barcode-print-payload.test.cjs",
      "frontend_prototype/tests/store-prep-bale-flow.test.cjs",
      "frontend_prototype/tests/sdo-store-item-flow.test.cjs",
      "frontend_prototype/tests/pos-store-item-sale-flow.test.cjs",
      "frontend_prototype/tests/print-agent-helper-ui.test.cjs",
      "frontend_prototype/tests/user-pos-auth-bugs.test.cjs",
      "frontend_prototype/tests/user-role-binding-flow.test.cjs",
      "frontend_prototype/tests/release-validation-contract.test.cjs",
    ],
    display:
      "node --test frontend_prototype/tests/app-barcode-routing.test.cjs frontend_prototype/tests/barcode-resolver-test-tools.test.cjs frontend_prototype/tests/bale-print-flow.test.cjs frontend_prototype/tests/barcode-print-payload.test.cjs frontend_prototype/tests/store-prep-bale-flow.test.cjs frontend_prototype/tests/sdo-store-item-flow.test.cjs frontend_prototype/tests/pos-store-item-sale-flow.test.cjs frontend_prototype/tests/print-agent-helper-ui.test.cjs frontend_prototype/tests/user-pos-auth-bugs.test.cjs frontend_prototype/tests/user-role-binding-flow.test.cjs frontend_prototype/tests/release-validation-contract.test.cjs",
  },
  {
    name: "Production frontend build",
    command: "npm",
    args: ["run", "build"],
    display: "npm run build",
  },
];

console.log("FW-ERP release validation");
console.log("This runner checks barcode contracts, STORE_ITEM sale flow, print payloads, Windows Print Agent paths, auth/user binding, and the frontend build.");

for (const [index, check] of checks.entries()) {
  console.log(`\n[${index + 1}/${checks.length}] ${check.name}`);
  console.log(`$ ${check.display}`);
  const result = spawnSync(check.command, check.args, {
    stdio: "inherit",
    shell: false,
  });
  if (result.error) {
    console.error(`\nRelease validation failed to start: ${check.display}`);
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`\nRelease validation failed: ${check.display}`);
    process.exit(result.status || 1);
  }
}

console.log("\nRelease validation completed successfully.");

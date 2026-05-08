const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const docPath = path.join(__dirname, "..", "..", "docs", "project-brain", "pda-end-to-end-staging-test.md");

test("PDA end-to-end staging runbook documents the manager SDO to clerk SDP test loop", () => {
  const doc = fs.readFileSync(docPath, "utf8");

  [
    "船单",
    "录成本",
    "入库",
    "分拣",
    "Create SDB",
    "Create LPK",
    "Build SDO from SDB + LPK",
    "Generate SDP / SDO_PACKAGE",
    "Warehouse dispatch",
    "store_manager_1 / demo1234",
    "Open 收退货",
    "Scan SDO",
    "Receive SDP package",
    "Assign SDP to active Utawala clerk",
    "Login assigned clerk",
  ].forEach((text) => {
    assert.match(doc, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `missing ${text}`);
  });

  assert.match(doc, /SDB \/ LPK.*source/i);
  assert.match(doc, /POS.*STORE_ITEM/);
  assert.match(doc, /当前店员端为演示流程；真实 assigned SDP 接入在后续 PR。/);
});

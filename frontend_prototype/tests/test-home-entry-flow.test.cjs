const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

const expectedEntries = [
  { label: "1. Warehouse main flow", workspace: "warehouse" },
  { label: "2. China source / inbound", workspace: "warehouse" },
  { label: "3. Sorting tasks", workspace: "warehouse" },
  { label: "4. Sorted stock / compression", workspace: "warehouse" },
  { label: "5. Store dispatch / receiving", workspace: "store" },
  { label: "6. Store item price / rack / printing", workspace: "store" },
  { label: "7. POS", workspace: "store" },
  { label: "8. Returns / return-to-warehouse", workspace: "store" },
  { label: "9. B2B bale sales", workspace: "warehouse" },
  { label: "10. Boss analysis / operating dashboard", workspace: "operations" },
  { label: "11. System health / test data / print status", workspace: "testing" },
];

test("/app test home contains title and environment warning copy", () => {
  assert.match(indexHtml, /<h2 id="testHomeTitle">\s*Direct Loop \/ FW-ERP Test Home\s*<\/h2>/);
  assert.match(indexHtml, /TEST ENVIRONMENT/);
  assert.match(indexHtml, /GitHub Pages[^<]*preview shell/);
  assert.match(indexHtml, /不是实际业务测试运行环境/);
  assert.match(indexHtml, /Recommended first practical test path/i);
  assert.match(indexHtml, /data-test-home-golden-path-copy/);
  assert.match(indexHtml, /Golden path manual checklist/);
  assert.match(indexHtml, /href="\.\.\/docs\/project-brain\/golden-path-manual-test-checklist\.md"/);
});

test("/app test home exposes all 11 module entries with test-home selectors", () => {
  const testHomeButtons = [...indexHtml.matchAll(/<button[^>]*class="test-home-link"[^>]*>/g)];
  assert.equal(testHomeButtons.length, 11, "expected exactly 11 test home entry buttons");

  for (const entry of expectedEntries) {
    const escapedLabel = entry.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const buttonPattern = new RegExp(
      `<button[^>]*class="test-home-link"[^>]*data-test-home-workspace="${entry.workspace}"[^>]*data-test-home-panel-prefix="[^"]+"[^>]*>\\s*${escapedLabel}\\s*<\\/button>`,
    );
    assert.match(indexHtml, buttonPattern, `missing or malformed entry: ${entry.label}`);
  }
});

test("China source / inbound test-home entry points to warehouse workspace", () => {
  const chinaSourceButtonPattern = /<button[^>]*class="test-home-link"[^>]*data-test-home-workspace="warehouse"[^>]*>\s*2\. China source \/ inbound\s*<\/button>/;
  assert.match(indexHtml, chinaSourceButtonPattern);

  const wrongWorkspacePattern = /<button[^>]*class="test-home-link"[^>]*data-test-home-workspace="store"[^>]*>\s*2\. China source \/ inbound\s*<\/button>/;
  assert.doesNotMatch(indexHtml, wrongWorkspacePattern);
});

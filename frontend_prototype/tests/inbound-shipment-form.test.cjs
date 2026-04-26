const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("inbound shipment unload_date uses datetime-local input", () => {
  const html = fs.readFileSync(
    path.join(__dirname, "..", "index.html"),
    "utf8",
  );

  assert.match(
    html,
    /<input\s+name="unload_date"\s+type="datetime-local"/,
  );
});

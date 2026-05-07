const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const appJs = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

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

function elementBlockById(source, id) {
  const marker = `id="${id}"`;
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `missing element ${id}`);
  const start = source.lastIndexOf("<input", markerIndex);
  assert.notEqual(start, -1, `missing input start for ${id}`);
  const end = source.indexOf(">", markerIndex);
  assert.notEqual(end, -1, `missing input end for ${id}`);
  return source.slice(start, end + 1);
}

function formFieldBlock(source, formId, fieldName) {
  const formMarker = `id="${formId}"`;
  const formStart = source.indexOf(formMarker);
  assert.notEqual(formStart, -1, `missing form ${formId}`);
  const formEnd = source.indexOf("</form>", formStart);
  assert.notEqual(formEnd, -1, `missing form end for ${formId}`);
  const formSource = source.slice(formStart, formEnd);
  const fieldMarker = `name="${fieldName}"`;
  const fieldIndex = formSource.indexOf(fieldMarker);
  assert.notEqual(fieldIndex, -1, `missing field ${formId} ${fieldName}`);
  const inputStart = formSource.lastIndexOf("<input", fieldIndex);
  const textareaStart = formSource.lastIndexOf("<textarea", fieldIndex);
  const start = Math.max(inputStart, textareaStart);
  assert.notEqual(start, -1, `missing field start for ${formId} ${fieldName}`);
  const end = formSource.indexOf(">", fieldIndex);
  assert.notEqual(end, -1, `missing field end for ${formId} ${fieldName}`);
  return formSource.slice(start, end + 1);
}

test("Android scanner markers exist on store receiving, clerk PDA, print scanner, and POS scan targets", () => {
  assert.match(formFieldBlock(indexHtml, "storeDispatchBaleAcceptForm", "bale_no"), /data-scan-input="true"/);
  assert.match(formFieldBlock(indexHtml, "storeTokenEditDirectoryForm", "bale_no"), /data-scan-input="true"/);
  assert.match(elementBlockById(indexHtml, "cashierTerminalBarcodeInput"), /data-scan-input="true"/);

  const pdaSource = extractFunctionSource(appJs, "renderStoreTokenEditSummary");
  assert.match(pdaSource, /id="storePdaScanInput"[\s\S]*?data-pda-scan-input[\s\S]*?data-scan-input="true"/);

  const printScannerSource = extractFunctionSource(appJs, "renderBaleScannerTestPanel");
  assert.match(printScannerSource, /id="baleScannerTestInput"[\s\S]*?data-scan-input="true"/);
});

test("Android scanner markers are not added to manual lookup or source-reference fields", () => {
  assert.doesNotMatch(elementBlockById(indexHtml, "cashierTerminalManualInput"), /data-scan-input="true"/);
  assert.doesNotMatch(formFieldBlock(indexHtml, "storeBluetoothPrinterForm", "bale_no"), /data-scan-input="true"/);
  assert.doesNotMatch(formFieldBlock(indexHtml, "itemTokenPrintQueueForm", "bale_no"), /data-scan-input="true"/);
  assert.doesNotMatch(formFieldBlock(indexHtml, "storeDispatchAssignmentForm", "bale_no"), /data-scan-input="true"/);
  assert.doesNotMatch(formFieldBlock(indexHtml, "directHangStoreWorkbenchForm", "bale_no"), /data-scan-input="true"/);
});

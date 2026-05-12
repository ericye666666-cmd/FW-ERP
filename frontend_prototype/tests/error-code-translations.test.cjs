const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appJs = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const errorCodesTsPath = path.join(__dirname, "..", "..", "src", "i18n", "error-codes.ts");
const errorCodesTs = fs.existsSync(errorCodesTsPath) ? fs.readFileSync(errorCodesTsPath, "utf8") : "";

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

function getExecutableErrorCodeBundle() {
  const blockStart = appJs.indexOf("const HIGH_RISK_ERROR_CODE_MESSAGES");
  const blockEnd = appJs.indexOf("function getFrontendErrorLocale", blockStart);
  assert.notEqual(blockStart, -1, "missing frontend error code map");
  assert.notEqual(blockEnd, -1, "missing frontend error locale helper");
  const errorCodeBlock = appJs.slice(blockStart, blockEnd);
  const sources = [
    errorCodeBlock,
    extractFunctionSource(appJs, "getFrontendErrorLocale"),
    extractFunctionSource(appJs, "translateErrorCode"),
    extractFunctionSource(appJs, "parseApiErrorPayload"),
    extractFunctionSource(appJs, "extractApiErrorCode"),
    extractFunctionSource(appJs, "extractApiErrorMessage"),
    extractFunctionSource(appJs, "formatErrorMessage"),
  ].join("\n");

  return vm.runInNewContext(`
    let currentLanguage = "zh";
    function pretty(value) { return JSON.stringify(value, null, 2); }
    function formatValidationDetail(detail) { return detail?.msg || detail?.message || ""; }
    ${sources}
    ({
      setLanguage: (language) => { currentLanguage = language; },
      translateErrorCode,
      extractApiErrorCode,
      formatErrorMessage,
    });
  `);
}

test("high-risk frontend error codes have stable en-KE and zh-CN copy", () => {
  const required = {
    INVALID_CODE: ["Invalid code. Try again.", "无效条码。请重试。"],
    POS_CODE_NOT_ALLOWED: ["POS only scans Store Item. Scan a product label.", "POS 只扫描门店商品码。请扫描商品标签。"],
    STORE_ITEM_REQUIRED_FOR_POS: ["POS only scans Store Item. Scan a product label.", "POS 只扫描门店商品码。请扫描商品标签。"],
    SDO_REQUIRED_FOR_STORE_RECEIVING: ["Scan Store Delivery Order.", "请扫描门店送货执行单。"],
    ITEM_ALREADY_SOLD: ["Item already sold.", "商品已售出。"],
    SHIFT_NOT_OPEN: ["Open shift first.", "请先开班。"],
    LOCATION_REQUIRED: ["Select shelf or backroom first.", "请先选择货架或后仓。"],
    PRINTER_NOT_CONNECTED: ["Printer not connected.", "打印机未连接。"],
    CASH_VARIANCE_FOUND: ["Cash variance found.", "发现现金差异。"],
    STOCK_ALREADY_DEDUCTED: ["Stock already deducted.", "库存已扣减。"],
  };

  Object.entries(required).forEach(([code, [enKE, zhCN]]) => {
    assert.match(errorCodesTs, new RegExp(`"${code}"`));
    assert.match(errorCodesTs, new RegExp(enKE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(errorCodesTs, new RegExp(zhCN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(appJs, new RegExp(`"${code}"`));
  });
});

test("formatErrorMessage translates known error_code and preserves safe fallback", () => {
  const bundle = getExecutableErrorCodeBundle();

  assert.equal(bundle.translateErrorCode("ITEM_ALREADY_SOLD", "en"), "Item already sold.");
  assert.equal(bundle.translateErrorCode("SHIFT_NOT_OPEN", "zh"), "请先开班。");
  assert.equal(bundle.extractApiErrorCode({ detail: { error_code: "LOCATION_REQUIRED" } }), "LOCATION_REQUIRED");

  bundle.setLanguage("zh");
  assert.equal(bundle.formatErrorMessage({ error_code: "PRINTER_NOT_CONNECTED" }), "打印机未连接。");

  const apiError = new Error("backend raw message");
  apiError.payload = { error_code: "POS_CODE_NOT_ALLOWED", message: "raw backend text" };
  assert.equal(bundle.formatErrorMessage(apiError), "POS 只扫描门店商品码。请扫描商品标签。");

  assert.equal(bundle.formatErrorMessage({ error_code: "UNKNOWN_CODE", message: "保留现有错误" }), "保留现有错误");
  assert.equal(bundle.formatErrorMessage({ error_code: "UNKNOWN_CODE" }), "操作失败，请检查后重试。");

  bundle.setLanguage("en");
  assert.equal(bundle.formatErrorMessage({ error_code: "UNKNOWN_CODE" }), "Action failed. Check and try again.");
});

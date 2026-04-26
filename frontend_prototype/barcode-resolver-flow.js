(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory();
  } else {
    root.barcodeResolverFlow = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function normalizeBarcode(value) {
    return String(value || "").trim().toUpperCase();
  }

  function buildBarcodeResolvePath(barcode, context) {
    const normalizedBarcode = normalizeBarcode(barcode);
    const normalizedContext = String(context || "").trim();
    const query = normalizedContext ? `?context=${encodeURIComponent(normalizedContext)}` : "";
    return `/barcode/resolve/${encodeURIComponent(normalizedBarcode)}${query}`;
  }

  function assertResolvedBarcodeContext(resolved, options = {}) {
    const allowedTypes = new Set(Array.isArray(options.allowedTypes) ? options.allowedTypes : []);
    const barcodeType = normalizeBarcode(resolved && resolved.barcode_type);
    const rejectReason = String((resolved && resolved.reject_reason) || "").trim();
    if (rejectReason) {
      throw new Error(rejectReason);
    }
    if (allowedTypes.size && !allowedTypes.has(barcodeType)) {
      const context = String(options.context || "").trim();
      throw new Error(`${context || "当前页面"} 不允许扫描 ${barcodeType || "UNKNOWN"}。`);
    }
    return resolved;
  }

  function getCanonicalBarcodeForContext({ inputBarcode = "", resolved = {}, stockResult = null, context = "" } = {}) {
    const normalizedContext = String(context || "").trim();
    if (normalizedContext === "pos" && stockResult && stockResult.barcode) {
      return normalizeBarcode(stockResult.barcode);
    }
    if (resolved && resolved.object_id) {
      return normalizeBarcode(resolved.object_id);
    }
    return normalizeBarcode(inputBarcode);
  }

  function getIdentityLedgerLookupValue(inputValue, resolved = {}) {
    const identityId = normalizeBarcode(resolved && resolved.identity_id);
    return identityId || normalizeBarcode(inputValue);
  }

  return {
    normalizeBarcode,
    buildBarcodeResolvePath,
    assertResolvedBarcodeContext,
    getCanonicalBarcodeForContext,
    getIdentityLedgerLookupValue,
  };
});

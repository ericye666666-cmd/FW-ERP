import {
  dictionaries,
  errorCodeMessageKeys,
  genericErrorMessages,
  highRiskErrorCodes,
  translateErrorCode,
} from "./index.ts";

const requiredErrorKeys = {
  INVALID_CODE: "errors.invalidCode",
  SDO_REQUIRED_FOR_STORE_RECEIVING: "errors.sdoRequiredForStoreReceiving",
  CASH_VARIANCE_FOUND: "errors.cashVarianceFound",
  STOCK_ALREADY_DEDUCTED: "errors.stockAlreadyDeducted",
} as const;

for (const errorCode of Object.keys(requiredErrorKeys) as Array<keyof typeof requiredErrorKeys>) {
  const key = requiredErrorKeys[errorCode];
  if (errorCodeMessageKeys[errorCode] !== key) {
    throw new Error(`Error code ${errorCode} must map to ${key}`);
  }

  if (!dictionaries["en-KE"][key] || !dictionaries["zh-CN"][key]) {
    throw new Error(`Dictionary key ${key} must exist in en-KE and zh-CN`);
  }
}

if (translateErrorCode("INVALID_CODE", "en-KE") !== "Invalid code. Try again.") {
  throw new Error("INVALID_CODE must use clear en-KE employee copy");
}

if (translateErrorCode("INVALID_CODE", "zh-CN") !== "无效条码，请重试。") {
  throw new Error("INVALID_CODE must use clear zh-CN employee copy");
}

for (const errorCode of highRiskErrorCodes) {
  const message = translateErrorCode(errorCode, "en-KE");
  if (!message || message.startsWith("errors.")) {
    throw new Error(`Mapped error code ${errorCode} must not expose a raw i18n key`);
  }
}

const originalEn = dictionaries["en-KE"]["errors.invalidCode"];
const originalZh = dictionaries["zh-CN"]["errors.invalidCode"];

if (!originalEn || !originalZh) {
  throw new Error("errors.invalidCode must be available before fallback checks");
}

try {
  delete dictionaries["en-KE"]["errors.invalidCode"];
  if (translateErrorCode("INVALID_CODE", "en-KE") !== originalZh) {
    throw new Error("Missing en-KE error copy should fall back without showing a raw key");
  }

  delete dictionaries["zh-CN"]["errors.invalidCode"];
  if (translateErrorCode("INVALID_CODE", "en-KE") !== genericErrorMessages["en-KE"]) {
    throw new Error("Missing all mapped error copy should fall back to generic safe copy");
  }
} finally {
  dictionaries["en-KE"]["errors.invalidCode"] = originalEn;
  dictionaries["zh-CN"]["errors.invalidCode"] = originalZh;
}

export const errorCodesContractChecked = true;

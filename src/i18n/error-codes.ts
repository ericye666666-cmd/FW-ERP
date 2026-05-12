import { enKEDictionary } from "./dictionaries/en-KE.ts";
import { zhCNDictionary } from "./dictionaries/zh-CN.ts";
import type { TerminologyKey } from "./terminology.ts";

export const highRiskErrorCodes = [
  "INVALID_CODE",
  "POS_CODE_NOT_ALLOWED",
  "STORE_ITEM_REQUIRED_FOR_POS",
  "SDO_REQUIRED_FOR_STORE_RECEIVING",
  "ITEM_ALREADY_SOLD",
  "SHIFT_NOT_OPEN",
  "LOCATION_REQUIRED",
  "PRINTER_NOT_CONNECTED",
  "CASH_VARIANCE_FOUND",
  "STOCK_ALREADY_DEDUCTED",
] as const;

export type HighRiskErrorCode = (typeof highRiskErrorCodes)[number];
export type ErrorMessageLocale = "en-KE" | "zh-CN";

export const errorCodeMessageKeys = {
  INVALID_CODE: "errors.invalidCode",
  SDO_REQUIRED_FOR_STORE_RECEIVING: "errors.sdoRequiredForStoreReceiving",
  CASH_VARIANCE_FOUND: "errors.cashVarianceFound",
  STOCK_ALREADY_DEDUCTED: "errors.stockAlreadyDeducted",
} as const satisfies Partial<Record<HighRiskErrorCode, TerminologyKey>>;

export const errorCodeMessages = {
  "en-KE": {
    INVALID_CODE: "Invalid code. Try again.",
    POS_CODE_NOT_ALLOWED: "POS only scans Store Item. Scan a product label.",
    STORE_ITEM_REQUIRED_FOR_POS: "POS only scans Store Item. Scan a product label.",
    SDO_REQUIRED_FOR_STORE_RECEIVING: "Scan the Store Delivery Order first.",
    ITEM_ALREADY_SOLD: "Item already sold.",
    SHIFT_NOT_OPEN: "Open shift first.",
    LOCATION_REQUIRED: "Select shelf or backroom first.",
    PRINTER_NOT_CONNECTED: "Printer not connected.",
    CASH_VARIANCE_FOUND: "Cash variance found.",
    STOCK_ALREADY_DEDUCTED: "Stock already deducted.",
  },
  "zh-CN": {
    INVALID_CODE: "无效条码，请重试。",
    POS_CODE_NOT_ALLOWED: "POS 只扫描门店商品码。请扫描商品标签。",
    STORE_ITEM_REQUIRED_FOR_POS: "POS 只扫描门店商品码。请扫描商品标签。",
    SDO_REQUIRED_FOR_STORE_RECEIVING: "请先扫描门店送货执行单。",
    ITEM_ALREADY_SOLD: "商品已售出。",
    SHIFT_NOT_OPEN: "请先开班。",
    LOCATION_REQUIRED: "请先选择货架或后仓。",
    PRINTER_NOT_CONNECTED: "打印机未连接。",
    CASH_VARIANCE_FOUND: "发现现金差异。",
    STOCK_ALREADY_DEDUCTED: "库存已扣减。",
  },
} as const satisfies Record<ErrorMessageLocale, Record<HighRiskErrorCode, string>>;

export const genericErrorMessages = {
  "en-KE": "Action failed. Check and try again.",
  "zh-CN": "操作失败，请检查后重试。",
} as const;

const errorDictionaries: Record<ErrorMessageLocale, Partial<Record<TerminologyKey, string>>> = {
  "en-KE": enKEDictionary,
  "zh-CN": zhCNDictionary,
};

const fallbackErrorLocales: Record<ErrorMessageLocale, ErrorMessageLocale> = {
  "en-KE": "zh-CN",
  "zh-CN": "en-KE",
};

function normalizeErrorLocale(locale: ErrorMessageLocale | string): ErrorMessageLocale {
  if (locale === "zh-CN" || locale === "zh") return "zh-CN";
  return "en-KE";
}

function translateErrorMessageKey(key: TerminologyKey, locale: ErrorMessageLocale): string | null {
  const fallbackLocale = fallbackErrorLocales[locale];
  const directMessage = errorDictionaries[locale]?.[key];
  if (directMessage) return directMessage;
  return errorDictionaries[fallbackLocale]?.[key] || null;
}

export function translateErrorCode(errorCode: string, locale: ErrorMessageLocale | string = "en-KE"): string | null {
  const normalizedLocale = normalizeErrorLocale(locale);
  const normalizedCode = errorCode.trim().toUpperCase() as HighRiskErrorCode;
  const messageKey = errorCodeMessageKeys[normalizedCode as keyof typeof errorCodeMessageKeys];
  if (messageKey) {
    return translateErrorMessageKey(messageKey, normalizedLocale) || genericErrorMessages[normalizedLocale];
  }
  return errorCodeMessages[normalizedLocale][normalizedCode] || null;
}

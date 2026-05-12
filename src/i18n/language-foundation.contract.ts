import {
  dictionaries,
  getDictionaryConfig,
  getDictionaryLocale,
  normalizeDictionaryLocale,
  setDictionaryLocale,
  t,
  type TerminologyKey,
} from "./index.ts";

const config = getDictionaryConfig();

if (config.defaultLocale !== "en-KE") {
  throw new Error("Dictionary default locale should stay en-KE for short employee action copy.");
}

if (!config.supportedLocales.includes("en-KE") || !config.supportedLocales.includes("zh-CN")) {
  throw new Error("Dictionary language config must expose en-KE and zh-CN.");
}

if (normalizeDictionaryLocale("unsupported-locale") !== config.defaultLocale) {
  throw new Error("Unsupported dictionary locale should normalize to the default locale.");
}

setDictionaryLocale("zh-CN");
if (getDictionaryLocale() !== "zh-CN") {
  throw new Error("Dictionary locale setter should update the internal active locale.");
}

setDictionaryLocale("en-KE");
if (getDictionaryLocale() !== "en-KE") {
  throw new Error("Dictionary locale setter should restore en-KE.");
}

const fallbackKey: TerminologyKey = "pos.shift.open";
const originalEnValue = dictionaries["en-KE"][fallbackKey];
delete (dictionaries["en-KE"] as Partial<Record<TerminologyKey, string>>)[fallbackKey];
try {
  if (t(fallbackKey, "en-KE") !== dictionaries["zh-CN"][fallbackKey]) {
    throw new Error("Missing en-KE dictionary value should fall back to zh-CN.");
  }
} finally {
  dictionaries["en-KE"][fallbackKey] = originalEnValue;
}

const originalZhValue = dictionaries["zh-CN"][fallbackKey];
delete (dictionaries["zh-CN"] as Partial<Record<TerminologyKey, string>>)[fallbackKey];
try {
  if (t(fallbackKey, "zh-CN") !== dictionaries["en-KE"][fallbackKey]) {
    throw new Error("Missing zh-CN dictionary value should fall back to en-KE.");
  }
} finally {
  dictionaries["zh-CN"][fallbackKey] = originalZhValue;
}

if (t("future.missing.key") !== "future.missing.key") {
  throw new Error("Unknown dictionary keys should safely fall back to the key name.");
}

export const languageFoundationContractChecked = true;

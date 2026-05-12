import { enKEDictionary } from "./dictionaries/en-KE.ts";
import { zhCNDictionary } from "./dictionaries/zh-CN.ts";
import { errorCodeMessages, genericErrorMessages, translateErrorCode } from "./error-codes.ts";
import { terminologyKeys, type TerminologyKey } from "./terminology.ts";

export { terminologyKeys };
export { errorCodeMessages, genericErrorMessages, translateErrorCode };
export type { TerminologyKey };

export const supportedLocales = ["en-KE", "zh-CN"] as const;
export type DictionaryLocale = (typeof supportedLocales)[number];

export const defaultLocale: DictionaryLocale = "en-KE";
export const fallbackLocales: Record<DictionaryLocale, DictionaryLocale> = {
  "en-KE": "zh-CN",
  "zh-CN": "en-KE",
};

export const dictionaries: Record<DictionaryLocale, Partial<Record<TerminologyKey, string>>> = {
  "en-KE": enKEDictionary,
  "zh-CN": zhCNDictionary,
};

let activeDictionaryLocale: DictionaryLocale = defaultLocale;

export function normalizeDictionaryLocale(locale: string | null | undefined): DictionaryLocale {
  return supportedLocales.includes(locale as DictionaryLocale) ? locale as DictionaryLocale : defaultLocale;
}

export function getDictionaryLocale(): DictionaryLocale {
  return activeDictionaryLocale;
}

export function setDictionaryLocale(locale: string | null | undefined): DictionaryLocale {
  activeDictionaryLocale = normalizeDictionaryLocale(locale);
  return activeDictionaryLocale;
}

export function getDictionaryConfig() {
  return {
    activeLocale: activeDictionaryLocale,
    defaultLocale,
    fallbackLocales,
    supportedLocales,
  };
}

export function t(key: TerminologyKey | string, locale: DictionaryLocale | string = activeDictionaryLocale): string {
  const normalizedLocale = normalizeDictionaryLocale(locale);
  const fallbackLocale = fallbackLocales[normalizedLocale];
  const dictionaryKey = String(key) as TerminologyKey;
  return dictionaries[normalizedLocale]?.[dictionaryKey] || dictionaries[fallbackLocale]?.[dictionaryKey] || String(key);
}

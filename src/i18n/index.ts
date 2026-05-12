import { enKEDictionary } from "./dictionaries/en-KE.ts";
import { zhCNDictionary } from "./dictionaries/zh-CN.ts";
import { terminologyKeys, type TerminologyKey } from "./terminology.ts";

export { terminologyKeys };
export type { TerminologyKey };

export const supportedLocales = ["en-KE", "zh-CN"] as const;
export type DictionaryLocale = (typeof supportedLocales)[number];

export const defaultLocale: DictionaryLocale = "en-KE";

export const dictionaries: Record<DictionaryLocale, Record<TerminologyKey, string>> = {
  "en-KE": enKEDictionary,
  "zh-CN": zhCNDictionary,
};

export function t(key: TerminologyKey, locale: DictionaryLocale = defaultLocale): string {
  return dictionaries[locale][key];
}

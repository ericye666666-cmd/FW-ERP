import { dictionaries, t, type DictionaryLocale, type TerminologyKey } from "./index.ts";

const expectedBusinessTerms: Array<{
  key: TerminologyKey;
  enKE: string;
  zhCN: string;
}> = [
  { key: "inventory.stockIn.pending", enKE: "Pending Stock-in", zhCN: "待完成入库" },
  { key: "inventory.stockIn.confirm", enKE: "Confirm Stock-in", zhCN: "确认入库" },
  { key: "inventory.stockIn.completed", enKE: "Stock-in Completed", zhCN: "已完成入库" },
  { key: "inventory.item.unbarcoded", enKE: "Unbarcoded Item", zhCN: "无码商品" },
  { key: "inventory.item.inStock", enKE: "In Stock", zhCN: "在库" },
  { key: "inventory.item.sold", enKE: "Sold", zhCN: "已售" },
  { key: "inventory.location.unassigned", enKE: "Unassigned Location", zhCN: "未关联位置" },
  { key: "inventory.location.backroom", enKE: "Backroom", zhCN: "后仓" },
  { key: "inventory.location.shelf", enKE: "Shelf", zhCN: "货架" },
  { key: "store.item.code", enKE: "Store Item", zhCN: "门店商品码" },
  { key: "store.delivery.package", enKE: "Store Delivery Package", zhCN: "待送店包" },
  { key: "store.delivery.order", enKE: "Store Delivery Order", zhCN: "门店送货执行单" },
  { key: "pos.shift.open", enKE: "Open Shift", zhCN: "收银开班" },
  { key: "pos.shift.close", enKE: "Close Shift", zhCN: "收银关班" },
  { key: "pos.report.x", enKE: "X Report", zhCN: "X 报表" },
  { key: "pos.report.z", enKE: "Z Report", zhCN: "Z 报表" },
  { key: "pos.cash.variance", enKE: "Cash Variance", zhCN: "现金差异" },
  { key: "pos.order.hold", enKE: "Hold Order", zhCN: "挂单" },
  { key: "pos.order.resumeHeld", enKE: "Resume Held Order", zhCN: "取回挂单" },
  { key: "pos.receipt.reprint", enKE: "Reprint Receipt", zhCN: "重打小票" },
];

const supportedLocales: DictionaryLocale[] = ["en-KE", "zh-CN"];

for (const term of expectedBusinessTerms) {
  if (t(term.key, "en-KE") !== term.enKE) {
    throw new Error(`Missing en-KE dictionary term: ${term.key}`);
  }

  if (t(term.key, "zh-CN") !== term.zhCN) {
    throw new Error(`Missing zh-CN dictionary term: ${term.key}`);
  }

  for (const locale of supportedLocales) {
    if (!dictionaries[locale][term.key]) {
      throw new Error(`Dictionary ${locale} does not define ${term.key}`);
    }
  }
}

export const terminologyContractTermCount = expectedBusinessTerms.length;

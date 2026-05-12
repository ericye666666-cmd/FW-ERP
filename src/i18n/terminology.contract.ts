import { dictionaries, t, type DictionaryLocale, type TerminologyKey } from "./index.ts";

const expectedBusinessTerms: Array<{
  key: TerminologyKey;
  enKE: string;
  zhCN: string;
}> = [
  { key: "inventory.overview.title", enKE: "Inventory Overview", zhCN: "库存总览" },
  { key: "inventory.stockIn.pending", enKE: "Pending Stock-in", zhCN: "待完成入库" },
  { key: "inventory.stockIn.confirm", enKE: "Confirm Stock-in", zhCN: "确认入库" },
  { key: "inventory.stockIn.completed", enKE: "Stock-in Completed", zhCN: "已完成入库" },
  { key: "inventory.stockIn.time", enKE: "Stock-in Time", zhCN: "入库时间" },
  { key: "inventory.item.unbarcoded", enKE: "Unbarcoded Item", zhCN: "无码商品" },
  { key: "inventory.item.inStock", enKE: "In Stock", zhCN: "在库" },
  { key: "inventory.item.sold", enKE: "Sold", zhCN: "已售" },
  { key: "inventory.location.unassigned", enKE: "Unassigned Location", zhCN: "未关联位置" },
  { key: "inventory.location.backroom", enKE: "Backroom", zhCN: "后仓" },
  { key: "inventory.location.shelf", enKE: "Shelf", zhCN: "货架" },
  { key: "inventory.source.package", enKE: "Source Package", zhCN: "来源包" },
  { key: "inventory.sale.time", enKE: "Sale Time", zhCN: "销售时间" },
  { key: "inventory.field.entityType", enKE: "Entity Type", zhCN: "单据类型" },
  { key: "inventory.shelf.layout", enKE: "Shelf Layout", zhCN: "货架布局" },
  { key: "store.switch", enKE: "Switch Store", zhCN: "切换门店" },
  { key: "store.current", enKE: "Current Store", zhCN: "当前门店" },
  { key: "store.item.code", enKE: "Store Item", zhCN: "门店商品码" },
  { key: "store.delivery.package", enKE: "Store Delivery Package", zhCN: "待送店包" },
  { key: "store.delivery.order", enKE: "Store Delivery Order", zhCN: "门店送货执行单" },
  { key: "pos.scan.storeItem", enKE: "Scan Store Item", zhCN: "扫描门店商品码" },
  { key: "pos.scan.storeItemOnly", enKE: "POS only scans Store Item. Scan a product label.", zhCN: "POS 只扫描门店商品码。请扫描商品标签。" },
  { key: "pos.shift.open", enKE: "Open Shift", zhCN: "收银开班" },
  { key: "pos.shift.close", enKE: "Close Shift", zhCN: "收银关班" },
  { key: "pos.shift.openFirst", enKE: "Open shift first.", zhCN: "请先开班。" },
  { key: "pos.report.x", enKE: "X Report", zhCN: "X 报表" },
  { key: "pos.report.z", enKE: "Z Report", zhCN: "Z 报表" },
  { key: "pos.item.addUnbarcoded", enKE: "Add Unbarcoded Item", zhCN: "添加无码商品" },
  { key: "pos.item.alreadySold", enKE: "Item already sold.", zhCN: "商品已售出。" },
  { key: "pos.cash.variance", enKE: "Cash Variance", zhCN: "现金差异" },
  { key: "pos.order.hold", enKE: "Hold Order", zhCN: "挂单" },
  { key: "pos.order.resumeHeld", enKE: "Resume Held Order", zhCN: "取回挂单" },
  { key: "pos.receipt.reprint", enKE: "Reprint Receipt", zhCN: "重打小票" },
  { key: "pda.work.today", enKE: "My Work Today", zhCN: "我的今日工作" },
  { key: "pda.package.scan", enKE: "Scan Package", zhCN: "扫描包裹" },
  { key: "pda.label.print", enKE: "Print Label", zhCN: "打印标签" },
  { key: "pda.label.printed", enKE: "Label Printed", zhCN: "标签已打印" },
  { key: "pda.label.printFailed", enKE: "Print Failed", zhCN: "打印失败" },
  { key: "pda.location.select", enKE: "Select Location", zhCN: "选择位置" },
  { key: "pda.location.selectFirst", enKE: "Select shelf or backroom first.", zhCN: "请先选择货架或后仓。" },
  { key: "pda.printer.notConnected", enKE: "Printer Not Connected", zhCN: "打印机未连接" },
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

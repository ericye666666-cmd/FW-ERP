import type { TerminologyKey } from "../terminology.ts";

export const zhCNDictionary = {
  "inventory.stockIn.pending": "待完成入库",
  "inventory.stockIn.confirm": "确认入库",
  "inventory.stockIn.completed": "已完成入库",
  "inventory.item.unbarcoded": "无码商品",
  "inventory.item.inStock": "在库",
  "inventory.item.sold": "已售",
  "inventory.location.unassigned": "未关联位置",
  "inventory.location.backroom": "后仓",
  "inventory.location.shelf": "货架",
  "store.item.code": "门店商品码",
  "store.delivery.package": "待送店包",
  "store.delivery.order": "门店送货执行单",
  "pos.shift.open": "收银开班",
  "pos.shift.close": "收银关班",
  "pos.report.x": "X 报表",
  "pos.report.z": "Z 报表",
  "pos.cash.variance": "现金差异",
  "pos.order.hold": "挂单",
  "pos.order.resumeHeld": "取回挂单",
  "pos.receipt.reprint": "重打小票",
} satisfies Record<TerminologyKey, string>;

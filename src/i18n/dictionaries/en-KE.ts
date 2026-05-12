import type { TerminologyKey } from "../terminology.ts";

export const enKEDictionary = {
  "inventory.stockIn.pending": "Pending Stock-in",
  "inventory.stockIn.confirm": "Confirm Stock-in",
  "inventory.stockIn.completed": "Stock-in Completed",
  "inventory.item.unbarcoded": "Unbarcoded Item",
  "inventory.item.inStock": "In Stock",
  "inventory.item.sold": "Sold",
  "inventory.location.unassigned": "Unassigned Location",
  "inventory.location.backroom": "Backroom",
  "inventory.location.shelf": "Shelf",
  "store.item.code": "Store Item",
  "store.delivery.package": "Store Delivery Package",
  "store.delivery.order": "Store Delivery Order",
  "pos.shift.open": "Open Shift",
  "pos.shift.close": "Close Shift",
  "pos.report.x": "X Report",
  "pos.report.z": "Z Report",
  "pos.cash.variance": "Cash Variance",
  "pos.order.hold": "Hold Order",
  "pos.order.resumeHeld": "Resume Held Order",
  "pos.receipt.reprint": "Reprint Receipt",
} satisfies Record<TerminologyKey, string>;

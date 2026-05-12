export const terminologyKeys = {
  inventory: {
    stockIn: {
      pending: "inventory.stockIn.pending",
      confirm: "inventory.stockIn.confirm",
      completed: "inventory.stockIn.completed",
    },
    item: {
      unbarcoded: "inventory.item.unbarcoded",
      inStock: "inventory.item.inStock",
      sold: "inventory.item.sold",
    },
    location: {
      unassigned: "inventory.location.unassigned",
      backroom: "inventory.location.backroom",
      shelf: "inventory.location.shelf",
    },
  },
  store: {
    item: {
      code: "store.item.code",
    },
    delivery: {
      package: "store.delivery.package",
      order: "store.delivery.order",
    },
  },
  pos: {
    shift: {
      open: "pos.shift.open",
      close: "pos.shift.close",
    },
    report: {
      x: "pos.report.x",
      z: "pos.report.z",
    },
    cash: {
      variance: "pos.cash.variance",
    },
    order: {
      hold: "pos.order.hold",
      resumeHeld: "pos.order.resumeHeld",
    },
    receipt: {
      reprint: "pos.receipt.reprint",
    },
  },
} as const;

type LeafValues<T> = T extends string ? T : { [K in keyof T]: LeafValues<T[K]> }[keyof T];

export type TerminologyKey = LeafValues<typeof terminologyKeys>;

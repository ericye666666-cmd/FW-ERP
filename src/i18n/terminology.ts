export const terminologyKeys = {
  inventory: {
    overview: {
      title: "inventory.overview.title",
    },
    stockIn: {
      pending: "inventory.stockIn.pending",
      confirm: "inventory.stockIn.confirm",
      completed: "inventory.stockIn.completed",
      time: "inventory.stockIn.time",
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
    source: {
      package: "inventory.source.package",
    },
    sale: {
      time: "inventory.sale.time",
    },
    field: {
      entityType: "inventory.field.entityType",
    },
    shelf: {
      layout: "inventory.shelf.layout",
    },
  },
  store: {
    switch: "store.switch",
    current: "store.current",
    item: {
      code: "store.item.code",
    },
    delivery: {
      package: "store.delivery.package",
      order: "store.delivery.order",
    },
  },
  pos: {
    scan: {
      storeItem: "pos.scan.storeItem",
      storeItemOnly: "pos.scan.storeItemOnly",
    },
    shift: {
      open: "pos.shift.open",
      close: "pos.shift.close",
      openFirst: "pos.shift.openFirst",
    },
    report: {
      x: "pos.report.x",
      z: "pos.report.z",
    },
    item: {
      addUnbarcoded: "pos.item.addUnbarcoded",
      alreadySold: "pos.item.alreadySold",
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
  pda: {
    work: {
      today: "pda.work.today",
    },
    package: {
      scan: "pda.package.scan",
    },
    label: {
      print: "pda.label.print",
      printed: "pda.label.printed",
      printFailed: "pda.label.printFailed",
    },
    location: {
      select: "pda.location.select",
      selectFirst: "pda.location.selectFirst",
    },
    printer: {
      notConnected: "pda.printer.notConnected",
    },
  },
} as const;

type LeafValues<T> = T extends string ? T : { [K in keyof T]: LeafValues<T[K]> }[keyof T];

export type TerminologyKey = LeafValues<typeof terminologyKeys>;

# FW-ERP POS UI Design Rules

Research date: 2026-05-11

## POS design goal

FW-ERP POS must behave like a real cashier terminal, not a backend ERP page.

It must be fast, touch-friendly, scan-first, and suitable for Kenyan retail store cashiers. The cashier should be able to scan, see the basket, collect payment, confirm coverage, complete the sale, and reprint when needed without navigating through ordinary ERP controls.

The POS main screen should show only cashier-needed information: scan entry, cart, payment, shift, printer, and sync state. It must not become an ERP traceability page.

## Entry and navigation rules

- Entry remains Store workspace / 收银功能区 / 9. 收银销售.
- Once opened, POS runs full-screen.
- Full-screen POS must not show:
  - first-level workspace menu;
  - second-level menu;
  - 上一页 / 下一页;
  - 搜索门店页面;
  - ordinary ERP sidebar.
- Browser Back exits POS full-screen and returns to the Store / 收银功能区 menu.
- POS top bar should include 退出收银台.
- 退出收银台 returns to the Store / 收银功能区 menu. It is separate from logout.
- Logout behavior must remain a separate explicit action if shown.

## Layout rules

Target layout:

Top bar:

- FW-ERP POS 收银台
- current store
- current cashier
- current shift
- network status
- current time
- exit cashier action

Left / center main area:

- large STORE_ITEM scan input above the cart
- placeholder: 扫描 STORE_ITEM 商品码
- scan error block directly below the scan input
- cart item list

Cart item rows display only:

- STORE_ITEM 商品码
- category
- price
- quantity
- discount
- subtotal
- rack location, if already known
- remove button

Cart item rows must not display:

- SDO
- SDB
- LPK
- RAW_BALE
- source chain
- recent scan history

Cart empty state:

- empty state: 商品篮为空，请扫描 STORE_ITEM 商品码

Right column:

- checkout panel
- total items
- subtotal
- discount
- receivable amount, displayed large
- paid
- balance / change
- Cash / M-Pesa / Mixed buttons
- complete sale button
- hold order
- clear cart
- current payment status
- latest sale summary

Bottom bar:

- today sales
- shift sales
- shift order count
- print status
- sync status
- reprint latest sale shortcut

Layout behavior:

- The scan input, cart, and checkout panel must remain visible during normal cashier work.
- The scan input is the cart's main entry point and must sit directly above the cart.
- Payment mode should not hide the cart total.
- Error and payment status should stay close to the control that caused the state.
- Avoid page-length ERP forms inside the main cashier surface.
- Do not show source-chain or lineage details on the POS main screen.
- Do not show a recent scan list on the POS main screen.
- Keep SDO / SDP / SDB / LPK / RAW_BALE context out of the cashier checkout view unless it is part of an error message saying the code cannot be sold.

## Touch density rules

- Buttons must be large enough for store cashier use.
- Primary actions must be obvious.
- Total amount must be visually dominant.
- Scan input must be the most obvious starting point.
- Avoid tiny backend-style controls in the main cashier flow.
- Keep explanations short.
- Use direct cashier-facing labels.
- Prefer one-tap cashier actions for payment mode, remove item, complete sale, and reprint.
- Keep destructive actions visually distinct and permission-aware.
- Avoid dense table-only layouts for the main cart on touch devices.

## Payment UI rules

Cash:

- cash received
- change due
- paid / balance status

M-Pesa:

- customer phone
- M-Pesa amount
- M-Pesa reference no.
- payment status
- phone used for payment verification, transaction record, after-sale lookup, and internal customer analysis only
- no SMS push
- no WhatsApp push
- no marketing push in POS UI

Mixed:

- cash amount
- M-Pesa phone
- M-Pesa amount
- M-Pesa reference no.
- paid total
- balance / covered state

General payment rules:

- Cash, M-Pesa, and Mixed should read as three clear cashier modes.
- Payment status must show whether the sale is unpaid, partially covered, pending, covered, or completed.
- Complete sale should stay disabled or blocked until payment rules are satisfied.
- M-Pesa reference fields are transaction evidence, not marketing consent.

## Hold order rules

- Hold order is only for temporarily preserving the current cart.
- Hold order is not credit sale / 赊账.
- Clicking hold generates a HOLD order.
- Items in a held order become held / reserved and cannot be sold again while held.
- A held order can continue to payment, be cancelled, or be transferred to the next shift with store-manager confirmation.
- Cancelling a held order releases items back to on_shelf / in_stock.
- Before shift handover, all held orders must be completed, cancelled, or explicitly transferred by store-manager confirmation.
- Hold order UI must make the temporary nature clear to cashiers.

## Shift rules

- A cashier must open a shift before entering POS.
- Every sale must bind to a shift_id.
- One shift belongs to one cashier. Multiple cashiers must not share one shift.
- After the current cashier closes a shift, the next cashier must open a new shift.
- Shift close must show:
  - shift sales amount;
  - order count;
  - cash amount;
  - M-Pesa amount;
  - Mixed amount;
  - expected cash;
  - counted cash;
  - variance.
- Cash variance must be recorded and must not be overwritten.
- Shift handover must not hide unresolved held orders.

## Weak-network rules

- POS top bar must show network status:
  - online;
  - syncing;
  - weak network;
  - offline;
  - sync failed.
- In weak-network mode, POS may sell locally cached STORE_ITEM records.
- Weak-network sales are completed_pending_sync.
- Items sold on this device immediately become sold_pending_sync to prevent duplicate sale on the same POS.
- When network recovers, POS syncs sale records and inventory status.
- Version 1 does not solve conflicts across multiple POS terminals.
- Version 1 assumes one primary POS terminal per store.
- POS still only sells STORE_ITEM in weak-network mode.
- Weak-network mode must not allow RAW_BALE / SDB / LPK / SDO / SDP sales.

## Customer phone rules

- Customer phone is collected during M-Pesa or Mixed payment flow.
- Phone may be stored for:
  - payment verification;
  - transaction record;
  - after-sale lookup;
  - internal customer analysis.
- Phone must not be used for:
  - SMS marketing;
  - WhatsApp marketing;
  - external export by cashier;
  - third-party sharing.
- Cashier should not see a full customer database.
- Future implementation should support Kenyan formats:
  - 0712345678
  - 712345678
  - +254712345678
  - 254712345678
- Future normalized format:
  - +254712345678
- Display can be masked where appropriate:
  - 0712 *** 678

## Status and error rules

Use FW-ERP status accent logic:

- Info: active scan / next action
- Success: paid / covered / connected / recognized STORE_ITEM / synced
- Warning: pending payment / sync pending / weak network / amount not fully covered
- Danger: scan error / cannot sell / wrong barcode / offline sync failed
- Neutral: empty cart / default state

Scan errors must appear near the scan input:

- 只能扫描 STORE_ITEM 商品码
- RAW_BALE 不能在 POS 销售
- SDB 不能在 POS 销售
- LPK 不能在 POS 销售
- SDO 不能在 POS 销售
- SDP 不能在 POS 销售
- 该商品还未上架，不可销售
- 该商品已挂单保留，不能重复销售
- 该商品已售出，不能重复销售

Error behavior:

- Do not hide scan errors in toast-only feedback.
- Keep the failed scan value visible enough for the cashier to understand what happened.
- Use short cashier-facing copy first. Put technical details behind diagnostics only when needed.
- Do not use success color for a merely eligible item unless it has actually been recognized for the current sale.

## Barcode guardrails

- POS only accepts STORE_ITEM.
- RAW_BALE cannot be sold in POS.
- SDB / STORE_PREP_BALE cannot be sold in POS.
- LPK cannot be sold in POS.
- SDO / STORE_DELIVERY_EXECUTION cannot be sold in POS.
- SDP / STORE_DELIVERY_PACKAGE cannot be sold in POS.
- pending_print cannot be sold.
- pending_putaway cannot be sold.
- held / reserved STORE_ITEM cannot be sold in a new sale until released or completed through the held order flow.
- sold STORE_ITEM cannot be sold again.
- Frontend/POS must not generate STORE_ITEM machine_code.
- POS UI must not weaken barcode resolver rules.
- POS UI must not infer sellable inventory from barcode prefix alone.
- POS UI must not make an item sellable by visual state only.

## Future implementation sequence

1. POS-FS-1 full-screen POS entry and browser Back behavior.
2. POS-UI-2 field-ready cashier terminal visual polish.
3. POS-PAY-1 Cash / M-Pesa / Mixed local validation and customer phone sale record.
4. POS-HOLD-1 HOLD cart reservation, release, and manager-confirmed shift transfer.
5. POS-MPESA-1 Safaricom Daraja sandbox STK Push backend integration.
6. POS-MPESA-2 STK Push callback and payment status update.
7. POS-MPESA-3 C2B callback for customer-initiated payments.
8. POS-SHIFT-1 open shift / close shift / Z-report.
9. POS-AUDIT-1 void/refund permission and audit.
10. POS-OFFLINE-1 weak network / offline sync.

Sequence rules:

- UI polish can improve cashier speed before payment integration is live.
- Daraja work must be backend-led and sandbox-first.
- C2B and STK Push are separate payment paths.
- HOLD order work must reserve and release STORE_ITEM status consistently before production use.
- Shift close, refund, void, and offline sync need audit rules before production use.
- None of these future steps should import external POS template code.

## Forbidden implementation changes in this research PR

This docs-only PR must not change:

- frontend_prototype/index.html
- frontend_prototype/app.js
- frontend_prototype/styles.css
- backend
- API
- barcode resolver
- POS sale rules
- store receiving
- PDA
- Android
- Print Agent
- inventory
- cost
- PickingWave
- runtime data
- backend/data
- secrets
- .env
- node_modules
- dist
- zip / APK / exe
- cache / backup files

This research PR may add only:

- docs/ui/references/FW_ERP_POS_UI_REFERENCES.md
- docs/ui/references/FW_ERP_POS_UI_DESIGN_RULES.md

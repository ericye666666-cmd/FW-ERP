# 03_BUSINESS_DECISIONS.md

This document records the business decisions that GPT Thinking and Codex should treat as the current baseline.

## 1. System principle

FW-ERP is one system with role-based surfaces, not many unrelated products.

Core roles:

- Owner / boss: business decisions, risk, expansion.
- Area operations manager: regional supervision and exception approval, not daily manual middleman.
- Warehouse supervisor: inbound, sorting, labels, inventory, dispatch.
- Store manager: receipt, allocation, progress, exceptions.
- Store clerk: assigned bale / token / shelving tasks only.
- Cashier: independent POS terminal role.

Frontend visibility is not permission. Backend hard permission is required.

## 2. Second-hand clothing flow

The main business flow is the sorting flow:

```text
source bale -> inbound -> warehouse_in label -> sorting task -> sorting confirmation -> sorted stock / item token -> warehouse inventory -> store dispatch or bale sales
```

Direct-hang goods are an exception, not the main flow.

Product subcategory is treated as product name. Kenya-side UI should prefer English names.

## 3. Cost and warehouse inventory

Cost belongs to warehouse / batch / sorting flow, not store editing.

`0.2 Sorting confirmation` is the main cost-lock point.

Store can edit sale price and rack position, but not original cost, supplier, category, or batch source.

Sorted warehouse stock remains warehouse inventory until dispatch / receipt / sale changes its status.

Compression work orders are warehouse actions, not sales actions.

## 4. Store fulfillment

Area manager should not manually create every transfer order between store and warehouse.

Replenishment should be driven by sales data, store inventory, pending shelving, in-transit stock, warehouse supply, and system suggestions.

Store receipt object is `warehouseout dispatch bale`, not the original raw bale.

One dispatch bale can be assigned to only one clerk.

Store manager and clerk workspaces must remain separate.

## 5. POS / cashier

Cashier is an independent role.

POS selling requires cashier role, open shift, POS device binding, and active session.

POS must accept only store item barcode. It must reject raw bale, dispatch bale, loose-pick, template, or test codes.

Cashier UI should be a terminal-style interface, not the full workspace.

## 6. Barcode / identity / template

Barcode types must be separated:

- `RAW_BALE`: warehouse inbound bale.
- `DISPATCH_BALE`: delivery / store receipt bale.
- `STORE_ITEM`: final sellable item.
- `BALE_SALES`: wholesale bale.
- `LOOSE_PICK`: loose-pick task label.

`template_scope` only chooses the print template family. It is not business identity.

`identity_id` should become the lifecycle anchor for price change, rack change, print, shelving, POS sale, refund, return, and warehouse return.

`barcode_value` must not remain globally ambiguous. A resolver is required.

## 7. Printing

Deli DL-720C and TSPL raw printing remain the baseline.

Warehouse-in labels, warehouseout labels, and store item labels are separate template families.

Candidate labs, hardware labs, and barcode smoke pages are testing tools, not formal business pages.

## 8. Bales sales

Bales sales is downstream sales, not raw inventory ownership.

Warehouse first decides whether a raw bale goes to sorting or bale-sales pool.

Bales sales handles only bales already in the sales pool.

Allowed sources:

1. Raw unsorted bale direct sale.
2. Repacked bale after sorting.

Bales sales is not POS. It needs salesperson, customer, contact, payment method, cost, margin, and sales order.

## 9. Returns / cycle close

From the store thread, return-to-warehouse is terminal.

Returned stock must first enter the warehouse RET area.

Post-RET diversion is unresolved and needs GPT Thinking review.

Potential directions include re-sort, bale-sales pool, disposal, or later redistribution.

## 10. General merchandise

General merchandise is a separate standard-SKU business line.

It should use SKU, shipment, packing list, batch, landed cost, warehouse zone, and replenishment logic.

Shipping cost for general merchandise should be allocated by CBM.

FCL and LCL are transport modes, not separate cost models.

## 11. Boss BI

Boss BI is decision support, not just charts.

Each card should produce conclusion, evidence, action suggestion, and missing data.

It must eventually cover second-hand clothing, general merchandise, and bales sales.

## 12. Deployment

First production phase should be a controlled pilot:

- 1 warehouse.
- 1 printing station.
- 1 store.

Cloud hosting does not automatically solve local label printing. A local print agent is needed if the main server moves to cloud.

`runtime_state.json` is acceptable for prototype and controlled testing, not long-term multi-store production.

## 13. Change rule

Any PR that changes these decisions must be marked as a decision change, explain why, update this file, and be reviewed by GPT Thinking before Codex implementation.

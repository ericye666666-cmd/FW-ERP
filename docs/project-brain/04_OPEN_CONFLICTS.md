# 04_OPEN_CONFLICTS.md

This document records unresolved conflicts that must be reviewed by GPT Thinking before Codex continues implementation.

## 1. Full local system vs GitHub Pages preview

Current conflict:

- `FW-ERP` GitHub Pages is the React/Vite admin preview.
- The deeper implemented workflow still appears to live in local `retail_ops_system/frontend_prototype` plus `backend`.

Decision needed:

- Short term: keep `frontend_prototype` as the real workflow validation surface and `frontend_react_admin` as the clickable management shell.
- Medium term: decide which confirmed workflows should be migrated into React admin.

Risk if unresolved:

- The user may think the Pages preview represents the full ERP, while real backend-connected flows remain local and scattered.

## 2. Barcode identity conflict

Current conflict:

Terms are repeatedly mixed across threads:

- `barcode`
- `barcode_value`
- `token_no`
- `identity_no`
- `identity_id`
- `scan_token`
- `dispatch_bale_no`
- `template_scope`

Decision needed:

A global barcode resolver spec must define each barcode type, who generates it, who can scan it, who must reject it, and how it maps to business objects.

Risk if unresolved:

- POS may accept a dispatch bale code.
- Warehouse may scan a store item code.
- Labels may print the correct template but encode the wrong business identity.
- Returns and identity ledger may lose lifecycle traceability.

## 3. `template_scope` vs business identity

Current conflict:

Some threads treat `template_scope` as if it implies business object type.

Decision needed:

`template_scope` must remain print-template classification only. Business identity must come from barcode resolver and object type.

Risk if unresolved:

- A label can look visually correct but route to the wrong business flow.

## 4. Store replenishment model conflict

Current conflict:

Two models exist:

1. Sell-through replenishment: sell多少补多少.
2. Two-week cycle model: store cycle closes, stock returns, good pieces re-selected, remaining stock enters lower-value channels.

Decision needed:

Define whether second-hand clothing store replenishment should be treated as standard replenishment, cycle-based replacement, or a hybrid.

Risk if unresolved:

- Page 4 replenishment suggestions may optimize for the wrong business model.
- Area manager workflow may reappear as a manual middle layer.
- Store stock and warehouse supply logic will drift.

## 5. Return-to-warehouse terminal meaning

Current conflict:

One decision says return-to-warehouse is terminal. Another thread needs post-RET diversion.

Decision needed:

Clarify whether `return-to-warehouse is terminal` means:

- terminal for the store thread only, or
- terminal for the entire item lifecycle.

Possible post-RET directions:

- re-sort
- bale-sales pool
- disposal / loss
- reallocation

Risk if unresolved:

- Returned stock may either disappear from business logic or re-enter flows without governance.

## 6. Bales sales vs `0.4` / compression work order

Current conflict:

Bales sales has a separate sales pool and outbound pages, while `0.4` / compression workflows may also handle sellable bales.

Decision needed:

Define the long-term relationship:

- Does Bales Sales replace `0.4` for downstream sales?
- Does `0.4` only create candidates and Bales Sales sells them?
- Which object owns cost and final sales status?

Risk if unresolved:

- Same bale may be managed in two places.
- Cost and status may diverge.

## 7. Raw bale destination ownership

Current conflict:

Raw bale can go to sorting or bale-sales pool. But ownership of that decision is not fully formalized.

Decision needed:

Define which role and which page decides raw bale destination.

Risk if unresolved:

- Warehouse main inventory and Bales Sales pool may double count or miss bales.

## 8. Compression quantity rules

Current conflict:

Threads mention different allowed compression quantities:

- 50 / 100 / 150 / 200 / 250
- only 100 / 200

Decision needed:

Set allowed package sizes for `0.1.2` compression tasks.

Risk if unresolved:

- Frontend and backend validation mismatch.
- Tests continue failing against outdated rules.

## 9. Cost lock authority

Current conflict:

`0.2` is the cost-lock point, but some summaries indicate cost is still partly calculated or displayed from frontend assumptions.

Decision needed:

Backend should be the authoritative cost lock source. Frontend may display suggested/default cost only.

Risk if unresolved:

- Store, warehouse, and bales sales margin calculations may use inconsistent cost values.

## 10. Warehouse inventory fact source

Current conflict:

Some warehouse inventory summaries are frontend aggregation, not backend fact source.

Decision needed:

Create backend read-only summary endpoints for key warehouse inventory views.

Risk if unresolved:

- Different pages may show different inventory totals.
- Boss BI cannot trust the data.

## 11. General merchandise cost model

Current conflict:

General merchandise is clearly a separate SKU business line, but formal cost allocation is not yet fixed.

Decision needed:

Define allocation rules for:

- ocean freight by CBM
- tax / duty
- clearance
- local delivery
- shared shipment cost

Risk if unresolved:

- Same SKU across batches will have inaccurate profit.
- POS and BI margin will be misleading.

## 12. Permission design vs implementation

Current conflict:

Role-permission design exists, but backend hard permission is not implemented.

Decision needed:

Start with a minimal backend permission enforcement slice before more UI role hiding.

Minimum candidates:

- `POST /sales`
- `POST /pos/shifts/open`
- `POST /transfers`
- store dispatch bale accept endpoint
- store item barcode edit endpoint

Risk if unresolved:

- Users can bypass hidden frontend buttons and call APIs directly.

## 13. Printing preview vs real print

Current conflict:

Template preview is not always pixel-accurate to thermal printer output.

Decision needed:

Decide whether to build backend print-preview parity or continue with approximate frontend preview plus real test print.

Risk if unresolved:

- User may approve a preview that prints incorrectly.

## 14. Local printing vs cloud deployment

Current conflict:

Cloud main server does not naturally print to local Deli label printer.

Decision needed:

For phase 1, choose one:

- warehouse local machine as server and print station
- cloud server + local print agent

Risk if unresolved:

- Production deployment may work in browser but fail at label printing.

## 15. Boss BI timing

Current conflict:

Boss BI is important but data sources are not stable.

Decision needed:

Delay full BI until barcode, cost, inventory fact source, and business line separation are more stable.

Risk if unresolved:

- BI charts become visually attractive but operationally wrong.

## Review rule

No Codex implementation should proceed on any item in this document until GPT Thinking writes a precise Issue with scope, acceptance criteria, and non-goals.

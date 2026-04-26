# 01_THREAD_INDEX.md

This file indexes the local Codex threads that have been summarized for FW-ERP / `retail_ops_system`.

## Core rule

Future work must not start from scattered local Codex threads. GPT Thinking reviews the project brain first, creates a GitHub Issue, and Codex implements only that Issue.

## Thread list

| Area | Thread | Status | Main surface | Notes |
|---|---|---|---|---|
| Main second-hand flow | Overall second-hand clothing flow | Mixed: design + local implementation | `retail_ops_system`, `frontend_prototype`, `backend` | Covers inbound, sorting, dispatch, store execution, POS, returns, analytics. |
| Warehouse | Main sorting flow | Backend-connected prototype | `frontend_prototype` + `backend` | Covers 4.2, 4.3, inbound, printing, sorting tasks, 0.2, 0.3. |
| Warehouse | Sorting back-half and compression | Backend-connected prototype | `backend` + `frontend_prototype` | Covers cost lock, sorted stock, 0.1.2 compression, waiting-store and waiting-sale bales. |
| Store operations | Fulfillment and replenishment | Backend-connected prototype | `frontend_prototype` + `backend` | Covers replenishment suggestion, transfer order, warehouse execution, dispatch bale, delivery tracking, store receipt. |
| Store execution | Receiving, allocation, clerk work, labels, POS | Prototype + partial backend | `frontend_prototype` + `backend` | Needs barcode and identity governance before expansion. |
| Returns | Cycle close and return-to-warehouse | Partial backend-connected flow | `frontend_prototype` + `backend` | Return creation/dispatch/RET receive exists; post-RET diversion not defined. |
| Printing | PDA and label machine | Prototype + real printer tests | `frontend_prototype` + `backend` + Deli DL-720C | Warehouse-in stable; warehouseout/store-item templates still need governance. |
| Barcode governance | Global barcode/identity/template scope | Needs review before implementation | Future documentation and resolver | Highest cross-thread risk. |
| Bales sales | Wholesale/bale sales pool and outbound | Backend-connected prototype | `/app`, `frontend_react_admin`, backend API | Needs upstream source integration and clearer relation with 0.4. |
| Cashier | POS terminal shell | Frontend prototype | `frontend_prototype` + standalone preview | Needs real `/app` cashier-role validation. |
| General merchandise | Department-store SKU flow | Design only | Future module | Needs shipment, packing list, CBM cost allocation, batch cost. |
| Permissions | Five-role permission model | Design docs only | Future backend auth + frontend visibility | Backend hard permission not implemented. |
| Deployment | Ops, startup, healthcheck, backup, print environment | Ops scripts/docs reported | `ops` + backend config | Needs real production machine deployment. |
| Boss BI | Owner decision desk | Design only | Future BI | Should wait for source-of-truth stabilization. |

## Status warning

The current GitHub Pages FW-ERP React preview is not the full local `retail_ops_system`. It is a clickable management shell. The deeper local implementation is still mainly in `frontend_prototype` + `backend`.

## Maintenance rule

When a new Issue changes a thread status, update this index in the same PR.

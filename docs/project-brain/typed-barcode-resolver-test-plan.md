# Typed Barcode Resolver Test Plan

## Purpose

This document defines pre-implementation test coverage for typed barcode resolver behavior in FW-ERP. It is documentation-only and does not change application behavior, routes, or scan logic.

Reference: `docs/project-brain/barcode-governance.md`.

## Scope and hard rules

- Barcode types covered: `RAW_BALE`, `DISPATCH_BALE`, `STORE_ITEM`, `BALE_SALES`, `LOOSE_PICK`, `UNKNOWN`.
- Scan contexts covered:
  1. Warehouse inbound
  2. Warehouse raw bale stock
  3. Warehouse sorting task creation
  4. Sorting confirmation
  5. Store dispatch
  6. Store receiving
  7. Store item editing
  8. Store item printing
  9. POS sale
  10. Return-to-warehouse
  11. B2B bale sales
  12. Loose pick / internal operation
  13. Unknown barcode scan
- POS accepts only `STORE_ITEM`.
- Warehouse sorting accepts `RAW_BALE`, rejects `STORE_ITEM`.
- Store receiving accepts `DISPATCH_BALE`, rejects `RAW_BALE`.
- B2B bale sales accepts `BALE_SALES`, rejects `STORE_ITEM`.
- `template_scope` is print-template classification only; it is not business identity.
- Store item lifecycle uses `identity_id`.
- Rejection message must direct the operator to the correct next scan flow.

## Resolver behavior matrix (test cases)

| Case ID | Scan context | Barcode type | Expected result | Business object returned | Required message to user | Operational next step | POS allowed | `identity_id` required | Risk level | Suggested backend test name |
|---|---|---|---|---|---|---|---|---|---|---|
| TC-001 | Warehouse inbound | `RAW_BALE` | Accept | `INBOUND_BALE` | Raw bale accepted for warehouse inbound intake. | Continue inbound receiving and supplier/batch registration. | No | No | Medium | `test_resolver_warehouse_inbound_accepts_raw_bale` |
| TC-002 | Warehouse inbound | `DISPATCH_BALE` | Reject | `DISPATCH_BALE` | Dispatch bale detected. Scan this in Store Receiving or Warehouse Dispatch Confirmation. | Move to transfer/store-receiving workflow. | No | No | Medium | `test_resolver_warehouse_inbound_rejects_dispatch_bale` |
| TC-003 | Warehouse inbound | `STORE_ITEM` | Reject | `STORE_ITEM` | Store item barcode detected. Use Store Item Editing/Inventory or POS flow, not warehouse inbound. | Route operator to store item lifecycle page. | Yes | Yes | High | `test_resolver_warehouse_inbound_rejects_store_item` |
| TC-004 | Warehouse inbound | `BALE_SALES` | Reject | `BALE_SALES_UNIT` | B2B bale sales barcode detected. Use B2B Bale Sales flow. | Route to wholesale handling flow. | No | No | Medium | `test_resolver_warehouse_inbound_rejects_bale_sales` |
| TC-005 | Warehouse inbound | `LOOSE_PICK` | Reject | `LOOSE_PICK_TASK` | Loose pick token detected. Use Loose Pick/Internal Operation screen. | Route to internal picking flow. | No | No | Medium | `test_resolver_warehouse_inbound_rejects_loose_pick` |
| TC-006 | Warehouse inbound | `UNKNOWN` | Reject | `UNKNOWN` | Barcode type is unknown. Verify label source and scan in the correct module. | Retry scan with known barcode class. | No | No | High | `test_resolver_warehouse_inbound_rejects_unknown` |
| TC-007 | Warehouse raw bale stock | `RAW_BALE` | Accept | `INBOUND_BALE` | Raw bale accepted for warehouse stock tracking. | Continue bale stock operation or adjustment. | No | No | Medium | `test_resolver_raw_bale_stock_accepts_raw_bale` |
| TC-008 | Warehouse raw bale stock | `DISPATCH_BALE` | Reject | `DISPATCH_BALE` | Dispatch bale detected. Use dispatch/receiving transfer pages for this code. | Route to transfer workflow. | No | No | Medium | `test_resolver_raw_bale_stock_rejects_dispatch_bale` |
| TC-009 | Warehouse raw bale stock | `STORE_ITEM` | Reject | `STORE_ITEM` | Store item barcode detected. Use store item inventory flow, not raw bale stock. | Open store inventory action. | Yes | Yes | High | `test_resolver_raw_bale_stock_rejects_store_item` |
| TC-010 | Warehouse raw bale stock | `BALE_SALES` | Reject | `BALE_SALES_UNIT` | Bale sales code detected. Use B2B Bale Sales flow. | Move to wholesale module. | No | No | Medium | `test_resolver_raw_bale_stock_rejects_bale_sales` |
| TC-011 | Warehouse raw bale stock | `LOOSE_PICK` | Reject | `LOOSE_PICK_TASK` | Loose pick token detected. Use internal operation flow. | Route to loose pick task page. | No | No | Low | `test_resolver_raw_bale_stock_rejects_loose_pick` |
| TC-012 | Warehouse raw bale stock | `UNKNOWN` | Reject | `UNKNOWN` | Unknown barcode. Confirm barcode type before warehouse stock scan. | Escalate to supervisor or relabel. | No | No | High | `test_resolver_raw_bale_stock_rejects_unknown` |
| TC-013 | Warehouse sorting task creation | `RAW_BALE` | Accept | `INBOUND_BALE` | Raw bale accepted for sorting task creation. | Create sorting task from bale identity. | No | No | High | `test_resolver_sorting_task_accepts_raw_bale` |
| TC-014 | Warehouse sorting task creation | `DISPATCH_BALE` | Reject | `DISPATCH_BALE` | Dispatch bale detected. Use dispatch transfer flows, not sorting task creation. | Scan inbound raw bale for sorting. | No | No | Medium | `test_resolver_sorting_task_rejects_dispatch_bale` |
| TC-015 | Warehouse sorting task creation | `STORE_ITEM` | Reject | `STORE_ITEM` | Store item barcode cannot create warehouse sorting tasks. Scan a raw bale barcode instead. | Return to store inventory/POS for store item actions. | Yes | Yes | High | `test_resolver_sorting_task_rejects_store_item` |
| TC-016 | Warehouse sorting task creation | `BALE_SALES` | Reject | `BALE_SALES_UNIT` | Bale sales barcode detected. Use B2B bale sales workflow. | Route to wholesale operations. | No | No | Medium | `test_resolver_sorting_task_rejects_bale_sales` |
| TC-017 | Warehouse sorting task creation | `LOOSE_PICK` | Reject | `LOOSE_PICK_TASK` | Loose pick token cannot start sorting task. Use internal operation screen. | Open loose-pick workflow. | No | No | Medium | `test_resolver_sorting_task_rejects_loose_pick` |
| TC-018 | Warehouse sorting task creation | `UNKNOWN` | Reject | `UNKNOWN` | Unknown barcode. Sorting task requires recognized raw bale barcode. | Retry with raw bale label. | No | No | High | `test_resolver_sorting_task_rejects_unknown` |
| TC-019 | Sorting confirmation | `RAW_BALE` | Accept | `INBOUND_BALE` | Raw bale accepted for sorting confirmation. | Confirm sorting output against bale. | No | No | High | `test_resolver_sorting_confirmation_accepts_raw_bale` |
| TC-020 | Sorting confirmation | `DISPATCH_BALE` | Reject | `DISPATCH_BALE` | Dispatch bale detected. Sorting confirmation requires raw bale source. | Return to transfer/dispatch flow. | No | No | Medium | `test_resolver_sorting_confirmation_rejects_dispatch_bale` |
| TC-021 | Sorting confirmation | `STORE_ITEM` | Reject | `STORE_ITEM` | Store item barcode is not valid for sorting confirmation. Scan raw bale barcode. | Route to store item lifecycle if needed. | Yes | Yes | High | `test_resolver_sorting_confirmation_rejects_store_item` |
| TC-022 | Sorting confirmation | `BALE_SALES` | Reject | `BALE_SALES_UNIT` | Bale sales barcode detected. Use B2B bale sales flow. | Move to wholesale module. | No | No | Medium | `test_resolver_sorting_confirmation_rejects_bale_sales` |
| TC-023 | Sorting confirmation | `LOOSE_PICK` | Reject | `LOOSE_PICK_TASK` | Loose pick token is not valid for sorting confirmation. | Continue in loose pick/internal operation flow. | No | No | Low | `test_resolver_sorting_confirmation_rejects_loose_pick` |
| TC-024 | Sorting confirmation | `UNKNOWN` | Reject | `UNKNOWN` | Unknown barcode. Sorting confirmation requires known raw bale identity. | Retry scan with raw bale label. | No | No | High | `test_resolver_sorting_confirmation_rejects_unknown` |
| TC-025 | Store dispatch | `RAW_BALE` | Reject | `INBOUND_BALE` | Raw bale detected. Store dispatch requires dispatch bale or store dispatch identity flow. | Use warehouse dispatch preparation first. | No | No | Medium | `test_resolver_store_dispatch_rejects_raw_bale` |
| TC-026 | Store dispatch | `DISPATCH_BALE` | Accept | `DISPATCH_BALE` | Dispatch bale accepted for store dispatch operation. | Proceed transfer dispatch confirmation. | No | No | High | `test_resolver_store_dispatch_accepts_dispatch_bale` |
| TC-027 | Store dispatch | `STORE_ITEM` | Reject | `STORE_ITEM` | Store item barcode scanned. Use item-level store operations or POS, not bale dispatch. | Return to store item operation page. | Yes | Yes | Medium | `test_resolver_store_dispatch_rejects_store_item` |
| TC-028 | Store dispatch | `BALE_SALES` | Reject | `BALE_SALES_UNIT` | Bale sales barcode belongs to B2B sales flow. | Route to B2B module. | No | No | Medium | `test_resolver_store_dispatch_rejects_bale_sales` |
| TC-029 | Store dispatch | `LOOSE_PICK` | Reject | `LOOSE_PICK_TASK` | Loose pick token detected. Use internal operation workflow. | Move to loose pick flow. | No | No | Low | `test_resolver_store_dispatch_rejects_loose_pick` |
| TC-030 | Store dispatch | `UNKNOWN` | Reject | `UNKNOWN` | Unknown barcode. Dispatch requires recognized dispatch bale barcode. | Retry with dispatch bale label. | No | No | High | `test_resolver_store_dispatch_rejects_unknown` |
| TC-031 | Store receiving | `RAW_BALE` | Reject | `INBOUND_BALE` | Raw bale detected. Store receiving accepts dispatch bale only. Scan dispatch bale barcode. | Return to warehouse inbound for raw bale handling. | No | No | High | `test_resolver_store_receiving_rejects_raw_bale` |
| TC-032 | Store receiving | `DISPATCH_BALE` | Accept | `DISPATCH_BALE` | Dispatch bale accepted for store receiving. | Continue receiving and transfer reconciliation. | No | No | High | `test_resolver_store_receiving_accepts_dispatch_bale` |
| TC-033 | Store receiving | `STORE_ITEM` | Reject | `STORE_ITEM` | Store item barcode detected. Store receiving expects dispatch bale barcode. | Scan dispatch bale, then process items in store flow. | Yes | Yes | Medium | `test_resolver_store_receiving_rejects_store_item` |
| TC-034 | Store receiving | `BALE_SALES` | Reject | `BALE_SALES_UNIT` | Bale sales barcode detected. Use B2B bale sales receiving/settlement workflow. | Route to wholesale handling. | No | No | Medium | `test_resolver_store_receiving_rejects_bale_sales` |
| TC-035 | Store receiving | `LOOSE_PICK` | Reject | `LOOSE_PICK_TASK` | Loose pick token is not valid for store receiving. | Use internal operation page. | No | No | Low | `test_resolver_store_receiving_rejects_loose_pick` |
| TC-036 | Store receiving | `UNKNOWN` | Reject | `UNKNOWN` | Unknown barcode. Store receiving requires recognized dispatch bale barcode. | Retry scan on dispatch bale label. | No | No | High | `test_resolver_store_receiving_rejects_unknown` |
| TC-037 | Store item editing | `RAW_BALE` | Reject | `INBOUND_BALE` | Raw bale barcode detected. Use warehouse inbound/sorting flow, not store item editing. | Route to warehouse operations. | No | No | Medium | `test_resolver_item_editing_rejects_raw_bale` |
| TC-038 | Store item editing | `DISPATCH_BALE` | Reject | `DISPATCH_BALE` | Dispatch bale barcode detected. Use store receiving/dispatch flow. | Route to transfer workflows. | No | No | Medium | `test_resolver_item_editing_rejects_dispatch_bale` |
| TC-039 | Store item editing | `STORE_ITEM` | Accept | `STORE_ITEM` | Store item barcode accepted for item editing. | Load item by `identity_id` and continue editing. | Yes | Yes | High | `test_resolver_item_editing_accepts_store_item_with_identity_id` |
| TC-040 | Store item editing | `BALE_SALES` | Reject | `BALE_SALES_UNIT` | Bale sales barcode detected. Use B2B bale sales flow. | Route to wholesale workflow. | No | No | Medium | `test_resolver_item_editing_rejects_bale_sales` |
| TC-041 | Store item editing | `LOOSE_PICK` | Reject | `LOOSE_PICK_TASK` | Loose pick token detected. Use internal operation flow. | Route to loose pick task handling. | No | No | Low | `test_resolver_item_editing_rejects_loose_pick` |
| TC-042 | Store item editing | `UNKNOWN` | Reject | `UNKNOWN` | Unknown barcode. Store item editing requires a valid store item barcode. | Retry with store item label. | No | No | High | `test_resolver_item_editing_rejects_unknown` |
| TC-043 | Store item printing | `RAW_BALE` | Reject | `INBOUND_BALE` | Raw bale barcode is not valid for store item printing. | Use warehouse print/intake template flow. | No | No | Medium | `test_resolver_item_printing_rejects_raw_bale` |
| TC-044 | Store item printing | `DISPATCH_BALE` | Reject | `DISPATCH_BALE` | Dispatch bale barcode is not valid for store item printing. | Use dispatch print flow. | No | No | Medium | `test_resolver_item_printing_rejects_dispatch_bale` |
| TC-045 | Store item printing | `STORE_ITEM` | Accept | `STORE_ITEM` | Store item barcode accepted for item printing; template scope is classification only. | Print store item label by resolved `identity_id`. | Yes | Yes | High | `test_resolver_item_printing_accepts_store_item_with_identity_id` |
| TC-046 | Store item printing | `BALE_SALES` | Reject | `BALE_SALES_UNIT` | Bale sales barcode detected. Use B2B print flow. | Route to bale sales print operation. | No | No | Medium | `test_resolver_item_printing_rejects_bale_sales` |
| TC-047 | Store item printing | `LOOSE_PICK` | Reject | `LOOSE_PICK_TASK` | Loose pick token is temporary and cannot drive store item printing. | Use loose pick/internal operation page. | No | No | Low | `test_resolver_item_printing_rejects_loose_pick` |
| TC-048 | Store item printing | `UNKNOWN` | Reject | `UNKNOWN` | Unknown barcode. Store item printing requires recognized store item barcode. | Retry with valid store item label. | No | No | High | `test_resolver_item_printing_rejects_unknown` |
| TC-049 | POS sale | `RAW_BALE` | Reject | `INBOUND_BALE` | Raw bale barcode cannot be sold at POS. Scan store item barcode instead. | Switch to store item scan at POS. | No | No | High | `test_resolver_pos_rejects_raw_bale` |
| TC-050 | POS sale | `DISPATCH_BALE` | Reject | `DISPATCH_BALE` | Dispatch bale barcode cannot be sold at POS. Scan store item barcode instead. | Switch to store item scan at POS. | No | No | High | `test_resolver_pos_rejects_dispatch_bale` |
| TC-051 | POS sale | `STORE_ITEM` | Accept | `STORE_ITEM` | Store item barcode accepted for POS sale. | Continue checkout using resolved `identity_id`. | Yes | Yes | Critical | `test_resolver_pos_accepts_store_item_with_identity_id` |
| TC-052 | POS sale | `BALE_SALES` | Reject | `BALE_SALES_UNIT` | Bale sales barcode is wholesale-only. Scan store item barcode at POS. | Route to B2B flow if wholesale transaction. | No | No | High | `test_resolver_pos_rejects_bale_sales` |
| TC-053 | POS sale | `LOOSE_PICK` | Reject | `LOOSE_PICK_TASK` | Loose pick token cannot be sold at POS. Scan store item barcode. | Continue in loose pick workflow or scan valid item. | No | No | High | `test_resolver_pos_rejects_loose_pick` |
| TC-054 | POS sale | `UNKNOWN` | Reject | `UNKNOWN` | Unknown barcode at POS. Scan valid store item barcode. | Retry with store item label or escalate. | No | No | High | `test_resolver_pos_rejects_unknown` |
| TC-055 | Return-to-warehouse | `RAW_BALE` | Accept | `INBOUND_BALE` | Raw bale accepted for return-to-warehouse intake. | Continue warehouse return intake process. | No | No | Medium | `test_resolver_return_to_warehouse_accepts_raw_bale` |
| TC-056 | Return-to-warehouse | `DISPATCH_BALE` | Accept | `DISPATCH_BALE` | Dispatch bale accepted for return transfer reconciliation. | Continue return reconciliation flow. | No | No | Medium | `test_resolver_return_to_warehouse_accepts_dispatch_bale` |
| TC-057 | Return-to-warehouse | `STORE_ITEM` | Accept | `STORE_ITEM` | Store item accepted for return traceability; identity binding required. | Process return against item `identity_id` then warehouse handling. | Yes | Yes | High | `test_resolver_return_to_warehouse_accepts_store_item_with_identity_id` |
| TC-058 | Return-to-warehouse | `BALE_SALES` | Reject | `BALE_SALES_UNIT` | Bale sales barcode detected. Use B2B bale return/settlement workflow. | Route to wholesale return process. | No | No | Medium | `test_resolver_return_to_warehouse_rejects_bale_sales` |
| TC-059 | Return-to-warehouse | `LOOSE_PICK` | Reject | `LOOSE_PICK_TASK` | Loose pick token detected. Use internal operation flow for token closure. | Resolve loose-pick task first. | No | No | Low | `test_resolver_return_to_warehouse_rejects_loose_pick` |
| TC-060 | Return-to-warehouse | `UNKNOWN` | Reject | `UNKNOWN` | Unknown barcode. Return processing requires recognized barcode class. | Retry scan or escalate for relabeling. | No | No | High | `test_resolver_return_to_warehouse_rejects_unknown` |
| TC-061 | B2B bale sales | `RAW_BALE` | Reject | `INBOUND_BALE` | Raw bale barcode detected. B2B sale requires bale sales barcode. | Complete bale sales packing/labeling first. | No | No | High | `test_resolver_b2b_sales_rejects_raw_bale` |
| TC-062 | B2B bale sales | `DISPATCH_BALE` | Reject | `DISPATCH_BALE` | Dispatch bale barcode detected. B2B sale requires bale sales barcode. | Route to dispatch flow or generate bale sales code. | No | No | Medium | `test_resolver_b2b_sales_rejects_dispatch_bale` |
| TC-063 | B2B bale sales | `STORE_ITEM` | Reject | `STORE_ITEM` | Store item barcode is retail identity; B2B bale sales requires bale sales barcode. | Use retail/POS or convert through bale sales workflow. | Yes | Yes | High | `test_resolver_b2b_sales_rejects_store_item` |
| TC-064 | B2B bale sales | `BALE_SALES` | Accept | `BALE_SALES_UNIT` | Bale sales barcode accepted for B2B sale workflow. | Continue wholesale settlement and handover. | No | No | Critical | `test_resolver_b2b_sales_accepts_bale_sales` |
| TC-065 | B2B bale sales | `LOOSE_PICK` | Reject | `LOOSE_PICK_TASK` | Loose pick token detected. Use internal operation workflow. | Complete loose pick flow before sales. | No | No | Low | `test_resolver_b2b_sales_rejects_loose_pick` |
| TC-066 | B2B bale sales | `UNKNOWN` | Reject | `UNKNOWN` | Unknown barcode. B2B sale requires recognized bale sales barcode. | Retry with bale sales label. | No | No | High | `test_resolver_b2b_sales_rejects_unknown` |
| TC-067 | Loose pick / internal operation | `RAW_BALE` | Reject | `INBOUND_BALE` | Raw bale barcode detected. Use warehouse inbound/sorting flow. | Route to warehouse operation. | No | No | Low | `test_resolver_loose_pick_context_rejects_raw_bale` |
| TC-068 | Loose pick / internal operation | `DISPATCH_BALE` | Reject | `DISPATCH_BALE` | Dispatch bale barcode detected. Use dispatch/receiving flow. | Route to transfer workflows. | No | No | Low | `test_resolver_loose_pick_context_rejects_dispatch_bale` |
| TC-069 | Loose pick / internal operation | `STORE_ITEM` | Reject | `STORE_ITEM` | Store item barcode detected. Use store item inventory or POS flow. | Route to item lifecycle actions. | Yes | Yes | Medium | `test_resolver_loose_pick_context_rejects_store_item` |
| TC-070 | Loose pick / internal operation | `BALE_SALES` | Reject | `BALE_SALES_UNIT` | Bale sales barcode detected. Use B2B bale sales workflow. | Route to wholesale flow. | No | No | Low | `test_resolver_loose_pick_context_rejects_bale_sales` |
| TC-071 | Loose pick / internal operation | `LOOSE_PICK` | Accept | `LOOSE_PICK_TASK` | Loose pick token accepted for internal operation. | Continue loose-pick task confirmation. | No | No | Medium | `test_resolver_loose_pick_context_accepts_loose_pick` |
| TC-072 | Loose pick / internal operation | `UNKNOWN` | Reject | `UNKNOWN` | Unknown barcode. Internal operation requires recognized loose pick token. | Retry with valid loose pick barcode. | No | No | Medium | `test_resolver_loose_pick_context_rejects_unknown` |
| TC-073 | Unknown barcode scan | `RAW_BALE` | Reject | `INBOUND_BALE` | Raw bale resolved but scanned in Unknown Barcode page. Use warehouse inbound/sorting page. | Route to warehouse flow. | No | No | Medium | `test_resolver_unknown_context_routes_raw_bale` |
| TC-074 | Unknown barcode scan | `DISPATCH_BALE` | Reject | `DISPATCH_BALE` | Dispatch bale resolved. Use store receiving or dispatch confirmation page. | Route to transfer flow. | No | No | Medium | `test_resolver_unknown_context_routes_dispatch_bale` |
| TC-075 | Unknown barcode scan | `STORE_ITEM` | Reject | `STORE_ITEM` | Store item resolved. Use Store Item Editing or POS page for this barcode. | Route to item/POS flow with `identity_id`. | Yes | Yes | High | `test_resolver_unknown_context_routes_store_item` |
| TC-076 | Unknown barcode scan | `BALE_SALES` | Reject | `BALE_SALES_UNIT` | Bale sales barcode resolved. Use B2B Bale Sales page. | Route to wholesale module. | No | No | Medium | `test_resolver_unknown_context_routes_bale_sales` |
| TC-077 | Unknown barcode scan | `LOOSE_PICK` | Reject | `LOOSE_PICK_TASK` | Loose pick token resolved. Use Loose Pick/Internal Operation page. | Route to internal operation flow. | No | No | Low | `test_resolver_unknown_context_routes_loose_pick` |
| TC-078 | Unknown barcode scan | `UNKNOWN` | Reject | `UNKNOWN` | Barcode remains unknown. Validate print template source; `template_scope` alone cannot determine business identity. | Escalate for relabeling/data quality check before rescan. | No | No | Critical | `test_resolver_unknown_context_rejects_unknown` |

## Additional verification notes

- Every rejection message explicitly instructs where the operator should scan next.
- `template_scope` must never be treated as identity authority in acceptance logic.
- Any accepted `STORE_ITEM` case must require and return `identity_id`.
- POS acceptance list must contain `STORE_ITEM` only.

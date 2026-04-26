# Barcode Governance Specification

## Purpose

This document defines a single governance model for barcode usage across warehouse, store receiving, POS, printing, returns, and bale sales workflows.

This is a documentation-only specification. It does **not** change current application code, backend routes, React components, or printing templates.

---

## Core Governance Decisions

1. `template_scope` is **print-template classification only**. It is not the business identity key.
2. POS must accept **only** `STORE_ITEM` barcodes.
3. POS must reject `RAW_BALE`, `DISPATCH_BALE`, `BALE_SALES`, `LOOSE_PICK`, and test/template-only barcodes.
4. Warehouse sorting must not accept store item (`STORE_ITEM`) barcodes.
5. Store receiving must accept dispatch/store-delivery bale barcodes, not raw inbound bale barcodes.
6. Store item lifecycle traceability uses `identity_id` as the long-term anchor.
7. `barcode_value` must not remain globally ambiguous; future scan resolution must return a typed result.

---

## Barcode Type Governance Matrix

| barcode_type | Business object represented | Generated at | Template family (`template_scope`) | Allowed scan contexts (role/page/device) | Rejected scan contexts (role/page/device) | POS entry | Binds to `identity_id` | Legacy field mapping (primary compatibility notes) | Operational rejection meaning |
|---|---|---|---|---|---|---|---|---|---|
| `RAW_BALE` | Inbound supplier bale/carton prior to store-delivery dispatch identity | Inbound receiving flow (warehouse) | Inbound/raw-bale label templates | Warehouse inbound receiving, warehouse intake QA, supplier intake reconciliation | POS checkout, store item sale scan, store receiving for dispatched stock | **No** | **No** (bale-level operational identity only) | Often appears in legacy `barcode` / `barcode_value`; may overlap with `dispatch_bale_no` text patterns in old data and must be typed by resolver | “This is an inbound raw bale code; use warehouse intake flow, not this page.” |
| `DISPATCH_BALE` | Warehouse dispatch bale prepared for transfer/store receiving | Warehouse dispatch/transfer preparation | Dispatch/store-delivery bale templates | Store receiving transfer scan, warehouse dispatch confirmation, transfer reconciliation | POS checkout, raw inbound receiving as new supplier stock, loose item sales scan | **No** | **No** (shipment/transfer container identity) | Commonly linked to legacy `dispatch_bale_no`, and sometimes persisted in `barcode_value` without type | “This is a dispatch bale code; use transfer/store-receiving flow only.” |
| `STORE_ITEM` | Sellable single inventory item in store lifecycle | Item identity assignment/labeling flow | Store item price/identity templates | Store inventory operations, store floor cycle count, POS checkout, after-sales verification | Warehouse raw-bale sorting intake, bale-level dispatch receiving as bale identity, template test scan | **Yes (only type accepted by POS)** | **Yes** (authoritative anchor for lifecycle traceability) | Legacy values may appear in `barcode`, `barcode_value`, `identity_no`, or `scan_token`; migration should prioritize mapping to canonical `identity_id` | “Valid store item identity required; other barcode classes are not saleable item IDs.” |
| `BALE_SALES` | Bale-level B2B/wholesale sale unit identity | Bale sales packing / wholesale processing | Bale-sales templates | B2B bale sales packing, bale handover verification, wholesale settlement checks | Retail POS checkout, normal store receiving, raw inbound receiving | **No** | **Generally no** (sale unit identity is bale contract unit; item identity remains separate) | Often tied to legacy `token_no` or dedicated bale sale references; may also be placed in generic `barcode_value` | “This is a bale-sales code for wholesale handling, not retail item checkout.” |
| `LOOSE_PICK` | Temporary pick token for loose-piece operational handling | Loose pick/fulfillment task generation | Internal operation/picking templates | Internal picking, exception handling, short-term task confirmation | POS checkout, final inventory identity scans, inbound bale receiving, store transfer receiving as bale identity | **No** | **No** (temporary operational token, not identity anchor) | Frequently represented by legacy `scan_token` or `token_no`; must not be treated as permanent item identity | “This is a temporary loose-pick token; complete via picking workflow, not sales/identity scan.” |

---

## `template_scope` vs Business Identity

`template_scope` determines which print template family produced a label (for example, inbound bale label vs store item label). It answers: “Which template class rendered this barcode?”

It does **not** answer: “What business object identity is this?”

Business identity is determined by typed barcode class and canonical IDs (especially `identity_id` for store items). Therefore:

- Template scope cannot be used as a substitute for domain identity.
- Matching visual template style does not imply POS eligibility.
- Resolver output must return typed meaning, not only template metadata.

---

## Scan Permission and Rejection Rules (Normative)

### POS

- Accept only `STORE_ITEM`.
- Reject `RAW_BALE`, `DISPATCH_BALE`, `BALE_SALES`, `LOOSE_PICK`, and test/template-only values.
- Rejection must communicate operational action (where to scan instead), not only “invalid barcode”.

### Warehouse Sorting / Intake

- Accept inbound operational classes such as `RAW_BALE` where applicable.
- Reject `STORE_ITEM` as an intake/sorting anchor.
- Rejection should direct user to store inventory or POS flow when a store item label is scanned.

### Store Receiving

- Accept `DISPATCH_BALE` (and equivalent store-delivery bale identity).
- Reject `RAW_BALE` for normal transfer receiving, because raw inbound stock belongs to warehouse inbound flow.

### Bale Sales / B2B Handling

- Accept `BALE_SALES` in wholesale handling contexts.
- Reject barcode classes intended for retail checkout or inbound-only processes.

---

## Future Resolver Output Shape (Documentation Contract)

To remove ambiguity in `barcode_value`, future scan resolution should return a typed object instead of raw text-only matching.

```json
{
  "barcode_value": "string",
  "barcode_type": "RAW_BALE | DISPATCH_BALE | STORE_ITEM | BALE_SALES | LOOSE_PICK | UNKNOWN",
  "business_object": {
    "kind": "INBOUND_BALE | DISPATCH_BALE | STORE_ITEM | BALE_SALES_UNIT | LOOSE_PICK_TASK | UNKNOWN",
    "id": "string"
  },
  "identity": {
    "identity_id": "string|null",
    "identity_no": "string|null"
  },
  "template": {
    "template_scope": "string|null",
    "template_family": "string|null"
  },
  "permissions": {
    "pos_allowed": true,
    "allowed_contexts": ["string"],
    "rejected_contexts": ["string"]
  },
  "legacy_links": {
    "barcode": "string|null",
    "barcode_value": "string|null",
    "token_no": "string|null",
    "identity_no": "string|null",
    "scan_token": "string|null",
    "dispatch_bale_no": "string|null"
  },
  "rejection": {
    "code": "string|null",
    "message": "string|null",
    "operational_next_step": "string|null"
  }
}
```

Notes:

- `barcode_type` is authoritative for acceptance logic.
- `template_scope` remains descriptive (print classification), not identity authority.
- `identity_id` is required for long-term store item traceability.

---

## Legacy Compatibility Risks and Migration Notes

1. **Global ambiguity risk in `barcode_value`**  
   Historical rows may contain different barcode classes in the same text field. Migration should first infer/assign `barcode_type` before enforcing scan rules.

2. **Mixed token semantics (`token_no`, `scan_token`)**  
   Legacy tokens may represent temporary operations (for example `LOOSE_PICK`) but were sometimes treated like permanent IDs. Migration must preserve history while preventing identity misuse.

3. **Dispatch number overlap (`dispatch_bale_no`)**  
   Dispatch references may look barcode-like but belong to transfer container identity, not item identity or POS domain.

4. **Store item identity drift (`identity_no` without stable ID binding)**  
   Existing records may rely on human-readable numbers. Migration should backfill and prioritize canonical `identity_id` for durable traceability.

5. **Template-driven assumptions**  
   Teams may have inferred barcode meaning from label appearance/template scope. Migration training and UI messaging should reinforce typed resolver outcomes.

6. **Operational rejection copy quality**  
   Generic “invalid barcode” errors hide process intent. Future implementation should map each rejection to explicit next action by workflow.

---

## Documentation-Only Verification Checklist

- File exists at `docs/project-brain/barcode-governance.md`.
- Matrix includes all five barcode types: `RAW_BALE`, `DISPATCH_BALE`, `STORE_ITEM`, `BALE_SALES`, `LOOSE_PICK`.
- POS acceptance/rejection policy is explicit.
- `template_scope` meaning is explicitly separated from business identity.
- Future typed resolver output shape is defined.
- Legacy compatibility risks and migration notes are included.

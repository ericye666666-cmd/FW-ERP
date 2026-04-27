# FW-ERP Role Permission Matrix

This document is the fixed business reference for future backend permission enforcement in FW-ERP.

## Roles

- Boss / owner
- Finance
- Warehouse manager
- Warehouse operator
- Sorter
- Store manager
- Store assistant
- Cashier
- Area manager
- System admin

## Enforcement flags used in matrix

- **Approval required**: whether a second-level authorization is mandatory before action completion.
- **Audit log required**: whether immutable event logging is mandatory.
- **Backend hard enforcement required**: whether backend must reject non-compliant requests regardless of frontend behavior.
- **Risk level**: `Low`, `Medium`, `High`, `Critical`.

## Permission matrix

| # | Action | Allowed roles | Forbidden roles | Approval required | Audit log required | Backend hard enforcement required | Risk level | Suggested backend test |
|---|---|---|---|---|---|---|---|---|
| 1 | China source input | Boss / owner, Finance, Warehouse manager, Warehouse operator, System admin | Sorter, Store manager, Store assistant, Cashier, Area manager | No | Yes | Yes | High | `POST /china-source` returns 403 for non-allowed roles; allowed roles persist and audit event recorded. |
| 2 | Cost fill | Finance, Warehouse manager, Boss / owner | Warehouse operator, Sorter, Store manager, Store assistant, Cashier, Area manager | No | Yes | Yes | Critical | Cost field update endpoint accepts only allowed roles; store-side and cashier tokens always 403. |
| 3 | Shipment / customs master | Finance, Warehouse manager, Warehouse operator, Boss / owner, System admin | Sorter, Store manager, Store assistant, Cashier, Area manager | No | Yes | Yes | High | Shipment master create/update blocked for store/cashier/sorter roles; audit entries include actor and diff. |
| 4 | Parcel inbound | Warehouse manager, Warehouse operator, Boss / owner, System admin | Finance, Sorter, Store manager, Store assistant, Cashier, Area manager | No | Yes | Yes | High | Inbound registration only accepts warehouse/admin/boss; finance/store roles denied. |
| 5 | Total confirmation | Warehouse manager, Finance, Boss / owner | Warehouse operator, Sorter, Store manager, Store assistant, Cashier, Area manager | Yes (manager or finance) | Yes | Yes | Critical | Confirmation requires eligible approver claim; non-approver token denied even if initiator is allowed for upstream steps. |
| 6 | Barcode generation / print | Warehouse manager, Warehouse operator, Store manager, Store assistant, Boss / owner, System admin | Finance, Sorter, Cashier, Area manager | No | Yes | Yes | Medium | Barcode generation endpoint validates role; printing actions create audit event with identity type and count. |
| 7 | Raw bale routing | Warehouse manager, Warehouse operator, Boss / owner, System admin | Finance, Sorter, Store manager, Store assistant, Cashier, Area manager | No | Yes | Yes | High | Raw bale route update rejects store/cashier/sorter roles; accepted requests must reference raw inbound bale IDs only. |
| 8 | Sorting task creation | Warehouse manager, Warehouse operator, Boss / owner, System admin | Finance, Store manager, Store assistant, Cashier, Area manager | No | Yes | Yes | High | Sorting task create rejects payload containing `STORE_ITEM` input type and rejects non-warehouse roles. |
| 9 | Sorting confirmation / cost lock | Warehouse manager, Finance, Boss / owner | Warehouse operator, Sorter, Store manager, Store assistant, Cashier, Area manager | Yes (warehouse manager or finance; boss override allowed) | Yes | Yes | Critical | Cost lock endpoint only callable from sorting-confirmation flow; fails outside flow; role checks and audit required. |
| 10 | Sorted stock rack update | Warehouse manager, Warehouse operator, Sorter, Boss / owner, System admin | Finance, Store manager, Store assistant, Cashier, Area manager | No | Yes | Yes | Medium | Rack update requires sorted-stock identity; store/cashier roles receive 403. |
| 11 | Compression task creation / completion | Warehouse manager, Warehouse operator, Boss / owner, System admin | Finance, Sorter, Store manager, Store assistant, Cashier, Area manager | No | Yes | Yes | High | Compression create/complete allowed for warehouse roles only; completion writes immutable lifecycle audit. |
| 12 | Store dispatch | Warehouse manager, Warehouse operator, Boss / owner, System admin | Finance, Sorter, Store manager, Store assistant, Cashier, Area manager | Yes (warehouse manager approval) | Yes | Yes | Critical | Dispatch must generate dispatch/store-delivery bale identity; reject raw inbound bale ID as delivery identity. |
| 13 | Store receiving | Store manager, Store assistant, Boss / owner, System admin | Finance, Warehouse manager, Warehouse operator, Sorter, Cashier, Area manager | Yes (store manager approval) | Yes | Yes | Critical | Receiving endpoint only accepts dispatch/store-delivery bale identity and rejects raw inbound bale identity. |
| 14 | Store item price edit | Store manager, Boss / owner, Finance, System admin | Warehouse manager, Warehouse operator, Sorter, Store assistant, Cashier, Area manager | Yes (store manager + finance/boss for high-value threshold) | Yes | Yes | Critical | Price edit succeeds for allowed roles and never mutates cost fields; cashier/store assistant always denied. |
| 15 | Store item rack edit | Store manager, Store assistant, Boss / owner, System admin | Finance, Warehouse manager, Warehouse operator, Sorter, Cashier, Area manager | No | Yes | Yes | Medium | Rack-location update for `STORE_ITEM` only; warehouse entities cannot be patched via store rack endpoint. |
| 16 | Store item print | Store manager, Store assistant, Cashier, Boss / owner, System admin | Finance, Warehouse manager, Warehouse operator, Sorter, Area manager | No | Yes | Yes | Low | Label print allowed at store roles; audit captures item IDs and quantity printed. |
| 17 | POS sale | Cashier, Store manager, Boss / owner, System admin | Finance, Warehouse manager, Warehouse operator, Sorter, Store assistant, Area manager | No | Yes | Yes | Critical | POS sale endpoint rejects any line not typed as `STORE_ITEM`; non-POS roles denied. |
| 18 | Sale void | Store manager, Boss / owner | Finance, Warehouse manager, Warehouse operator, Sorter, Store assistant, Cashier, Area manager | Yes (store manager or boss with reason code) | Yes | Yes | Critical | Void endpoint separate from refund endpoint; cashier token denied; mandatory reason and receipt reference enforced. |
| 19 | Refund | Cashier, Store manager, Boss / owner | Finance, Warehouse manager, Warehouse operator, Sorter, Store assistant, Area manager | Yes (manager approval above threshold) | Yes | Yes | Critical | Refund endpoint is distinct from void; verifies original sale exists and enforces approval threshold rules. |
| 20 | Return-to-warehouse | Store manager, Area manager (request only), Warehouse manager, Boss / owner, System admin | Finance, Warehouse operator, Sorter, Store assistant, Cashier | Yes (warehouse manager acceptance; area manager cannot self-approve) | Yes | Yes | High | Area manager can create request but cannot finalize; acceptance requires warehouse manager/boss and logs both actors. |
| 21 | B2B bale sales | Boss / owner, Finance, Warehouse manager, System admin | Warehouse operator, Sorter, Store manager, Store assistant, Cashier, Area manager | Yes (finance or boss) | Yes | Yes | Critical | B2B sale endpoints separate namespace from POS; POS roles cannot access B2B routes; inventory type must be bale-level. |
| 22 | Boss dashboard | Boss / owner, Finance, Area manager (read-only subset), System admin | Warehouse manager, Warehouse operator, Sorter, Store manager, Store assistant, Cashier | No | Yes | Yes | High | Read scope test: area manager cannot access cost override widgets/actions, only monitoring views. |
| 23 | User / role management | System admin, Boss / owner | Finance, Warehouse manager, Warehouse operator, Sorter, Store manager, Store assistant, Cashier, Area manager | Yes (boss confirmation for role elevation to privileged roles) | Yes | Yes | Critical | Role-change endpoint restricted to admin/boss; elevation to privileged roles requires dual control and audit trail. |

## Hard business rules (normative)

1. **Store staff cannot change cost.**
   - Store manager and store assistant can edit store-facing price/rack/print only, never cost.
2. **Cashier cannot change item cost.**
   - Cashier scope is POS sale, refund (policy-bound), and print where allowed.
3. **POS can only sell `STORE_ITEM`.**
   - Any non-`STORE_ITEM` line in POS payload must be rejected by backend.
4. **Warehouse sorting cannot use `STORE_ITEM` as sorting input.**
   - Sorting input must be warehouse identities (raw bale / sorted stock), never store-sellable identity.
5. **Store receiving must use dispatch/store-delivery bale identity, not raw inbound bale identity.**
6. **Cost lock can only happen in warehouse sorting confirmation.**
   - No other workflow stage may lock cost.
7. **Any cost unlock must require boss / finance approval and audit log.**
   - Cost unlock is exceptional and must be fully traceable.
8. **Sale void and refund are controlled separately.**
   - Separate permissions, routes, and audit semantics.
9. **B2B bale sales is separate from store POS.**
   - Different inventory scope, roles, and endpoint namespace.
10. **Area manager can monitor and request actions, but cannot directly override warehouse cost.**

## Cross-cutting backend test checklist

- Role matrix regression tests for all 23 actions (allow + deny cases).
- Identity-type validation tests for raw bale vs dispatch/store-delivery bale vs `STORE_ITEM`.
- Cost-lock invariant tests (only sorting confirmation can lock).
- Cost-unlock exceptional flow tests (boss/finance approval + mandatory audit).
- Separation tests for POS sale vs sale void vs refund vs B2B sales.
- Area manager limitation tests (request/monitor allowed, override denied).


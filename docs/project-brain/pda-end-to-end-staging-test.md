# PDA End-to-End Staging Test

This runbook is for the staging PDA loop from warehouse delivery to Utawala store receiving and clerk assignment.

## Business Path

1. Create shipment / 船单.
2. Add cost / 录成本.
3. Inbound / 入库.
4. Sorting / 分拣.
5. Create SDB.
6. Create LPK if shortage.
7. Build SDO from SDB + LPK.
8. Generate SDP / SDO_PACKAGE.
9. Warehouse dispatch.
10. Login `store_manager_1 / demo1234` on PDA.
11. Open 收退货.
12. Scan SDO.
13. Receive SDP package.
14. Assign SDP to active Utawala clerk.
15. Login assigned clerk.
16. Confirm assigned SDP appears, or record the current gap if the clerk PDA page is still demo-only.

## Barcode Boundaries

- Store manager official receiving scan target is SDO / STORE_DELIVERY_EXECUTION only.
- SDP / SDO_PACKAGE is package detail under SDO.
- SDB / LPK remain warehouse source references only; they are displayed as source_code/source only.
- POS remains STORE_ITEM only. Do not use POS to scan SDO, SDP, SDB, LPK, or RAW_BALE.

## Current Clerk PDA Gap

当前店员端为演示流程；真实 assigned SDP 接入在后续 PR。

Backend assignment should still be tested from the manager PDA. After assignment, use the backend assigned SDP endpoint or future clerk PDA integration to verify the package is available to the selected active Utawala clerk.

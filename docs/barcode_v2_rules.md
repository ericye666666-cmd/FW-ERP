# FW-ERP STORE_ITEM Barcode v2 Rules

This document locks the first-phase STORE_ITEM Barcode v2 contract for backend
issuance, resolver behavior, POS guardrails, and legacy compatibility.

## STORE_ITEM Format

STORE_ITEM is the only POS sale barcode. New STORE_ITEM machine codes use:

```text
5 + YYDDD + NNNNNN + EAN-13 check digit
```

- Length: 13 numeric digits
- Type digit: `5`
- Date fragment: `YYDDD`, year plus day of year
- Daily global sequence: `000001` to `999999`
- Final digit: EAN-13 check digit calculated from the first 12 digits

Example for 2026-05-04, day 124:

- STORE_ITEM body: `526124000001`
- EAN-13 check digit: `3`
- STORE_ITEM barcode: `5261240000013`

## Issuance

- All new STORE_ITEM machine codes must be issued by the backend.
- Frontend, PDA, and Print Agent must not construct STORE_ITEM `machine_code`
  values.
- Before issuing a new STORE_ITEM code, the backend must check existing
  `machine_code`, `barcode_value`, `scan_token`, and `human_readable` values.
- If a generated candidate already exists, skip that sequence and allocate the
  next one.
- If the daily sequence exceeds `999999`, return an error instead of wrapping.

## Resolver And Compatibility

- Resolver must first match actual stored records. It must not rely only on
  regex inference.
- Existing 10-digit STORE_ITEM records are legacy-compatible and remain
  resolvable when they exist in state.
- New STORE_ITEM codes must use the 13-digit v2 format.
- For POS, a 13-digit STORE_ITEM must pass EAN-13 check digit validation and
  exist in the system.

## POS Guardrails

- POS accepts only STORE_ITEM.
- POS rejects RAW_BALE, SDB, LPK, SDO, reserved 6-prefixed codes, unknown
  STORE_ITEM codes, and 13-digit STORE_ITEM codes with invalid check digits.

## First-Phase Scope

This phase adds the STORE_ITEM v2 rule documentation, EAN-13 helper,
STORE_ITEM v2 backend generation, resolver/POS checksum validation, frontend
POS guardrails, and legacy STORE_ITEM compatibility.

It does not implement delivery-package models, PDA code pools, store receiving
package UI, STORE_ITEM token inheritance, or Print Agent/TSPL changes.

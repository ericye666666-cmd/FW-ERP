# UI Copy Dictionary

This note defines the first FW-ERP frontend dictionary boundary. It is a UI-copy foundation only and must not change business logic, barcode rules, stock counting, Android behavior, or printing behavior.

## Rules

- Backend keys are not UI display text. Values such as `stock_in_confirmed`, `entity_type`, and `layout_json` are data contracts for code and storage, not labels for warehouse, store, or cashier employees.
- UI copy should use stable dictionary keys going forward. Keys should be grouped by business domain, such as `inventory.stockIn.pending`, `store.delivery.order`, or `pos.shift.open`, rather than by page number or screen layout.
- Employee-facing screens should show business wording from the dictionary, not raw backend fields, technical object names, JSON field names, or layout configuration keys.
- This PR seeds only first-stage high-frequency terms. It does not enable full language switching and does not replace existing UI text broadly.

## Current Files

- `src/i18n/terminology.ts` owns stable business-domain keys.
- `src/i18n/dictionaries/en-KE.ts` owns Kenyan English display copy.
- `src/i18n/dictionaries/zh-CN.ts` owns Simplified Chinese display copy.
- `src/i18n/index.ts` exports `t(key)` plus typed dictionary access for future UI work.

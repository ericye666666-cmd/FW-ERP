# UI Copy Dictionary

This note defines the first FW-ERP frontend dictionary boundary. It is a UI-copy foundation only and must not change business logic, barcode rules, stock counting, Android behavior, or printing behavior.

## Rules

- Backend keys are not UI display text. Values such as `stock_in_confirmed`, `entity_type`, and `layout_json` are data contracts for code and storage, not labels for warehouse, store, or cashier employees.
- UI copy should use stable dictionary keys going forward. Keys should be grouped by business domain, such as `inventory.stockIn.pending`, `store.delivery.order`, or `pos.shift.open`, rather than by page number or screen layout.
- Employee-facing screens should show business wording from the dictionary, not raw backend fields, technical object names, JSON field names, or layout configuration keys.
- Employee-facing English should prefer short en-KE action copy, especially on POS, PDA, scan, print, shift, and stock-in flows.
- This PR seeds only first-stage high-frequency terms. It does not enable full language switching and does not replace existing UI text broadly.

## Current Files

- `src/i18n/terminology.ts` owns stable business-domain keys.
- `src/i18n/dictionaries/en-KE.ts` owns Kenyan English display copy.
- `src/i18n/dictionaries/zh-CN.ts` owns Simplified Chinese display copy.
- `src/i18n/error-codes.ts` owns frontend copy for high-risk API `error_code` values.
- `src/i18n/index.ts` exports `t(key)` plus typed dictionary access for future UI work.

## Language Foundation

- `src/i18n/index.ts` exposes a lightweight internal language config: supported locales, default locale, fallback locales, active locale getter, and active locale setter.
- The default dictionary locale remains `en-KE`; existing prototype pages that currently run in Chinese are not migrated by this note.
- `t(key, locale)` is safe for gradual migration. If an `en-KE` value is missing it falls back to `zh-CN`, if a `zh-CN` value is missing it falls back to `en-KE`, and if neither locale has the key it returns the key name.
- Future PRs can migrate copy gradually by calling `t("business.domain.key", locale)` or by using a thin page-local copy helper that delegates to dictionary keys.
- Do not add a full visible language toggle as part of dictionary migration unless the target surface is explicitly low risk, such as an admin or test-only area.

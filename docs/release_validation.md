# FW-ERP Release Validation

This document defines the preflight checks to run before uploading the current build to a live testing environment.

## Command

Run from the repository root:

```bash
npm run validate:release
```

The command stops at the first failure. Do not deploy until the failure is understood.

## What The Script Covers

Barcode identity:

- RAW_BALE = 1
- SDB = 2
- LPK = 3
- SDO = 4
- STORE_ITEM = 5
- `display_code` is human-readable text.
- `machine_code` is the scanner value.
- `barcode_value = machine_code` for printed labels.

STORE_ITEM token and POS flow:

- Warehouse Page 6 SDB/LPK to SDO targeted checks are included.
- STORE_ITEM labels use 5-prefixed machine codes.
- POS only accepts STORE_ITEM.
- POS sale records keep the STORE_ITEM source chain.
- Sales analytics tests keep the sale record path visible.

Printing:

- RAW_BALE, SDB, LPK, SDO, and STORE_ITEM print payloads preserve display codes while encoding machine codes.
- RAW_BALE cannot print `RB...` or a short value such as `260427` as the barcode.
- Old RAW_BALE print jobs are hydrated from source records only when a formal 1-prefixed machine code exists.
- RAW_BALE machine_code repair/backfill tests cover dry-run reporting, apply mode, source-record repair, old print-job payload repair, uniqueness, and ambiguous-source skips.
- Windows Print Agent checks cover `/health`, `/printers`, and `/print/label`.
- TSPL raw printing is the formal Windows Deli path.

Frontend and auth:

- Cashier logout, password clearing, and test-environment login rules are included.
- User role binding targeted tests are included.
- `frontend_prototype/app.js` must parse cleanly.
- `npm run build` must pass.

## Windows Print Agent Deployment Check

Before field testing Windows one-click print:

1. Download the latest GitHub Actions artifact for `fw-erp-print-agent-windows.zip`.
2. Upload it to:

   ```text
   /var/www/html/downloads/fw-erp-print-agent-windows.zip
   ```

3. Confirm the ERP download button resolves:

   ```text
   /downloads/fw-erp-print-agent-windows.zip
   ```

4. On the Windows print station, start the agent and check:

   ```text
   http://127.0.0.1:8719/health
   http://127.0.0.1:8719/printers
   ```

5. Confirm Deli DL-720C appears in `/printers`.
6. In ERP, click `检测打印助手`, then `检测本机打印机`.
7. Click `打印标签`. The formal path should call `/print/label` and should not open Edge or Chrome.

## Server Deployment Check

After PR merge:

```bash
cd ~/FW-ERP
git checkout main
git pull origin main
npm run validate:release
sudo systemctl restart nginx
```

If the backend is running as a service, restart that service according to the staging server runbook.

## Data And Secret Guard

This validation PR must not include:

- `DATABASE_URL`
- secrets
- `.env`
- `ops/env/local.env`
- runtime data
- `backend/data`
- node_modules
- `dist`
- `.venv`
- zip files
- backup/cache/generated files

Cloud SQL staging exists, but this validation does not cut business flow over to Cloud SQL. Local runtime JSON fallback remains separate from production business data.

## Known Limitation

This is not a full historical backend pytest gate. It intentionally runs the targeted release-critical suites for barcode, print, RAW_BALE hydration, auth, token/POS, and build validation. If full backend pytest has unrelated historical failures, track those separately and do not hide them in this release gate.

## Historical Tests Not In The Blocking Gate

The following frontend tests are not used as blocking checks in `npm run validate:release` because their current assertions are stale page-structure or older workflow-contract checks. They should be renewed separately instead of silently treated as passed:

- `frontend_prototype/tests/auth-route-guard-flow.test.cjs`
- `frontend_prototype/tests/priority-mainline-page-structure.test.cjs`
- `frontend_prototype/tests/test-data-tools-flow.test.cjs`

This exclusion is narrow: the release gate still checks current cashier logout/password behavior, user role binding, barcode routing, print payloads, Windows Print Agent helper UI, warehouse SDB/LPK to SDO handoff checks, STORE_ITEM POS sales, backend barcode contracts, RAW_BALE print job hydration, RAW_BALE machine_code repair/backfill, and `npm run build`.

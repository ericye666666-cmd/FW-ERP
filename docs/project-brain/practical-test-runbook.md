# FW-ERP Practical Test Runbook (Non-Developer)

Audience: business testers who need to run the first real local test with backend-served `/app`.

## 1) Environment purpose

Use this runbook for **local business validation** where the frontend prototype is served by the local backend.

- Purpose: verify real workflow behavior against local API + runtime state.
- Entry point: `http://127.0.0.1:8000/app/`
- Not this environment: GitHub Pages preview (UI preview only, not the business-valid runtime).

## 2) Start backend locally

From the repository root, start the backend:

```bash
cd backend
uvicorn app.main:app --reload
```

If startup succeeds, keep this terminal running and check:

- API base is reachable at `http://127.0.0.1:8000/api/v1`
- App entry is reachable at `http://127.0.0.1:8000/app/`

## 3) Open backend-served `/app`

1. Open your browser.
2. Go to `http://127.0.0.1:8000/app/`.
3. Confirm you see a login screen (or authenticated home if you already have a valid session).

## 4) Demo login credentials (if using demo accounts)

Use one of the default demo usernames:

- `admin_1`
- `warehouse_clerk_1`
- `warehouse_supervisor_1`
- `store_manager_1`
- `cashier_1`
- `area_supervisor_1`

Default demo password:

- `demo1234`

If demo accounts are disabled in your local branch, ask the maintainer for a valid test account before continuing.

## 5) Confirm FW-ERP Test Home is visible

After login, confirm all items below before you start testing:

- You are no longer on the login page.
- The app home/dashboard is visible (FW-ERP Test Home).
- A signed-in user identity/role is visible in the UI.

If any item is missing, do **not** continue to business steps; report as blocked.

## 6) Start the golden path checklist

Use this checklist document:

- `docs/project-brain/golden-path-manual-test-checklist.md`

How to begin:

1. Start from Step 1 (`/app` login).
2. Execute steps in order.
3. For each row, mark `PASS`, `FAIL`, or `BLOCKED`.
4. In Notes, record evidence for that specific step.

## 7) Evidence to capture during the test

Capture evidence for every executed step:

- Screenshots (full page preferred) that show the step result.
- Business IDs (task/order/shipment/transfer/return IDs).
- Barcode samples used/scanned (or printed barcode IDs).
- Exact timestamp and role/account used.
- Error text or mismatch details when a step fails.

Recommended naming pattern:

- `step-<number>-<result>-<short-note>.png`
- Example: `step-11-fail-cost-lock-editable.png`

## 8) What to do when a step fails

When a step is `FAIL` or `BLOCKED`:

1. Stop moving to later dependent steps.
2. Re-check the exact role and input for the failing step.
3. Retry once only (to rule out accidental input mistakes).
4. If still failing, collect evidence and file a bug.
5. Link the bug ID in the checklist Notes column.

## 9) What not to test yet

Do **not** treat these as part of this practical first run:

- GitHub Pages behavior as equivalent to backend-served `/app` behavior.
- Any production deployment assumptions.
- New business requirements or workflow redesign.
- Backend route/schema changes or code behavior changes.
- Unapproved cross-flow expansions outside the golden path checklist.

## 10) Report bugs using the GitHub bug template

Create bugs with:

- `.github/ISSUE_TEMPLATE/bug-report.md`

When filing:

1. Title with clear symptom and module (for example: `fix: step 11 cost lock still editable after confirmation`).
2. Fill all template sections:
   - What happened
   - What did you expect
   - Steps to reproduce
   - Environment (Device/OS, Browser, Branch/URL)
   - Impact
   - Evidence
3. Attach screenshots and IDs from the failed checklist step.
4. Add the bug link back into `golden-path-manual-test-checklist.md` Notes for traceability.

---

## Quick verification checklist (non-developer)

- [ ] Backend started locally with `uvicorn app.main:app --reload`
- [ ] `/app/` opens from local backend
- [ ] Login works with demo account (or approved test account)
- [ ] FW-ERP Test Home/dashboard is visible
- [ ] Golden path checklist is being executed step-by-step with evidence
- [ ] Any failed step is filed via GitHub bug template and linked in notes

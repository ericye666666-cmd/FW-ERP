# FW-ERP Windows Print-Station Agent (Issue #64 MVP)

This folder now supports the **production print path** for FW-ERP operations:

```text
Android PDA / staff browser
→ FW-ERP cloud backend queues print job
→ Windows print-station agent polls cloud queue
→ Windows print computer prints locally to Deli label printer
→ Agent marks job complete or failed
```

> Deployment model: **one Windows print-station computer per warehouse/store**.

Android PDAs do **not** install printer drivers and do **not** print directly. PDA screens only queue print jobs to FW-ERP cloud.

---

## Files

- `agent.py` — main agent program.
  - `local-api` mode: old localhost bridge (`/health`, `/printers`, `/print/html`).
  - `print-station` mode: Windows poll/claim/print/complete/fail worker for cloud queue.
- `print_station_config.example.json` — sample print-station config.
- `start_windows.ps1` — recommended Windows startup script for print-station mode.
- `start_mac.sh` — legacy local API startup for macOS/Linux testing.
- `requirements.txt` — dependency list (still standard-library runtime).

---

## Print-station config

Create `print_station_config.json` (copy from example):

```json
{
  "api_base_url": "https://fw-erp-34-35-52-250.nip.io/api/v1",
  "station_id": "kikuyu-print-station-1",
  "printer_name": "Deli DL-720C",
  "poll_interval_seconds": 5
}
```

Fields:

- `api_base_url`: FW-ERP cloud API base (must include `/api/v1`).
- `station_id`: unique ID for this Windows print-station computer.
- `printer_name`: Windows printer queue name.
- `poll_interval_seconds`: queue polling interval.

---

## Required cloud endpoints used by the agent

1. Poll pending jobs:
   - `GET /print-jobs/pending?station_id=<station_id>`
2. Claim a job:
   - `POST /print-jobs/{job_id}/claim`
3. On print success:
   - `POST /print-jobs/{job_id}/complete`
4. On print failure:
   - `POST /print-jobs/{job_id}/fail` with error message.

---

## Windows setup (non-developer steps)

1. **Install Python on Windows**
   - Install Python 3.10+ from python.org.
   - During install, enable "Add Python to PATH".

2. **Install Deli DL-720C Windows driver**
   - Install the official driver on the print-station computer.

3. **Confirm Windows can print a test page**
   - In Windows Printer settings, print a test page to the Deli printer.
   - Do this before running FW-ERP print-station agent.

4. **Configure print-station file**
   - In `ops\local_print_agent`, copy `print_station_config.example.json` to `print_station_config.json`.
   - Set `api_base_url`, `station_id`, and exact `printer_name`.

5. **Start print-station agent**

```powershell
cd ops\local_print_agent
powershell -ExecutionPolicy Bypass -File .\start_windows.ps1
```

6. **Verify polling**
   - Console should log repeated polling messages.
   - When there are no jobs: `polling ok: no pending jobs`.
   - When a job arrives: claimed → printed → completed.

7. **Stop / restart**
   - Press `Ctrl + C` in the PowerShell window to stop.
   - Re-run `start_windows.ps1` to restart.

---

## Windows printing behavior in this MVP

- The agent renders a text-based Bale label from job payload fields and prints via PowerShell `Out-Printer` to configured queue.
- This is intentionally Windows-first and practical for operator rollout.
- **Limitation:** advanced layout/barcode-perfect rendering for all label templates is not finalized in this pass. If driver formatting is not acceptable, the agent still performs explicit claim/fail/complete flow and reports actionable error messages.

---

## Legacy local API mode (optional)

Legacy mode is kept for local dev/testing only:

```bash
python agent.py local-api
```

It serves localhost endpoints (`/health`, `/printers`, `/print/html`) and is **not** the recommended production model for warehouse/store operations.

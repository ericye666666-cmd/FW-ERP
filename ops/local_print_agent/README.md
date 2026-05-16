# FW-ERP Warehouse Print Station

This folder contains the Windows local print bridge used by the fixed warehouse print computer.

The production field path is intentionally small:

1. Install Python 3 on the warehouse Windows computer once.
2. During Python install, check **Add Python to PATH**.
3. Double-click `start_warehouse_print_agent.cmd`.
4. Keep the black window open while printing.
5. In ERP, click **检测打印助手**.
6. Click **检测打印机队列** and confirm `Deli DL-720C` is visible.
7. Print RAW_BALE / 60x40 labels from ERP.

Do not use the PowerShell launcher as the main warehouse startup path. The warehouse operator path is the English ASCII CMD file above.

## Files

- `agent.py` - localhost HTTP print bridge and print-station worker.
- `start_warehouse_print_agent.cmd` - fixed warehouse computer launcher.
- `requirements.txt` - Python dependencies. The current agent uses the standard library only.
- `print_station_config.example.json` - legacy cloud polling config example.
- Existing `.ps1`, `.bat`, and packaging scripts are retained for older build/admin flows, but they are not the fixed warehouse startup chain.

## What the CMD launcher does

`start_warehouse_print_agent.cmd`:

- runs in plain CMD, not PowerShell;
- uses `curl.exe` to download/update `agent.py` and `requirements.txt` from GitHub main;
- installs them under `%LOCALAPPDATA%\FW-ERP\PrintAgent`;
- detects `py -3` first, then `python`;
- if Python is missing, only prints:

```text
Install Python 3 and check Add Python to PATH, then run this file again.
```

- creates or reuses `%LOCALAPPDATA%\FW-ERP\PrintAgent\.venv`;
- installs `requirements.txt` into the virtual environment;
- starts:

```text
.venv\Scripts\python.exe agent.py local-api
```

- leaves the window open and shows:

```text
Keep this window open while printing.
```

## Local API

The local API only listens on loopback:

```text
http://127.0.0.1:8719
```

It does not listen on LAN interfaces.

Supported endpoints remain unchanged:

- `GET /health`
- `GET /printers`
- `POST /print/html`
- `POST /print/label`

`/print/label` is the formal Deli DL-720C RAW TSPL path for 60x40 labels. RAW_BALE barcode and label rules are not changed by the warehouse launcher.

## Browser CORS / Private Network Access

The local agent is loopback-permissive for browser calls from ERP.

For `OPTIONS`, `GET`, and `POST`, the agent returns:

```text
Access-Control-Allow-Origin: <request Origin, or * when no Origin is sent>
Access-Control-Allow-Headers: Content-Type
Access-Control-Allow-Methods: GET,POST,OPTIONS
Access-Control-Allow-Private-Network: true
Vary: Origin
```

This supports ERP pages such as:

```text
https://staging.directlooperp.com
```

calling:

```text
http://127.0.0.1:8719/health
http://127.0.0.1:8719/printers
```

## Field Verification

After double-clicking `start_warehouse_print_agent.cmd`, keep the window open and run:

```cmd
curl.exe -i http://127.0.0.1:8719/health
curl.exe -i http://127.0.0.1:8719/printers
curl.exe -i -X OPTIONS -H "Origin: https://staging.directlooperp.com" -H "Access-Control-Request-Method: GET" -H "Access-Control-Request-Private-Network: true" http://127.0.0.1:8719/health
```

Expected:

- `/health` returns `200 OK` with `status: ok`.
- `/printers` returns the Windows printer list and includes `Deli DL-720C` when the driver/USB queue is installed.
- the OPTIONS response includes `Access-Control-Allow-Origin: https://staging.directlooperp.com`.
- the OPTIONS response includes `Access-Control-Allow-Private-Network: true`.

## ERP Operator Copy

Use this copy near the print helper controls:

```text
仓库打印电脑先双击 Start Warehouse Print Agent，保持黑色窗口不要关闭，再点击检测打印助手。
```

## Troubleshooting

- If `/health` does not respond, confirm the black CMD window is still open and that no other process owns port `8719`.
- If `/printers` does not show Deli, install the Deli DL-720C Windows driver, reconnect USB, and print a Windows test page.
- If ERP cannot detect the agent, run the OPTIONS curl command above and confirm the CORS and Private Network Access headers are present.
- If printing fails because the queue is offline, turn off **Use Printer Offline**, clear paused/error jobs, and retry after a Windows test page succeeds.
- If a RAW_BALE label is rejected, fix the source data so `barcode_value` / `machine_code` is the valid numeric machine code. Do not use display codes as encoded barcodes.

## Developer Checks

Recommended focused checks:

```cmd
python -m py_compile ops\local_print_agent\agent.py
python -m pytest -q backend\tests\test_windows_local_print_agent.py
node --test frontend_prototype\tests\print-agent-helper-ui.test.cjs
git diff --check
```

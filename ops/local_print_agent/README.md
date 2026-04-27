# FW-ERP Local Print Agent (MVP)

This folder provides a **local print bridge** for FW-ERP. It lets a cloud/staging FW-ERP page call a tiny local service running on the print computer.

- Agent URL: `http://127.0.0.1:8719`
- It binds to `127.0.0.1` only (localhost), not LAN.
- No printing happens automatically on startup.

## Security notes

- Run this only on trusted print computers.
- Do not change binding to `0.0.0.0` in MVP.
- CORS is restricted to:
  - `https://fw-erp-staging.onrender.com`
  - `http://34.35.52.250:8000`
  - `http://localhost:8000`
  - `http://127.0.0.1:8000`

## Files

- `agent.py` — Python standard-library HTTP API (no third-party runtime dependency).
- `requirements.txt` — Python package dependencies.
- `start_mac.sh` — startup script for macOS/Linux.
- `start_windows.ps1` — startup script for Windows PowerShell.

## API endpoints

1. `GET /health`
   - Returns status, version, host, and current UTC timestamp.

2. `GET /printers`
   - macOS/Linux: uses `lpstat -a` if available.
   - Windows: returns clear `not implemented` response for MVP.

3. `POST /print/html`
   - Request body JSON:
     - `html` (string): printable HTML text.
     - `printer` (string): target printer name.
   - MVP behavior:
     - Saves HTML to a temporary file.
     - macOS/Linux: runs `lp -d <printer> <tempfile>`.
     - Windows: returns actionable unsupported message in MVP.

4. `POST /print/raw` (experimental/disabled)
   - Reserved for future TSPL/ZPL/EPL support.
   - Returns clear disabled response in MVP.

## Start on macOS/Linux

```bash
cd ops/local_print_agent
chmod +x start_mac.sh
./start_mac.sh
```

If startup succeeds, the process listens on:

- `http://127.0.0.1:8719`

## Start on Windows (PowerShell)

```powershell
cd ops\local_print_agent
powershell -ExecutionPolicy Bypass -File .\start_windows.ps1
```

## Verification steps (non-developer friendly)

1. **Start agent** using one of the scripts above.
2. **Check health** in browser:
   - Open `http://127.0.0.1:8719/health`
   - You should see JSON with `"status": "ok"`.
3. **Check printers**:
   - Open `http://127.0.0.1:8719/printers`
   - On macOS/Linux, printer list appears if CUPS tools are installed.
4. **Submit a test HTML print request** (Terminal example):

```bash
curl -X POST http://127.0.0.1:8719/print/html \
  -H "Content-Type: application/json" \
  -d '{"printer":"YOUR_PRINTER_NAME","html":"<html><body><h1>FW-ERP Test Label</h1></body></html>"}'
```

If the platform/driver path is unsupported, the API returns a clear error plus fallback guidance.

## Browser fallback if local agent is unavailable

Continue using standard browser printing from FW-ERP pages. The local print agent is an optional bridge for direct local-printer workflows.

## Known MVP limitations

- Windows printer listing/HTML direct print not implemented yet.
- Requires CUPS (`lpstat`, `lp`) tools on macOS/Linux for printer discovery and command-based print.
- HTML rendering fidelity depends on OS print stack and printer driver.

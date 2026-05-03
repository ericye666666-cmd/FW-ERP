# FW-ERP Local Print Agent / Windows Print Station

This folder supports two print paths for FW-ERP label operations:

1. **Local Print Agent (`local-api`)** — the current Windows one-click path for a browser running on the same Windows computer as the Deli printer.
2. **Print Station (`print-station`)** — the future PDA/cloud queue path where a Windows station polls FW-ERP print jobs and prints locally.

For immediate Windows + Deli DL-720C testing, start with **Local Print Agent local-api**:

```text
ERP print modal
→ POST http://127.0.0.1:8719/print/label
→ Windows agent builds 60x40 TSPL raw commands
→ Windows RAW print job is sent to Deli DL-720C
→ no Edge/Chrome page and no Chrome print dialog
```

The older print-station queue path remains available:

```text
Android PDA / staff browser
→ FW-ERP cloud backend queues print job
→ Windows print-station agent polls cloud queue
→ Windows print computer prints locally to Deli label printer
→ Agent marks job complete or failed
```

> Deployment model for production PDA rollout: **one Windows print-station computer per warehouse/store**.

Android PDAs do **not** install printer drivers and do **not** print directly. PDA screens only queue print jobs to FW-ERP cloud.

---

## Files

- `agent.py` — main agent program.
  - `local-api` mode: localhost bridge (`/health`, `/printers`, `/print/label`) for Windows one-click label printing.
  - `print-station` mode: Windows poll/claim/print/complete/fail worker for cloud queue.
- `print_station_config.example.json` — sample print-station config.
- `build_windows_exe.ps1` — administrator/developer build script that creates `FW-ERP-Print-Agent.exe` with PyInstaller.
- `start_fwerp_print_agent_windows.bat` — employee launcher. It starts the bundled exe and does not call Python.
- `start_windows.ps1` — source-mode startup script for administrators/developers. Defaults to `local-api`; pass `-Mode print-station` for queue polling.
- `package_windows_agent.ps1` — creates the downloadable Windows helper zip for operators after the exe has been built.
- `start_mac.sh` — legacy local API startup for macOS/Linux testing.
- `requirements.txt` — dependency list (still standard-library runtime).

---

## 普通员工

普通员工不需要安装 Python，也不需要输入 PowerShell 命令。

1. 下载 `fw-erp-print-agent-windows.zip`。
2. 解压到桌面或固定文件夹。
3. 双击 `启动 FW-ERP 打印助手.bat`。
4. 不要关闭黑色窗口。
5. 回到 ERP 打印弹窗，点击 `检测打印助手`。
6. 如果显示已连接，再点击 `打印标签`。

员工包必须包含 `FW-ERP-Print-Agent.exe`。如果 bat 提示 `FW-ERP-Print-Agent.exe not found. Please download the official print agent package.`，说明下载的不是正式员工包，需要联系管理员重新上传安装包。

---

## GitHub Actions 自动打包

不想在本地 Windows 电脑安装 Python / PyInstaller 时，优先用 GitHub Actions 自动打包。

1. 打开 GitHub repository 的 **Actions**。
2. 选择 workflow：`Build Windows Print Agent`。
3. 点击 `Run workflow`。这个 workflow 使用 `workflow_dispatch` 手动触发。
4. 等待 Windows runner 完成构建。
5. 在 workflow run 的 **Artifacts** 下载：
   - `FW-ERP-Print-Agent.exe`
   - `fw-erp-print-agent-windows.zip`
6. 把 `fw-erp-print-agent-windows.zip` 上传到服务器：

```text
/downloads/fw-erp-print-agent-windows.zip
```

当前 nginx/static 部署建议路径：

```text
/var/www/fw-erp/downloads/fw-erp-print-agent-windows.zip
```

如果需要从 GitHub Release 下载，在手动触发 workflow 时填写 `release_tag`，workflow 会把 exe 和 zip 附加到对应 release。

---

## 管理员 / 开发者

管理员/开发者才需要在 Windows 打包电脑上安装 Python 和 PyInstaller，用来重新生成 exe 和 zip。

### 1. Build the Windows exe

From a Windows or PowerShell environment:

```powershell
cd ops\local_print_agent
python -m pip install pyinstaller
powershell -ExecutionPolicy Bypass -File .\build_windows_exe.ps1
```

The build script runs PyInstaller:

```text
python -m PyInstaller --onefile --name FW-ERP-Print-Agent agent.py
```

Expected output:

```text
ops\local_print_agent\dist\FW-ERP-Print-Agent.exe
ops\local_print_agent\FW-ERP-Print-Agent.exe
```

Do not commit the exe to GitHub.

### 2. Build the Windows download package

After `FW-ERP-Print-Agent.exe` exists:

```powershell
cd ops\local_print_agent
powershell -ExecutionPolicy Bypass -File .\package_windows_agent.ps1
```

The script creates:

```text
ops\local_print_agent\fw-erp-print-agent-windows.zip
```

The zip includes:

- `FW-ERP-Print-Agent.exe`
- `start_fwerp_print_agent_windows.bat`
- `启动 FW-ERP 打印助手.bat`
- `README.md`
- `print_station_config.example.json`
- `README_WINDOWS_NON_TECHNICAL.md`, if present

Do not commit the zip file to GitHub. Upload it to the web server static downloads folder instead.

The ERP print modal download button points to:

```text
/downloads/fw-erp-print-agent-windows.zip
```

For the current deployment, place the generated zip at:

```text
/var/www/fw-erp/downloads/fw-erp-print-agent-windows.zip
```

If the server is using a project-local static folder instead of nginx static files, copy the same zip into the folder that is served as `/downloads/`.

When the zip has not been uploaded yet, the ERP button shows:

```text
安装包暂未上传，请联系管理员。
```

---

## Windows Local Print Agent mode

### Start from source, for administrators/developers only

```powershell
cd ops\local_print_agent
powershell -ExecutionPolicy Bypass -File .\start_windows.ps1
```

or directly:

```powershell
cd ops\local_print_agent
python agent.py local-api
```

### Verify `/health`

Open:

```text
http://127.0.0.1:8719/health
```

Expected response:

```json
{
  "status": "ok",
  "version": "0.3.0",
  "platform": "windows",
  "mode": "local-api"
}
```

### Verify `/printers`

Open:

```text
http://127.0.0.1:8719/printers
```

The agent uses PowerShell `Get-Printer` and should return Windows queues such as:

```json
{
  "printers": [
    {
      "name": "Deli DL-720C",
      "is_default": false,
      "status": "available"
    }
  ]
}
```

Printer name matching is best-effort: `Deli DL-720C`, `Deli_DL_720C`, and spacing/case variants are normalized before printing.

### Print 60x40 TSPL labels

Formal Deli DL-720C label printing uses TSPL raw commands. It does not open Edge/Chrome and does not use browser kiosk printing.

`POST /print/label` accepts:

- `printer_name` or `printer`
- `copies`
- `template_size`, for example `60x40`
- `template_code` and `template_scope`
- `label_payload` with `display_code`, `machine_code`, and `barcode_value`

The agent generates a 60mm x 40mm label:

```text
SIZE 60 mm,40 mm
GAP 2 mm,0 mm
DENSITY 8
SPEED 4
DIRECTION 1
CLS
TEXT ...
BARCODE ... "barcode_value"
PRINT 1,1
```

Barcode rule:

- encoded barcode comes from `barcode_value` only when it is a valid 10-digit machine code: `^[1-5][0-9]{9}$`.
- if `barcode_value` is missing, the agent may use valid `machine_code`.
- if neither value is a valid 10-digit machine code, the agent rejects the request.
- the agent never extracts digits from display codes such as `RB260427AAAQH`, `SDB260427AAAQH`, `LPK260427001`, or `SDO260427001`.
- `template_code`, `display_code`, and `machine_code` must agree on type:
  - `warehouse_in` / `RB...` requires a `1...` machine code.
  - `store_prep_bale_60x40` or `wait_for_transtoshop` / `SDB...` requires a `2...` machine code.
  - `store_loose_pick_60x40` / `LPK...` requires a `3...` machine code.
  - `store_dispatch_60x40` / `SDO...` requires a `4...` machine code.
  - `store_item_60x40` or `clothes_retail` / `STOREITEM...` requires a `5...` machine code.
- `display_code` is never used as the encoded barcode.

Template rule:

- `warehouse_in` renders the RAW_BALE / WAREHOUSE IN layout, with supplier/category/package fields and machine-code barcode.
- `store_prep_bale_60x40` and `wait_for_transtoshop` render SDB / STORE PREP BALE.
- `store_loose_pick_60x40` renders LPK SHORTAGE PICK.
- `store_dispatch_60x40` and `transtoshop` render STORE DISPATCH / SDO.
- `store_item_60x40`, `apparel_60x40`, and `clothes_retail` render STORE ITEM.

Legacy `POST /print/html` is browser/HTML fallback only. On Windows, if a request includes `label_payload`, `/print/html` routes to the same TSPL raw path instead of Edge/Chrome kiosk printing.

### Common local-api errors

- `/health` does not open: the agent is not running, or another process owns port `8719`.
- `/printers` does not list Deli: install the Deli DL-720C driver and confirm Windows can print a test page.
- `/print/label` says the printer is not available: turn off **Use Printer Offline**, reconnect the Deli printer, clear paused/error jobs in the Windows queue, print a Windows test page, then retry in FW-ERP.
- `/print/label` rejects barcode: confirm `barcode_value` is the numeric machine code, not RB/SDB/LPK/SDO/STOREITEM display code.
- Paper feeds but layout is wrong: check the Deli driver paper size is configured as 60mm x 40mm.

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

1. **Install Deli DL-720C Windows driver**
   - Install the official driver on the print-station computer.

2. **Confirm Windows can print a test page**
   - In Windows Printer settings, print a test page to the Deli printer.
   - Do this before running FW-ERP print-station agent.

3. **Configure print-station file**
   - In `ops\local_print_agent`, copy `print_station_config.example.json` to `print_station_config.json`.
   - Set `api_base_url`, `station_id`, and exact `printer_name`.

4. **Start print-station agent from source, only for administrators/developers**

```powershell
cd ops\local_print_agent
powershell -ExecutionPolicy Bypass -File .\start_windows.ps1 -Mode print-station
```

5. **Verify polling**
   - Console should log repeated polling messages.
   - When there are no jobs: `polling ok: no pending jobs`.
   - When a job arrives: claimed → printed → completed.

6. **Stop / restart**
   - Press `Ctrl + C` in the PowerShell window to stop.
   - Re-run `start_windows.ps1` to restart.

---

## Windows print-station behavior in this MVP

- The agent renders a text-based Bale label from job payload fields and prints via PowerShell `Out-Printer` to configured queue.
- This is intentionally Windows-first and practical for operator rollout.
- **Limitation:** advanced layout/barcode-perfect rendering for all label templates is not finalized in this pass. If driver formatting is not acceptable, the agent still performs explicit claim/fail/complete flow and reports actionable error messages.

---

## macOS/Linux local API mode

macOS/Linux can also run local API mode and print through CUPS `lp`:

```bash
python agent.py local-api
```

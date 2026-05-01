#!/usr/bin/env python3
"""FW-ERP Local Print Agent + Windows print-station mode."""

from __future__ import annotations

import argparse
import json
import os
import platform
import re
import shutil
import subprocess
import tempfile
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib import error, parse, request
from urllib.parse import urlparse

APP_VERSION = "0.2.0"
HOST = "127.0.0.1"
PORT = 8719
ALLOWED_ORIGINS = {
    "https://fw-erp-staging.onrender.com",
    "http://34.35.52.250:8000",
    "https://fw-erp-34-35-52-250.nip.io",
    "http://fw-erp-34-35-52-250.nip.io",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
}

_PRINTER_STATUS_MARKERS = [
    "正在接受请求",
    "接受请求",
    "is accepting requests",
    "accepting requests",
    "is idle",
    "idle",
    "已禁用",
    "disabled",
    "not accepting requests",
]


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _extract_printer_name(raw_line: str) -> str:
    """Extract a stable CUPS queue name from localized lpstat output."""
    line = str(raw_line or "").strip()
    if not line:
        return ""
    first_token = line.split()[0].strip()
    for marker in _PRINTER_STATUS_MARKERS:
        if marker in first_token:
            return first_token.split(marker, 1)[0].strip()
        if marker in line:
            return line.split(marker, 1)[0].strip().split()[0].strip()
    return first_token


def _normalize_printer_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value or "").lower())


def _list_printers_unix() -> tuple[list[str], str | None]:
    if not shutil.which("lpstat"):
        return [], "lpstat is not available. Install CUPS tools or use browser print fallback."

    result = subprocess.run(["lpstat", "-a"], capture_output=True, text=True, check=False)
    if result.returncode != 0:
        return [], f"lpstat failed: {result.stderr.strip() or result.stdout.strip() or 'unknown error'}"

    printers: list[str] = []
    for line in result.stdout.splitlines():
        printer_name = _extract_printer_name(line)
        if printer_name and printer_name not in printers:
            printers.append(printer_name)

    return printers, None


def _resolve_printer_name_unix(requested_printer: str) -> tuple[str, str | None]:
    requested = str(requested_printer or "").strip()
    if not requested:
        return requested, "No printer name was provided."

    printers, warning = _list_printers_unix()
    if requested in printers:
        return requested, warning

    requested_norm = _normalize_printer_name(requested)
    for printer in printers:
        printer_norm = _normalize_printer_name(printer)
        if not printer_norm:
            continue
        if printer_norm == requested_norm:
            return printer, warning
        if printer_norm.startswith(requested_norm) or requested_norm.startswith(printer_norm):
            return printer, f"Matched requested printer '{requested}' to local queue '{printer}'."

    if printers:
        return requested, f"Requested printer '{requested}' was not found. Available printers: {', '.join(printers)}"
    return requested, warning or "No local printers were found by lpstat."


def _coerce_bool(value: object) -> bool:
    if isinstance(value, bool):
        return value
    return str(value or "").strip().lower() in {"1", "true", "yes", "y"}


def _parse_windows_printer_json(raw_json: str) -> tuple[list[dict], str | None]:
    text = str(raw_json or "").strip()
    if not text:
        return [], "Get-Printer returned no printers."
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError as exc:
        return [], f"Get-Printer returned invalid JSON: {exc}"

    rows = parsed if isinstance(parsed, list) else [parsed]
    printers: list[dict] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        name = str(row.get("Name") or row.get("name") or "").strip()
        if not name:
            continue
        work_offline = _coerce_bool(row.get("WorkOffline") or row.get("work_offline"))
        raw_status = str(row.get("PrinterStatus") or row.get("Status") or row.get("status") or "").strip()
        status_lower = raw_status.lower()
        is_problem_status = any(
            marker in status_lower
            for marker in ("offline", "error", "paper", "jam", "paused", "unavailable")
        )
        printers.append(
            {
                "name": name,
                "is_default": _coerce_bool(row.get("IsDefault") or row.get("Default") or row.get("is_default")),
                "status": "offline" if work_offline else ("unavailable" if is_problem_status else "available"),
                "raw_status": raw_status or ("Offline" if work_offline else "Normal"),
            }
        )

    if not printers:
        return [], "Get-Printer returned no usable printer names."
    return printers, None


def _list_printers_windows() -> tuple[list[dict], str | None]:
    command = [
        "powershell",
        "-NoProfile",
        "-Command",
        (
            "$ErrorActionPreference = 'Stop'; "
            "$defaultPrinter = (Get-CimInstance Win32_Printer | "
            "Where-Object { $_.Default -eq $true } | "
            "Select-Object -First 1 -ExpandProperty Name); "
            "Get-Printer | ForEach-Object { "
            "[pscustomobject]@{ "
            "Name = $_.Name; "
            "PrinterStatus = [string]$_.PrinterStatus; "
            "WorkOffline = [bool]$_.WorkOffline; "
            "IsDefault = ($_.Name -eq $defaultPrinter) "
            "} } | ConvertTo-Json -Compress"
        ),
    ]
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        err = result.stderr.strip() or result.stdout.strip() or "unknown Get-Printer error"
        return [], f"Get-Printer failed: {err}"
    return _parse_windows_printer_json(result.stdout)


def _resolve_printer_name_windows(requested_printer: str) -> tuple[str, str | None]:
    requested = str(requested_printer or "").strip()
    if not requested:
        return requested, "No printer name was provided."

    printers, warning = _list_printers_windows()
    for printer in printers:
        name = str(printer.get("name") or "").strip()
        if name == requested:
            return name, warning

    requested_norm = _normalize_printer_name(requested)
    for printer in printers:
        name = str(printer.get("name") or "").strip()
        printer_norm = _normalize_printer_name(name)
        if not printer_norm:
            continue
        if printer_norm == requested_norm:
            return name, f"Matched requested printer '{requested}' to Windows queue '{name}'."
        if printer_norm.startswith(requested_norm) or requested_norm.startswith(printer_norm):
            return name, f"Matched requested printer '{requested}' to Windows queue '{name}'."

    if printers:
        return requested, f"Requested printer '{requested}' was not found. Available printers: {', '.join(str(p.get('name') or '') for p in printers)}"
    return requested, warning or "No Windows printers were found by Get-Printer."


def _print_html_unix(printer: str, html_path: str) -> tuple[bool, str, str]:
    if not shutil.which("lp"):
        return False, "lp command is not available. Install CUPS or use browser print fallback.", printer

    resolved_printer, warning = _resolve_printer_name_unix(printer)
    result = subprocess.run(["lp", "-d", resolved_printer, html_path], capture_output=True, text=True, check=False)
    if result.returncode != 0:
        err = result.stderr.strip() or result.stdout.strip() or "unknown error"
        prefix = f"{warning} " if warning else ""
        return False, f"{prefix}Print command failed for '{resolved_printer}': {err}", resolved_printer

    message = result.stdout.strip() or "Print job submitted."
    if warning:
        message = f"{warning} {message}"
    return True, message, resolved_printer


def _sanitize_text(value: object) -> str:
    return str(value or "").strip()


def _job_field(job: dict, *keys: str, default: str = "") -> str:
    for key in keys:
        value = job.get(key)
        if value is not None and str(value).strip():
            return str(value)
    return default


def _render_bale_label_text(job: dict) -> str:
    data = job.get("payload") if isinstance(job.get("payload"), dict) else job
    title = _job_field(data, "label_title", default="FW-ERP Bale Label")
    lines = [
        title,
        "=" * 36,
        f"Job ID: {_job_field(job, 'id', 'job_id', default='(unknown)')}",
        f"Bale ID: {_job_field(data, 'bale_id', 'barcode', 'code', default='-')}",
        f"Supplier: {_job_field(data, 'supplier_name', 'supplier', default='-')}",
        f"Batch: {_job_field(data, 'batch_number', 'batch_code', default='-')}",
        f"Category: {_job_field(data, 'category', default='-')}",
        f"Grade: {_job_field(data, 'grade', default='-')}",
        f"Quantity: {_job_field(data, 'quantity', 'qty', default='-')}",
        f"Weight (kg): {_job_field(data, 'weight_kg', default='-')}",
        f"Destination: {_job_field(data, 'warehouse_name', 'store_name', default='-')}",
        f"Created: {_job_field(job, 'created_at', default=_utc_now())}",
    ]

    notes = _sanitize_text(_job_field(data, "notes", default=""))
    if notes:
        lines.extend(["-" * 36, f"Notes: {notes}"])

    return "\r\n".join(lines) + "\r\n"


def _print_text_windows(printer_name: str, text_content: str) -> tuple[bool, str, str | None]:
    if platform.system() != "Windows":
        return False, "Windows print-station mode must run on Windows.", None

    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False, encoding="utf-8") as temp_file:
        temp_file.write(text_content)
        text_path = temp_file.name

    command = [
        "powershell",
        "-NoProfile",
        "-Command",
        (
            "$ErrorActionPreference = 'Stop'; "
            f"Get-Content -LiteralPath '{text_path}' | "
            f"Out-Printer -Name '{printer_name}'"
        ),
    ]

    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        error_message = result.stderr.strip() or result.stdout.strip() or "unknown Out-Printer error"
        message = (
            "Windows print failed. Check printer name/driver and confirm Windows test page works first. "
            f"Out-Printer error: {error_message}"
        )
        return False, message, text_path

    return True, f"Printed via Windows Out-Printer to '{printer_name}'.", text_path


def _clean_positive_int(value: object, *, default: int = 1, maximum: int = 20) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    return max(1, min(parsed, maximum))


def _normalize_template_size(value: object) -> str:
    raw = str(value or "").strip().lower().replace(" ", "")
    if raw in {"60x40", "60×40", "60*40", "60mmx40mm"}:
        return "60x40"
    return raw or "60x40"


def _looks_like_machine_code(value: object) -> bool:
    return bool(re.fullmatch(r"[1-5][0-9]{5,}", str(value or "").strip()))


def _select_barcode_value(payload: dict) -> tuple[str, str | None]:
    label_payload = payload.get("label_payload") if isinstance(payload.get("label_payload"), dict) else {}
    candidates = [
        label_payload.get("barcode_value"),
        payload.get("barcode_value"),
        label_payload.get("machine_code"),
        payload.get("machine_code"),
    ]
    machine_candidates = [
        label_payload.get("machine_code"),
        payload.get("machine_code"),
    ]

    for candidate in candidates:
        cleaned = re.sub(r"[^A-Za-z0-9]", "", str(candidate or "").strip()).upper()
        if _looks_like_machine_code(cleaned):
            return cleaned, None

    for candidate in machine_candidates:
        cleaned = re.sub(r"[^A-Za-z0-9]", "", str(candidate or "").strip()).upper()
        if cleaned:
            return cleaned, "Machine code does not match the expected numeric barcode prefix."

    display_code = str(label_payload.get("display_code") or payload.get("display_code") or "").strip()
    return "", f"Missing machine barcode value. Display code '{display_code}' will not be used as the encoded barcode."


def _normalize_print_html_request(payload: dict) -> tuple[dict, str | None]:
    html = payload.get("html")
    if not html or not isinstance(html, str):
        return {}, "Invalid request: 'html' string is required."

    printer = payload.get("printer_name") or payload.get("printer")
    if not printer or not isinstance(printer, str):
        return {}, "Invalid request: 'printer_name' string is required."

    barcode_value, warning = _select_barcode_value(payload)
    label_payload = payload.get("label_payload") if isinstance(payload.get("label_payload"), dict) else {}
    display_code = str(label_payload.get("display_code") or payload.get("display_code") or "").strip()
    return (
        {
            "html": html,
            "printer_name": printer.strip(),
            "copies": _clean_positive_int(payload.get("copies"), default=1, maximum=20),
            "template_size": _normalize_template_size(payload.get("template_size")),
            "barcode_value": barcode_value,
            "display_code": display_code,
            "label_payload": label_payload,
            "warning": warning,
        },
        None,
    )


def _powershell_single_quote(value: object) -> str:
    return str(value or "").replace("'", "''")


def _windows_file_uri(path: str) -> str:
    normalized = str(path or "").replace("\\", "/")
    if re.match(r"^[A-Za-z]:/", normalized):
        return f"file:///{normalized}"
    if normalized.startswith("//"):
        return f"file:{normalized}"
    return Path(normalized).resolve().as_uri()


def _find_windows_browser() -> str:
    explicit = os.environ.get("FWERP_PRINT_BROWSER_PATH", "").strip()
    candidates = [
        explicit,
        shutil.which("msedge") or "",
        shutil.which("chrome") or "",
        shutil.which("chrome.exe") or "",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    ]
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return candidate
    return ""


def _build_windows_html_print_script(
    *,
    printer_name: str,
    browser_path: str,
    html_path: str,
    copies: int,
    wait_seconds: int = 8,
    browser_profile_dir: str = "",
) -> str:
    profile_dir = browser_profile_dir or tempfile.mkdtemp(prefix="fwerp-print-agent-browser-")
    file_uri = _windows_file_uri(html_path)
    return (
        "$ErrorActionPreference = 'Stop'; "
        f"$targetPrinter = '{_powershell_single_quote(printer_name)}'; "
        f"$browserPath = '{_powershell_single_quote(browser_path)}'; "
        f"$fileUri = '{_powershell_single_quote(file_uri)}'; "
        f"$profileDir = '{_powershell_single_quote(profile_dir)}'; "
        f"$copies = {int(copies)}; "
        f"$waitSeconds = {int(wait_seconds)}; "
        "$previousDefault = (Get-CimInstance Win32_Printer | "
        "Where-Object { $_.Default -eq $true } | "
        "Select-Object -First 1 -ExpandProperty Name); "
        "Get-Printer -Name $targetPrinter -ErrorAction Stop | Out-Null; "
        "$network = New-Object -ComObject WScript.Network; "
        "$network.SetDefaultPrinter($targetPrinter); "
        "try { "
        "New-Item -ItemType Directory -Force -Path $profileDir | Out-Null; "
        "for ($i = 0; $i -lt $copies; $i++) { "
        "$args = @('--kiosk-printing','--disable-print-preview','--no-first-run',"
        "'--disable-extensions','--user-data-dir=' + $profileDir,$fileUri); "
        "$proc = Start-Process -FilePath $browserPath -ArgumentList $args -PassThru; "
        "Start-Sleep -Seconds $waitSeconds; "
        "if ($proc -and -not $proc.HasExited) { "
        "$proc.CloseMainWindow() | Out-Null; "
        "Start-Sleep -Milliseconds 800; "
        "if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue } "
        "} "
        "} "
        "} finally { "
        "if ($previousDefault) { $network.SetDefaultPrinter($previousDefault) } "
        "}"
    )


def _print_html_windows(
    *,
    printer: str,
    html_path: str,
    copies: int = 1,
    template_size: str = "60x40",
) -> tuple[bool, str, str]:
    if platform.system() != "Windows":
        return False, "Windows HTML print is only available when the agent runs on Windows.", printer

    resolved_printer, warning = _resolve_printer_name_windows(printer)
    browser_path = _find_windows_browser()
    if not browser_path:
        return (
            False,
            "Microsoft Edge or Google Chrome was not found. Install Edge/Chrome or set FWERP_PRINT_BROWSER_PATH.",
            resolved_printer,
        )

    script = _build_windows_html_print_script(
        printer_name=resolved_printer,
        browser_path=browser_path,
        html_path=html_path,
        copies=copies,
        wait_seconds=8,
    )
    command = ["powershell", "-NoProfile", "-Command", script]
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        err = result.stderr.strip() or result.stdout.strip() or "unknown Windows browser print error"
        prefix = f"{warning} " if warning else ""
        return False, f"{prefix}Windows HTML print failed for '{resolved_printer}': {err}", resolved_printer

    prefix = f"{warning} " if warning else ""
    return (
        True,
        f"{prefix}Print job submitted to '{resolved_printer}' via Windows kiosk browser printing ({template_size}, {copies} copies).",
        resolved_printer,
    )


def _http_json(method: str, url: str, payload: dict | None = None) -> tuple[int, dict]:
    data = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = request.Request(url=url, data=data, method=method, headers=headers)
    try:
        with request.urlopen(req, timeout=20) as resp:
            body = resp.read().decode("utf-8") if resp.length is None or resp.length > 0 else ""
            parsed = json.loads(body) if body else {}
            return int(resp.status), parsed if isinstance(parsed, dict) else {}
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8") if exc.fp else ""
        parsed: dict = {}
        if body:
            try:
                raw = json.loads(body)
                if isinstance(raw, dict):
                    parsed = raw
            except json.JSONDecodeError:
                parsed = {"raw": body}
        return int(exc.code), parsed


def _extract_pending_jobs(response_payload: dict) -> list[dict]:
    for key in ("items", "jobs", "results", "data"):
        value = response_payload.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]

    if isinstance(response_payload.get("job"), dict):
        return [response_payload["job"]]

    if response_payload.get("id"):
        return [response_payload]

    return []


def _build_url(base_url: str, path: str) -> str:
    return f"{base_url.rstrip('/')}/{path.lstrip('/')}"


def run_print_station(config_path: Path):
    if platform.system() != "Windows":
        raise RuntimeError("Print-station mode is Windows-first. Run this mode on a Windows print computer.")

    if not config_path.exists():
        raise FileNotFoundError(f"Config file not found: {config_path}")

    config = json.loads(config_path.read_text(encoding="utf-8"))

    api_base_url = _sanitize_text(config.get("api_base_url"))
    station_id = _sanitize_text(config.get("station_id"))
    printer_name = _sanitize_text(config.get("printer_name"))
    poll_interval_seconds = int(config.get("poll_interval_seconds", 5) or 5)

    missing = [
        name
        for name, value in (
            ("api_base_url", api_base_url),
            ("station_id", station_id),
            ("printer_name", printer_name),
        )
        if not value
    ]
    if missing:
        raise ValueError(f"Missing required config fields: {', '.join(missing)}")

    print("[print-station] Starting FW-ERP Windows print-station agent")
    print(f"[print-station] station_id={station_id} printer_name={printer_name} poll={poll_interval_seconds}s")
    print(f"[print-station] api_base_url={api_base_url}")

    while True:
        try:
            pending_url = _build_url(api_base_url, f"print-jobs/pending?{parse.urlencode({'station_id': station_id})}")
            status_code, pending_payload = _http_json("GET", pending_url)
            if status_code >= 400:
                print(f"[{_utc_now()}] pending poll failed: status={status_code} body={pending_payload}")
                time.sleep(poll_interval_seconds)
                continue

            jobs = _extract_pending_jobs(pending_payload)
            if not jobs:
                print(f"[{_utc_now()}] polling ok: no pending jobs")
                time.sleep(poll_interval_seconds)
                continue

            job = jobs[0]
            job_id = _job_field(job, "id", "job_id")
            if not job_id:
                print(f"[{_utc_now()}] skipped malformed pending job: {job}")
                time.sleep(poll_interval_seconds)
                continue

            claim_url = _build_url(api_base_url, f"print-jobs/{job_id}/claim")
            claim_status, claim_payload = _http_json("POST", claim_url, {"station_id": station_id})
            if claim_status >= 400:
                print(f"[{_utc_now()}] claim failed for job={job_id}: status={claim_status} body={claim_payload}")
                time.sleep(poll_interval_seconds)
                continue

            print(f"[{_utc_now()}] claimed job={job_id}; printing...")
            label_text = _render_bale_label_text(job)
            printed, print_message, temp_path = _print_text_windows(printer_name=printer_name, text_content=label_text)

            if printed:
                complete_url = _build_url(api_base_url, f"print-jobs/{job_id}/complete")
                complete_status, complete_payload = _http_json("POST", complete_url, {"station_id": station_id})
                if complete_status >= 400:
                    print(
                        f"[{_utc_now()}] printed but complete failed job={job_id}: "
                        f"status={complete_status} body={complete_payload}"
                    )
                else:
                    print(f"[{_utc_now()}] completed job={job_id}; {print_message}; temp={temp_path}")
            else:
                fail_url = _build_url(api_base_url, f"print-jobs/{job_id}/fail")
                fail_status, fail_payload = _http_json(
                    "POST",
                    fail_url,
                    {
                        "station_id": station_id,
                        "error": print_message,
                    },
                )
                print(
                    f"[{_utc_now()}] failed job={job_id}; fail_status={fail_status}; "
                    f"print_error={print_message}; fail_body={fail_payload}; temp={temp_path}"
                )
        except KeyboardInterrupt:
            print("\n[print-station] Stopped by operator.")
            return
        except Exception as exc:  # noqa: BLE001
            print(f"[{_utc_now()}] loop error: {exc}")

        time.sleep(poll_interval_seconds)


class PrintAgentHandler(BaseHTTPRequestHandler):
    server_version = "FWERPPrintAgent/0.2"

    def _set_headers(self, status_code: int = 200):
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        origin = self.headers.get("Origin")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
            self.send_header("Access-Control-Allow-Private-Network", "true")
        self.end_headers()

    def _send_json(self, payload: dict, status_code: int = 200):
        self._set_headers(status_code)
        self.wfile.write(json.dumps(payload).encode("utf-8"))

    def _read_json(self) -> dict:
        content_length = int(self.headers.get("Content-Length", "0"))
        if content_length <= 0:
            return {}
        raw = self.rfile.read(content_length)
        try:
            decoded = json.loads(raw.decode("utf-8"))
            return decoded if isinstance(decoded, dict) else {}
        except json.JSONDecodeError:
            return {}

    def do_OPTIONS(self):  # noqa: N802
        self._set_headers(204)

    def do_GET(self):  # noqa: N802
        path = urlparse(self.path).path

        if path == "/health":
            self._send_json(
                {
                    "status": "ok",
                    "version": APP_VERSION,
                    "platform": platform.system().lower(),
                    "mode": "local-api",
                    "host": HOST,
                    "port": PORT,
                    "timestamp_utc": _utc_now(),
                }
            )
            return

        if path == "/printers":
            system_name = platform.system()
            if system_name in {"Darwin", "Linux"}:
                printers, warning = _list_printers_unix()
                self._send_json(
                    {
                        "platform": system_name,
                        "printers": printers,
                        "count": len(printers),
                        "warning": warning,
                    }
                )
                return

            if system_name == "Windows":
                printers, warning = _list_printers_windows()
                self._send_json(
                    {
                        "platform": system_name,
                        "printers": printers,
                        "count": len(printers),
                        "warning": warning,
                    },
                    200 if printers else 500,
                )
                return

            self._send_json(
                {
                    "platform": system_name,
                    "printers": [],
                    "count": 0,
                    "warning": f"Unsupported platform for printer listing: {system_name}",
                },
                501,
            )
            return

        self._send_json({"error": "Not found"}, 404)

    def do_POST(self):  # noqa: N802
        path = urlparse(self.path).path
        payload = self._read_json()

        if path == "/print/html":
            normalized, validation_error = _normalize_print_html_request(payload)
            if validation_error:
                self._send_json({"error": validation_error}, 400)
                return
            html = normalized["html"]
            printer = normalized["printer_name"]

            with tempfile.NamedTemporaryFile(mode="w", suffix=".html", delete=False, encoding="utf-8") as temp_file:
                temp_file.write(html)
                html_path = temp_file.name

            system_name = platform.system()
            if system_name in {"Darwin", "Linux"}:
                success, message, resolved_printer = _print_html_unix(printer=printer, html_path=html_path)
                self._send_json(
                    {
                        "ok": success,
                        "platform": system_name,
                        "printer": printer,
                        "resolved_printer": resolved_printer,
                        "message": message,
                        "temp_file": html_path,
                        "template_size": normalized["template_size"],
                        "copies": normalized["copies"],
                        "barcode_value": normalized["barcode_value"],
                        "display_code": normalized["display_code"],
                        "warning": normalized["warning"],
                    },
                    200 if success else 500,
                )
                return

            if system_name == "Windows":
                success, message, resolved_printer = _print_html_windows(
                    printer=printer,
                    html_path=html_path,
                    copies=normalized["copies"],
                    template_size=normalized["template_size"],
                )
                self._send_json(
                    {
                        "ok": success,
                        "platform": system_name,
                        "printer": printer,
                        "resolved_printer": resolved_printer,
                        "message": message,
                        "temp_file": html_path,
                        "template_size": normalized["template_size"],
                        "copies": normalized["copies"],
                        "barcode_value": normalized["barcode_value"],
                        "display_code": normalized["display_code"],
                        "warning": normalized["warning"],
                    },
                    200 if success else 500,
                )
                return

            self._send_json(
                {
                    "ok": False,
                    "platform": system_name,
                    "printer": printer,
                    "message": f"Unsupported platform for HTML print: {system_name}",
                    "temp_file": html_path,
                },
                501,
            )
            return

        if path == "/print/raw":
            self._send_json(
                {
                    "ok": False,
                    "experimental": True,
                    "message": "POST /print/raw is reserved for future TSPL/ZPL/EPL support and is disabled in MVP.",
                },
                501,
            )
            return

        self._send_json({"error": "Not found"}, 404)

    def log_message(self, format: str, *args):
        return


def run_local_api_server():
    server = ThreadingHTTPServer((HOST, PORT), PrintAgentHandler)
    print(f"FW-ERP Local Print Agent v{APP_VERSION} running on http://{HOST}:{PORT}")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


def main():
    parser = argparse.ArgumentParser(description="FW-ERP print agent")
    subparsers = parser.add_subparsers(dest="mode")

    subparsers.add_parser("local-api", help="Run localhost HTTP print bridge (legacy MVP mode)")

    station_parser = subparsers.add_parser("print-station", help="Run Windows cloud print-station poller")
    station_parser.add_argument(
        "--config",
        default="print_station_config.json",
        help="Path to print-station config JSON (default: print_station_config.json)",
    )

    args = parser.parse_args()
    if args.mode in (None, "local-api"):
        run_local_api_server()
        return

    if args.mode == "print-station":
        run_print_station(Path(args.config))


if __name__ == "__main__":
    main()

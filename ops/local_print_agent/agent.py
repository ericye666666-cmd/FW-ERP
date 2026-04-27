#!/usr/bin/env python3
"""FW-ERP Local Print Agent MVP."""

from __future__ import annotations

import json
import platform
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

APP_VERSION = "0.1.2"
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


def _list_printers_unix() -> tuple[list[str], str | None]:
    if not shutil.which("lpstat"):
        return [], "lpstat is not available. Install CUPS tools or use browser print fallback."

    result = subprocess.run(["lpstat", "-a"], capture_output=True, text=True, check=False)
    if result.returncode != 0:
        return [], f"lpstat failed: {result.stderr.strip() or result.stdout.strip() or 'unknown error'}"

    printers: list[str] = []
    for line in result.stdout.splitlines():
        line = line.strip()
        if not line:
            continue
        printer_name = line.split()[0]
        if printer_name not in printers:
            printers.append(printer_name)

    return printers, None


def _print_html_unix(printer: str, html_path: str) -> tuple[bool, str]:
    if not shutil.which("lp"):
        return False, "lp command is not available. Install CUPS or use browser print fallback."

    result = subprocess.run(["lp", "-d", printer, html_path], capture_output=True, text=True, check=False)
    if result.returncode != 0:
        err = result.stderr.strip() or result.stdout.strip() or "unknown error"
        return False, f"Print command failed: {err}"

    return True, result.stdout.strip() or "Print job submitted."


class PrintAgentHandler(BaseHTTPRequestHandler):
    server_version = "FWERPPrintAgent/0.1"

    def _set_headers(self, status_code: int = 200):
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        origin = self.headers.get("Origin")
        if origin in ALLOWED_ORIGINS:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
            # Chrome Private Network Access preflight requires this header when a
            # public/staging page calls a localhost agent such as 127.0.0.1:8719.
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
                    "host": HOST,
                    "port": PORT,
                    "timestamp_utc": datetime.now(timezone.utc).isoformat(),
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
                self._send_json(
                    {
                        "platform": system_name,
                        "printers": [],
                        "count": 0,
                        "warning": "Windows printer listing is not implemented in MVP. Use browser print fallback.",
                    },
                    501,
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
            html = payload.get("html")
            printer = payload.get("printer")

            if not html or not isinstance(html, str):
                self._send_json({"error": "Invalid request: 'html' string is required."}, 400)
                return
            if not printer or not isinstance(printer, str):
                self._send_json({"error": "Invalid request: 'printer' string is required."}, 400)
                return

            with tempfile.NamedTemporaryFile(mode="w", suffix=".html", delete=False, encoding="utf-8") as temp_file:
                temp_file.write(html)
                html_path = temp_file.name

            system_name = platform.system()
            if system_name in {"Darwin", "Linux"}:
                success, message = _print_html_unix(printer=printer, html_path=html_path)
                self._send_json(
                    {
                        "ok": success,
                        "platform": system_name,
                        "printer": printer,
                        "message": message,
                        "temp_file": html_path,
                    },
                    200 if success else 500,
                )
                return

            if system_name == "Windows":
                self._send_json(
                    {
                        "ok": False,
                        "platform": system_name,
                        "printer": printer,
                        "message": "Windows direct HTML printing is not implemented in MVP. Use browser print fallback.",
                        "temp_file": html_path,
                    },
                    501,
                )
                return

            self._send_json(
                {
                    "ok": False,
                    "platform": system_name,
                    "printer": printer,
                    "message": f"Unsupported platform for printing: {system_name}",
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


def run_server():
    server = ThreadingHTTPServer((HOST, PORT), PrintAgentHandler)
    print(f"FW-ERP local print agent running on http://{HOST}:{PORT}")
    server.serve_forever()


if __name__ == "__main__":
    run_server()

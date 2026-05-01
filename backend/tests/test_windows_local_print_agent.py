import importlib.util
import json
import unittest
from pathlib import Path
from unittest.mock import patch


REPO_ROOT = Path(__file__).resolve().parents[2]
AGENT_PATH = REPO_ROOT / "ops" / "local_print_agent" / "agent.py"

spec = importlib.util.spec_from_file_location("fwerp_local_print_agent", AGENT_PATH)
agent = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(agent)


class WindowsLocalPrintAgentTest(unittest.TestCase):
    def test_parse_windows_get_printer_json_returns_status_and_default(self):
        raw = json.dumps(
            [
                {
                    "Name": "Microsoft Print to PDF",
                    "PrinterStatus": "Normal",
                    "WorkOffline": False,
                    "IsDefault": True,
                },
                {
                    "Name": "Deli DL-720C",
                    "PrinterStatus": "Normal",
                    "WorkOffline": False,
                    "IsDefault": False,
                },
            ]
        )

        printers, warning = agent._parse_windows_printer_json(raw)

        self.assertIsNone(warning)
        self.assertEqual(printers[1]["name"], "Deli DL-720C")
        self.assertEqual(printers[1]["status"], "available")
        self.assertFalse(printers[1]["is_default"])
        self.assertTrue(printers[0]["is_default"])

    def test_resolve_windows_printer_name_matches_spacing_and_punctuation(self):
        printers = [
            {"name": "Deli_DL_720C", "is_default": False, "status": "available"},
            {"name": "Office Laser", "is_default": True, "status": "available"},
        ]

        with patch.object(agent, "_list_printers_windows", return_value=(printers, None)):
            resolved, warning = agent._resolve_printer_name_windows("Deli DL-720C")

        self.assertEqual(resolved, "Deli_DL_720C")
        self.assertIn("Matched requested printer", warning)

    def test_print_html_request_prefers_machine_barcode_over_display_code(self):
        normalized, error = agent._normalize_print_html_request(
            {
                "printer_name": "Deli DL-720C",
                "html": "<html><body>Display: RB260427AAAQH</body></html>",
                "copies": 2,
                "template_size": "60x40",
                "label_payload": {
                    "display_code": "RB260427AAAQH",
                    "machine_code": "1260427001",
                    "barcode_value": "RB260427AAAQH",
                },
            }
        )

        self.assertIsNone(error)
        self.assertEqual(normalized["printer_name"], "Deli DL-720C")
        self.assertEqual(normalized["copies"], 2)
        self.assertEqual(normalized["template_size"], "60x40")
        self.assertEqual(normalized["display_code"], "RB260427AAAQH")
        self.assertEqual(normalized["barcode_value"], "1260427001")

    def test_print_html_request_rejects_missing_html_or_printer(self):
        _, error = agent._normalize_print_html_request({"printer_name": "Deli DL-720C"})
        self.assertIn("html", error)

        _, error = agent._normalize_print_html_request({"html": "<html></html>"})
        self.assertIn("printer_name", error)

    def test_windows_kiosk_print_script_uses_browser_without_print_dialog(self):
        script = agent._build_windows_html_print_script(
            printer_name="Deli DL-720C",
            browser_path=r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
            html_path=r"C:\Temp\label.html",
            copies=1,
            wait_seconds=3,
            browser_profile_dir=r"C:\Temp\fwerp-print-profile",
        )

        self.assertIn("SetDefaultPrinter($targetPrinter)", script)
        self.assertIn("--kiosk-printing", script)
        self.assertIn("--disable-print-preview", script)
        self.assertIn("file:///C:/Temp/label.html", script)
        self.assertIn("Deli DL-720C", script)


if __name__ == "__main__":
    unittest.main()

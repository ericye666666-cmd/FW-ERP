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
        self.assertEqual(printers[1]["raw_status"], "Normal")
        self.assertFalse(printers[1]["work_offline"])
        self.assertTrue(printers[1]["available"])
        self.assertFalse(printers[1]["is_default"])
        self.assertTrue(printers[0]["is_default"])

    def test_parse_windows_get_printer_json_marks_offline_queue_not_available(self):
        raw = json.dumps(
            {
                "Name": "Deli DL-720C",
                "PrinterStatus": "Offline",
                "WorkOffline": True,
                "IsDefault": False,
            }
        )

        printers, warning = agent._parse_windows_printer_json(raw)

        self.assertIsNone(warning)
        self.assertEqual(printers[0]["name"], "Deli DL-720C")
        self.assertEqual(printers[0]["status"], "offline")
        self.assertEqual(printers[0]["raw_status"], "Offline")
        self.assertTrue(printers[0]["work_offline"])
        self.assertFalse(printers[0]["available"])

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

    def test_raw_bale_tspl_uses_60x40_and_machine_barcode(self):
        normalized, error = agent._normalize_print_label_request(
            {
                "printer_name": "Deli DL-720C",
                "copies": 1,
                "template_size": "60x40",
                "template_code": "warehouse_in",
                "template_scope": "bale",
                "label_payload": {
                    "display_code": "RB260427AAAQH",
                    "machine_code": "1260427001",
                    "barcode_value": "1260427001",
                    "supplier_name": "YOUXUNDE",
                    "category_main": "tops",
                    "category_sub": "shirt",
                    "serial_no": 1,
                    "total_packages": 18,
                    "shipment_no": "SHIP-260427",
                    "parcel_batch_no": "PB-001",
                    "received_at": "2026-04-27",
                },
            }
        )

        self.assertIsNone(error)
        tspl = agent._build_tspl_60x40_label(normalized["label_payload"], copies=normalized["copies"])

        self.assertIn("SIZE 60 mm,40 mm", tspl)
        self.assertIn("GAP 2 mm,0 mm", tspl)
        self.assertIn("RAW_BALE / WAREHOUSE IN", tspl)
        self.assertNotIn("SDB / Store Prep Bale", tspl)
        self.assertIn("Display: RB260427AAAQH", tspl)
        self.assertIn("Machine: 1260427001", tspl)
        self.assertIn("Encoded: 1260427001", tspl)
        self.assertIn("SUP: YOUXUNDE", tspl)
        self.assertIn("CAT: tops", tspl)
        self.assertIn("SUB: shirt", tspl)
        self.assertIn("No: 1", tspl)
        self.assertIn("Total: 18", tspl)
        self.assertIn('BARCODE', tspl)
        self.assertIn('"1260427001"', tspl)
        self.assertNotIn('"RB260427AAAQH"', tspl.split("BARCODE", 1)[1])
        self.assertIn("PRINT 1,1", tspl)
        self.assertNotIn("PRINT 2,1", tspl)

    def test_tspl_uses_type_prefixed_machine_codes_for_all_label_types(self):
        cases = [
            ("store_prep_bale_60x40", "warehouseout_bale", "SDB260429AAB", "2260429001", "SDB / STORE PREP BALE", {"category": "long dress", "item_count": 100, "store": "UTAWALA"}),
            ("store_loose_pick_60x40", "warehouseout_bale", "LPK260429001", "3260429001", "LPK SHORTAGE PICK", {"transfer_order_no": "TO-001", "qty": 12, "category": "kids"}),
            ("store_dispatch_60x40", "warehouseout_bale", "SDO260429002", "4260429002", "STORE DISPATCH / SDO", {"store": "UTAWALA", "request": "TO-001", "packages": 3, "packing_list": "SDB/LPK"}),
            ("store_item_60x40", "product", "STOREITEM260429001", "5260429001", "STORE ITEM", {"price": 150, "rack": "A-01", "category": "tops"}),
        ]

        for template_code, template_scope, display_code, barcode_value, title, extra_fields in cases:
            with self.subTest(display_code=display_code):
                payload = {"display_code": display_code, "machine_code": barcode_value, "barcode_value": barcode_value, **extra_fields}
                normalized, error = agent._normalize_print_label_request(
                    {
                        "printer_name": "Deli DL-720C",
                        "template_code": template_code,
                        "template_scope": template_scope,
                        "label_payload": payload,
                    }
                )

                self.assertIsNone(error)
                tspl = agent._build_tspl_60x40_label(normalized["label_payload"], copies=1)
                self.assertIn(title, tspl)
                self.assertIn(f"Machine: {barcode_value}", tspl)
                self.assertIn(f"Encoded: {barcode_value}", tspl)
                self.assertIn(f'"{barcode_value}"', tspl)
                self.assertNotIn(f'BARCODE 40,220,"128",80,1,0,2,2,"{display_code}"', tspl)

    def test_print_label_request_rejects_display_code_as_barcode_value(self):
        _, error = agent._normalize_print_label_request(
            {
                "printer_name": "Deli DL-720C",
                "label_payload": {
                    "display_code": "RB260427AAAQH",
                    "machine_code": "1260427001",
                    "barcode_value": "RB260427AAAQH",
                },
            }
        )

        self.assertIn("Missing valid 10-digit machine_code. Display code cannot be used as barcode.", error)

    def test_print_label_request_rejects_short_or_display_derived_machine_codes(self):
        invalid_values = ["260427", "260427001", "126-0427001", "RB260427AAAQH", "SDB260427AAAQH", "LPK260427001", "SDO260427001"]
        for value in invalid_values:
            with self.subTest(value=value):
                _, error = agent._normalize_print_label_request(
                    {
                        "printer_name": "Deli DL-720C",
                        "template_code": "warehouse_in",
                        "template_scope": "bale",
                        "label_payload": {
                            "display_code": "RB260427AAAQH",
                            "machine_code": value,
                            "barcode_value": value,
                        },
                    }
                )
                self.assertIn("Missing valid 10-digit machine_code. Display code cannot be used as barcode.", error)

    def test_print_label_request_validates_display_template_and_machine_type(self):
        invalid_cases = [
            ("warehouse_in", "bale", "RB260427AAAQH", "2260427001"),
            ("store_prep_bale_60x40", "warehouseout_bale", "SDB260427AAAQH", "1260427001"),
            ("store_loose_pick_60x40", "warehouseout_bale", "LPK260427001", "4260427001"),
            ("store_dispatch_60x40", "warehouseout_bale", "SDO260427001", "3260427001"),
            ("store_item_60x40", "product", "STOREITEM260427001", "4260427001"),
        ]
        for template_code, template_scope, display_code, machine_code in invalid_cases:
            with self.subTest(template_code=template_code, display_code=display_code):
                _, error = agent._normalize_print_label_request(
                    {
                        "printer_name": "Deli DL-720C",
                        "template_code": template_code,
                        "template_scope": template_scope,
                        "label_payload": {
                            "display_code": display_code,
                            "machine_code": machine_code,
                            "barcode_value": machine_code,
                        },
                    }
                )
                self.assertIn("does not match template/display type", error)

        normalized, error = agent._normalize_print_label_request(
            {
                "printer_name": "Deli DL-720C",
                "template_code": "warehouse_in",
                "template_scope": "bale",
                "label_payload": {
                    "display_code": "RB260427AAAQH",
                    "machine_code": "1260427001",
                    "barcode_value": "1260427001",
                },
            }
        )
        self.assertIsNone(error)
        self.assertEqual(normalized["barcode_value"], "1260427001")

    def test_windows_label_print_uses_raw_tspl_sender_not_browser_kiosk(self):
        normalized, error = agent._normalize_print_label_request(
            {
                "printer_name": "Deli DL-720C",
                "label_payload": {
                    "display_code": "SDB260429AAB",
                    "barcode_value": "2260429001",
                    "category": "long dress",
                    "item_count": 100,
                },
            }
        )
        self.assertIsNone(error)

        with patch.object(agent.platform, "system", return_value="Windows"), \
            patch.object(agent, "_resolve_printer_name_windows", return_value=("Deli DL-720C", None)), \
            patch.object(agent, "_send_raw_to_windows_printer", return_value=(True, "raw ok")) as raw_sender, \
            patch.object(agent, "_build_windows_html_print_script", side_effect=AssertionError("browser kiosk should not be used")):
            success, message, resolved_printer, tspl = agent._print_label_windows(normalized)

        self.assertTrue(success)
        self.assertEqual(resolved_printer, "Deli DL-720C")
        self.assertIn("TSPL raw", message)
        self.assertIn('"2260429001"', tspl)
        raw_sender.assert_called_once()


if __name__ == "__main__":
    unittest.main()

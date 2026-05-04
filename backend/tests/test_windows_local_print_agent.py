import importlib.util
import json
import re
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
    def _tspl_text_y_values(self, tspl):
        return [int(match.group(1)) for match in re.finditer(r"^TEXT\s+\d+,(\d+),", tspl, re.MULTILINE)]

    def _tspl_text_commands(self, tspl):
        pattern = re.compile(r'^TEXT\s+(\d+),(\d+),"0",0,(\d+),(\d+),"([^"]*)"', re.MULTILINE)
        return [
            {
                "x": int(match.group(1)),
                "y": int(match.group(2)),
                "x_scale": int(match.group(3)),
                "y_scale": int(match.group(4)),
                "text": match.group(5),
            }
            for match in pattern.finditer(tspl)
        ]

    def _tspl_text_right_edge(self, command):
        return command["x"] + len(command["text"]) * 8 * command["x_scale"]

    def _tspl_barcode_values(self, tspl):
        return re.findall(r'^BARCODE\s+[^"]+"128"[^"]+"([^"]+)"', tspl, re.MULTILINE)

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

    def test_windows_label_print_refuses_offline_queue_before_raw_print(self):
        normalized, error = agent._normalize_print_label_request(
            {
                "printer_name": "Deli DL-720C",
                "template_code": "store_prep_bale_60x40",
                "label_payload": {
                    "display_code": "SDB260429AAB",
                    "machine_code": "2260429001",
                    "barcode_value": "2260429001",
                    "category": "long dress",
                    "item_count": 100,
                },
            }
        )
        self.assertIsNone(error)

        offline_printers = [
            {
                "name": "Deli DL-720C",
                "is_default": False,
                "status": "offline",
                "raw_status": "Offline",
                "work_offline": True,
                "available": False,
            }
        ]

        with patch.object(agent.platform, "system", return_value="Windows"), \
            patch.object(agent, "_list_printers_windows", return_value=(offline_printers, None)), \
            patch.object(agent, "_send_raw_to_windows_printer", return_value=(True, "raw ok")) as raw_sender:
            success, message, resolved_printer, tspl = agent._print_label_windows(normalized)

        self.assertFalse(success)
        self.assertEqual(resolved_printer, "Deli DL-720C")
        self.assertEqual(tspl, "")
        self.assertIn("is not available", message)
        self.assertIn("Use Printer Offline", message)
        raw_sender.assert_not_called()

    def test_windows_label_print_uses_available_normalized_queue_instead_of_stale_offline_queue(self):
        normalized, error = agent._normalize_print_label_request(
            {
                "printer_name": "Deli DL-720C",
                "template_code": "store_prep_bale_60x40",
                "label_payload": {
                    "display_code": "SDB260429AAB",
                    "machine_code": "2260429001",
                    "barcode_value": "2260429001",
                    "category": "long dress",
                    "item_count": 100,
                },
            }
        )
        self.assertIsNone(error)

        printers = [
            {
                "name": "Deli DL-720C",
                "is_default": False,
                "status": "offline",
                "raw_status": "Offline",
                "work_offline": True,
                "available": False,
            },
            {
                "name": "Deli_DL_720C",
                "is_default": False,
                "status": "available",
                "raw_status": "Normal",
                "work_offline": False,
                "available": True,
            },
        ]

        with patch.object(agent.platform, "system", return_value="Windows"), \
            patch.object(agent, "_list_printers_windows", return_value=(printers, None)), \
            patch.object(agent, "_send_raw_to_windows_printer", return_value=(True, "raw ok")) as raw_sender:
            success, message, resolved_printer, tspl = agent._print_label_windows(normalized)

        self.assertTrue(success)
        self.assertEqual(resolved_printer, "Deli_DL_720C")
        self.assertIn("Matched requested printer", message)
        self.assertIn('"2260429001"', tspl)
        raw_sender.assert_called_once()
        self.assertEqual(raw_sender.call_args.args[0], "Deli_DL_720C")

    def test_print_station_text_print_refuses_offline_queue_before_out_printer(self):
        offline_printers = [
            {
                "name": "Deli DL-720C",
                "is_default": False,
                "status": "paused",
                "raw_status": "Paused",
                "work_offline": False,
                "available": False,
            }
        ]

        with patch.object(agent.platform, "system", return_value="Windows"), \
            patch.object(agent, "_list_printers_windows", return_value=(offline_printers, None)), \
            patch.object(agent.subprocess, "run") as out_printer:
            printed, message, temp_path = agent._print_text_windows(
                printer_name="Deli DL-720C",
                text_content="FW-ERP label",
            )

        self.assertFalse(printed)
        self.assertIsNone(temp_path)
        self.assertIn("is not available", message)
        self.assertIn("Paused", message)
        out_printer.assert_not_called()

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
        self.assertIn("RAW_BALE", tspl)
        self.assertNotIn("RAW_BALE / WAREHOUSE IN", tspl)
        self.assertNotIn("SDB / Store Prep Bale", tspl)
        self.assertIn("Display: RB260427AAAQH", tspl)
        self.assertIn("MCode: 1260427001", tspl)
        self.assertIn("Enc: 1260427001", tspl)
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
            ("store_prep_bale_60x40", "warehouseout_bale", "SDB260429AAB", "2260429001", "SDB / PREP", {"category": "long dress", "item_count": 100, "store": "UTAWALA"}),
            ("store_loose_pick_60x40", "warehouseout_bale", "LPK260429001", "3260429001", "LPK / PICK", {"transfer_order_no": "TO-001", "qty": 12, "category": "kids"}),
            ("store_dispatch_60x40", "warehouseout_bale", "SDO260429002", "4260429002", "SDO / DELIVERY", {"store": "UTAWALA", "request": "TO-001", "packages": 3, "packing_list": "SDB/LPK"}),
            ("store_item_60x40", "product", "STOREITEM260429001", "5260429001", "STORE_ITEM", {"price": 150, "rack": "A-01", "category": "tops"}),
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
                self.assertEqual(normalized["barcode_value"], barcode_value)
                self.assertEqual(normalized["label_payload"]["barcode_value"], barcode_value)
                self.assertEqual(normalized["label_payload"]["machine_code"], barcode_value)
                tspl = agent._build_tspl_60x40_label(normalized["label_payload"], copies=1)
                self.assertIn(title, tspl)
                if template_code in {"store_prep_bale_60x40", "store_loose_pick_60x40"}:
                    self.assertIn(f"Enc: {barcode_value}", tspl)
                    self.assertNotIn(f"Machine: {barcode_value}", tspl)
                    self.assertNotIn(f"Encoded: {barcode_value}", tspl)
                else:
                    self.assertIn(f"MCode: {barcode_value}", tspl)
                    if template_code == "store_dispatch_60x40":
                        self.assertIn(f"SDO: {display_code}", tspl)
                        self.assertNotIn(f"Enc: {barcode_value}", tspl)
                    else:
                        self.assertIn(f"Enc: {barcode_value}", tspl)
                self.assertIn(f'"{barcode_value}"', tspl)
                self.assertNotIn(f'BARCODE 40,220,"128",80,1,0,2,2,"{display_code}"', tspl)

    def test_active_60x40_tspl_labels_use_compact_titles_and_safe_text_bounds(self):
        old_titles = [
            "RAW_BALE / WAREHOUSE IN",
            "STORE DELIVERY EXECUTION",
            "STORE PREP BALE",
            "LOOSE PICK TASK",
            "STORE DISPATCH / SDO",
            "STORE ITEM",
        ]
        cases = [
            (
                "RAW_BALE",
                "warehouse_in",
                "bale",
                "RB260427AAAQH",
                "1260427001",
                {
                    "supplier_name": "YOUXUNDE",
                    "category_main": "tops",
                    "category_sub": "shirt",
                    "serial_no": 1,
                    "total_packages": 18,
                },
            ),
            (
                "SDB / PREP",
                "store_prep_bale_60x40",
                "warehouseout_bale",
                "SDB260429AAB",
                "2260429001",
                {
                    "store": "UTAWALA",
                    "qty": 120,
                    "category_main": "dress",
                    "category_sub": "long dress",
                    "grade": "A",
                    "source_reference": "RB260429XYZ",
                },
            ),
            (
                "LPK / PICK",
                "store_loose_pick_60x40",
                "warehouseout_bale",
                "LPK260429001",
                "3260429001",
                {
                    "store": "UTAWALA",
                    "transfer_order_no": "TO-001",
                    "picked_item_summary": "dress/long dress x80; tops/lady tops x40; kids/skirt x10",
                    "shortage_summary": "dress/short dress x20",
                },
            ),
            (
                "SDO / DELIVERY",
                "store_dispatch_60x40",
                "warehouseout_bale",
                "SDO260429002",
                "4260429002",
                {
                    "store": "UTAWALA",
                    "request": "TO-001",
                    "packages": 3,
                    "packing_list": "SDB/LPK",
                },
            ),
            (
                "STORE_ITEM",
                "store_item_60x40",
                "product",
                "STOREITEM260429001",
                "5260429001",
                {
                    "price": 150,
                    "rack": "A-01",
                    "category": "tops",
                },
            ),
        ]

        for short_title, template_code, template_scope, display_code, machine_code, extra_fields in cases:
            with self.subTest(template_code=template_code):
                normalized, error = agent._normalize_print_label_request(
                    {
                        "printer_name": "Deli DL-720C",
                        "template_code": template_code,
                        "template_scope": template_scope,
                        "label_payload": {
                            "display_code": display_code,
                            "machine_code": machine_code,
                            "barcode_value": machine_code,
                            **extra_fields,
                        },
                    }
                )

                self.assertIsNone(error)
                self.assertEqual(normalized["barcode_value"], machine_code)
                self.assertEqual(normalized["label_payload"]["barcode_value"], machine_code)
                self.assertEqual(normalized["label_payload"]["machine_code"], machine_code)

                tspl = agent._build_tspl_60x40_label(normalized["label_payload"], copies=1)
                self.assertIn(short_title, tspl)
                for old_title in old_titles:
                    self.assertNotIn(old_title, tspl)

                self.assertEqual(self._tspl_barcode_values(tspl), [machine_code])
                self.assertRegex(machine_code, r"^[1-5]\d{9}$")
                barcode_lines = "\n".join(line for line in tspl.splitlines() if line.startswith("BARCODE"))
                self.assertIn(f'"{machine_code}"', barcode_lines)
                self.assertNotIn(f'"{display_code}"', barcode_lines)
                barcode_command = re.search(
                    rf'^BARCODE\s+(\d+),(\d+),"128",(\d+),1,0,(\d+),(\d+),"{machine_code}"',
                    tspl,
                    re.MULTILINE,
                )
                self.assertIsNotNone(barcode_command)
                self.assertLessEqual(int(barcode_command.group(1)), 40)
                self.assertGreaterEqual(int(barcode_command.group(2)), 220)
                self.assertLessEqual(int(barcode_command.group(4)), 2)
                self.assertLessEqual(int(barcode_command.group(5)), 2)

                text_commands = self._tspl_text_commands(tspl)
                self.assertTrue(text_commands)
                for command in text_commands:
                    self.assertLessEqual(
                        self._tspl_text_right_edge(command),
                        456,
                        f"{short_title} text clips right boundary: {command}",
                    )

                identity_commands = [
                    command
                    for command in text_commands
                    if any(token in command["text"] for token in ("Display:", "SDO:", "MCode:", "Machine:", "Enc:", "Encoded:", "Code:"))
                ]
                self.assertTrue(identity_commands)
                if template_code == "store_dispatch_60x40":
                    self.assertTrue(any(command["text"].startswith("SDO:") for command in identity_commands))
                else:
                    self.assertTrue(any(command["text"].startswith("Display:") for command in identity_commands))
                self.assertTrue(any(machine_code in command["text"] for command in identity_commands))
                for command in identity_commands:
                    self.assertLessEqual(command["x"], 40, f"{short_title} identity text should start near the left edge: {command}")
                    self.assertLessEqual(
                        self._tspl_text_right_edge(command),
                        340,
                        f"{short_title} identity text should stay compact: {command}",
                    )

    def test_tspl_sdb_and_lpk_labels_prioritize_subcategory_and_pick_summary(self):
        sdb_payload = {
            "display_code": "SDB260429AAB",
            "machine_code": "2260429001",
            "barcode_value": "2260429001",
            "template_code": "store_prep_bale_60x40",
            "category_main": "dress",
            "category_sub": "long dress",
            "qty": 120,
            "grade": "A",
            "store": "UTAWALA",
            "source_reference": "RB260429XYZ",
        }
        sdb_tspl = agent._build_tspl_60x40_label(sdb_payload, copies=1)

        self.assertIn("SDB / PREP", sdb_tspl)
        self.assertIn("Store: UTAWALA", sdb_tspl)
        self.assertIn("Cat: dress/long dress", sdb_tspl)
        self.assertIn("Qty: 120", sdb_tspl)
        self.assertIn("Grade: A", sdb_tspl)
        self.assertIn("Display: SDB260429AAB", sdb_tspl)
        self.assertIn("Enc: 2260429001", sdb_tspl)
        self.assertIn('"2260429001"', sdb_tspl)
        self.assertNotIn('"SDB260429AAB"', sdb_tspl.split("BARCODE", 1)[1])

        lpk_payload = {
            "display_code": "LPK260429001",
            "machine_code": "3260429001",
            "barcode_value": "3260429001",
            "template_code": "store_loose_pick_60x40",
            "transfer_order_no": "TO-001",
            "store": "UTAWALA",
            "picked_item_summary": "dress/long dress x80; tops/lady tops x40; +1 more",
            "shortage_summary": "dress/short dress x20",
        }
        lpk_tspl = agent._build_tspl_60x40_label(lpk_payload, copies=1)

        self.assertIn("LPK / PICK", lpk_tspl)
        self.assertIn("Store: UTAWALA", lpk_tspl)
        self.assertIn("Pick1: dress/long dress x80", lpk_tspl)
        self.assertIn("Pick2: tops/lady tops x40 +1 more", lpk_tspl)
        self.assertIn("Short: dress/short dress x20", lpk_tspl)
        self.assertIn("Display: LPK260429001", lpk_tspl)
        self.assertIn("Enc: 3260429001", lpk_tspl)
        self.assertIn('"3260429001"', lpk_tspl)
        self.assertNotIn('"LPK260429001"', lpk_tspl.split("BARCODE", 1)[1])

    def test_sdo_tspl_matches_preview_identity_layout_without_long_packing_text(self):
        payload = {
            "display_code": "SDO260503004",
            "machine_code": "4260503004",
            "barcode_value": "4260503004",
            "template_code": "store_dispatch_60x40",
            "template_scope": "warehouseout_bale",
            "store": "UTAWALA",
            "request": "TO-20260503-016",
            "serial_no": 1,
            "total_packages": 2,
            "package_count": 2,
            "source_package_summary": "SDB260503AAG, LPK260503001",
            "packing_list": "pants / jeans pant · 100 件\n来源 bales: SDB260503AAG, LPK260503001",
        }

        tspl = agent._build_tspl_60x40_label(payload, copies=1)
        barcode_lines = "\n".join(line for line in tspl.splitlines() if line.startswith("BARCODE"))

        self.assertIn("SDO / DELIVERY", tspl)
        self.assertIn("Store: UTAWALA", tspl)
        self.assertIn("Req: TO-20260503-016", tspl)
        self.assertIn("Package: 1/2", tspl)
        self.assertIn("SDO: SDO260503004", tspl)
        self.assertIn("MCode: 4260503004", tspl)
        self.assertIn("PACKING", tspl)
        self.assertIn("SDB: 1", tspl)
        self.assertIn("LPK: 1", tspl)
        self.assertEqual(self._tspl_barcode_values(tspl), ["4260503004"])
        self.assertIn('"4260503004"', barcode_lines)
        self.assertNotIn('"SDO260503004"', barcode_lines)
        self.assertNotIn('"SDB260503AAG"', barcode_lines)
        self.assertNotIn('"2260503006"', barcode_lines)
        self.assertNotIn("Pkg:", tspl)
        self.assertNotIn("Pack:", tspl)
        self.assertNotIn("????", tspl)
        self.assertNotIn("pants / jeans pant", tspl)
        self.assertNotIn("来源", tspl)

    def test_sdo_package_tspl_uses_package_machine_code_and_compact_layout(self):
        payload = {
            "entity_type": "STORE_DELIVERY_PACKAGE",
            "display_code": "SDP261240003",
            "machine_code": "6261240003",
            "barcode_value": "6261240003",
            "template_code": "store_dispatch_60x40",
            "template_scope": "warehouseout_bale",
            "parent_sdo_display_code": "SDO260429001",
            "parent_sdo_machine_code": "4260429001",
            "store_code": "UTAWALA",
            "package_no": 1,
            "package_total": 2,
            "source_type": "SDB",
            "source_code": "SDB-TO202604-001",
            "source_machine_code": "2260429001",
            "item_count": 120,
            "content_summary": "tops / lady tops",
        }

        normalized, error = agent._normalize_print_label_request(
            {
                "printer_name": "Deli DL-720C",
                "template_code": "store_dispatch_60x40",
                "template_scope": "warehouseout_bale",
                "label_payload": payload,
            }
        )
        self.assertIsNone(error)
        self.assertEqual(normalized["barcode_value"], "6261240003")

        tspl = agent._build_tspl_60x40_label(normalized["label_payload"], copies=1)
        barcode_lines = "\n".join(line for line in tspl.splitlines() if line.startswith("BARCODE"))

        self.assertIn("SDO / DELIVERY", tspl)
        self.assertIn("UTAWALA - Pkg 1/2", tspl)
        self.assertIn("SDP261240003", tspl)
        self.assertIn("SDB-TO202604-001", tspl)
        self.assertIn("120 pcs", tspl)
        self.assertEqual(self._tspl_barcode_values(tspl), ["6261240003"])
        self.assertIn('"6261240003"', barcode_lines)
        self.assertNotIn('"4260429001"', barcode_lines)
        self.assertNotIn('"2260429001"', barcode_lines)
        self.assertNotIn('"SDP261240003"', barcode_lines)
        self.assertNotIn("Pkg:", tspl)
        self.assertNotIn("Pack:", tspl)
        self.assertNotIn("????", tspl)

    def test_sdb_lpk_tspl_text_stays_clear_of_barcode_area(self):
        cases = [
            (
                "SDB",
                {
                    "display_code": "SDB260429AAB",
                    "machine_code": "2260429001",
                    "barcode_value": "2260429001",
                    "template_code": "store_prep_bale_60x40",
                    "category_main": "dress",
                    "category_sub": "long dress",
                    "qty": 120,
                    "grade": "A",
                    "store": "UTAWALA",
                    "source_reference": "RB260429XYZ",
                },
                "2260429001",
                "SDB260429AAB",
            ),
            (
                "LPK",
                {
                    "display_code": "LPK260429001",
                    "machine_code": "3260429001",
                    "barcode_value": "3260429001",
                    "template_code": "store_loose_pick_60x40",
                    "transfer_order_no": "TO-001",
                    "store": "UTAWALA",
                    "picked_item_summary": "dress/long dress x80; tops/lady tops x40; kids/skirt x10",
                    "shortage_summary": "dress/short dress x20; shoes/sneaker x5",
                },
                "3260429001",
                "LPK260429001",
            ),
        ]

        for label_type, payload, machine_code, display_code in cases:
            with self.subTest(label_type=label_type):
                tspl = agent._build_tspl_60x40_label(payload, copies=1)
                text_y_values = self._tspl_text_y_values(tspl)
                barcode_values = self._tspl_barcode_values(tspl)

                self.assertTrue(text_y_values)
                self.assertLessEqual(max(text_y_values), 198)
                self.assertNotIn(210, text_y_values)
                self.assertNotIn("BAR 20,126,436,3", tspl)
                self.assertEqual(barcode_values, [machine_code])
                self.assertRegex(machine_code, r"^[1-5]\d{9}$")
                self.assertNotIn(f'"{display_code}"', "\n".join(line for line in tspl.splitlines() if line.startswith("BARCODE")))

        sdb_tspl = agent._build_tspl_60x40_label(cases[0][1], copies=1)
        self.assertIn("Cat: dress/long dress", sdb_tspl)

        lpk_tspl = agent._build_tspl_60x40_label(cases[1][1], copies=1)
        self.assertIn("Pick1: dress/long dress x80", lpk_tspl)
        self.assertIn("Pick2: tops/lady tops x40 +1 more", lpk_tspl)
        self.assertIn("Short: dress/short dress x20", lpk_tspl)

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
            patch.object(agent, "_resolve_available_printer_name_windows", return_value=("Deli DL-720C", None, None)), \
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

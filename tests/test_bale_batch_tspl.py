import sys
import unittest
import re
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

sys.path.insert(0, "/Users/ericye/Desktop/AI自动化/retail_ops_system/backend")

from app.api.routes import (
    _build_bale_template_content_map,
    _build_print_debug_snapshot,
    _build_candidate_lab_tspl_payload,
    _derive_bale_label_display_parts,
    _merge_print_payload_with_template,
    _build_tspl_barcode_batch_payload,
    _build_tspl_barcode_payload,
    _fit_text_component_font_size,
    _resolve_printer_destination,
)
from app.core.config import settings
from app.schemas.printing import LabelCandidatePrintRequest


class BaleBatchTsplTest(unittest.TestCase):
    def test_resolve_printer_destination_prefers_system_queue_name(self):
        resolved = _resolve_printer_destination(
            {"name": "Deli_DL_720C", "uri": "usb://Deli/DL-720C"},
            "Deli DL-720C",
        )

        self.assertEqual(resolved, "Deli_DL_720C")

    def test_build_candidate_lab_tspl_payload_supports_top_text_lower_left_barcode_and_right_code(self):
        raw_tspl = _build_candidate_lab_tspl_payload(
            {
                "width_mm": 60,
                "height_mm": 40,
                "blocks": [
                    {"type": "text", "value": "YCUXUR", "x_mm": 3.0, "y_mm": 2.0, "w_mm": 54.0, "h_mm": 5.2, "font_size": 12, "font_weight": "700", "align": "left"},
                    {"type": "text", "value": "WINTER+", "x_mm": 3.0, "y_mm": 7.8, "w_mm": 54.0, "h_mm": 5.6, "font_size": 11, "font_weight": "700", "align": "left"},
                    {"type": "text", "value": "light knit / top", "x_mm": 3.0, "y_mm": 13.8, "w_mm": 54.0, "h_mm": 3.6, "font_size": 6.2, "font_weight": "400", "align": "left"},
                    {"type": "barcode", "value": "RB042220000001", "x_mm": 3.0, "y_mm": 21.0, "w_mm": 25.5, "h_mm": 10.5},
                    {"type": "text", "value": "inbound W-A1\nstore UTAWALA\n2026-04-22 09:40", "x_mm": 3.0, "y_mm": 31.8, "w_mm": 25.5, "h_mm": 6.0, "font_size": 5.8, "font_weight": "400", "align": "left"},
                    {"type": "text", "value": "RB042220000001", "x_mm": 31.2, "y_mm": 21.0, "w_mm": 25.8, "h_mm": 13.5, "font_size": 10.5, "font_weight": "700", "align": "center"},
                    {"type": "line", "x_mm": 28.0, "y_mm": 19.8, "w_mm": 0.22, "h_mm": 15.8},
                ],
            }
        )

        self.assertIn(b'BARCODE ', raw_tspl)
        self.assertIn(b'"RB042220000001"', raw_tspl)
        self.assertIn(b'BITMAP ', raw_tspl)
        self.assertIn(b'BAR ', raw_tspl)
        self.assertNotIn(b'TEXT ', raw_tspl)
        bitmap_start = raw_tspl.index(b"BITMAP ")
        payload_start = raw_tspl.index(b",0,", bitmap_start) + 3
        self.assertEqual(
            raw_tspl[payload_start:payload_start + 8],
            b"\xff" * 8,
            "bitmap text should keep blank background white instead of printing a solid black block",
        )

    def test_build_candidate_lab_tspl_payload_supports_qr_blocks_for_warehouseout_labels(self):
        raw_tspl = _build_candidate_lab_tspl_payload(
            {
                "width_mm": 60,
                "height_mm": 40,
                "blocks": [
                    {"type": "qr", "value": "dispatch_bale=WOB240423018|store=UTAWALA|qty=24|out=2026-04-23 10:30|machine=MCH-07", "x_mm": 2.4, "y_mm": 3.0, "w_mm": 23.0, "h_mm": 23.0},
                    {"type": "text", "value": "UTAWALA", "x_mm": 28.6, "y_mm": 4.6, "w_mm": 28.0, "h_mm": 7.2, "font_size": 17, "font_weight": "700", "align": "left"},
                ],
            }
        )

        self.assertIn(b"QRCODE ", raw_tspl)
        self.assertIn(b'"dispatch_bale=WOB240423018|store=UTAWALA|qty=24|out=2026-04-23 10:30|machine=MCH-07"', raw_tspl)
        self.assertNotIn(b"BARCODE ", raw_tspl)
        self.assertIn(b"BITMAP ", raw_tspl)

    def test_candidate_print_request_accepts_sub_1mm_divider_blocks(self):
        payload = LabelCandidatePrintRequest.model_validate(
            {
                "candidate_id": "warehouse_bale__wb_supplier_focus",
                "printer_name": "Deli DL-720C",
                "width_mm": 60,
                "height_mm": 40,
                "label_size": "60x40",
                "blocks": [
                    {"type": "line", "x_mm": 38.6, "y_mm": 0.0, "w_mm": 0.88, "h_mm": 12.6},
                ],
            }
        )

        self.assertEqual(len(payload.blocks), 1)
        self.assertAlmostEqual(payload.blocks[0].w_mm, 0.88, places=2)

    def test_build_tspl_barcode_batch_payload_keeps_label_order(self):
        jobs = [
            {"label_size": "60x40"},
            {"label_size": "60x40"},
        ]
        payloads = [
            {
                "barcode_value": "BALE-BL-20260421-YOUXUNDE-SUMMERAP-007-001",
                "supplier_name": "Youxun Demo",
                "category_display": "dress / short dress",
                "package_position_label": "第 1 包 / 共 5 包",
                "serial_no": 1,
                "total_packages": 5,
            },
            {
                "barcode_value": "BALE-BL-20260421-YOUXUNDE-SUMMERAP-007-002",
                "supplier_name": "Youxun Demo",
                "category_display": "dress / short dress",
                "package_position_label": "第 2 包 / 共 5 包",
                "serial_no": 2,
                "total_packages": 5,
            },
        ]

        raw_tspl = _build_tspl_barcode_batch_payload(jobs, payloads)
        raw_tspl_text = raw_tspl.decode("latin-1")

        self.assertEqual(raw_tspl_text.count("PRINT 1,1"), 2)
        self.assertIn("BALE-BL-20260421-YOUXUNDE-SUMMERAP-007-001", raw_tspl_text)
        self.assertIn("BALE-BL-20260421-YOUXUNDE-SUMMERAP-007-002", raw_tspl_text)
        self.assertLess(
            raw_tspl_text.index("BALE-BL-20260421-YOUXUNDE-SUMMERAP-007-001"),
            raw_tspl_text.index("BALE-BL-20260421-YOUXUNDE-SUMMERAP-007-002"),
        )

    def test_build_tspl_barcode_batch_payload_uses_short_scan_token_for_code128(self):
        jobs = [{"label_size": "60x40"}]
        payloads = [
            {
                "barcode_value": "RB260421000001",
                "bale_barcode": "RB260421000001",
                "legacy_bale_barcode": "BALE-BL-20260421-YOUXUNDE-SUMMERAP-007-001",
                "scan_token": "RB260421000001",
                "supplier_name": "Youxun Demo",
                "category_display": "dress / short dress",
                "package_position_label": "第 1 包 / 共 5 包",
                "serial_no": 1,
                "total_packages": 5,
            },
        ]

        raw_tspl = _build_tspl_barcode_batch_payload(jobs, payloads)
        raw_tspl_text = raw_tspl.decode("latin-1")

        self.assertIn('"128",', raw_tspl_text)
        self.assertIn('"RB260421000001"', raw_tspl_text)
        self.assertIn("007-001", raw_tspl_text)
        self.assertNotIn('"BALE-BL-20260421-YOUXUNDE-SUMMERAP-007-001"', raw_tspl_text)
        self.assertIn(',1,2,"RB260421000001"', raw_tspl_text)

    def test_build_tspl_barcode_payload_does_not_home_before_single_print(self):
        raw_tspl = _build_tspl_barcode_payload(
            {"label_size": "60x40"},
            {
                "barcode_value": "RB042020000001",
                "scan_token": "RB042020000001",
                "bale_barcode": "RB042020000001",
                "supplier_name": "youxun",
                "category_display": "summer+ / summer+",
                "package_position_label": "第 1 包 / 共 3 包",
                "serial_no": 1,
                "total_packages": 3,
            },
        )
        raw_tspl_text = raw_tspl.decode("latin-1")

        self.assertIn("REFERENCE 0,0\r\nSET PEEL OFF\r\nSET TEAR OFF\r\nCLS\r\n", raw_tspl_text)
        self.assertNotIn("\r\nHOME\r\n", raw_tspl_text)

    def test_build_tspl_barcode_payload_uses_crlf_command_endings(self):
        raw_tspl = _build_tspl_barcode_payload(
            {"label_size": "60x40"},
            {
                "barcode_value": "RB042020000001",
                "scan_token": "RB042020000001",
                "bale_barcode": "RB042020000001",
                "supplier_name": "youxun",
                "category_display": "summer+ / summer+",
                "package_position_label": "第 1 包 / 共 3 包",
                "serial_no": 1,
                "total_packages": 3,
            },
        )

        self.assertIn(b"SIZE 60 mm,40 mm\r\n", raw_tspl)
        self.assertIn(b"REFERENCE 0,0\r\nSET PEEL OFF\r\nSET TEAR OFF\r\nCLS\r\n", raw_tspl)
        self.assertNotIn(b"\r\nHOME\r\n", raw_tspl)
        self.assertIn(b'PRINT 1,1\r\n', raw_tspl)
        self.assertNotIn(b"SIZE 60 mm,40 mm\n", raw_tspl)

    def test_build_tspl_barcode_batch_payload_does_not_home_in_batch(self):
        jobs = [
            {"label_size": "60x40"},
            {"label_size": "60x40"},
        ]
        payloads = [
            {
                "barcode_value": "RB260421000001",
                "scan_token": "RB260421000001",
                "bale_barcode": "RB260421000001",
                "supplier_name": "Youxun Demo",
                "category_display": "dress / short dress",
                "package_position_label": "第 1 包 / 共 2 包",
                "serial_no": 1,
                "total_packages": 2,
            },
            {
                "barcode_value": "RB260421000002",
                "scan_token": "RB260421000002",
                "bale_barcode": "RB260421000002",
                "supplier_name": "Youxun Demo",
                "category_display": "dress / short dress",
                "package_position_label": "第 2 包 / 共 2 包",
                "serial_no": 2,
                "total_packages": 2,
            },
        ]

        raw_tspl = _build_tspl_barcode_batch_payload(jobs, payloads)
        raw_tspl_text = raw_tspl.decode("latin-1")

        self.assertEqual(raw_tspl_text.count("\r\nHOME\r\n"), 0)
        self.assertIn("REFERENCE 0,0\r\nSET PEEL OFF\r\nSET TEAR OFF\r\nCLS\r\n", raw_tspl_text)
        self.assertIn("PRINT 1,1\r\nSIZE 60 mm,40 mm\r\nGAP 2 mm,0 mm\r\nDENSITY 8\r\nSPEED 4\r\nDIRECTION 1\r\nREFERENCE 0,0\r\nSET PEEL OFF\r\nSET TEAR OFF\r\nCLS\r\n", raw_tspl_text)

    def test_build_tspl_barcode_batch_payload_uses_crlf_between_labels(self):
        jobs = [
            {"label_size": "60x40"},
            {"label_size": "60x40"},
        ]
        payloads = [
            {
                "barcode_value": "RB260421000001",
                "scan_token": "RB260421000001",
                "bale_barcode": "RB260421000001",
                "supplier_name": "Youxun Demo",
                "category_display": "dress / short dress",
                "package_position_label": "第 1 包 / 共 2 包",
                "serial_no": 1,
                "total_packages": 2,
            },
            {
                "barcode_value": "RB260421000002",
                "scan_token": "RB260421000002",
                "bale_barcode": "RB260421000002",
                "supplier_name": "Youxun Demo",
                "category_display": "dress / short dress",
                "package_position_label": "第 2 包 / 共 2 包",
                "serial_no": 2,
                "total_packages": 2,
            },
        ]

        raw_tspl = _build_tspl_barcode_batch_payload(jobs, payloads)

        self.assertIn(b'PRINT 1,1\r\nSIZE 60 mm,40 mm\r\n', raw_tspl)
        self.assertNotIn(b'PRINT 1,1\nSIZE 60 mm,40 mm\n', raw_tspl)

    def test_fit_text_component_font_size_shrinks_long_copy_inside_small_box(self):
        fitted = _fit_text_component_font_size(
            {
                "id": "headline",
                "font_size": 9,
                "font_weight": "700",
                "w_mm": 18,
                "h_mm": 4.6,
            },
            "Youxun Demo Dress Short Dress 1 / 5",
        )

        self.assertLess(fitted, 9)
        self.assertGreaterEqual(fitted, 5)

    def test_build_tspl_barcode_payload_keeps_60x40_barcode_origin_near_left_quiet_zone(self):
        raw_tspl = _build_tspl_barcode_payload(
            {"label_size": "60x40"},
            {
                "barcode_value": "RB042020000001",
                "scan_token": "RB042020000001",
                "bale_barcode": "RB042020000001",
                "legacy_bale_barcode": "BALE-BL-20260422-YOUXUN-SUMMER-001-001",
                "supplier_name": "youxun",
                "category_display": "summer+ / summer+",
                "package_position_label": "第 1 包 / 共 3 包",
                "serial_no": 1,
                "total_packages": 3,
                "layout": {
                    "paper_preset": "60x40",
                    "components": [
                        {"id": "headline", "label": "顶部关键信息", "type": "text", "enabled": True, "x_mm": 3.6, "y_mm": 2.4, "w_mm": 52.8, "h_mm": 6.8, "font_size": 8.8, "font_weight": "700", "align": "left", "content_source": "supplier_package"},
                        {"id": "barcode", "label": "中间 Code128 条码", "type": "barcode", "enabled": True, "x_mm": 3.6, "y_mm": 10.8, "w_mm": 52.8, "h_mm": 15.0, "font_size": 0, "font_weight": "400", "align": "center", "content_source": "scan_token"},
                        {"id": "scan_token", "label": "短码文本", "type": "text", "enabled": True, "x_mm": 3.6, "y_mm": 27.4, "w_mm": 52.8, "h_mm": 4.8, "font_size": 6.8, "font_weight": "700", "align": "center", "content_source": "scan_token"},
                    ],
                },
            },
        )
        raw_tspl_text = raw_tspl.decode("latin-1")

        match = re.search(r'BARCODE (\d+),86,"128",120,0,0,1,2,"RB042020000001"', raw_tspl_text)

        self.assertIsNotNone(match)
        self.assertLessEqual(int(match.group(1)), 60)

    def test_build_tspl_barcode_payload_supports_bitmap_text_and_dividers_for_warehouse_in_template(self):
        payload = {
            "barcode_value": "RB042220000003",
            "scan_token": "RB042220000003",
            "bale_barcode": "RB042220000003",
            "legacy_bale_barcode": "BALE-BL-20260422-YCUXUR-001-003",
            "supplier_name": "YCUXUR",
            "category_main": "COATS",
            "category_sub": "short dress / mixed",
            "category_display": "COATS / short dress / mixed",
            "package_position_label": "第 3 包 / 共 5 包",
            "serial_no": 3,
            "total_packages": 5,
            "shipment_no": "1-04052026",
            "parcel_batch_no": "BL-20260422-YCUXUR-001",
            "unload_date": "2026-04-22T09:42",
            "layout": {
                "paper_preset": "60x40",
                "components": [
                    {"id": "warehouse_in_top_supplier", "type": "text", "enabled": True, "x_mm": 2.4, "y_mm": 0.0, "w_mm": 34.2, "h_mm": 5.6, "font_size": 13.4, "font_weight": "700", "align": "left", "content_source": "top_supplier", "render_mode": "bitmap"},
                    {"id": "warehouse_in_top_major", "type": "text", "enabled": True, "x_mm": 2.4, "y_mm": 4.8, "w_mm": 34.2, "h_mm": 5.2, "font_size": 12.2, "font_weight": "700", "align": "left", "content_source": "top_major", "render_mode": "bitmap"},
                    {"id": "warehouse_in_top_minor", "type": "text", "enabled": True, "x_mm": 2.4, "y_mm": 9.6, "w_mm": 34.2, "h_mm": 4.6, "font_size": 10.0, "font_weight": "700", "align": "left", "content_source": "top_minor", "render_mode": "bitmap"},
                    {"id": "warehouse_in_piece_current", "type": "text", "enabled": True, "x_mm": 40.8, "y_mm": 0.0, "w_mm": 17.2, "h_mm": 6.0, "font_size": 12.2, "font_weight": "700", "align": "center", "content_source": "piece_current", "render_mode": "bitmap"},
                    {"id": "warehouse_in_piece_total", "type": "text", "enabled": True, "x_mm": 40.8, "y_mm": 5.6, "w_mm": 17.2, "h_mm": 6.0, "font_size": 12.2, "font_weight": "700", "align": "center", "content_source": "piece_total", "render_mode": "bitmap"},
                    {"id": "warehouse_in_top_divider", "type": "line", "enabled": True, "x_mm": 2.4, "y_mm": 16.6, "w_mm": 54.2, "h_mm": 0.88},
                    {"id": "warehouse_in_barcode", "type": "barcode", "enabled": True, "x_mm": 2.8, "y_mm": 20.0, "w_mm": 26.8, "h_mm": 15.2, "align": "center", "content_source": "scan_token"},
                    {"id": "warehouse_in_lower_vertical_divider", "type": "line", "enabled": True, "x_mm": 30.4, "y_mm": 20.0, "w_mm": 0.88, "h_mm": 16.2},
                    {"id": "warehouse_in_trace_code", "type": "text", "enabled": True, "x_mm": 31.8, "y_mm": 20.0, "w_mm": 24.8, "h_mm": 3.4, "font_size": 9.0, "font_weight": "700", "align": "left", "content_source": "trace_code", "render_mode": "bitmap"},
                    {"id": "warehouse_in_trace_batch", "type": "text", "enabled": True, "x_mm": 31.8, "y_mm": 23.9, "w_mm": 24.8, "h_mm": 3.4, "font_size": 9.0, "font_weight": "700", "align": "left", "content_source": "trace_batch", "render_mode": "bitmap"},
                    {"id": "warehouse_in_trace_shipment", "type": "text", "enabled": True, "x_mm": 31.8, "y_mm": 27.8, "w_mm": 24.8, "h_mm": 3.4, "font_size": 9.0, "font_weight": "700", "align": "left", "content_source": "trace_shipment", "render_mode": "bitmap"},
                    {"id": "warehouse_in_trace_inbound", "type": "text", "enabled": True, "x_mm": 31.8, "y_mm": 31.7, "w_mm": 24.8, "h_mm": 3.4, "font_size": 9.0, "font_weight": "700", "align": "left", "content_source": "trace_inbound", "render_mode": "bitmap"},
                    {"id": "warehouse_in_middle_divider", "type": "line", "enabled": True, "x_mm": 2.4, "y_mm": 37.1, "w_mm": 54.2, "h_mm": 0.88},
                ],
            },
        }
        display = _derive_bale_label_display_parts(payload)
        content_map = _build_bale_template_content_map(payload, display)
        raw_tspl = _build_tspl_barcode_payload({"label_size": "60x40"}, payload)
        raw_tspl_text = raw_tspl.decode("latin-1")

        self.assertIn("BARCODE ", raw_tspl_text)
        self.assertIn('"RB042220000003"', raw_tspl_text)
        self.assertIn("BITMAP ", raw_tspl_text)
        self.assertIn("\nBAR ", raw_tspl_text)
        self.assertNotIn("TEXT ", raw_tspl_text)
        barcode_match = re.search(r'BARCODE (\d+),160,"128",121,0,0,1,2,"RB042220000003"', raw_tspl_text)
        self.assertIsNotNone(barcode_match)
        self.assertGreaterEqual(int(barcode_match.group(1)), 22)
        self.assertIn("BAR 19,133", raw_tspl_text)
        self.assertIn("BAR 243,160", raw_tspl_text)
        self.assertIn("BAR 19,297", raw_tspl_text)
        self.assertEqual(content_map["trace_batch"], "Batch: 260422-001")
        self.assertEqual(content_map["trace_shipment"], "Ship: 1-04052026")
        self.assertEqual(content_map["trace_inbound"], "In: 04-22 09:42")

    def test_build_bale_template_content_map_supports_warehouseout_and_wait_fields(self):
        payload = {
            "store_name": "UTAWALA",
            "transfer_order_no": "TRF-240423-018",
            "bale_piece_summary": "Bale 2 / 5",
            "outbound_time": "2026-04-23 10:30",
            "total_quantity": "24 pcs",
            "packing_list": "COATS / long x2\nTOPS / knit x3",
            "dispatch_bale_no": "240423000018",
            "status": "wait for sale",
            "cat": "pants",
            "sub": "jeans pant",
            "grade": "A/B",
            "qty": "50",
            "weight": "18.6 KG",
            "code": "240423100018",
        }
        display = _derive_bale_label_display_parts(
            {
                "barcode_value": "240423000018",
                "scan_token": "240423000018",
                "supplier_name": "Youxun Demo",
                "category_main": "pants",
                "category_sub": "jeans pant",
                "shipment_no": "1-04052026",
                "parcel_batch_no": "BL-20260422-001",
                "received_at": "2026-04-22T09:42:00+03:00",
            }
        )

        content_map = _build_bale_template_content_map(payload, display)

        self.assertEqual(content_map["store_name"], "UTAWALA")
        self.assertEqual(content_map["transfer_order_no"], "TRF-240423-018")
        self.assertEqual(content_map["bale_piece_summary"], "Bale 2 / 5")
        self.assertEqual(content_map["total_quantity"], "Total: 24 pcs")
        self.assertEqual(content_map["dispatch_bale_no"], "240423000018")
        self.assertEqual(content_map["outbound_time"], "Out: 2026-04-23 10:30")
        self.assertEqual(content_map["status"], "STATUS: wait for sale")
        self.assertEqual(content_map["cat"], "CAT: pants")
        self.assertEqual(content_map["sub"], "SUB: jeans pant")
        self.assertEqual(content_map["grade"], "GRADE: A/B")
        self.assertEqual(content_map["qty"], "QTY: 50")
        self.assertEqual(content_map["weight"], "WEIGHT: 18.6 KG")
        self.assertEqual(content_map["code"], "CODE: 240423100018")

    def test_merge_print_payload_with_template_keeps_warehouseout_scope_for_wait_templates(self):
        payload = _merge_print_payload_with_template(
            {
                "job_type": "bale_barcode_label",
                "label_size": "60x40",
                "print_payload": {
                    "template_code": "wait_for_transtoshop",
                    "template_scope": "warehouseout_bale",
                    "barcode_value": "240423000018",
                    "dispatch_bale_no": "240423000018",
                    "status": "wait for transtoshop",
                    "cat": "pants",
                    "sub": "jeans pant",
                    "grade": "P",
                    "qty": "50",
                    "code": "240423000018",
                },
            }
        )

        self.assertEqual(payload["template_code"], "wait_for_transtoshop")
        self.assertEqual(payload["template_scope"], "warehouseout_bale")
        self.assertEqual(payload["paper_preset"], "60x40")
        self.assertEqual(payload["status"], "wait for transtoshop")
        self.assertEqual(payload["dispatch_bale_no"], "240423000018")

    def test_build_tspl_barcode_payload_supports_product_template_fields_for_department_retail(self):
        payload = {
            "template_scope": "product",
            "template_code": "department_retail",
            "price": "KES 590",
            "product_name": "wire basket",
            "short_suffix": "B12",
            "barcode_value": "420300000018",
            "human_readable": "420300000018",
            "layout": {
                "paper_preset": "40x30",
                "components": [
                    {"id": "department_retail_price", "type": "text", "enabled": True, "x_mm": 1.4, "y_mm": 1.2, "w_mm": 22.6, "h_mm": 8.8, "font_size": 30.0, "font_weight": "700", "align": "left", "content_source": "price", "render_mode": "bitmap"},
                    {"id": "department_retail_short_suffix", "type": "text", "enabled": True, "x_mm": 27.4, "y_mm": 1.8, "w_mm": 10.6, "h_mm": 4.6, "font_size": 13.0, "font_weight": "700", "align": "center", "content_source": "short_suffix", "render_mode": "bitmap"},
                    {"id": "department_retail_product_name", "type": "text", "enabled": True, "x_mm": 1.4, "y_mm": 10.8, "w_mm": 36.0, "h_mm": 5.0, "font_size": 14.0, "font_weight": "700", "align": "left", "content_source": "product_name", "render_mode": "bitmap"},
                    {"id": "department_retail_divider", "type": "line", "enabled": True, "x_mm": 1.4, "y_mm": 16.8, "w_mm": 36.6, "h_mm": 0.6},
                    {"id": "department_retail_barcode", "type": "barcode", "enabled": True, "x_mm": 1.2, "y_mm": 18.0, "w_mm": 37.0, "h_mm": 8.8, "align": "center", "content_source": "barcode_value"},
                    {"id": "department_retail_barcode_text", "type": "text", "enabled": True, "x_mm": 1.4, "y_mm": 27.2, "w_mm": 28.0, "h_mm": 2.2, "font_size": 9.0, "font_weight": "700", "align": "left", "content_source": "barcode_value", "render_mode": "bitmap"},
                ],
            },
        }

        raw_tspl = _build_tspl_barcode_payload({"job_type": "barcode_label", "label_size": "40x30"}, payload)
        raw_tspl_text = raw_tspl.decode("latin-1")

        self.assertIn('SIZE 40 mm,30 mm', raw_tspl_text)
        self.assertIn('"420300000018"', raw_tspl_text)
        self.assertIn("BARCODE ", raw_tspl_text)
        self.assertIn("BITMAP ", raw_tspl_text)
        self.assertIn("\r\nBAR ", raw_tspl_text)

    def test_build_print_debug_snapshot_writes_exact_tspl_and_latest_files(self):
        with TemporaryDirectory() as temp_dir:
            payload = b'SIZE 60 mm,40 mm\r\nBARCODE 32,160,"128",121,0,0,1,2,"RB042120000001"\r\nPRINT 1,1\r\n'
            with patch.object(settings, "data_dir", Path(temp_dir)):
                metadata = _build_print_debug_snapshot(
                    "Deli_DL_720C",
                    payload,
                    copies=1,
                )

            tspl_path = Path(metadata["tspl_path"])
            latest_tspl_path = Path(metadata["latest_tspl_path"])
            meta_path = Path(str(tspl_path).replace(".tspl", ".json"))
            latest_meta_path = latest_tspl_path.with_suffix(".json")

            self.assertTrue(tspl_path.exists())
            self.assertTrue(latest_tspl_path.exists())
            self.assertTrue(meta_path.exists())
            self.assertTrue(latest_meta_path.exists())
            self.assertEqual(tspl_path.read_bytes(), payload)
            self.assertEqual(latest_tspl_path.read_bytes(), payload)
            self.assertIn("payload_sha256", meta_path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()

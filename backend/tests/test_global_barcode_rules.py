import re
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, "/Users/ericye/Desktop/AI自动化/retail_ops_system/backend")

from app.core.config import settings
from app.core.state import InMemoryState


class GlobalBarcodeRulesTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_state_file = settings.state_file
        settings.state_file = Path(self.temp_dir.name) / "runtime_state.json"
        self.state = InMemoryState()

    def tearDown(self):
        settings.state_file = self.original_state_file
        self.temp_dir.cleanup()

    def _prepare_sorting_flow(self, customs_notice_no="BCRULE260425", qty=2):
        self.state.upsert_apparel_default_cost(
            {
                "category_main": "dress",
                "category_sub": "ladies dress",
                "grade": "P",
                "default_cost_kes": 80,
                "note": "barcode rules test",
            },
            "warehouse_supervisor_1",
        )
        self.state.upsert_apparel_sorting_rack(
            {
                "category_main": "dress",
                "category_sub": "ladies dress",
                "grade": "P",
                "default_cost_kes": 80,
                "rack_code": "DR-P-01",
                "note": "barcode rules test",
            },
            "warehouse_supervisor_1",
        )
        shipment = self.state.create_inbound_shipment(
            {
                "shipment_type": "sea",
                "customs_notice_no": customs_notice_no,
                "unload_date": "2026-04-25",
                "coc_goods_manifest": "barcode rules test",
                "note": "",
                "coc_documents": [],
            }
        )
        self.state.create_parcel_batch(
            {
                "intake_type": "sea_freight",
                "inbound_shipment_no": shipment["shipment_no"],
                "supplier_name": "Barcode Rules Supplier",
                "cargo_type": "apparel",
                "category_main": "dress",
                "category_sub": "ladies dress",
                "package_count": 1,
                "total_weight": 40,
                "received_by": "warehouse_clerk_1",
                "note": "",
            }
        )
        self.state.confirm_inbound_shipment_intake(
            shipment["shipment_no"],
            {
                "declared_total_packages": 1,
                "confirmed_by": "warehouse_supervisor_1",
                "note": "",
            },
        )
        raw_bale = self.state.generate_bale_barcodes(shipment["shipment_no"], "warehouse_supervisor_1")[0]
        task = self.state.create_sorting_task(
            {
                "bale_barcodes": [raw_bale["bale_barcode"]],
                "handler_names": ["warehouse_clerk_1"],
                "note": "",
                "created_by": "warehouse_supervisor_1",
            }
        )
        self.state.submit_sorting_task_results(
            task["task_no"],
            {
                "result_items": [
                    {
                        "category_name": "dress / ladies dress",
                        "grade": "P",
                        "qty": qty,
                        "confirm_to_inventory": True,
                    }
                ],
                "note": "",
                "created_by": "warehouse_supervisor_1",
            },
        )
        return shipment, raw_bale, task

    def test_new_raw_bale_scan_token_uses_alpha_serial(self):
        shipment, raw_bale, _ = self._prepare_sorting_flow()

        self.assertEqual(raw_bale["scan_token"], "RB260425AAAAB")
        self.assertEqual(raw_bale["bale_barcode"], raw_bale["scan_token"])
        self.assertRegex(raw_bale["scan_token"], r"^RB\d{6}[A-Z]{5}$")
        self.assertNotRegex(raw_bale["scan_token"], r"\d$")

        resolved = self.state.resolve_barcode(raw_bale["scan_token"], context="warehouse_sorting_create")
        self.assertEqual(resolved["barcode_type"], "RAW_BALE")
        self.assertEqual(resolved["object_type"], "raw_bale")
        self.assertEqual(resolved["object_id"], raw_bale["bale_barcode"])
        self.assertEqual(resolved["template_scope"], "bale")
        self.assertEqual(resolved["reject_reason"], "")

        pos_result = self.state.resolve_barcode(raw_bale["scan_token"], context="pos")
        self.assertEqual(pos_result["barcode_type"], "RAW_BALE")
        self.assertIn("POS", pos_result["reject_reason"])

    def test_new_dispatch_bale_uses_alpha_serial_and_is_not_pos_sellable(self):
        self._prepare_sorting_flow()
        dispatch_bale = self.state.list_store_dispatch_bales()[0]

        self.assertRegex(dispatch_bale["bale_no"], r"^SDB\d{6}[A-Z]{3}$")
        self.assertNotRegex(dispatch_bale["bale_no"], r"\d$")

        resolved = self.state.resolve_barcode(dispatch_bale["bale_no"], context="store_receiving")
        self.assertEqual(resolved["barcode_type"], "DISPATCH_BALE")
        self.assertEqual(resolved["object_type"], "dispatch_bale")
        self.assertEqual(resolved["object_id"], dispatch_bale["bale_no"])
        self.assertEqual(resolved["template_scope"], "warehouseout_bale")
        self.assertEqual(resolved["reject_reason"], "")

        pos_result = self.state.resolve_barcode(dispatch_bale["bale_no"], context="pos")
        self.assertEqual(pos_result["barcode_type"], "DISPATCH_BALE")
        self.assertIn("POS", pos_result["reject_reason"])

    def test_store_item_prints_alpha_barcode_value_and_resolves_to_identity(self):
        self._prepare_sorting_flow(qty=2)
        dispatch_bale = self.state.list_store_dispatch_bales()[0]
        self.state.accept_store_dispatch_bale(
            dispatch_bale["bale_no"],
            {"store_code": "UTAWALA", "accepted_by": "store_manager_1", "note": ""},
        )
        self.state.assign_store_dispatch_bale(
            dispatch_bale["bale_no"],
            {"employee_name": "store_clerk_1", "assigned_by": "store_manager_1", "note": ""},
        )
        token = self.state.get_store_dispatch_bale_tokens(dispatch_bale["bale_no"])[0]
        self.state.update_item_barcode_token_store_edit(
            token["token_no"],
            {
                "store_code": "UTAWALA",
                "selling_price_kes": 500,
                "store_rack_code": "A-01",
                "updated_by": "store_clerk_1",
                "note": "",
            },
        )

        jobs = self.state.queue_item_barcode_token_print_jobs(
            {
                "token_nos": [token["token_no"]],
                "copies": 1,
                "printer_name": "Deli DL-720C",
                "template_code": "clothes_retail",
                "requested_by": "store_clerk_1",
            }
        )
        barcode_value = jobs[0]["print_payload"]["barcode_value"]

        self.assertRegex(barcode_value, r"^IT\d{6}[A-Z]{6}$")
        self.assertNotRegex(barcode_value, r"\d$")
        self.assertNotEqual(barcode_value, token["token_no"])
        self.assertEqual(jobs[0]["barcode"], token["token_no"])

        self.state.mark_print_job_printed(jobs[0]["id"], "store_clerk_1")
        printed_token = self.state.item_barcode_tokens[token["token_no"]]
        self.assertEqual(printed_token["barcode_value"], barcode_value)
        self.assertEqual(printed_token["final_item_barcode"]["barcode_value"], barcode_value)
        self.assertEqual(printed_token["final_item_barcode"]["identity_id"], token["token_no"])

        resolved = self.state.resolve_barcode(barcode_value, context="pos")
        self.assertEqual(resolved["barcode_type"], "STORE_ITEM")
        self.assertEqual(resolved["object_type"], "store_item")
        self.assertEqual(resolved["object_id"], token["token_no"])
        self.assertEqual(resolved["identity_id"], token["token_no"])
        self.assertEqual(resolved["template_scope"], "product")
        self.assertEqual(resolved["reject_reason"], "")

        sorting_result = self.state.resolve_barcode(barcode_value, context="warehouse_sorting_create")
        self.assertIn("仓库分拣", sorting_result["reject_reason"])

    def test_legacy_numeric_and_tok_codes_still_resolve_for_compatibility(self):
        raw_row = {
            "id": 1,
            "bale_barcode": "RB260425000001",
            "scan_token": "RB260425000001",
            "legacy_bale_barcode": "BALE-260425-001",
            "shipment_no": "SHIP-LEGACY",
            "status": "ready_for_sorting",
            "created_at": "2026-04-25T00:00:00+03:00",
            "updated_at": "2026-04-25T00:00:00+03:00",
        }
        self.state.bale_barcodes[raw_row["bale_barcode"]] = raw_row
        token = {
            "token_no": "TOK-ST20260425001-0001",
            "identity_no": "TOK-ST20260425001-0001",
            "barcode_value": "TOK-ST20260425001-0001",
            "status": "printed_in_store",
            "category_name": "legacy / item",
            "grade": "P",
            "task_no": "ST-LEGACY",
            "shipment_no": "SHIP-LEGACY",
            "customs_notice_no": "",
            "source_bale_barcodes": [],
            "source_legacy_bale_barcodes": [],
            "sku_code": "LEGACY-P",
            "rack_code": "",
            "qty_index": 1,
            "qty_total": 1,
            "token_group_no": 1,
            "store_dispatch_bale_no": "",
            "store_code": "UTAWALA",
            "assigned_employee": "",
            "created_at": "2026-04-25T00:00:00+03:00",
            "updated_at": "2026-04-25T00:00:00+03:00",
        }
        self.state.item_barcode_tokens[token["token_no"]] = token

        raw_result = self.state.resolve_barcode("BALE-260425-001", context="warehouse_sorting_create")
        self.assertEqual(raw_result["barcode_type"], "RAW_BALE")
        self.assertEqual(raw_result["object_id"], "RB260425000001")

        tok_result = self.state.resolve_barcode("TOK-ST20260425001-0001", context="pos")
        self.assertEqual(tok_result["barcode_type"], "STORE_ITEM")
        self.assertEqual(tok_result["object_id"], "TOK-ST20260425001-0001")
        self.assertEqual(tok_result["identity_id"], "TOK-ST20260425001-0001")


if __name__ == "__main__":
    unittest.main()

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

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

    def _seed_raw_bale(self):
        raw_bale = {
            "id": 1,
            "bale_barcode": "RB260425AAAAB",
            "scan_token": "RB260425AAAAB",
            "machine_code": "1260425001",
            "legacy_bale_barcode": "BALE-260425-001",
            "shipment_no": "SHIP-BCRULE-RAW",
            "status": "ready_for_sorting",
            "created_at": "2026-04-25T00:00:00+03:00",
            "updated_at": "2026-04-25T00:00:00+03:00",
        }
        self.state.bale_barcodes[raw_bale["bale_barcode"]] = raw_bale
        return raw_bale

    def _seed_dispatch_bale(self):
        dispatch_bale = {
            "bale_no": "SDB260425AAB",
            "bale_barcode": "SDB260425AAB",
            "scan_token": "SDB260425AAB",
            "machine_code": "2260425002",
            "transfer_no": "TO-20260425-001",
            "source_bales": ["SDB260425AAB"],
            "status": "ready_dispatch",
            "store_code": "UTAWALA",
            "item_count": 100,
            "token_nos": [],
        }
        self.state.store_dispatch_bales[dispatch_bale["bale_no"]] = dispatch_bale
        return dispatch_bale

    def _seed_store_item(self):
        token = {
            "token_no": "TOK-ST20260425001-0001",
            "identity_no": "TOK-ST20260425001-0001",
            "barcode_value": "5260425001",
            "final_item_barcode": {"barcode_value": "5260425001"},
            "status": "printed_in_store",
            "category_name": "dress / ladies dress",
            "grade": "P",
            "task_no": "ST-20260425-001",
            "qty_index": 1,
            "qty_total": 1,
            "token_group_no": 1,
            "store_dispatch_bale_no": "SDB260425AAB",
            "store_code": "UTAWALA",
            "assigned_employee": "store_clerk_1",
            "selling_price_kes": 500,
            "store_rack_code": "A-01",
            "created_at": "2026-04-25T00:00:00+03:00",
            "updated_at": "2026-04-25T00:00:00+03:00",
        }
        self.state.item_barcode_tokens[token["token_no"]] = token
        return token

    def _seed_sdo(self):
        order = self.state._normalize_store_delivery_execution_order(
            {
                "execution_order_no": "SDO260425001",
                "source_transfer_no": "TO-20260425-001",
                "from_warehouse_code": "WH1",
                "to_store_code": "UTAWALA",
                "packages": [{"source_type": "SDB", "source_code": "SDB260425AAB", "item_count": 100}],
                "status": "pending_print",
                "created_by": "warehouse_clerk_1",
                "created_at": "2026-04-25T00:00:00+03:00",
            }
        )
        self.state.store_delivery_execution_orders[order["execution_order_no"]] = order
        return order

    def test_raw_bale_uses_type_1_machine_code_and_context_rules(self):
        raw_bale = self._seed_raw_bale()

        self.assertRegex(raw_bale["machine_code"], r"^1\d{9}$")
        resolved = self.state.resolve_barcode(raw_bale["machine_code"], context="warehouse_sorting_create")
        self.assertEqual(resolved["barcode_type"], "RAW_BALE")
        self.assertEqual(resolved["object_type"], "raw_bale")
        self.assertEqual(resolved["object_id"], raw_bale["bale_barcode"])
        self.assertEqual(resolved["reject_reason"], "")

        self.assertTrue(self.state.resolve_barcode(raw_bale["machine_code"], context="pos")["reject_reason"])
        self.assertTrue(self.state.resolve_barcode(raw_bale["machine_code"], context="store_receiving")["reject_reason"])

    def test_sdb_dispatch_bale_is_not_store_receiving_or_pos_code(self):
        dispatch_bale = self._seed_dispatch_bale()

        self.assertRegex(dispatch_bale["machine_code"], r"^2\d{9}$")
        identity_result = self.state.resolve_barcode(dispatch_bale["machine_code"], context="identity_ledger")
        self.assertEqual(identity_result["barcode_type"], "DISPATCH_BALE")
        self.assertEqual(identity_result["reject_reason"], "")

        receiving_result = self.state.resolve_barcode(dispatch_bale["machine_code"], context="store_receiving")
        self.assertEqual(receiving_result["barcode_type"], "DISPATCH_BALE")
        self.assertTrue(receiving_result["reject_reason"])

        pos_result = self.state.resolve_barcode(dispatch_bale["machine_code"], context="pos")
        self.assertEqual(pos_result["barcode_type"], "DISPATCH_BALE")
        self.assertTrue(pos_result["reject_reason"])

    def test_sdo_is_only_official_store_receiving_code(self):
        sdo = self._seed_sdo()

        self.assertRegex(sdo["machine_code"], r"^4\d{9}$")
        receiving_result = self.state.resolve_barcode(sdo["machine_code"], context="store_receiving")
        self.assertEqual(receiving_result["barcode_type"], "STORE_DELIVERY_EXECUTION")
        self.assertEqual(receiving_result["reject_reason"], "")

        self.assertTrue(self.state.resolve_barcode(sdo["machine_code"], context="pos")["reject_reason"])
        self.assertTrue(self.state.resolve_barcode(sdo["machine_code"], context="warehouse_sorting_create")["reject_reason"])

    def test_store_item_machine_code_is_type_5_and_pos_only(self):
        token = self._seed_store_item()

        self.assertRegex(token["barcode_value"], r"^5\d{9}$")
        pos_result = self.state.resolve_barcode(token["barcode_value"], context="pos")
        self.assertEqual(pos_result["barcode_type"], "STORE_ITEM")
        self.assertEqual(pos_result["object_id"], token["token_no"])
        self.assertEqual(pos_result["identity_id"], token["token_no"])
        self.assertEqual(pos_result["reject_reason"], "")

        self.assertTrue(self.state.resolve_barcode(token["barcode_value"], context="store_receiving")["reject_reason"])
        self.assertTrue(self.state.resolve_barcode(token["barcode_value"], context="warehouse_sorting_create")["reject_reason"])

    def test_store_item_v2_machine_code_is_13_digit_ean13_and_pos_only(self):
        token = self._seed_store_item()
        token["barcode_value"] = "5261240000013"
        token["final_item_barcode"] = {"barcode_value": "5261240000013"}

        self.assertRegex(token["barcode_value"], r"^5\d{12}$")
        self.assertTrue(self.state._is_valid_store_item_v2_barcode(token["barcode_value"]))
        pos_result = self.state.resolve_barcode(token["barcode_value"], context="pos")
        self.assertEqual(pos_result["barcode_type"], "STORE_ITEM")
        self.assertEqual(pos_result["object_id"], token["token_no"])
        self.assertEqual(pos_result["identity_id"], token["token_no"])
        self.assertTrue(pos_result["pos_allowed"])
        self.assertEqual(pos_result["reject_reason"], "")

        self.assertTrue(self.state.resolve_barcode("1261240001", context="pos")["reject_reason"])
        self.assertTrue(self.state.resolve_barcode("2261240001", context="pos")["reject_reason"])
        self.assertTrue(self.state.resolve_barcode("3261240001", context="pos")["reject_reason"])
        self.assertTrue(self.state.resolve_barcode("4261240001", context="pos")["reject_reason"])
        self.assertTrue(self.state.resolve_barcode("6261240001", context="pos")["reject_reason"])

        token["barcode_value"] = "5261240000010"
        token["final_item_barcode"] = {"barcode_value": "5261240000010"}
        checksum_result = self.state.resolve_barcode("5261240000010", context="pos")
        self.assertEqual(checksum_result["barcode_type"], "STORE_ITEM")
        self.assertFalse(checksum_result["pos_allowed"])
        self.assertEqual(checksum_result["reject_reason"], "STORE_ITEM EAN-13 校验位不正确，不能 POS 销售。")

    def test_lpk_is_warehouse_only_typed_code(self):
        self.assertEqual(
            self.state.resolve_barcode("3260425001", context="warehouse_shortage_pick")["barcode_type"],
            "LOOSE_PICK_TASK",
        )
        self.assertEqual(
            self.state.resolve_barcode("LPK260425001", context="warehouse_execution")["barcode_type"],
            "LOOSE_PICK_TASK",
        )
        self.assertTrue(self.state.resolve_barcode("3260425001", context="pos")["reject_reason"])
        self.assertTrue(self.state.resolve_barcode("LPK260425001", context="store_receiving")["reject_reason"])

    def test_legacy_display_codes_remain_reference_only_not_pos_sales_codes(self):
        raw_bale = self._seed_raw_bale()
        token = self._seed_store_item()

        raw_result = self.state.resolve_barcode(raw_bale["bale_barcode"], context="identity_ledger")
        self.assertEqual(raw_result["barcode_type"], "RAW_BALE")
        self.assertEqual(raw_result["object_id"], raw_bale["bale_barcode"])

        tok_result = self.state.resolve_barcode(token["token_no"], context="pos")
        self.assertEqual(tok_result["barcode_type"], "STORE_ITEM")
        self.assertFalse(tok_result["pos_allowed"])
        self.assertTrue(tok_result["reject_reason"])


if __name__ == "__main__":
    unittest.main()

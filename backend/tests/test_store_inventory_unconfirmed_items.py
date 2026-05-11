import sys
import tempfile
import unittest
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api import routes as routes_module
from app.core.config import settings
from app.core.seed_data import STORE_RACK_TEMPLATE
from app.core.state import InMemoryState
from app.schemas.store_racks import StoreItemStockInConfirmRequest


def _store_item(
    *,
    store_code="UTAWALA",
    store_item_id="STOREITEM-304-001",
    machine_code="5260511003041",
    category_short="CARGO PANT",
    status="active",
    sale_status="ready_for_sale",
    stock_in_confirmed=None,
    current_location_code="",
):
    row = {
        "store_item_id": store_item_id,
        "item_id": store_item_id,
        "display_code": store_item_id,
        "machine_code": machine_code,
        "barcode_value": machine_code,
        "entity_type": "STORE_ITEM",
        "store_code": store_code,
        "category_short": category_short,
        "category_name": category_short,
        "category_sub": category_short,
        "grade": "P",
        "pricing_type": "P",
        "sale_price_kes": 410,
        "current_location_code": current_location_code,
        "store_rack_code": current_location_code,
        "rack_code": current_location_code,
        "source_sdp_display_code": "SDP261290018",
        "parent_sdo_display_code": "SDO261290001",
        "print_status": "printed",
        "printed_by": "Austin",
        "status": status,
        "sale_status": sale_status,
        "created_at": "2026-05-11T08:00:00+03:00",
        "updated_at": "2026-05-11T08:00:00+03:00",
    }
    if stock_in_confirmed is not None:
        row["stock_in_confirmed"] = stock_in_confirmed
    return row


class StoreInventoryUnconfirmedItemsTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_state_file = settings.state_file
        settings.state_file = Path(self.temp_dir.name) / "runtime_state.json"
        self.state = InMemoryState()
        self.original_routes_state = routes_module.state
        routes_module.state = self.state
        self.state.initialize_store_racks("UTAWALA", STORE_RACK_TEMPLATE, initialized_by="store_manager_1")
        self.state.initialize_store_racks("KINNO", STORE_RACK_TEMPLATE, initialized_by="area_supervisor_1")
        self.state.upsert_store_location(
            "UTAWALA",
            {
                "location_code": "PT-CR",
                "location_name": "CARGO PANT 主货架",
                "location_type": "SHELF",
                "category_name": "CARGO PANT",
                "active": True,
                "updated_by": "store_manager_1",
            },
        )
        self.token = self.state.authenticate_user("store_manager_1", "demo1234")["access_token"]

    def tearDown(self):
        routes_module.state = self.original_routes_state
        settings.state_file = self.original_state_file
        self.temp_dir.cleanup()

    def _add_item(self, row):
        token_id = row["display_code"]
        self.state.store_items[row["store_item_id"]] = dict(row, token_id=token_id, token_no=token_id)
        self.state.item_barcode_tokens[token_id] = dict(
            row,
            token_id=token_id,
            token_no=token_id,
            entity_id=row["store_item_id"],
            store_item_id=row["store_item_id"],
            status=row.get("status", "active"),
            pos_allowed=True,
            allowed_contexts=["pos", "store_item_label", "inventory_lookup"],
        )

    def test_unconfirmed_endpoint_lists_false_and_missing_only_with_suggestions(self):
        self._add_item(_store_item(stock_in_confirmed=False))
        self._add_item(_store_item(store_item_id="STOREITEM-304-MISSING", machine_code="5260511003042"))
        self._add_item(_store_item(store_item_id="STOREITEM-304-CONFIRMED", machine_code="5260511003043", stock_in_confirmed=True, current_location_code="PT-CR"))
        self._add_item(_store_item(store_item_id="STOREITEM-304-SOLD", machine_code="5260511003044", status="sold"))
        self._add_item(_store_item(store_item_id="STOREITEM-304-VOID", machine_code="5260511003045", status="void"))
        self._add_item(_store_item(store_item_id="STOREITEM-304-CANCELLED", machine_code="5260511003046", status="cancelled"))
        self._add_item(_store_item(store_item_id="STOREITEM-304-DELETED", machine_code="5260511003047", status="deleted"))
        self._add_item(_store_item(store_code="KINNO", store_item_id="STOREITEM-304-KINNO", machine_code="5260511003048"))

        rows = routes_module.get_store_inventory_unconfirmed_items("UTAWALA", authorization=f"Bearer {self.token}")

        self.assertEqual([row["machine_code"] for row in rows], ["5260511003042", "5260511003041"])
        self.assertTrue(all(row["store_code"] == "UTAWALA" for row in rows))
        self.assertEqual(rows[0]["suggested_location_code"], "PT-CR")
        self.assertEqual(rows[0]["suggested_location_name"], "CARGO PANT 主货架")
        self.assertEqual(rows[0]["source_sdp_display_code"], "SDP261290018")
        self.assertEqual(rows[0]["parent_sdo_display_code"], "SDO261290001")
        self.assertEqual(rows[0]["printed_by"], "Austin")
        self.assertEqual(rows[0]["price_kes"], 410)

    def test_confirm_stock_in_removes_item_from_unconfirmed_and_adds_overview(self):
        self._add_item(_store_item(stock_in_confirmed=False))
        before_rows = routes_module.get_store_inventory_unconfirmed_items("UTAWALA", authorization=f"Bearer {self.token}")
        before_overview = routes_module.get_store_inventory_overview("UTAWALA", authorization=f"Bearer {self.token}")

        result = routes_module.confirm_store_item_stock_in(
            "UTAWALA",
            "5260511003041",
            StoreItemStockInConfirmRequest(location_code="PT-CR", confirmed_by="Austin"),
            authorization=f"Bearer {self.token}",
        )
        after_rows = routes_module.get_store_inventory_unconfirmed_items("UTAWALA", authorization=f"Bearer {self.token}")
        after_overview = routes_module.get_store_inventory_overview("UTAWALA", authorization=f"Bearer {self.token}")

        self.assertEqual(len(before_rows), 1)
        self.assertEqual(before_overview["total_items"], 0)
        self.assertEqual(result.status, "confirmed")
        self.assertEqual(after_rows, [])
        self.assertEqual(after_overview["total_items"], 1)
        self.assertEqual(after_overview["shelf_items"], 1)

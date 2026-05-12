import sys
import tempfile
import unittest
from pathlib import Path

from fastapi import HTTPException


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api import routes as routes_module
from app.core.config import settings
from app.core.seed_data import STORE_RACK_TEMPLATE
from app.core.state import InMemoryState
from app.schemas.store_racks import StoreItemStockInConfirmRequest


def _store_item(
    *,
    store_item_id="STOREITEM-303-001",
    machine_code="5260511003031",
    category_short="CARGO PANT",
    location_code="",
    stock_in_confirmed=None,
):
    row = {
        "store_item_id": store_item_id,
        "item_id": store_item_id,
        "display_code": store_item_id,
        "machine_code": machine_code,
        "barcode_value": machine_code,
        "entity_type": "STORE_ITEM",
        "store_code": "UTAWALA",
        "category_short": category_short,
        "category_name": category_short,
        "category_sub": category_short,
        "grade": "P",
        "pricing_type": "P",
        "sale_price_kes": 410,
        "current_location_code": location_code,
        "store_rack_code": location_code,
        "rack_code": location_code,
        "source_sdp_display_code": "SDP261290018",
        "parent_sdo_display_code": "SDO261290001",
        "print_status": "printed",
        "printed_by": "Austin",
        "status": "active",
        "sale_status": "ready_for_sale",
        "created_at": "2026-05-11T08:00:00+03:00",
        "updated_at": "2026-05-11T08:00:00+03:00",
    }
    if stock_in_confirmed is not None:
        row["stock_in_confirmed"] = stock_in_confirmed
    return row


class StoreItemStockInInventoryIntegrationTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.original_state_file = settings.state_file
        settings.state_file = Path(self.temp_dir.name) / "runtime_state.json"
        self.state = InMemoryState()
        self.original_routes_state = routes_module.state
        routes_module.state = self.state
        self.state.initialize_store_racks("UTAWALA", STORE_RACK_TEMPLATE, initialized_by="store_manager_1")
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
        self.token = self.state.authenticate_user("store_clerk_1", "demo1234")["access_token"]

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

    def _confirm(self, machine_code="5260511003031", location_code="PT-CR"):
        return routes_module.confirm_store_item_stock_in(
            "UTAWALA",
            machine_code,
            StoreItemStockInConfirmRequest(location_code=location_code, confirmed_by="Austin"),
            authorization=f"Bearer {self.token}",
        )

    def test_confirm_to_shelf_moves_item_from_unconfirmed_into_inventory_overview(self):
        self._add_item(_store_item())
        before = routes_module.get_store_inventory_overview("UTAWALA", authorization=f"Bearer {self.token}")

        result = self._confirm(location_code="PT-CR")
        after = routes_module.get_store_inventory_overview("UTAWALA", authorization=f"Bearer {self.token}")
        category_items = routes_module.get_store_inventory_category_items(
            "UTAWALA",
            "CARGO PANT",
            authorization=f"Bearer {self.token}",
        )
        location_items = routes_module.get_store_inventory_location_items(
            "UTAWALA",
            "PT-CR",
            authorization=f"Bearer {self.token}",
        )

        self.assertEqual(before["total_items"], 0)
        self.assertEqual(before["unconfirmed_items"], 1)
        self.assertEqual(result.status, "confirmed")
        self.assertEqual(after["total_items"], 1)
        self.assertEqual(after["shelf_items"], 1)
        self.assertEqual(after["backroom_items"], 0)
        self.assertEqual(after["unconfirmed_items"], 0)
        self.assertEqual(after["by_category"][0]["category_name"], "CARGO PANT")
        self.assertEqual(after["by_category"][0]["total_items"], 1)
        self.assertEqual({row["location_code"]: row["item_count"] for row in after["by_location"]}["PT-CR"], 1)
        self.assertEqual([row["machine_code"] for row in category_items], ["5260511003031"])
        self.assertEqual([row["machine_code"] for row in location_items], ["5260511003031"])

    def test_confirm_to_backroom_counts_backroom_not_shelf(self):
        self._add_item(_store_item(machine_code="5260511003032"))

        result = self._confirm(machine_code="5260511003032", location_code="UT-BACKROOM")
        overview = routes_module.get_store_inventory_overview("UTAWALA", authorization=f"Bearer {self.token}")
        backroom_items = routes_module.get_store_inventory_location_items(
            "UTAWALA",
            "UT-BACKROOM",
            authorization=f"Bearer {self.token}",
        )

        self.assertEqual(result.status, "confirmed")
        self.assertEqual(overview["total_items"], 1)
        self.assertEqual(overview["shelf_items"], 0)
        self.assertEqual(overview["backroom_items"], 1)
        self.assertEqual([row["machine_code"] for row in backroom_items], ["5260511003032"])

    def test_repeated_confirmation_is_idempotent_and_different_location_conflicts(self):
        self._add_item(_store_item(stock_in_confirmed=False))

        first = self._confirm(location_code="PT-CR")
        again = self._confirm(location_code="PT-CR")
        before_move = routes_module.get_store_inventory_overview("UTAWALA", authorization=f"Bearer {self.token}")
        with self.assertRaises(HTTPException) as ctx:
            self._confirm(location_code="UT-BACKROOM")
        after_conflict = routes_module.get_store_inventory_overview("UTAWALA", authorization=f"Bearer {self.token}")

        self.assertEqual(first.status, "confirmed")
        self.assertEqual(again.status, "already_confirmed")
        self.assertEqual(before_move["total_items"], 1)
        self.assertEqual(before_move["shelf_items"], 1)
        self.assertEqual(before_move["backroom_items"], 0)
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertEqual(after_conflict["total_items"], 1)
        self.assertEqual(after_conflict["shelf_items"], 1)
        self.assertEqual(after_conflict["backroom_items"], 0)
